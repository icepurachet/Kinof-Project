import {
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt } from 'crypto';
import { DataSource } from 'typeorm';
import { EntryService } from './entry.service';
import { MailService } from '../mail/mail.service';

export interface EntryOtpStatus {
  active: boolean;
  roomId: number | null;
  expiresAt: string | null;
  maskedEmail?: string;
  roomName?: string | null;
  deliveryMode?: 'smtp' | 'webhook';
  monthlyLimit?: number;
  monthlyUsed?: number;
  monthlyRemaining?: number;
}

@Injectable()
export class EntryOtpService {
  private static readonly MONTHLY_REQUEST_LIMIT = 5;
  private readonly verifyAttempts = new Map<number, number[]>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly entryService: EntryService,
    @Optional() private readonly mail?: MailService,
  ) {}

  async request(userId: number, roomId?: number): Promise<EntryOtpStatus> {
    const users = this.readRows(
      (await this.dataSource.query(
        'SELECT id, email FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
        [userId],
      )) as unknown,
    );
    const user = users[0];
    if (!user) {
      throw new ServiceUnavailableException('ไม่พบบัญชีผู้ใช้ที่เปิดใช้งาน');
    }

    const monthlyUsed = await this.countMonthlyRequests(userId);
    if (monthlyUsed >= EntryOtpService.MONTHLY_REQUEST_LIMIT) {
      throw new HttpException(
        'ใช้สิทธิ์ขอ OTP สำรองครบ 5 ครั้งของเดือนนี้แล้ว',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const counts = this.readRows(
      (await this.dataSource.query(
        `SELECT COUNT(*) AS request_count FROM entry_otp_codes
         WHERE user_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 10 MINUTE`,
        [userId],
      )) as unknown,
    );
    if (Number(counts[0]?.request_count ?? 0) >= 3) {
      throw new HttpException(
        'ขอ OTP ถี่เกินไป กรุณารอ 10 นาที',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const { code, codeHash } = await this.generateUniqueCode();
    await this.dataSource.query(
      `UPDATE entry_otp_codes SET used_at = UTC_TIMESTAMP()
       WHERE user_id = ? AND used_at IS NULL`,
      [userId],
    );
    const result = (await this.dataSource.query(
      `INSERT INTO entry_otp_codes
       (user_id, room_id, code_hash, expires_at)
       VALUES (?, ?, ?, UTC_TIMESTAMP() + INTERVAL 10 MINUTE)`,
      [userId, roomId ?? null, codeHash],
    )) as unknown;
    const otpId = this.readInsertId(result);

    let deliveryMode: 'smtp' | 'webhook';
    try {
      deliveryMode = await this.deliverCode(String(user.email), code);
    } catch (error) {
      await this.dataSource.query(
        'UPDATE entry_otp_codes SET used_at = UTC_TIMESTAMP() WHERE id = ?',
        [otpId],
      );
      throw error;
    }

    const status: EntryOtpStatus = {
      active: true,
      roomId: roomId ?? null,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      maskedEmail: this.maskEmail(String(user.email)),
      deliveryMode,
      monthlyLimit: EntryOtpService.MONTHLY_REQUEST_LIMIT,
      monthlyUsed: monthlyUsed + 1,
      monthlyRemaining: Math.max(
        0,
        EntryOtpService.MONTHLY_REQUEST_LIMIT - monthlyUsed - 1,
      ),
    };
    return status;
  }

  async active(userId: number): Promise<EntryOtpStatus> {
    const [result, monthlyUsed] = await Promise.all([
      this.dataSource.query(
        `SELECT eoc.room_id, eoc.expires_at, u.email, r.room_name
         FROM entry_otp_codes AS eoc
         INNER JOIN users AS u ON u.id = eoc.user_id
         LEFT JOIN rooms AS r ON r.id = eoc.room_id
         WHERE eoc.user_id = ? AND eoc.used_at IS NULL
           AND eoc.expires_at > UTC_TIMESTAMP()
         ORDER BY eoc.created_at DESC LIMIT 1`,
        [userId],
      ),
      this.countMonthlyRequests(userId),
    ]);
    const quota = {
      monthlyLimit: EntryOtpService.MONTHLY_REQUEST_LIMIT,
      monthlyUsed,
      monthlyRemaining: Math.max(
        0,
        EntryOtpService.MONTHLY_REQUEST_LIMIT - monthlyUsed,
      ),
    };
    const row = this.readRows(result)[0];
    return row
      ? {
          active: true,
          roomId: row.room_id === null ? null : Number(row.room_id),
          expiresAt: String(row.expires_at),
          maskedEmail: this.maskEmail(String(row.email)),
          roomName: typeof row.room_name === 'string' ? row.room_name : null,
          ...quota,
        }
      : { active: false, roomId: null, expiresAt: null, ...quota };
  }

  async verify(roomId: number, code: string) {
    this.checkVerifyRateLimit(roomId);
    const codeHash = this.hashCode(code);
    const rows = this.readRows(
      (await this.dataSource.query(
        `SELECT id, user_id FROM entry_otp_codes
         WHERE code_hash = ? AND used_at IS NULL
           AND expires_at > UTC_TIMESTAMP()
           AND (room_id IS NULL OR room_id = ?)
         ORDER BY created_at DESC LIMIT 2`,
        [codeHash, roomId],
      )) as unknown,
    );
    if (rows.length !== 1) {
      return {
        granted: false,
        identified: false,
        suggestOtp: true,
        message: 'OTP ไม่ถูกต้องหรือหมดอายุ',
      };
    }

    const otpId = Number(rows[0].id);
    const userId = Number(rows[0].user_id);
    const consumeResult = (await this.dataSource.query(
      `UPDATE entry_otp_codes SET used_at = UTC_TIMESTAMP()
       WHERE id = ? AND used_at IS NULL`,
      [otpId],
    )) as unknown;
    if (this.readAffectedRows(consumeResult) !== 1) {
      return {
        granted: false,
        identified: false,
        suggestOtp: true,
        message: 'OTP นี้ถูกใช้ไปแล้ว',
      };
    }

    const access = await this.entryService.authorizeDoor(userId, roomId);
    await this.dataSource.query(
      `INSERT INTO entry_verifications
       (user_id, room_id, method, result, reason)
       VALUES (?, ?, 'otp', ?, ?)`,
      [
        userId,
        roomId,
        access.allowed ? 'success' : 'failed',
        access.allowed ? null : 'access_denied',
      ],
    );
    return {
      ...access,
      granted: access.allowed,
      identified: true,
      suggestOtp: false,
      message: access.allowed
        ? 'ยืนยัน OTP และสิทธิ์เข้าห้องสำเร็จ'
        : access.reason,
      user: access.user ?? { id: userId },
      access,
    };
  }

  private async deliverCode(
    email: string,
    code: string,
  ): Promise<'smtp' | 'webhook'> {
    if (this.mail?.configured()) {
      await this.mail.sendOtp(email, code, 'เข้าห้องสำรอง');
      return 'smtp';
    }
    const url = this.config.get<string>('ENTRY_OTP_WEBHOOK_URL');
    if (!url) {
      throw new ServiceUnavailableException('ยังไม่ได้ตั้งค่าระบบส่ง OTP');
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const key = this.config.get<string>('ENTRY_OTP_WEBHOOK_KEY');
    if (key) headers.Authorization = `Bearer ${key}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, code, expiresInMinutes: 10 }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`delivery ${response.status}`);
      return 'webhook';
    } catch {
      throw new ServiceUnavailableException('ส่ง OTP ไม่สำเร็จ');
    }
  }

  private hashCode(code: string): string {
    const secret = this.config.getOrThrow<string>('ENTRY_OTP_SECRET');
    return createHmac('sha256', secret).update(code).digest('hex');
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return '***';
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
  }

  private async generateUniqueCode(): Promise<{
    code: string;
    codeHash: string;
  }> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const codeHash = this.hashCode(code);
      const rows = this.readRows(
        (await this.dataSource.query(
          `SELECT COUNT(*) AS active_count FROM entry_otp_codes
           WHERE code_hash = ? AND used_at IS NULL
             AND expires_at > UTC_TIMESTAMP()`,
          [codeHash],
        )) as unknown,
      );
      if (Number(rows[0]?.active_count ?? 0) === 0) {
        return { code, codeHash };
      }
    }
    throw new ServiceUnavailableException(
      'ไม่สามารถสร้าง OTP ได้ กรุณาลองใหม่',
    );
  }

  private async countMonthlyRequests(userId: number): Promise<number> {
    const rows = this.readRows(
      (await this.dataSource.query(
        `SELECT COUNT(*) AS request_count FROM entry_otp_codes
         WHERE user_id = ?
           AND created_at >= CONVERT_TZ(
             DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00'), '%Y-%m-01 00:00:00'),
             '+07:00',
             '+00:00'
           )`,
        [userId],
      )) as unknown,
    );
    return Number(rows[0]?.request_count ?? 0);
  }

  private checkVerifyRateLimit(roomId: number): void {
    const now = Date.now();
    const recent = (this.verifyAttempts.get(roomId) ?? []).filter(
      (time) => time > now - 15 * 60_000,
    );
    if (recent.length >= 10) {
      throw new HttpException(
        'กรอก OTP ผิดหรือถี่เกินไป กรุณารอ 15 นาที',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.verifyAttempts.set(roomId, recent);
  }

  private readRows(result: unknown): Array<Record<string, unknown>> {
    return Array.isArray(result)
      ? result.filter(
          (row): row is Record<string, unknown> =>
            typeof row === 'object' && row !== null,
        )
      : [];
  }

  private readAffectedRows(result: unknown): number {
    return typeof result === 'object' && result !== null
      ? Number((result as Record<string, unknown>).affectedRows ?? 0)
      : 0;
  }

  private readInsertId(result: unknown): number {
    const id =
      typeof result === 'object' && result !== null
        ? Number((result as Record<string, unknown>).insertId)
        : 0;
    if (!Number.isInteger(id) || id <= 0) {
      throw new TypeError('ฐานข้อมูลไม่ส่ง otp id ที่ถูกต้องกลับมา');
    }
    return id;
  }
}
