import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateUsageLogDto } from './dto/create-usage-log.dto';

export interface TrackingSessionResult {
  session_id: number;
  computer_id: number;
  machine_no: string;
  room_id: number;
  room_name: string;
  login_time: string;
  logout_time: string | null;
  status: 'online' | 'offline';
}

export interface UsageLogResult {
  log_id: number;
  session_id: number;
  log_type: 'program' | 'website';
  name: string;
  duration_minutes: number | null;
  is_suspicious: boolean;
  start_time: string;
  end_time: string | null;
}

@Injectable()
export class TrackingService {
  constructor(private readonly dataSource: DataSource) {}

  async startSession(
    userId: number,
    computerId: number,
  ): Promise<{ session_id: number; status: 'online' }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const computerRows = this.readRows(
        (await queryRunner.query(
          `
            SELECT id, status
            FROM lab_computers
            WHERE id = ?
            FOR UPDATE
          `,
          [computerId],
        )) as unknown,
      );
      const computer = computerRows[0];
      if (!computer) {
        throw new NotFoundException('ไม่พบเครื่องคอมพิวเตอร์');
      }
      if (computer.status === 'maintenance') {
        throw new ConflictException('เครื่องนี้อยู่ระหว่างซ่อมบำรุง');
      }

      const activeRows = this.readRows(
        (await queryRunner.query(
          `
            SELECT id
            FROM pc_sessions
            WHERE computer_id = ? AND status = 'online'
            LIMIT 1
            FOR UPDATE
          `,
          [computerId],
        )) as unknown,
      );
      if (activeRows.length > 0) {
        throw new ConflictException('เครื่องนี้กำลังถูกใช้งานอยู่');
      }

      const insertResult = (await queryRunner.query(
        `
          INSERT INTO pc_sessions (computer_id, user_id, status)
          VALUES (?, ?, 'online')
        `,
        [computerId, userId],
      )) as unknown;
      const sessionId = this.readInsertId(insertResult, 'session_id');

