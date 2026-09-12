import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type EntryAccessSource = 'class_schedule' | 'booking';

export interface EntryAccessResult {
  allowed: boolean;
  room_id: number;
  source: EntryAccessSource | null;
  reference_id: number | null;
  reason: string;
}

export interface KioskEntryResult extends EntryAccessResult {
  sessionId?: number;
  seatLabel?: string;
  computerName?: string;
  user?: { id: number; displayName: string };
  room?: { id: number; name: string };
}

@Injectable()
export class EntryService {
  constructor(private readonly dataSource: DataSource) {}

  async checkAccess(
    userId: number,
    roomId: number,
  ): Promise<EntryAccessResult> {
    const classRows = this.readRows(
      (await this.dataSource.query(
        `
          SELECT s.id
          FROM subject_enrollments AS se
          INNER JOIN subjects AS s ON s.id = se.subject_id
          INNER JOIN academic_terms AS at ON at.id = s.term_id
          WHERE se.user_id = ?
            AND se.status = 'active'
            AND at.status = 'active'
            AND s.room_id = ?
            AND DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00'))
                BETWEEN at.start_date AND at.end_date
            AND s.day_of_week = DAYNAME(
              CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00')
            )
            AND TIME(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00'))
                BETWEEN s.start_time AND s.end_time
          LIMIT 1
        `,
        [userId, roomId],
      )) as unknown,
    );
    if (classRows[0]) {
      return {
        allowed: true,
        room_id: roomId,
        source: 'class_schedule',
        reference_id: Number(classRows[0].id),
        reason: 'มีสิทธิ์จากตารางเรียนปัจจุบัน',
      };
    }

    const bookingRows = this.readRows(
      (await this.dataSource.query(
        `
          SELECT DISTINCT b.id
          FROM bookings AS b
          LEFT JOIN booking_members AS bm
            ON bm.booking_id = b.id
           AND bm.user_id = ?
           AND bm.invite_status = 'accepted'
          WHERE b.room_id = ?
            AND b.status = 'confirmed'
            AND b.booking_date = DATE(
              CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00')
            )
            AND TIME(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00'))
                BETWEEN STR_TO_DATE(
                  SUBSTRING_INDEX(b.time_slot, '-', 1), '%H:%i'
                )
                AND STR_TO_DATE(
                  SUBSTRING_INDEX(b.time_slot, '-', -1), '%H:%i'
                )
            AND (b.host_id = ? OR bm.id IS NOT NULL)
          LIMIT 1
        `,
        [userId, roomId, userId],
      )) as unknown,
    );
    if (bookingRows[0]) {
      return {
        allowed: true,
        room_id: roomId,
        source: 'booking',
        reference_id: Number(bookingRows[0].id),
        reason: 'มีสิทธิ์จากการจองที่ยืนยันแล้ว',
      };
    }

    return {
      allowed: false,
      room_id: roomId,
      source: null,
      reference_id: null,
      reason: 'ไม่มีตารางเรียนหรือการจองที่ใช้ได้ในเวลานี้',
    };
  }

  async enterRoom(userId: number, roomId: number): Promise<KioskEntryResult> {
    const access = await this.checkAccess(userId, roomId);
    if (!access.allowed) return access;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const existing = this.readRows(
        (await queryRunner.query(
          `
            SELECT ps.id AS session_id, lc.id AS computer_id, lc.machine_no,
                   r.id AS room_id, r.room_name, ta.hostname,
                   u.first_name, u.last_name
            FROM pc_sessions AS ps
            INNER JOIN lab_computers AS lc ON lc.id = ps.computer_id
            INNER JOIN rooms AS r ON r.id = lc.room_id
            INNER JOIN users AS u ON u.id = ps.user_id
            LEFT JOIN tracking_agents AS ta
              ON ta.computer_id = lc.id AND ta.is_enabled = 1
            WHERE ps.user_id = ? AND ps.status = 'online'
            ORDER BY ps.login_time DESC LIMIT 1
            FOR UPDATE
          `,
          [userId],
        )) as unknown,
      )[0];
      if (existing) {
        await queryRunner.commitTransaction();
        return this.toKioskEntry(
          access,
          userId,
          existing,
          Number(existing.room_id) === roomId
            ? 'มี session ในห้องนี้อยู่แล้ว'
            : 'ผู้ใช้อยู่ระหว่างใช้งานเครื่องในห้องอื่น',
          Number(existing.room_id) === roomId,
        );
      }

      const computer = this.readRows(
        (await queryRunner.query(
          `
            SELECT lc.id AS computer_id, lc.machine_no, r.id AS room_id,
                   r.room_name, ta.hostname, u.first_name, u.last_name
            FROM lab_computers AS lc
            INNER JOIN rooms AS r ON r.id = lc.room_id
            INNER JOIN tracking_agents AS ta
              ON ta.computer_id = lc.id
             AND ta.is_enabled = 1
             AND ta.last_seen_at >= UTC_TIMESTAMP() - INTERVAL 90 SECOND
            INNER JOIN users AS u ON u.id = ?
            WHERE lc.room_id = ?
              AND r.status = 'active'
              AND lc.status <> 'maintenance'
              AND NOT EXISTS (
                SELECT 1 FROM pc_sessions AS ps
                WHERE ps.computer_id = lc.id AND ps.status = 'online'
              )
            ORDER BY CAST(lc.machine_no AS UNSIGNED), lc.machine_no, lc.id
            LIMIT 1
            FOR UPDATE
          `,
          [userId, roomId],
        )) as unknown,
      )[0];
      if (!computer) {
        await queryRunner.commitTransaction();
        return {
          ...access,
          allowed: false,
          reason: 'ไม่มีเครื่องที่ Agent ออนไลน์และว่างในห้องนี้',
        };
      }

      const insertResult = (await queryRunner.query(
        `INSERT INTO pc_sessions (computer_id, user_id, status)
         VALUES (?, ?, 'online')`,
        [Number(computer.computer_id), userId],
      )) as unknown;
      const sessionId = this.readInsertId(insertResult);
      await queryRunner.query(
        `UPDATE lab_computers SET status = 'online', last_seen_at = NOW()
         WHERE id = ?`,
        [Number(computer.computer_id)],
      );
      await queryRunner.commitTransaction();
      return this.toKioskEntry(
        access,
        userId,
        { ...computer, session_id: sessionId },
        access.reason,
        true,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private toKioskEntry(
    access: EntryAccessResult,
    userId: number,
    row: Record<string, unknown>,
    reason: string,
    allowed: boolean,
  ): KioskEntryResult {
    return {
      ...access,
      allowed,
      reason,
      sessionId: Number(row.session_id),
      seatLabel: String(row.machine_no),
      computerName: typeof row.hostname === 'string' ? row.hostname : undefined,
      user: {
        id: userId,
        displayName: [row.first_name, row.last_name]
          .filter((value) => typeof value === 'string' && value.length > 0)
          .join(' '),
      },
      room: { id: Number(row.room_id), name: String(row.room_name) },
    };
  }

  private readInsertId(result: unknown): number {
    const id =
      typeof result === 'object' && result !== null
        ? Number((result as Record<string, unknown>).insertId)
        : 0;
    if (!Number.isInteger(id) || id <= 0) {
      throw new TypeError('ฐานข้อมูลไม่ส่ง session_id ที่ถูกต้องกลับมา');
    }
    return id;
  }

  private readRows(result: unknown): Array<Record<string, unknown>> {
    return Array.isArray(result)
      ? result.filter(
          (row: unknown): row is Record<string, unknown> =>
            typeof row === 'object' && row !== null,
        )
      : [];
  }
}
