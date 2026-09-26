import { DataSource } from 'typeorm';
import { ScheduleImportService } from './schedule-import.service';

jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));

const HEADER =
  'term_name,term_start_date,term_end_date,subject_code,subject_name,section,class_type,instructor_name,day_of_week,start_time,end_time,room_name,user_id';

describe('ScheduleImportService', () => {
  it('สร้างและอ่าน Excel โดยจับคู่รหัสนักศึกษาจริงกับบัญชีที่เปิดใช้งาน', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 7, student_id: '6600000001' }])
      .mockResolvedValueOnce([{ id: 1, room_name: 'LAB-1' }])
      .mockResolvedValueOnce([
        { id: 7, first_name: 'Student', last_name: 'Test' },
      ])
      .mockResolvedValueOnce([]);
    const service = new ScheduleImportService({
      query,
    } as unknown as DataSource);
    const workbook = await service.excelTemplate();
    expect(workbook.subarray(0, 2).toString()).toBe('PK');
    await expect(service.preview(workbook)).resolves.toMatchObject({
      canConfirm: true,
      enrollments: [{ studentId: '6600000001', status: 'linked' }],
    });
    expect(query.mock.calls[0][0]).toContain("role='student'");
    expect(query.mock.calls[0][1]).toEqual(['6600000001']);
  });
  it('สร้างแม่แบบ CSV ที่ Excel เปิดได้และมีหัวตารางครบ', () => {
    const service = new ScheduleImportService({} as DataSource);
    expect(service.template()).toMatch(/^\uFEFFterm_name,/);
    expect(service.template()).toContain('room_name,user_id');
  });

  it('ตรวจไฟล์ที่ถูกต้องและผูก user id ที่มีอยู่', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 1, room_name: 'LAB-1' }])
        .mockResolvedValueOnce([
          { id: 7, first_name: 'สมชาย', last_name: 'ใจดี' },
        ])
        .mockResolvedValueOnce([]),
    };
    const service = new ScheduleImportService(
      dataSource as unknown as DataSource,
    );
    const file = Buffer.from(
      `${HEADER}\n1/2026,2026-06-01,2026-10-15,CS101,Intro,1,LAB,Teacher,Monday,09:00,11:00,LAB-1,7`,
    );

    await expect(service.preview(file)).resolves.toMatchObject({
      term: '1/2026',
      errorCount: 0,
      canConfirm: true,
      schedules: [{ subjectCode: 'CS101', status: 'ready' }],
      enrollments: [
        { studentId: '7', status: 'linked', linkedName: 'สมชาย ใจดี' },
      ],
    });
  });

  it('ไม่ยืนยันเมื่อห้อง วัน เวลา และผู้ใช้ไม่ถูกต้อง', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const service = new ScheduleImportService(
      dataSource as unknown as DataSource,
    );
    const file = Buffer.from(
      `${HEADER}\n1/2026,2026-06-01,2026-10-15,CS101,Intro,1,OTHER,Teacher,Funday,12:00,10:00,NO-ROOM,999`,
    );

    const result = await service.preview(file);
    expect(result.canConfirm).toBe(false);
    expect(result.errorCount).toBe(2);
    expect(result.schedules[0].messages).toEqual(
      expect.arrayContaining([
        'class_type ต้องเป็น LAB หรือ LECT',
        'day_of_week ไม่ถูกต้อง',
        'end_time ต้องมากกว่า start_time',
        'ไม่พบห้องที่เปิดใช้งาน',
      ]),
    );
    expect(result.enrollments[0].messages).toContain(
      'ไม่พบผู้ใช้ที่เปิดใช้งาน',
    );
  });
});
