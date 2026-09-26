import {
  HttpException,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';
import { AdminAuthService } from './admin-auth.service';
import { LoginDto } from './dto/login.dto';
import { MailService } from '../mail/mail.service';

type Challenge = {
  id: number;
  staff: boolean;
  email: string;
  hash: Buffer;
  expires: number;
  attempts: number;
  sends: number;
  sentAt: number;
  busy: boolean;
};

@Injectable()
export class LoginOtpService {
  // Single-process deployment: restart invalidates pending challenges, never grants access.
  private readonly challenges = new Map<string, Challenge>();
  constructor(
    private readonly auth: AuthService,
    private readonly admins: AdminAuthService,
    private readonly db: DataSource,
    private readonly config: ConfigService,
    @Optional() private readonly mail?: MailService,
  ) {}

  private clean() {
    for (const [key, challenge] of this.challenges)
      if (challenge.expires <= Date.now()) this.challenges.delete(key);
  }

  async start(dto: LoginDto, staff = false) {
    this.clean();
    const account = staff
      ? await this.admins.validateAdmin(dto)
      : await this.auth.validateUser(dto);
    const result = await this.db.query(
      `SELECT email FROM ${staff ? 'admins' : 'users'} WHERE id=?`,
      [account.id],
    );
    const email = result[0]?.email;
    if (!email) throw new UnauthorizedException('ไม่พบอีเมลสำหรับส่ง OTP');
    if (
      [...this.challenges.values()].some(
        (c) =>
          c.id === account.id &&
          c.staff === staff &&
          Date.now() - c.sentAt < 60_000,
      )
    )
      throw new HttpException('กรุณารอ 60 วินาทีก่อนขอ OTP ใหม่', 429);
    if (this.challenges.size >= 10000)
      throw new ServiceUnavailableException('ระบบ OTP ไม่ว่าง กรุณาลองใหม่');
    for (const [key, c] of this.challenges)
      if (c.id === account.id && c.staff === staff) this.challenges.delete(key);
    const key = randomBytes(32).toString('base64url');
    const challenge: Challenge = {
      id: account.id,
      staff,
      email,
      hash: Buffer.alloc(32),
      expires: Date.now() + 600_000,
      attempts: 0,
      sends: 0,
      sentAt: Date.now(),
      busy: true,
    };
    this.challenges.set(key, challenge);
    try {
      return await this.send(key, challenge);
    } catch (error) {
      this.challenges.delete(key);
      throw error;
    } finally {
      challenge.busy = false;
    }
  }

  private hash(key: string, code: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update(`${key}:${code}`)
      .digest();
  }

  private async send(key: string, challenge: Challenge) {
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const url =
      this.config.get<string>('LOGIN_OTP_WEBHOOK_URL') ||
      this.config.get<string>('ENTRY_OTP_WEBHOOK_URL');
    const deliveryMode = 'smtp' as const;
    if (!url && !this.mail?.configured())
      throw new ServiceUnavailableException(
        'ยังไม่ได้ตั้งค่าระบบส่ง OTP ล็อกอิน',
      );
    if (this.mail?.configured()) {
      await this.mail.sendOtp(challenge.email, code, 'เข้าสู่ระบบ');
    } else if (url) {
      const webhookKey =
        this.config.get<string>('LOGIN_OTP_WEBHOOK_KEY') ||
        this.config.get<string>('ENTRY_OTP_WEBHOOK_KEY');
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(webhookKey ? { Authorization: `Bearer ${webhookKey}` } : {}),
          },
          body: JSON.stringify({
            email: challenge.email,
            code,
            expiresInMinutes: 10,
            purpose: 'login',
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('delivery failed');
      } catch {
        throw new ServiceUnavailableException('ส่ง OTP ล็อกอินไม่สำเร็จ');
      }
    }
    challenge.hash = this.hash(key, code);
    challenge.sentAt = Date.now();
    challenge.sends++;
    const [local, domain] = challenge.email.split('@');
    return {
      userId: key,
      maskedEmail: `${local.slice(0, 2)}***@${domain}`,
      deliveryMode,
      expiresAt: new Date(challenge.expires).toISOString(),
    };
  }

  private get(key: string) {
    this.clean();
    const challenge = this.challenges.get(key);
    if (!challenge || challenge.attempts >= 5)
      throw new UnauthorizedException(
        'OTP หมดอายุหรือใช้ไม่ได้ กรุณาเข้าสู่ระบบใหม่',
      );
    if (challenge.busy)
      throw new HttpException('กำลังดำเนินการ กรุณารอสักครู่', 429);
    return challenge;
  }

  async resend(key: string) {
    const challenge = this.get(key);
    if (challenge.sends >= 5 || Date.now() - challenge.sentAt < 60000)
      throw new HttpException(
        'กรุณารอ 60 วินาที หรือเข้าสู่ระบบใหม่เมื่อส่งครบ 5 ครั้ง',
        429,
      );
    challenge.busy = true;
    try {
      return await this.send(key, challenge);
    } finally {
      challenge.busy = false;
    }
  }

  async verify(key: string, code: string) {
    const challenge = this.get(key);
    challenge.attempts++;
    if (!timingSafeEqual(challenge.hash, this.hash(key, code)))
      throw new UnauthorizedException('OTP ไม่ถูกต้อง');
    // Consume synchronously before issuing any token, including concurrent requests.
    this.challenges.delete(key);
    if (challenge.staff) {
      const admin = await this.admins.me(challenge.id);
      return {
        access_token: this.auth.issueAccessToken({
          id: admin.id,
          username: admin.email,
          role: admin.role,
        }),
        admin,
      };
    }
    const active = await this.db.query(
      'SELECT id FROM users WHERE id=? AND is_active=1',
      [challenge.id],
    );
    if (!active.length) throw new UnauthorizedException('บัญชีถูกระงับ');
    const user = await this.auth.getUserProfile(challenge.id);
    return this.auth.issueLoginResult({
      id: user.id,
      username: user.username,
      role: user.role,
      face_enrolled: Boolean(user.faceEnrolled),
    });
  }
}
