import { AdminAccountService } from './admin-account.service';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { hash } from 'bcrypt';

jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('typeorm', () => ({ DataSource: class {} }));
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('secure-hash'),
}));

describe('AdminAccountService', () => {
  function setup(query: jest.Mock, production = false) {
    const db = {
      query,
      transaction: (run: (manager: { query: jest.Mock }) => Promise<unknown>) =>
        run({ query }),
    };
    const config = {
      get: (key: string) =>
        key === 'NODE_ENV'
          ? production
            ? 'production'
            : 'development'
          : undefined,
    };
    const mail = { configured: () => false };
    return new AdminAccountService(
      db as unknown as DataSource,
      config as unknown as ConfigService,
      mail as unknown as MailService,
    );
  }
  it('rejects expired, used, unknown or disabled admin tokens without password writes', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(
      setup(query).reset('unknown-token', 'NewPassword123!'),
    ).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("a.status='active'");
    expect(query.mock.calls[0][0]).toContain('t.used_at IS NULL');
    expect(query.mock.calls[0][0]).toContain('t.expires_at>UTC_TIMESTAMP()');
  });
  it('hashes new passwords and invalidates all remaining admin reset tokens', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 5, admin_id: 9 }])
      .mockResolvedValue({ affectedRows: 1 });
    await setup(query).reset('valid-token', 'NewPassword123!');
    expect(hash).toHaveBeenCalledWith('NewPassword123!', 12);
    expect(query.mock.calls[1][1]).toEqual(['secure-hash', 9]);
    expect(query.mock.calls[2][0]).toContain('used_at=UTC_TIMESTAMP()');
  });
  it('returns the same public recovery response for unknown accounts', async () => {
    const query = jest.fn().mockResolvedValue([]);
    expect(await setup(query).forgot('unknown@example.com')).toEqual({
      message: 'หากอีเมลนี้มีบัญชีผู้ดูแล ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้',
    });
  });
  it('never exposes a development link in production without delivery configuration', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 9 }])
      .mockResolvedValueOnce([{ email: 'admin@example.com' }])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValue({ affectedRows: 1 });
    const response = await setup(query, true).forgot('admin@example.com');
    expect(response).not.toHaveProperty('developmentResetUrl');
    expect(query.mock.calls.at(-1)?.[0]).toContain('WHERE token_hash=?');
  });
});
