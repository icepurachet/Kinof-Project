import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
@Injectable()
export class MailService {
  constructor(private readonly config: ConfigService) {}
  configured() {
    return Boolean(
      this.config.get<string>('SMTP_HOST') &&
      this.config.get<string>('SMTP_USER') &&
      this.config.get<string>('SMTP_PASSWORD') &&
      this.config.get<string>('SMTP_FROM'),
    );
  }
  async send(to: string, subject: string, text: string) {
    if (!this.configured())
      throw new ServiceUnavailableException('ยังไม่ได้ตั้งค่า SMTP');
    const transport = createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: Number(this.config.get('SMTP_PORT') ?? 587),
      secure: String(this.config.get('SMTP_SECURE') ?? 'false') === 'true',
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASSWORD'),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    try {
      const result = await transport.sendMail({
        from: this.config.get<string>('SMTP_FROM'),
        to,
        subject,
        text,
      });
      if (!result.accepted?.length) throw new Error('not accepted');
    } catch {
      throw new ServiceUnavailableException(
        'ส่งอีเมลไม่สำเร็จ กรุณาตรวจการตั้งค่า SMTP',
      );
    } finally {
      transport.close();
    }
  }
  sendOtp(email: string, code: string, purpose: string) {
    return this.send(
      email,
      `KINOF: รหัสยืนยัน ${purpose}`,
      `รหัสยืนยันของคุณคือ ${code}\nใช้ได้ 10 นาที ครั้งเดียว ห้ามส่งต่อให้ผู้อื่น\nหากคุณไม่ได้ขอรหัสนี้ กรุณาไม่ใช้รหัส`,
    );
  }
}