      await queryRunner.query(
        `
          UPDATE lab_computers
          SET status = 'online', last_seen_at = NOW()
          WHERE id = ?
        `,
        [computerId],
      );
      await queryRunner.commitTransaction();
      return { session_id: sessionId, status: 'online' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async endSession(
    userId: number,
    sessionId: number,
  ): Promise<{ session_id: number; status: 'offline' }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const sessionRows = this.readRows(
        (await queryRunner.query(
          `
            SELECT id, computer_id
            FROM pc_sessions
            WHERE id = ? AND user_id = ? AND status = 'online'
            FOR UPDATE
          `,
          [sessionId, userId],
        )) as unknown,
      );
      const session = sessionRows[0];
      if (!session) {
        throw new NotFoundException('ไม่พบ session ที่กำลังใช้งาน');
      }
      const computerId = Number(session.computer_id);

      await queryRunner.query(
        `
          UPDATE pc_sessions
          SET status = 'offline', logout_time = NOW()
          WHERE id = ?
        `,
        [sessionId],
      );
      await queryRunner.query(
        `
          UPDATE lab_computers
          SET status = 'offline', last_seen_at = NOW()
          WHERE id = ?
        `,
        [computerId],
      );
      await queryRunner.commitTransaction();
      return { session_id: sessionId, status: 'offline' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async createUsageLog(
    userId: number,
    dto: CreateUsageLogDto,
  ): Promise<UsageLogResult> {
    const sessionRows = this.readRows(
      (await this.dataSource.query(
        `
          SELECT id
          FROM pc_sessions
          WHERE id = ? AND user_id = ? AND status = 'online'
          LIMIT 1
        `,
        [dto.session_id, userId],
      )) as unknown,
    );
    if (sessionRows.length === 0) {
      throw new NotFoundException('ไม่พบ session ที่กำลังใช้งาน');
    }

    const startTime = new Date(dto.start_time);
    const endTime = dto.end_time ? new Date(dto.end_time) : null;
    if (endTime && endTime.getTime() < startTime.getTime()) {
      throw new BadRequestException('end_time ต้องไม่น้อยกว่า start_time');
    }

    const suspicious =
      dto.log_type === 'website' && (await this.isBlockedWebsite(dto.name));
    const durationMinutes = endTime
      ? Math.ceil((endTime.getTime() - startTime.getTime()) / 60_000)
      : null;

    const insertResult = (await this.dataSource.query(
      `
        INSERT INTO usage_logs (
          log_type, name, duration_minutes, is_suspicious,
          start_time, end_time, session_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        dto.log_type,
        dto.name,
        durationMinutes,
        suspicious ? 1 : 0,
        startTime,
        endTime,
        dto.session_id,
      ],
    )) as unknown;

    return {
      log_id: this.readInsertId(insertResult, 'log_id'),
      session_id: dto.session_id,
      log_type: dto.log_type,
      name: dto.name,
      duration_minutes: durationMinutes,
      is_suspicious: suspicious,
      start_time: startTime.toISOString(),
      end_time: endTime?.toISOString() ?? null,
    };
  }

  async findUserSessions(userId: number): Promise<TrackingSessionResult[]> {
    const result = (await this.dataSource.query(
      `
        SELECT
          ps.id AS session_id,
          ps.computer_id,
          lc.machine_no,
          lc.room_id,
          r.room_name,
          DATE_FORMAT(ps.login_time, '%Y-%m-%dT%H:%i:%s') AS login_time,
          DATE_FORMAT(ps.logout_time, '%Y-%m-%dT%H:%i:%s') AS logout_time,
          ps.status
        FROM pc_sessions AS ps
        INNER JOIN lab_computers AS lc ON lc.id = ps.computer_id
        INNER JOIN rooms AS r ON r.id = lc.room_id
        WHERE ps.user_id = ?
        ORDER BY ps.login_time DESC, ps.id DESC
      `,
      [userId],
    )) as unknown;

    return this.readRows(result).map((row) => ({
      session_id: Number(row.session_id),
      computer_id: Number(row.computer_id),
      machine_no: String(row.machine_no),
      room_id: Number(row.room_id),
      room_name: String(row.room_name),
      login_time: String(row.login_time),
      logout_time: typeof row.logout_time === 'string' ? row.logout_time : null,
      status: row.status as TrackingSessionResult['status'],
    }));
  }

  async findSessionLogs(
    userId: number,
    sessionId: number,
  ): Promise<UsageLogResult[]> {
    const result = (await this.dataSource.query(
      `
        SELECT
          ul.id AS log_id,
          ul.session_id,
          ul.log_type,
          ul.name,
          ul.duration_minutes,
          ul.is_suspicious,
          DATE_FORMAT(ul.start_time, '%Y-%m-%dT%H:%i:%s') AS start_time,
          DATE_FORMAT(ul.end_time, '%Y-%m-%dT%H:%i:%s') AS end_time
        FROM usage_logs AS ul
        INNER JOIN pc_sessions AS ps ON ps.id = ul.session_id
        WHERE ul.session_id = ? AND ps.user_id = ?
        ORDER BY ul.start_time DESC, ul.id DESC
      `,
      [sessionId, userId],
    )) as unknown;

    return this.readRows(result).map((row) => ({
      log_id: Number(row.log_id),
      session_id: Number(row.session_id),
      log_type: row.log_type as UsageLogResult['log_type'],
      name: String(row.name),
      duration_minutes:
        row.duration_minutes === null ? null : Number(row.duration_minutes),
      is_suspicious: Number(row.is_suspicious) === 1,
      start_time: String(row.start_time),
      end_time: typeof row.end_time === 'string' ? row.end_time : null,
    }));
  }

  private async isBlockedWebsite(value: string): Promise<boolean> {
    const hostname = this.toHostname(value);
    const result = (await this.dataSource.query(
      `
        SELECT id
        FROM blocked_domains
        WHERE LOWER(domain_name) = ?
           OR ? LIKE CONCAT('%.', LOWER(domain_name))
        LIMIT 1
      `,
      [hostname, hostname],
    )) as unknown;
    return this.readRows(result).length > 0;
  }

  private toHostname(value: string): string {
    try {
      return new URL(
        value.includes('://') ? value : `https://${value}`,
      ).hostname
        .toLowerCase()
        .replace(/^www\./, '');
    } catch {
      return value
        .toLowerCase()
        .replace(/^www\./, '')
        .split('/')[0];
    }
  }

  private readRows(result: unknown): Array<Record<string, unknown>> {
    return Array.isArray(result)
      ? result.filter(
          (row: unknown): row is Record<string, unknown> =>
            typeof row === 'object' && row !== null,
        )
      : [];
  }

  private readInsertId(result: unknown, fieldName: string): number {
    if (typeof result !== 'object' || result === null) {
      throw new TypeError(`ฐานข้อมูลไม่ส่ง ${fieldName} กลับมา`);
    }
    const id = Number((result as Record<string, unknown>).insertId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new TypeError(`ฐานข้อมูลส่ง ${fieldName} ไม่ถูกต้อง`);
    }
    return id;
  }
}
