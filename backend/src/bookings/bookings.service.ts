import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { BookingTimeSlot } from '../rooms/dto/find-available-rooms.dto';
import { CreateSoloBookingDto } from './dto/create-solo-booking.dto';
import { CreateGroupBookingDto } from './dto/create-group-booking.dto';
import { RespondInvitationDto } from './dto/respond-invitation.dto';
import { ConfirmBookingRoomDto } from './dto/confirm-booking-room.dto';

interface BookingSlot {
  booking_date: string;
  time_slot: BookingTimeSlot;
}

interface RoomBookingSlot extends BookingSlot {
  room_id: number;
}

interface RoomRow extends Record<string, unknown> {
  id: number | string;
  room_name: string;
  capacity: number | string;
}

export interface SoloBookingResult {
  booking_id: number;
  booking_date: string;
  time_slot: BookingTimeSlot;
  reserved_seats: 1;
  status: 'confirmed';
  room: {
    id: number;
    room_name: string;
  };
}

export interface GroupBookingResult {
  booking_id: number;
  booking_date: string;
  time_slot: BookingTimeSlot;
  reserved_seats: number;
  status: 'pending';
  expires_in_seconds: 300;
  room: null;
  members: Array<{
    user_id: number;
    invite_status: 'pending';
  }>;
}

export interface BookingInvitation {
  invitation_id: number;
  booking_id: number;
  booking_date: string;
  time_slot: BookingTimeSlot;
  expires_at: string;
  invite_status: 'pending';
  host: {
    id: number;
    username: string;
  };
  room: {
    id: number;
    room_name: string;
  } | null;
}

export interface InvitationResponseResult {
  booking_id: number;
  invitation_id: number;
  invite_status: 'accepted' | 'declined';
  booking_status: 'pending' | 'confirmed' | 'cancelled';
  can_search_room: boolean;
  booking_date: string;
  time_slot: BookingTimeSlot;
  reserved_seats: number;
  room: {
    id: number;
    room_name: string;
  } | null;
}

export interface ConfirmedGroupBookingResult {
  booking_id: number;
  booking_date: string;
  time_slot: BookingTimeSlot;
  reserved_seats: number;
  status: 'confirmed';
  room: {
    id: number;
    room_name: string;
  };
}

export interface UserBookingSummary {
  booking_id: number;
  booking_date: string;
  time_slot: BookingTimeSlot;
  reserved_seats: number;
  status: string;
  expires_at: string | null;
  is_host: boolean;
  room: { id: number; room_name: string } | null;
}

@Injectable()
export class BookingsService {
  constructor(private readonly dataSource: DataSource) {}

  async createSoloBooking(
    hostId: number,
    dto: CreateSoloBookingDto,
  ): Promise<SoloBookingResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const room = await this.findAndLockRoom(queryRunner, dto.room_id);
      await this.ensureHostHasNoBooking(queryRunner, hostId, dto);
      await this.ensureNoClassSchedule(queryRunner, dto);
      await this.ensureRoomHasCapacity(queryRunner, room, dto, 1);

      const insertResult = (await queryRunner.query(
        `
          INSERT INTO bookings (
            booking_date,
            time_slot,
            reserved_seats,
            status,
            confirmed_at,
            host_id,
            room_id
          ) VALUES (?, ?, 1, 'confirmed', NOW(), ?, ?)
        `,
        [dto.booking_date, dto.time_slot, hostId, dto.room_id],
      )) as unknown;
      const bookingId = this.readInsertId(insertResult);

      await queryRunner.commitTransaction();

