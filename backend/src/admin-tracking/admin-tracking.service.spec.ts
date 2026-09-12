import { DataSource } from 'typeorm';
import { AdminTrackingService } from './admin-tracking.service';

jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));

describe('AdminTrackingService', () => {
  it('คำนวณ summary เป็นตัวเลข', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          machines_total: '30',
          available: '20',
          in_use: '5',
          offline: '3',
          maintenance: '2',
          active_users: '5',
          websites_today: '18',
          flagged_count: '2',
        },
      ]),
    };
    const service = new AdminTrackingService(
      dataSource as unknown as DataSource,
    );
    await expect(service.summary()).resolves.toEqual({
      machines_total: 30,
      available: 20,
      in_use: 5,
      offline: 3,
      maintenance: 2,
      active_users: 5,
      websites_today: 18,
      flagged_count: 2,
    });
  });

  it('ส่งออกรายงานเว็บไซต์เป็น CSV ที่รองรับข้อความมี comma', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          event_id: 1,
          event_type: 'website',
          username: 'student01',
          room_name: 'Lab, 1',
          machine_no: '01',
          name: 'example.com',
          domain: 'example.com',
          risk_level: 'none',
          was_blocked: 0,
          occurred_at: new Date('2026-09-12T01:00:00.000Z'),
        },
      ]),
    };
    const service = new AdminTrackingService(
      dataSource as unknown as DataSource,
    );

    const result = await service.exportCsv({
      report: 'website',
      room_id: 2,
      from: '2026-09-12',
      to: '2026-09-12',
    });
    expect(result.filename).toMatch(/^kinof-website-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(result.content).toContain('"Lab, 1"');
    expect(result.content.charCodeAt(0)).toBe(0xfeff);
  });
});
