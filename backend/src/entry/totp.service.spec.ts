import { DataSource } from 'typeorm';
import { EntryService } from './entry.service';
import { TotpService } from './totp.service';

jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));

describe('TotpService', () => {
  it('สร้าง secret และบันทึกให้ผู้ใช้', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ email: 'student@example.com' }])
        .mockResolvedValueOnce({ affectedRows: 1 }),
    };
    const entryService = {};
    const service = new TotpService(
      dataSource as unknown as DataSource,
      entryService as EntryService,
    );

    const result = await service.setup(7);
    expect(result.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(result.otp_auth_url).toContain('otpauth://totp/');
    expect(dataSource.query).toHaveBeenCalledTimes(2);
  });

  it('ตรวจ TOTP ตาม RFC 6238 ได้', () => {
    const service = new TotpService({} as DataSource, {} as EntryService);
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(service.verifyCode(secret, '287082', 59_000)).toBe(true);
    expect(service.verifyCode(secret, '000000', 59_000)).toBe(false);
  });
});