      return {
        booking_id: bookingId,
        booking_date: dto.booking_date,
        time_slot: dto.time_slot,
        reserved_seats: 1,
        status: 'confirmed',
        room: {
          id: Number(room.id),
          room_name: room.room_name,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findUserBookings(userId: number): Promise<UserBookingSummary[]> {
    await this.expirePendingBookings();
    const result = (await this.dataSource.query(
      `
        SELECT DISTINCT
          b.id AS booking_id,
          DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
          b.time_slot,
          b.reserved_seats,
          b.status,
          DATE_FORMAT(b.expires_at, '%Y-%m-%dT%H:%i:%s') AS expires_at,
          b.host_id = ? AS is_host,
          r.id AS room_id,
          r.room_name
        FROM bookings AS b
        LEFT JOIN booking_members AS bm ON bm.booking_id = b.id
        LEFT JOIN rooms AS r ON r.id = b.room_id
        WHERE b.host_id = ?
           OR (bm.user_id = ? AND bm.invite_status = 'accepted')
        ORDER BY booking_date DESC, booking_id DESC
      `,
      [userId, userId, userId],
    )) as unknown;

    return this.readRows(result).map((row) => this.toUserBooking(row));
  }

  async findUserBookingDetail(
    userId: number,
    bookingId: number,
  ): Promise<UserBookingSummary & { members: Array<Record<string, unknown>> }> {
    await this.expirePendingBookings();
    const bookings = (await this.dataSource.query(
      `
        SELECT DISTINCT
          b.id AS booking_id,
          DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
          b.time_slot,
          b.reserved_seats,
          b.status,
          DATE_FORMAT(b.expires_at, '%Y-%m-%dT%H:%i:%s') AS expires_at,
          b.host_id = ? AS is_host,
          r.id AS room_id,
          r.room_name
        FROM bookings AS b
        LEFT JOIN booking_members AS access_member
          ON access_member.booking_id = b.id
        LEFT JOIN rooms AS r ON r.id = b.room_id
        WHERE b.id = ?
          AND (
            b.host_id = ?
            OR (access_member.user_id = ? AND access_member.invite_status <> 'removed')
          )
        LIMIT 1
      `,
      [userId, bookingId, userId, userId],
    )) as unknown;
    const booking = this.firstRow(bookings);
    if (!booking) {
      throw new NotFoundException('ไม่พบรายการจองนี้');
    }

    const members = (await this.dataSource.query(
      `
        SELECT
          bm.id AS invitation_id,
          u.id AS user_id,
          u.username,
          bm.invite_status,
          DATE_FORMAT(bm.responded_at, '%Y-%m-%dT%H:%i:%s') AS responded_at
        FROM booking_members AS bm
        INNER JOIN users AS u ON u.id = bm.user_id
        WHERE bm.booking_id = ? AND bm.invite_status <> 'removed'
        ORDER BY bm.id ASC
      `,
      [bookingId],
    )) as unknown;

    return {
      ...this.toUserBooking(booking),
      members: this.readRows(members),
    };
  }

  async cancelBooking(
    hostId: number,
    bookingId: number,
  ): Promise<{ message: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = (await queryRunner.query(
        `
          SELECT id, status
          FROM bookings
          WHERE id = ? AND host_id = ?
          FOR UPDATE
        `,
        [bookingId, hostId],
      )) as unknown;
      const booking = this.firstRow(result);
      if (!booking) {
        throw new NotFoundException('ไม่พบรายการจองนี้');
      }
      if (booking.status !== 'pending' && booking.status !== 'confirmed') {
        throw new ConflictException('รายการจองนี้ยกเลิกไม่ได้แล้ว');
      }

      await queryRunner.query(
        `UPDATE bookings SET status = 'cancelled' WHERE id = ?`,
        [bookingId],
      );
      await queryRunner.query(
        `
          UPDATE booking_members
          SET invite_status = 'removed', removed_at = NOW()
          WHERE booking_id = ? AND invite_status = 'pending'
        `,
        [bookingId],
      );
      await queryRunner.commitTransaction();
      return { message: 'ยกเลิกรายการจองสำเร็จ' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async createGroupBooking(
    hostId: number,
    dto: CreateGroupBookingDto,
  ): Promise<GroupBookingResult> {
    const uniqueMemberIds = [...new Set(dto.member_ids)];
    if (
      uniqueMemberIds.length !== dto.member_ids.length ||
      uniqueMemberIds.includes(hostId)
    ) {
      throw new ConflictException(
        'รายชื่อสมาชิกซ้ำ หรือมีผู้จองอยู่ในรายชื่อเชิญ',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.ensureInvitedUsersExist(queryRunner, uniqueMemberIds);
      await this.ensureHostHasNoBooking(queryRunner, hostId, dto);

      const insertResult = (await queryRunner.query(
        `
          INSERT INTO bookings (
            booking_date,
            time_slot,
            reserved_seats,
            status,
            expires_at,
            host_id,
            room_id
          ) VALUES (?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 5 MINUTE), ?, NULL)
        `,
        [dto.booking_date, dto.time_slot, uniqueMemberIds.length + 1, hostId],
      )) as unknown;
      const bookingId = this.readInsertId(insertResult);
      const memberValues = uniqueMemberIds.map(() => "(?, ?, 'pending')");
      const memberParameters = uniqueMemberIds.flatMap((userId) => [
        bookingId,
        userId,
      ]);

      await queryRunner.query(
        `
          INSERT INTO booking_members (booking_id, user_id, invite_status)
          VALUES ${memberValues.join(', ')}
        `,
        memberParameters,
      );
      await queryRunner.commitTransaction();

      return {
        booking_id: bookingId,
        booking_date: dto.booking_date,
        time_slot: dto.time_slot,
        reserved_seats: uniqueMemberIds.length + 1,
        status: 'pending',
        expires_in_seconds: 300,
        room: null,
        members: uniqueMemberIds.map((userId) => ({
          user_id: userId,
          invite_status: 'pending',
        })),
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findPendingInvitations(userId: number): Promise<BookingInvitation[]> {
    const result = (await this.dataSource.query(
      `
        SELECT
          bm.id AS invitation_id,
          b.id AS booking_id,
          DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
          b.time_slot,
          DATE_FORMAT(b.expires_at, '%Y-%m-%dT%H:%i:%s') AS expires_at,
          bm.invite_status,
          host.id AS host_id,
          host.username AS host_username,
          r.id AS room_id,
          r.room_name
        FROM booking_members AS bm
        INNER JOIN bookings AS b ON b.id = bm.booking_id
        INNER JOIN users AS host ON host.id = b.host_id
        LEFT JOIN rooms AS r ON r.id = b.room_id
        WHERE bm.user_id = ?
          AND bm.invite_status = 'pending'
          AND b.status = 'pending'
          AND b.expires_at > NOW()
        ORDER BY b.expires_at ASC, bm.id ASC
      `,
      [userId],
    )) as unknown;

    return this.readRows(result).map((row) => ({
      invitation_id: Number(row.invitation_id),
      booking_id: Number(row.booking_id),
      booking_date: String(row.booking_date),
      time_slot: row.time_slot as BookingTimeSlot,
      expires_at: String(row.expires_at),
      invite_status: 'pending',
      host: {
        id: Number(row.host_id),
        username: String(row.host_username),
      },
      room:
        row.room_id === null
          ? null
          : {
              id: Number(row.room_id),
              room_name: String(row.room_name),
            },
    }));
  }

  async respondToInvitation(
    userId: number,
    invitationId: number,
    dto: RespondInvitationDto,
  ): Promise<InvitationResponseResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const invitationResult = (await queryRunner.query(
        `
          SELECT
            bm.id AS invitation_id,
            bm.booking_id,
            bm.invite_status,
            b.status AS booking_status,
            b.expires_at <= NOW() AS is_expired,
            DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
            b.time_slot,
            b.reserved_seats,
            r.id AS room_id,
            r.room_name
          FROM booking_members AS bm
          INNER JOIN bookings AS b ON b.id = bm.booking_id
          LEFT JOIN rooms AS r ON r.id = b.room_id
          WHERE bm.id = ? AND bm.user_id = ?
          FOR UPDATE
        `,
        [invitationId, userId],
      )) as unknown;
      const invitation = this.firstRow(invitationResult);

      if (!invitation) {
        throw new NotFoundException('ไม่พบคำเชิญนี้');
      }
      if (
        invitation.invite_status !== 'pending' ||
        invitation.booking_status !== 'pending'
      ) {
        throw new ConflictException('คำเชิญนี้ถูกตอบหรือยกเลิกแล้ว');
      }
      if (Number(invitation.is_expired) === 1) {
        throw new GoneException('คำเชิญนี้หมดเวลาแล้ว');
      }

      if (dto.response === 'accepted') {
        await this.ensureMemberHasNoBooking(
          queryRunner,
          userId,
          Number(invitation.booking_id),
          String(invitation.booking_date),
          invitation.time_slot as BookingTimeSlot,
        );
      }

      await queryRunner.query(
        `
          UPDATE booking_members
          SET invite_status = ?, responded_at = NOW()
          WHERE id = ?
        `,
        [dto.response, invitationId],
      );

      if (dto.response === 'declined') {
        await queryRunner.query(
          `
            UPDATE bookings
            SET status = 'cancelled'
            WHERE id = ? AND status = 'pending'
          `,
          [invitation.booking_id],
        );
        await queryRunner.query(
          `
            UPDATE booking_members
            SET invite_status = 'removed', removed_at = NOW()
            WHERE booking_id = ? AND invite_status = 'pending'
          `,
          [invitation.booking_id],
        );
        await queryRunner.commitTransaction();

        return {
          booking_id: Number(invitation.booking_id),
          invitation_id: invitationId,
          invite_status: 'declined',
          booking_status: 'cancelled',
          can_search_room: false,
          booking_date: String(invitation.booking_date),
          time_slot: invitation.time_slot as BookingTimeSlot,
          reserved_seats: Number(invitation.reserved_seats),
          room: this.toOptionalRoom(invitation),
        };
      }

      const progressResult = (await queryRunner.query(
        `
          SELECT
            SUM(invite_status = 'pending') AS pending_members,
            SUM(invite_status = 'declined') AS declined_members
          FROM booking_members
          WHERE booking_id = ? AND invite_status <> 'removed'
        `,
        [invitation.booking_id],
      )) as unknown;
      const progress = this.firstRow(progressResult);
      const canSearchRoom =
        Number(progress?.pending_members ?? 0) === 0 &&
        Number(progress?.declined_members ?? 0) === 0;

      if (canSearchRoom) {
        await queryRunner.query(
          `UPDATE bookings
           SET expires_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE)
           WHERE id = ? AND status = 'pending'`,
          [invitation.booking_id],
        );
      }

      await queryRunner.commitTransaction();

      return {
        booking_id: Number(invitation.booking_id),
        invitation_id: invitationId,
        invite_status: 'accepted',
        booking_status: 'pending',
        can_search_room: canSearchRoom && invitation.room_id === null,
        booking_date: String(invitation.booking_date),
        time_slot: invitation.time_slot as BookingTimeSlot,
        reserved_seats: Number(invitation.reserved_seats),
        room: this.toOptionalRoom(invitation),
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async confirmGroupBookingRoom(
    hostId: number,
    bookingId: number,
    dto: ConfirmBookingRoomDto,
  ): Promise<ConfirmedGroupBookingResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const bookingResult = (await queryRunner.query(
        `
          SELECT
            id,
            host_id,
            DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date,
            time_slot,
            reserved_seats,
            status,
            expires_at <= NOW() AS is_expired
          FROM bookings
          WHERE id = ? AND host_id = ?
          FOR UPDATE
        `,
        [bookingId, hostId],
      )) as unknown;
      const booking = this.firstRow(bookingResult);

      if (!booking) {
        throw new NotFoundException('ไม่พบรายการจองกลุ่มนี้');
      }
      if (booking.status !== 'pending') {
        throw new ConflictException('รายการจองนี้ไม่ได้อยู่ในสถานะรอเลือกห้อง');
      }
      if (Number(booking.is_expired) === 1) {
        throw new GoneException('รายการจองกลุ่มหมดเวลาแล้ว');
      }

      const progressResult = (await queryRunner.query(
        `
          SELECT
            SUM(invite_status = 'pending') AS pending_members,
            SUM(invite_status = 'declined') AS declined_members
          FROM booking_members
          WHERE booking_id = ? AND invite_status <> 'removed'
        `,
        [bookingId],
      )) as unknown;
      const progress = this.firstRow(progressResult);
      if (
        Number(progress?.pending_members ?? 0) !== 0 ||
        Number(progress?.declined_members ?? 0) !== 0
      ) {
        throw new ConflictException('สมาชิกยังตอบรับไม่ครบ');
      }

      const room = await this.findAndLockRoom(queryRunner, dto.room_id);
      const bookingSlot: RoomBookingSlot = {
        booking_date: String(booking.booking_date),
        time_slot: booking.time_slot as BookingTimeSlot,
        room_id: dto.room_id,
      };
      await this.ensureNoClassSchedule(queryRunner, bookingSlot);
      await this.ensureRoomHasCapacity(
        queryRunner,
        room,
        bookingSlot,
        Number(booking.reserved_seats),
        bookingId,
      );

      await queryRunner.query(
        `
          UPDATE bookings
          SET room_id = ?, status = 'confirmed', confirmed_at = NOW()
          WHERE id = ? AND status = 'pending'
        `,
        [dto.room_id, bookingId],
      );
      await queryRunner.commitTransaction();

      return {
        booking_id: bookingId,
        booking_date: String(booking.booking_date),
        time_slot: booking.time_slot as BookingTimeSlot,
        reserved_seats: Number(booking.reserved_seats),
        status: 'confirmed',
        room: {
          id: Number(room.id),
          room_name: room.room_name,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async findAndLockRoom(
    queryRunner: QueryRunner,
    roomId: number,
  ): Promise<RoomRow> {
    const result = (await queryRunner.query(
      `
        SELECT id, room_name, capacity
        FROM rooms
        WHERE id = ? AND status = 'active'
        FOR UPDATE
      `,
      [roomId],
    )) as unknown;
    const room = this.firstRow(result);

    if (!this.isRoomRow(room)) {
      throw new NotFoundException('ไม่พบห้องที่พร้อมใช้งาน');
    }

    return room;
  }

  private async ensureHostHasNoBooking(
    queryRunner: QueryRunner,
    hostId: number,
    dto: BookingSlot,
  ): Promise<void> {
    const result = (await queryRunner.query(
      `
        SELECT id
        FROM bookings
        WHERE host_id = ?
          AND booking_date = ?
          AND time_slot = ?
          AND status IN ('pending', 'confirmed')
        LIMIT 1
      `,
      [hostId, dto.booking_date, dto.time_slot],
    )) as unknown;

    if (this.firstRow(result)) {
      throw new ConflictException('ผู้ใช้มีรายการจองในช่วงเวลานี้แล้ว');
    }
  }

  private async ensureInvitedUsersExist(
    queryRunner: QueryRunner,
    memberIds: number[],
  ): Promise<void> {
    const placeholders = memberIds.map(() => '?').join(', ');
    const result = (await queryRunner.query(
      `
        SELECT id
        FROM users
        WHERE is_active = TRUE
          AND id IN (${placeholders})
        FOR UPDATE
      `,
      memberIds,
    )) as unknown;
    const foundIds = this.readRows(result).map((row) => Number(row.id));

    if (foundIds.length !== memberIds.length) {
      throw new NotFoundException('มีสมาชิกบางคนที่ไม่พบหรือถูกระงับบัญชี');
    }
  }

  private async ensureMemberHasNoBooking(
    queryRunner: QueryRunner,
    userId: number,
    currentBookingId: number,
    bookingDate: string,
    timeSlot: BookingTimeSlot,
  ): Promise<void> {
    const result = (await queryRunner.query(
      `
        SELECT DISTINCT b.id
        FROM bookings AS b
        LEFT JOIN booking_members AS bm ON bm.booking_id = b.id
        WHERE b.id <> ?
          AND b.booking_date = ?
          AND b.time_slot = ?
          AND b.status IN ('pending', 'confirmed')
          AND (
            b.host_id = ?
            OR (bm.user_id = ? AND bm.invite_status = 'accepted')
          )
        LIMIT 1
      `,
      [currentBookingId, bookingDate, timeSlot, userId, userId],
    )) as unknown;

    if (this.firstRow(result)) {
      throw new ConflictException('ผู้ใช้มีรายการจองในช่วงเวลานี้แล้ว');
    }
  }

  private async ensureNoClassSchedule(
    queryRunner: QueryRunner,
    dto: RoomBookingSlot,
  ): Promise<void> {
    const slot = this.getSlotTimes(dto.time_slot);
    const result = (await queryRunner.query(
      `
        SELECT 1
        FROM subjects AS s
        INNER JOIN academic_terms AS t ON t.id = s.term_id
        WHERE s.room_id = ?
          AND t.status = 'active'
          AND ? BETWEEN t.start_date AND t.end_date
          AND s.day_of_week = ELT(
            WEEKDAY(?) + 1,
            'Monday', 'Tuesday', 'Wednesday', 'Thursday',
            'Friday', 'Saturday', 'Sunday'
          )
          AND s.start_time < ?
          AND s.end_time > ?
        LIMIT 1
      `,
      [dto.room_id, dto.booking_date, dto.booking_date, slot.end, slot.start],
    )) as unknown;

    if (this.firstRow(result)) {
      throw new ConflictException('ห้องนี้มีตารางเรียนทับช่วงเวลาที่เลือก');
    }
  }

  private async ensureRoomHasCapacity(
    queryRunner: QueryRunner,
    room: RoomRow,
    dto: RoomBookingSlot,
    requiredSeats: number,
    excludeBookingId?: number,
  ): Promise<void> {
    const result = (await queryRunner.query(
      `
        SELECT COALESCE(SUM(reserved_seats), 0) AS used_seats
        FROM bookings
        WHERE room_id = ?
          AND booking_date = ?
          AND time_slot = ?
          AND (
            status = 'confirmed'
            OR (status = 'pending' AND expires_at > NOW())
          )
          AND (? IS NULL OR id <> ?)
      `,
      [
        dto.room_id,
        dto.booking_date,
        dto.time_slot,
        excludeBookingId ?? null,
        excludeBookingId ?? null,
      ],
    )) as unknown;
    const usage = this.firstRow(result);
    const usedSeats = Number(usage?.used_seats ?? 0);

    if (usedSeats + requiredSeats > Number(room.capacity)) {
      throw new ConflictException('ห้องนี้มีที่นั่งไม่พอสำหรับการจอง');
    }
  }

  private getSlotTimes(slot: BookingTimeSlot): {
    start: string;
    end: string;
  } {
    return {
      '09:00-11:30': { start: '09:00:00', end: '11:30:00' },
      '11:30-14:00': { start: '11:30:00', end: '14:00:00' },
      '14:00-16:30': { start: '14:00:00', end: '16:30:00' },
      '16:30-19:00': { start: '16:30:00', end: '19:00:00' },
    }[slot];
  }

  private firstRow(result: unknown): Record<string, unknown> | undefined {
    if (!Array.isArray(result)) {
      return undefined;
    }

    const row: unknown = result[0];
    return typeof row === 'object' && row !== null
      ? (row as Record<string, unknown>)
      : undefined;
  }

  private readRows(result: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(result)) {
      return [];
    }

    return result.filter(
      (row: unknown): row is Record<string, unknown> =>
        typeof row === 'object' && row !== null,
    );
  }

  private isRoomRow(row: unknown): row is RoomRow {
    if (typeof row !== 'object' || row === null) {
      return false;
    }

    const room = row as Record<string, unknown>;
    return (
      (typeof room.id === 'number' || typeof room.id === 'string') &&
      typeof room.room_name === 'string' &&
      (typeof room.capacity === 'number' || typeof room.capacity === 'string')
    );
  }

  private readInsertId(result: unknown): number {
    if (typeof result !== 'object' || result === null) {
      throw new TypeError('ฐานข้อมูลไม่ส่ง booking_id กลับมา');
    }

    const insertId = Number((result as Record<string, unknown>).insertId);
    if (!Number.isInteger(insertId) || insertId <= 0) {
      throw new TypeError('ฐานข้อมูลส่ง booking_id ไม่ถูกต้อง');
    }

    return insertId;
  }

  private toOptionalRoom(
    row: Record<string, unknown>,
  ): { id: number; room_name: string } | null {
    return row.room_id === null || row.room_id === undefined
      ? null
      : { id: Number(row.room_id), room_name: String(row.room_name) };
  }

  private async expirePendingBookings(): Promise<void> {
    await this.dataSource.query(
      `
        UPDATE bookings
        SET status = 'expired'
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at <= NOW()
      `,
    );
  }

  private toUserBooking(row: Record<string, unknown>): UserBookingSummary {
    const roomId = row.room_id === null ? null : Number(row.room_id);
    return {
      booking_id: Number(row.booking_id),
      booking_date: String(row.booking_date),
      time_slot: row.time_slot as BookingTimeSlot,
      reserved_seats: Number(row.reserved_seats),
      status: String(row.status),
      expires_at:
        typeof row.expires_at === 'string'
          ? row.expires_at
          : row.expires_at instanceof Date
            ? row.expires_at.toISOString()
            : null,
      is_host: Number(row.is_host) === 1,
      room:
        roomId === null
          ? null
          : { id: roomId, room_name: String(row.room_name) },
    };
  }
}
