import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EntryOtpService } from './entry-otp.service';
import { EntryService } from './entry.service';

jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

describe('EntryOtpService', () => {
  const config = {
    get: jest.fn((name: string) =>
      name === 'NODE_ENV' ? 'development' : undefined,
    ),
    getOrThrow: jest.fn().mockReturnValue('unit-test-otp-secret'),
  };

  beforeEach(() => jest.clearAllMocks());

  it('สร้าง OTP แบบ hash และคืน code เฉพาะ development', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 7, email: 'student@example.com' }])
        .mockResolvedValueOnce([{ request_count: 0 }])
        .mockResolvedValueOnce([{ active_count: 0 }])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ insertId: 9 }),
    };
    const service = new EntryOtpService(
      dataSource as unknown as DataSource,
      config as unknown as ConfigService,
      {} as EntryService,
    );

    const result = await service.request(7, 2);
    expect(result).toMatchObject({ active: true, roomId: 2 });
    expect(result.developmentCode).toMatch(/^\d{6}$/);
    expect(dataSource.query).toHaveBeenNthCalledWith(
      5,
      expect.any(String),
      expect.arrayContaining([7, 2, expect.not.stringMatching(/^\d{6}$/)]),
    );
  });

  it('OTP ใช้ได้ครั้งเดียวและยังต้องผ่านสิทธิ์เข้าห้อง', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 9, user_id: 7 }])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ insertId: 11 }),
    };
    const entryService = {
      enterRoom: jest.fn().mockResolvedValue({
        allowed: true,
        room_id: 2,
        reason: 'มีสิทธิ์',
        sessionId: 11,
        seatLabel: '03',
      }),
    };
    const service = new EntryOtpService(
      dataSource as unknown as DataSource,
      config as unknown as ConfigService,
      entryService as unknown as EntryService,
    );

    await expect(service.verify(2, '123456')).resolves.toMatchObject({
      granted: true,
      identified: true,
      sessionId: 11,
      seatLabel: '03',
    });
    expect(entryService.enterRoom).toHaveBeenCalledWith(7, 2);
  });
});
