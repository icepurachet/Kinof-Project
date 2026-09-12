import { DataSource } from 'typeorm';
import { EntryService } from './entry.service';

jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));

describe('EntryService', () => {
  it('อนุญาตเมื่อผู้ใช้มีวิชาเรียนในห้องและเวลาปัจจุบัน', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValueOnce([{ id: 15 }]),
    };
    const service = new EntryService(dataSource as unknown as DataSource);

    await expect(service.checkAccess(7, 2)).resolves.toMatchObject({
      allowed: true,
      source: 'class_schedule',
      reference_id: 15,
    });
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('อนุญาตเมื่อไม่มีวิชาเรียนแต่มี booking ที่ยืนยันแล้ว', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 23 }]),
    };
    const service = new EntryService(dataSource as unknown as DataSource);

    await expect(service.checkAccess(7, 2)).resolves.toMatchObject({
      allowed: true,
      source: 'booking',
      reference_id: 23,
    });
  });

  it('ปฏิเสธเมื่อไม่มีทั้งตารางเรียนและ booking', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
    };
    const service = new EntryService(dataSource as unknown as DataSource);

    await expect(service.checkAccess(7, 2)).resolves.toMatchObject({
      allowed: false,
      source: null,
    });
  });

  it('จัดเครื่องที่ Agent ออนไลน์และสร้าง session เมื่อมีสิทธิ์', async () => {
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            computer_id: 8,
            machine_no: '08',
            room_id: 2,
            room_name: 'Lab 2',
            hostname: 'LAB-08',
            first_name: 'สมชาย',
            last_name: 'ใจดี',
          },
        ])
        .mockResolvedValueOnce({ insertId: 45 })
        .mockResolvedValueOnce({ affectedRows: 1 }),
    };
    const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };
    const service = new EntryService(dataSource as unknown as DataSource);
    jest.spyOn(service, 'checkAccess').mockResolvedValue({
      allowed: true,
      room_id: 2,
      source: 'booking',
      reference_id: 23,
      reason: 'มีสิทธิ์จากการจองที่ยืนยันแล้ว',
    });

    await expect(service.enterRoom(7, 2)).resolves.toMatchObject({
      allowed: true,
      sessionId: 45,
      seatLabel: '08',
      computerName: 'LAB-08',
      user: { id: 7, displayName: 'สมชาย ใจดี' },
      room: { id: 2, name: 'Lab 2' },
    });
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
