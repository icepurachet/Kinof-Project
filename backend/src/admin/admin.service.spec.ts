import { DataSource } from 'typeorm';
import { AdminService } from './admin.service';

jest.mock('typeorm', () => ({
  DataSource: class DataSource {},
  QueryRunner: class QueryRunner {},
}));

describe('AdminService', () => {
  it('สรุปตัวเลข dashboard เป็น number', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          users: '10',
          active_computers: '3',
          today_bookings: '2',
          pending_issues: '4',
          suspicious_logs_today: '1',
        },
      ]),
    };
    const service = new AdminService(dataSource as unknown as DataSource);

    await expect(service.dashboard()).resolves.toEqual({
      users: 10,
      active_computers: 3,
      today_bookings: 2,
      pending_issues: 4,
      suspicious_logs_today: 1,
    });
  });

  it('ลงโทษและหัก usage_score ใน transaction เดียว', async () => {
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 7, usage_score: 100 }])
        .mockResolvedValueOnce({ insertId: 9 })
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ insertId: 20 }),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const service = new AdminService(dataSource as unknown as DataSource);

    await expect(
      service.createPenalty(2, {
        user_id: 7,
        points: 15,
        reason: 'ใช้งานเว็บไซต์ต้องห้าม',
      }),
    ).resolves.toEqual({ penalty_id: 9, remaining_score: 85 });
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });
});
