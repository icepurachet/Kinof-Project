import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';
import { AdminAuthService } from './admin-auth.service';
import { LoginOtpService } from './login-otp.service';
jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));
jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));
jest.mock('./auth.service', () => ({ AuthService: class AuthService {} }));
jest.mock('./admin-auth.service', () => ({
  AdminAuthService: class AdminAuthService {},
}));

describe('Login OTP', () => {
  const dto = { identifier: 'user', password: 'test-password' };
  let otp: LoginOtpService;
  let auth: {
    validateUser: jest.Mock;
    issueLoginResult: jest.Mock;
    getUserProfile: jest.Mock;
    issueAccessToken: jest.Mock;
  };
  let admin: { validateAdmin: jest.Mock; me: jest.Mock };
  let query: jest.Mock;
  let config: Record<string, string>;
  let mailConfigured: boolean;
  let deliveredCode: string;
  let mail: { configured: jest.Mock; sendOtp: jest.Mock };
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-18T00:00:00Z'));
    config = { JWT_SECRET: 'test-secret', NODE_ENV: 'development' };
    auth = {
      validateUser: jest.fn().mockResolvedValue({ id: 7 }),
      issueLoginResult: jest.fn().mockResolvedValue({ access_token: 'token' }),
      getUserProfile: jest.fn().mockResolvedValue({
        id: 7,
        username: 'user',
        role: 'student',
        faceEnrolled: true,
      }),
      issueAccessToken: jest.fn().mockReturnValue('admin-token'),
    };
    admin = {
      validateAdmin: jest.fn().mockResolvedValue({ id: 7 }),
      me: jest.fn().mockResolvedValue({
        id: 7,
        email: 'admin@example.com',
        role: 'super_admin',
      }),
    };
    query = jest.fn().mockResolvedValue([{ id: 7, email: 'user@example.com' }]);
    mailConfigured = true;
    deliveredCode = '';
    mail = {
      configured: jest.fn(() => mailConfigured),
      sendOtp: jest.fn((_email: string, code: string) => {
        deliveredCode = code;
        return Promise.resolve();
      }),
    };
    otp = new LoginOtpService(
      auth as unknown as AuthService,
      admin as unknown as AdminAuthService,
      { query } as unknown as DataSource,
      {
        get: (key: string) => config[key],
        getOrThrow: (key: string) => config[key],
      } as unknown as ConfigService,
      mail as never,
    );
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('issues no tokens until OTP is verified and consumes the challenge once', async () => {
    const pending = await otp.start(dto);
    expect(pending).not.toHaveProperty('access_token');
    expect(auth.issueLoginResult).not.toHaveBeenCalled();
    await expect(
      otp.verify(pending.userId, deliveredCode),
    ).resolves.toMatchObject({ access_token: 'token' });
    await expect(otp.verify(pending.userId, deliveredCode)).rejects.toThrow();
    expect(auth.issueLoginResult).toHaveBeenCalledTimes(1);
  });
  it('rejects five wrong attempts even if the sixth is correct', async () => {
    const p = await otp.start(dto);
    const correct = deliveredCode;
    const wrong = correct === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++)
      await expect(otp.verify(p.userId, wrong)).rejects.toThrow();
    await expect(otp.verify(p.userId, correct)).rejects.toThrow();
    expect(auth.issueLoginResult).not.toHaveBeenCalled();
  });
  it('expires after ten minutes', async () => {
    const p = await otp.start(dto);
    const correct = deliveredCode;
    jest.advanceTimersByTime(600000);
    await expect(otp.verify(p.userId, correct)).rejects.toThrow();
  });
  it('binds staff identity separately from a student with the same ID', async () => {
    const p = await otp.start(dto, true);
    await expect(otp.verify(p.userId, deliveredCode)).resolves.toMatchObject({
      admin: { role: 'super_admin' },
    });
    expect(admin.me).toHaveBeenCalledWith(7);
    expect(auth.issueLoginResult).not.toHaveBeenCalled();
  });
  it('limits resend and retains the failed-attempt budget', async () => {
    const p = await otp.start(dto);
    await expect(otp.resend(p.userId)).rejects.toThrow();
    const wrong = deliveredCode === '000000' ? '000001' : '000000';
    for (let i = 0; i < 4; i++)
      await expect(otp.verify(p.userId, wrong)).rejects.toThrow();
    jest.advanceTimersByTime(60000);
    await otp.resend(p.userId);
    const nextCode = deliveredCode;
    const nextWrong = nextCode === '000000' ? '000001' : '000000';
    await expect(otp.verify(p.userId, nextWrong)).rejects.toThrow();
    await expect(otp.verify(p.userId, nextCode)).rejects.toThrow();
  });
  it('fails closed in production without an email sender', async () => {
    config.NODE_ENV = 'production';
    mailConfigured = false;
    await expect(otp.start(dto)).rejects.toThrow('ยังไม่ได้ตั้งค่า');
    expect(auth.issueLoginResult).not.toHaveBeenCalled();
  });
  it('does not return a development code on actual delivery', async () => {
    config.LOGIN_OTP_WEBHOOK_URL = 'https://mail.example.test/send';
    mailConfigured = false;
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const pending = await otp.start(dto);
    expect(pending.deliveryMode).toBe('smtp');
    expect(pending).not.toHaveProperty('devOtp');
  });
  it('fails closed when the email sender fails', async () => {
    config.LOGIN_OTP_WEBHOOK_URL = 'https://mail.example.test/send';
    mailConfigured = false;
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);
    await expect(otp.start(dto)).rejects.toThrow('ส่ง OTP');
  });
  it('refuses disabled users even with a correct OTP', async () => {
    const p = await otp.start(dto);
    const correct = deliveredCode;
    query.mockResolvedValueOnce([]);
    await expect(otp.verify(p.userId, correct)).rejects.toThrow(
      'บัญชีถูกระงับ',
    );
  });
});
