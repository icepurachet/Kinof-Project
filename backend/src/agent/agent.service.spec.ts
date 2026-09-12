import { DataSource } from 'typeorm';
import { AgentService } from './agent.service';

jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));

describe('AgentService', () => {
  it('กัน event_id ซ้ำและ match เฉพาะ domain หรือ subdomain', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 50 }])
        .mockResolvedValueOnce([
          {
            domain_name: 'danger.example',
            severity: 'high',
            action: 'block',
            match_type: 'suffix',
          },
        ])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 0 })
        .mockResolvedValueOnce({ affectedRows: 1 }),
    };
    const service = new AgentService(dataSource as unknown as DataSource);
    const occurredAt = new Date().toISOString();

    await expect(
      service.ingestEvents({ id: 1, computer_id: 2, room_id: 3 }, [
        {
          event_id: '2e227e4d-0a6f-4ee6-81bc-8c62c672071b',
          event_type: 'website',
          domain: 'sub.danger.example',
          occurred_at: occurredAt,
        },
        {
          event_id: '2e227e4d-0a6f-4ee6-81bc-8c62c672071b',
          event_type: 'website',
          domain: 'notdanger.example',
          occurred_at: occurredAt,
        },
      ]),
    ).resolves.toEqual({ accepted: 1, skipped: 1, flagged: 1, blocked: 1 });
  });

  it('ปิด session เมื่อเครื่องยืนยันคำสั่ง logout สำเร็จ', async () => {
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 9, command_type: 'logout', computer_id: 2 },
        ])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 }),
    };
    const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };
    const service = new AgentService(dataSource as unknown as DataSource);

    await expect(
      service.completeCommand(1, 9, {
        status: 'completed',
        message: 'logout accepted',
      }),
    ).resolves.toEqual({ message: 'บันทึกผลคำสั่งสำเร็จ' });
    expect(queryRunner.query).toHaveBeenCalledTimes(4);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
