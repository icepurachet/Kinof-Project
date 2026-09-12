import { DataSource } from 'typeorm';
import { ScheduleService } from './schedule.service';

jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));

describe('ScheduleService', () => {
  it('คืนตารางเรียนของผู้ใช้โดยแปลง id เป็น number', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          subject_id: '2',
          subject_code: 'CS101',
          subject_name: 'Programming',
          section: '1',
          class_type: 'LAB',
          instructor_name: 'Teacher',
          day_of_week: 'Monday',
          start_time: '09:00',
          end_time: '11:30',
          room_id: '3',
          room_name: 'LAB-3',
          term_id: '1',
          term_name: '1/2569',
        },
      ]),
    };
    const service = new ScheduleService(dataSource as unknown as DataSource);

    const result = await service.findUserSchedule(7);
    expect(result[0]).toMatchObject({
      subject_id: 2,
      room_id: 3,
      term_id: 1,
    });
  });
});
