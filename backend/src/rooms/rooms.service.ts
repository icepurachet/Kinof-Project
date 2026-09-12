import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BookingTimeSlot,
  FindAvailableRoomsDto,
} from './dto/find-available-rooms.dto';

export interface AvailableRoom {
  room_id: number;
  room_name: string;
  capacity: number;
  used_seats: number;
  available_seats: number;
  remaining_after_assignment: number;
}

@Injectable()
export class RoomsService {
  constructor(private readonly dataSource: DataSource) {}

  async findActiveRooms(): Promise<
    Array<{ id: number; name: string; capacity: number }>
  > {
    const result = (await this.dataSource.query(
      `SELECT id, room_name, capacity FROM rooms
       WHERE status = 'active' ORDER BY room_name`,
    )) as unknown;
    if (!Array.isArray(result)) return [];
    return result
      .filter((row) => this.isRoomRow(row))
      .map((row) => ({
        id: Number(row.id),
        name: String(row.room_name),
        capacity: Number(row.capacity),
      }));
  }

  async findAvailableRooms(
    query: FindAvailableRoomsDto,
  ): Promise<AvailableRoom[]> {
    const slotTimes: Record<BookingTimeSlot, { start: string; end: string }> = {
      '09:00-11:30': { start: '09:00:00', end: '11:30:00' },
      '11:30-14:00': { start: '11:30:00', end: '14:00:00' },
      '14:00-16:30': { start: '14:00:00', end: '16:30:00' },
      '16:30-19:00': { start: '16:30:00', end: '19:00:00' },
    };
    const slot = slotTimes[query.time_slot];
    const result = (await this.dataSource.query(
      `
        SELECT
          r.id AS room_id,
          r.room_name,
          r.capacity,
          COALESCE(u.used_seats, 0) AS used_seats,
          r.capacity - COALESCE(u.used_seats, 0) AS available_seats,
          r.capacity - COALESCE(u.used_seats, 0) - ?
            AS remaining_after_assignment
        FROM rooms AS r
        LEFT JOIN (
          SELECT room_id, SUM(reserved_seats) AS used_seats
          FROM bookings
          WHERE booking_date = ?
            AND time_slot = ?
            AND (
              status = 'confirmed'
              OR (status = 'pending' AND expires_at > NOW())
            )
            AND room_id IS NOT NULL
          GROUP BY room_id
        ) AS u ON u.room_id = r.id
        WHERE r.status = 'active'
          AND r.capacity - COALESCE(u.used_seats, 0) >= ?
          AND NOT EXISTS (
            SELECT 1
            FROM subjects AS s
            INNER JOIN academic_terms AS t ON t.id = s.term_id
            WHERE s.room_id = r.id
              AND t.status = 'active'
              AND ? BETWEEN t.start_date AND t.end_date
              AND s.day_of_week = ELT(
                WEEKDAY(?) + 1,
                'Monday', 'Tuesday', 'Wednesday', 'Thursday',
                'Friday', 'Saturday', 'Sunday'
              )
              AND s.start_time < ?
              AND s.end_time > ?
          )
        ORDER BY remaining_after_assignment ASC, r.id ASC
      `,
      [
        query.required_seats,
        query.booking_date,
        query.time_slot,
        query.required_seats,
        query.booking_date,
        query.booking_date,
        slot.end,
        slot.start,
      ],
    )) as unknown;

    if (!Array.isArray(result)) {
      return [];
    }

    return result.map((row: unknown) => this.toAvailableRoom(row));
  }

  private toAvailableRoom(row: unknown): AvailableRoom {
    if (!this.isRoomRow(row)) {
      throw new TypeError('ผลลัพธ์ห้องว่างจากฐานข้อมูลมีรูปแบบไม่ถูกต้อง');
    }

    return {
      room_id: Number(row.room_id),
      room_name: String(row.room_name),
      capacity: Number(row.capacity),
      used_seats: Number(row.used_seats),
      available_seats: Number(row.available_seats),
      remaining_after_assignment: Number(row.remaining_after_assignment),
    };
  }

  private isRoomRow(row: unknown): row is Record<string, unknown> {
    return typeof row === 'object' && row !== null;
  }
}
