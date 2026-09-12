import { DataSource } from 'typeorm';
import { BookingsService } from './bookings.service';
import { CreateSoloBookingDto } from './dto/create-solo-booking.dto';

jest.mock('typeorm', () => ({
  DataSource: class DataSource {},
}));

describe('BookingsService', () => {
  it('ล็อกห้อง ตรวจเงื่อนไข และ commit การจองคนเดียว', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 3, room_name: 'LAB-C', capacity: 20 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ used_seats: '5' }])
      .mockResolvedValueOnce({ insertId: 42 });
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query,
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const service = new BookingsService(dataSource as unknown as DataSource);
    const dto: CreateSoloBookingDto = {
      booking_date: '2026-09-12',
      time_slot: '09:00-11:30',
      room_id: 3,
    };

    await expect(service.createSoloBooking(7, dto)).resolves.toEqual({
      booking_id: 42,
      booking_date: '2026-09-12',
      time_slot: '09:00-11:30',
      reserved_seats: 1,
      status: 'confirmed',
      room: { id: 3, room_name: 'LAB-C' },
    });
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('สร้าง booking pending และคำเชิญที่หมดอายุใน 5 นาที', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 8 }, { id: 9 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 3, room_name: 'LAB-C', capacity: 20 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ used_seats: '5' }])
      .mockResolvedValueOnce({ insertId: 43 })
      .mockResolvedValueOnce({ affectedRows: 2 });
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query,
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const service = new BookingsService(dataSource as unknown as DataSource);

    await expect(
      service.createGroupBooking(7, {
        booking_date: '2026-09-12',
        time_slot: '09:00-11:30',
        room_id: 3,
        member_ids: [8, 9],
      }),
    ).resolves.toEqual({
      booking_id: 43,
      booking_date: '2026-09-12',
      time_slot: '09:00-11:30',
      reserved_seats: 3,
      status: 'pending',
      expires_in_seconds: 300,
      room: { id: 3, room_name: 'LAB-C' },
      members: [
        { user_id: 8, invite_status: 'pending' },
        { user_id: 9, invite_status: 'pending' },
      ],
    });
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('คืนเฉพาะคำเชิญ pending ที่ยังไม่หมดเวลา', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          invitation_id: 5,
          booking_id: 11,
          booking_date: '2026-09-12',
          time_slot: '09:00-11:30',
          expires_at: '2026-09-11T23:00:00',
          invite_status: 'pending',
          host_id: 7,
          host_username: 'student07',
          room_id: 3,
          room_name: 'LAB-C',
        },
      ]),
    };
    const service = new BookingsService(dataSource as unknown as DataSource);

    await expect(service.findPendingInvitations(8)).resolves.toEqual([
      {
        invitation_id: 5,
        booking_id: 11,
        booking_date: '2026-09-12',
        time_slot: '09:00-11:30',
        expires_at: '2026-09-11T23:00:00',
        invite_status: 'pending',
        host: { id: 7, username: 'student07' },
        room: { id: 3, room_name: 'LAB-C' },
      },
    ]);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining("bm.invite_status = 'pending'"),
      [8],
    );
  });

  it('ตอบรับคำเชิญและอนุญาตค้นหาห้องเมื่อทุกคนตอบครบ', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          invitation_id: 5,
          booking_id: 11,
          invite_status: 'pending',
          booking_status: 'pending',
          is_expired: 0,
          booking_date: '2026-09-12',
          time_slot: '09:00-11:30',
          reserved_seats: 3,
          room_id: 3,
          room_name: 'LAB-C',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce([{ pending_members: '0', declined_members: '0' }])
      .mockResolvedValueOnce({ affectedRows: 1 });
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query,
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const service = new BookingsService(dataSource as unknown as DataSource);

    await expect(
      service.respondToInvitation(8, 5, { response: 'accepted' }),
    ).resolves.toEqual({
      booking_id: 11,
      invitation_id: 5,
      invite_status: 'accepted',
      booking_status: 'confirmed',
      can_search_room: false,
      booking_date: '2026-09-12',
      time_slot: '09:00-11:30',
      reserved_seats: 3,
      room: { id: 3, room_name: 'LAB-C' },
    });
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('ตรวจสมาชิกและที่ว่างซ้ำก่อนยืนยันห้องของกลุ่ม', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 11,
          host_id: 7,
          booking_date: '2026-09-12',
          time_slot: '09:00-11:30',
          reserved_seats: 3,
          status: 'pending',
          is_expired: 0,
        },
      ])
      .mockResolvedValueOnce([{ pending_members: '0', declined_members: '0' }])
      .mockResolvedValueOnce([{ id: 3, room_name: 'LAB-C', capacity: 20 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ used_seats: '5' }])
      .mockResolvedValueOnce({ affectedRows: 1 });
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query,
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const service = new BookingsService(dataSource as unknown as DataSource);

    await expect(
      service.confirmGroupBookingRoom(7, 11, { room_id: 3 }),
    ).resolves.toEqual({
      booking_id: 11,
      booking_date: '2026-09-12',
      time_slot: '09:00-11:30',
      reserved_seats: 3,
      status: 'confirmed',
      room: { id: 3, room_name: 'LAB-C' },
    });
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('คืนรายการจองที่ผู้ใช้เป็น host หรือสมาชิก', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ affectedRows: 0 })
        .mockResolvedValueOnce([
          {
            booking_id: 20,
            booking_date: '2026-09-12',
            time_slot: '09:00-11:30',
            reserved_seats: 1,
            status: 'confirmed',
            expires_at: null,
            is_host: 1,
            room_id: 3,
            room_name: 'LAB-C',
          },
        ]),
    };
    const service = new BookingsService(dataSource as unknown as DataSource);

    await expect(service.findUserBookings(7)).resolves.toEqual([
      {
        booking_id: 20,
        booking_date: '2026-09-12',
        time_slot: '09:00-11:30',
        reserved_seats: 1,
        status: 'confirmed',
        expires_at: null,
        is_host: true,
        room: { id: 3, room_name: 'LAB-C' },
      },
    ]);
  });

  it('ให้ host ยกเลิก booking และ commit transaction', async () => {
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 20, status: 'confirmed' }])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 0 }),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const service = new BookingsService(dataSource as unknown as DataSource);

    await expect(service.cancelBooking(7, 20)).resolves.toEqual({
      message: 'ยกเลิกรายการจองสำเร็จ',
    });
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });
});
