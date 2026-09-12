import { DataSource } from 'typeorm';
import { FindAvailableRoomsDto } from './dto/find-available-rooms.dto';
import { RoomsService } from './rooms.service';

jest.mock('typeorm', () => ({
  DataSource: class DataSource {},
}));

describe('RoomsService', () => {
  it('เรียก procedure และแปลงจำนวนที่ MySQL ส่งกลับมา', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          room_id: 1,
          room_name: 'Lab 1',
          capacity: 30,
          used_seats: '20',
          available_seats: '10',
          remaining_after_assignment: '7',
        },
      ]),
    };
    const service = new RoomsService(dataSource as unknown as DataSource);
    const query: FindAvailableRoomsDto = {
      booking_date: '2026-09-12',
      time_slot: '09:00-11:30',
      required_seats: 3,
    };

    await expect(service.findAvailableRooms(query)).resolves.toEqual([
      {
        room_id: 1,
        room_name: 'Lab 1',
        capacity: 30,
        used_seats: 20,
        available_seats: 10,
        remaining_after_assignment: 7,
      },
    ]);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM rooms AS r'),
      [
        3,
        '2026-09-12',
        '09:00-11:30',
        3,
        '2026-09-12',
        '2026-09-12',
        '11:30:00',
        '09:00:00',
      ],
    );
  });
});
