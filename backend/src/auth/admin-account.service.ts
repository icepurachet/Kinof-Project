import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { hash } from 'bcrypt';
import { MailService } from '../mail/mail.service';
import { CreateAdminDto } from '../super-admin/dto/create-admin.dto';

@Injectable()
export class AdminAccountService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}
  private digest(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
  async createInvite(actor: number, dto: CreateAdminDto) {
    const password = await hash(randomBytes(48).toString('base64url'), 12);
    let id: number;
    try {
      id = await this.db.transaction(async (m) => {
        const inserted = await m.query(
          "INSERT INTO admins (email,first_name,last_name,password_hash,role,status,username,job_title,phone,password_setup_required) VALUES (?,?,?,?,?,'active',?,?,?,1)",
          [
            dto.email,
            dto.first_name,
            dto.last_name,
            password,
            dto.role,
            dto.username ?? null,
            dto.job_title ?? null,
            dto.phone ?? null,
          ],
        );
        await m.query('INSERT INTO audit_logs (admin_id,action) VALUES (?,?)', [
          actor,
          `เชิญผู้ดูแล #${inserted.insertId}`,
        ]);
        return Number(inserted.insertId);
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY')
        throw new ConflictException('อีเมลหรือชื่อผู้ดูแลนี้ถูกใช้แล้ว');
      throw error;
    }
    try {
      return {
        id,
        email: dto.email,
        role: dto.role,
        ...(await this.sendLink(id)),
      };
    } catch {
      return {
        id,
        email: dto.email,
        role: dto.role,
        deliveryMode: 'failed',
        message: 'สร้างบัญชีแล้วแต่ส่งลิงก์ไม่สำเร็จ กรุณากดส่งลิงก์อีกครั้ง',
      };
    }
  }
  async resendInvite(actor: number, id: number) {
    const result = await this.sendLink(id);
    await this.db.query(
      'INSERT INTO audit_logs (admin_id,action) VALUES (?,?)',
      [actor, `ส่งลิงก์ตั้งรหัสผู้ดูแล #${id}`],
    );
    return result;
  }
  async forgot(email: string) {
    const generic = {
      message: 'หากอีเมลนี้มีบัญชีผู้ดูแล ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้',
    };
    const admins = await this.db.query(
      "SELECT id FROM admins WHERE email=? AND status='active' LIMIT 1",
      [email],
    );
    if (!admins[0]) return generic;
    // Public recovery must not reveal account existence or sender errors.
    try {
      await this.sendLink(Number(admins[0].id));
      return generic;
    } catch {
      return generic;
    }
  }
  private async sendLink(id: number) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.digest(token);
    const email = await this.db.transaction(async (m) => {
      const admins = await m.query(
        "SELECT email FROM admins WHERE id=? AND status='active' FOR UPDATE",
        [id],
      );
      if (!admins[0])
        throw new BadRequestException('ไม่พบบัญชีผู้ดูแลที่เปิดใช้งาน');
      const counts = await m.query(
        'SELECT COUNT(*) AS total FROM admin_password_tokens WHERE admin_id=? AND created_at>UTC_TIMESTAMP()-INTERVAL 1 HOUR',
        [id],
      );
      if (Number(counts[0]?.total ?? 0) >= 3)
        throw new HttpException('ขอลิงก์ได้สูงสุด 3 ครั้งต่อชั่วโมง', 429);
      await m.query(
        'UPDATE admin_password_tokens SET used_at=UTC_TIMESTAMP() WHERE admin_id=? AND used_at IS NULL',
        [id],
      );
      await m.query(
        'INSERT INTO admin_password_tokens (admin_id,token_hash,expires_at) VALUES (?,?,UTC_TIMESTAMP()+INTERVAL 30 MINUTE)',
        [id, tokenHash],
      );
      return admins[0].email;
    });
    const base =
      this.config.get<string>('FRONTEND_PUBLIC_URL') || 'http://localhost:5173';
    const url = `${base.replace(/\/$/, '')}/reset-password?account=admin&token=${encodeURIComponent(token)}`;
    const hook = this.config.get<string>('PASSWORD_RESET_WEBHOOK_URL');
    let mode: 'smtp' | 'webhook' = 'smtp';
    try {
      if (this.mail.configured()) {
        await this.mail.send(
          email,
          'KINOF: ตั้งรหัสผ่านผู้ดูแล',
          `ลิงก์ตั้งรหัสผ่าน (30 นาที ครั้งเดียว):\n${url}\nหากไม่ได้ขอ กรุณาไม่เปิดลิงก์`,
        );
        mode = 'smtp';
      } else if (hook) {
        const key = this.config.get<string>('PASSWORD_RESET_WEBHOOK_KEY');
        const response = await fetch(hook, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          body: JSON.stringify({ email, resetUrl: url, expiresInMinutes: 30 }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('delivery');
        mode = 'webhook';
      } else
        throw new ServiceUnavailableException('ยังไม่ได้ตั้งค่าระบบส่งอีเมล');
    } catch {
      await this.db.query(
        'UPDATE admin_password_tokens SET used_at=UTC_TIMESTAMP() WHERE token_hash=?',
        [tokenHash],
      );
      throw new ServiceUnavailableException('ส่งลิงก์ตั้งรหัสไม่สำเร็จ');
    }
    return {
      deliveryMode: mode,
    };
  }
  async reset(token: string, password: string) {
    await this.db.transaction(async (m) => {
      const tokens = await m.query(
        "SELECT t.id,t.admin_id FROM admin_password_tokens t JOIN admins a ON a.id=t.admin_id WHERE t.token_hash=? AND t.used_at IS NULL AND t.expires_at>UTC_TIMESTAMP() AND a.status='active' FOR UPDATE",
        [this.digest(token)],
      );
      if (!tokens[0])
        throw new BadRequestException('ลิงก์ไม่ถูกต้อง ถูกใช้แล้ว หรือหมดอายุ');
      const passwordHash = await hash(password, 12);
      await m.query(
        'UPDATE admins SET password_hash=?,password_setup_required=0 WHERE id=?',
        [passwordHash, tokens[0].admin_id],
      );
      await m.query(
        'UPDATE admin_password_tokens SET used_at=UTC_TIMESTAMP() WHERE admin_id=? AND used_at IS NULL',
        [tokens[0].admin_id],
      );
      await m.query('INSERT INTO audit_logs (admin_id,action) VALUES (?,?)', [
        tokens[0].admin_id,
        'ตั้งรหัสผ่านผู้ดูแลผ่านลิงก์',
      ]);
    });
    return { message: 'ตั้งรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่' };
  }
}
