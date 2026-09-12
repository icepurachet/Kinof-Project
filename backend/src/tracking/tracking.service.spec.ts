import { DataSource } from 'typeorm';
import { TrackingService } from './tracking.service';

jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));

describe('TrackingService', () => {
  it('เริ่ม session และอัปเดตสถานะเครื่องใน transaction เดียว', async () => {
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 3, status: 'offline' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce({ insertId: 21 })
        .mockResolvedValueOnce({ affectedRows: 1 }),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const service = new TrackingService(dataSource as unknown as DataSource);

    await expect(service.startSession(7, 3)).resolves.toEqual({
      session_id: 21,
      status: 'online',
    });
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('ทำเครื่องหมายเว็บไซต์ที่อยู่ใน blocked_domains ว่าน่าสงสัย', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 10 }])
        .mockResolvedValueOnce([{ id: 2 }])
        .mockResolvedValueOnce({ insertId: 31 }),
    };
    const service = new TrackingService(dataSource as unknown as DataSource);

    const result = await service.createUsageLog(7, {
      session_id: 10,
      log_type: 'website',
      name: 'https://www.example.com/page',
      start_time: '2026-09-12T10:00:00.000Z',
      end_time: '2026-09-12T10:01:01.000Z',
    });

    expect(result.is_suspicious).toBe(true);
    expect(result.duration_minutes).toBe(2);
  });
});
