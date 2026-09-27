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

  it('กรองกิจกรรมที่ backend และรวม login/logout ในแท็บ session', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    const service = new AdminTrackingService(
      dataSource as unknown as DataSource,
    );

    await service.activity({
      room_id: 3,
      date: '2026-09-26',
      type: 'session',
      limit: 50,
    });

    const [sql, parameters] = dataSource.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(sql).toContain('r.id = ?');
    expect(sql).toContain("te.event_type IN ('login', 'logout')");
    expect(sql).toContain(
      "DATE(CONVERT_TZ(te.occurred_at, '+00:00', '+07:00')) = ?",
    );
    expect(parameters).toEqual([3, '2026-09-26', 50]);
  });

  it('ดึงกิจกรรมรายเครื่องผ่าน query เฉพาะเครื่อง', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 7 }])
        .mockResolvedValueOnce([{ id: 99, computer_id: 7 }]),
    };
    const service = new AdminTrackingService(
      dataSource as unknown as DataSource,
    );

    await expect(service.computerActivity(7, 25)).resolves.toEqual([
      { id: 99, computer_id: 7 },
    ]);
    expect(dataSource.query.mock.calls[1][0]).toContain('lc.id = ?');
    expect(dataSource.query.mock.calls[1][1]).toEqual([7, 25]);
  });

  it('คืนจำนวนเครื่องและคำสั่ง logout เมื่อปิดทั้งห้อง', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          { machine_count: '20', active_session_count: '3' },
        ])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 18 })
        .mockResolvedValueOnce({ affectedRows: 1 }),
    };
    const service = new AdminTrackingService(
      dataSource as unknown as DataSource,
    );

    await expect(service.bulkRoomAction(1, 2, 'close')).resolves.toEqual({
      message: 'อัปเดตสถานะห้องสำเร็จ',
      status: 'closed',
      machine_count: 20,
      active_session_count: 3,
      logout_commands_queued: 18,
    });
  });

  it('ออกคีย์ Agent ใหม่และบันทึก audit โดยไม่คืนค่า hash', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 1 }),
    };
    const service = new AdminTrackingService(
      dataSource as unknown as DataSource,
    );

    const result = await service.rotateAgentKey(4, 12);

    expect(result.agent_id).toBe(12);
    expect(result.api_key).toEqual(expect.any(String));
    expect(result.api_key.length).toBeGreaterThan(30);
    expect(dataSource.query.mock.calls[0][0]).toContain(
      'UPDATE tracking_agents',
    );
    expect(dataSource.query.mock.calls[0][1][1]).toBe(12);
    expect(dataSource.query.mock.calls[1][1]).toEqual([
      'ออกคีย์ใหม่ให้ Tracking Agent #12',
      4,
    ]);
  });
});
