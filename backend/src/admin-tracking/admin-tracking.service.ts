import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { CreateAgentDto } from './dto/create-agent.dto';
import { ExportTrackingDto } from './dto/export-tracking.dto';
import { QueueCommandDto } from './dto/queue-command.dto';

@Injectable()
export class AdminTrackingService {
  constructor(private readonly dataSource: DataSource) {}

  async summary(): Promise<Record<string, number>> {
    const rows = this.readRows(
      (await this.dataSource.query(`
        SELECT
          COUNT(*) AS machines_total,
          SUM(CASE WHEN lc.status = 'maintenance' OR r.status = 'maintenance'
            THEN 1 ELSE 0 END) AS maintenance,
          SUM(CASE WHEN lc.status <> 'maintenance' AND r.status <> 'maintenance'
            AND (ta.last_seen_at IS NULL OR ta.last_seen_at < UTC_TIMESTAMP() - INTERVAL 90 SECOND)
            THEN 1 ELSE 0 END) AS offline,
          SUM(CASE WHEN lc.status <> 'maintenance' AND r.status = 'active'
            AND ta.last_seen_at >= UTC_TIMESTAMP() - INTERVAL 90 SECOND
            AND ps.id IS NULL THEN 1 ELSE 0 END) AS available,
          SUM(CASE WHEN lc.status <> 'maintenance' AND r.status = 'active'
            AND ta.last_seen_at >= UTC_TIMESTAMP() - INTERVAL 90 SECOND
            AND ps.id IS NOT NULL THEN 1 ELSE 0 END) AS in_use,
          COUNT(DISTINCT ps.user_id) AS active_users,
          (SELECT COUNT(*) FROM tracking_events AS today_event
            WHERE today_event.event_type = 'website'
              AND DATE(CONVERT_TZ(today_event.occurred_at, '+00:00', '+07:00'))
                = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00'))
          ) AS websites_today,
          (SELECT COUNT(*) FROM tracking_events AS risk_event
            WHERE risk_event.risk_level <> 'none'
              AND DATE(CONVERT_TZ(risk_event.occurred_at, '+00:00', '+07:00'))
                = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00'))
          ) AS flagged_count
        FROM lab_computers AS lc
        INNER JOIN rooms AS r ON r.id = lc.room_id
        LEFT JOIN tracking_agents AS ta
          ON ta.computer_id = lc.id AND ta.is_enabled = 1
        LEFT JOIN pc_sessions AS ps
          ON ps.computer_id = lc.id AND ps.status = 'online'
      `)) as unknown,
    );
    const row = rows[0] ?? {};
    return {
      machines_total: Number(row.machines_total ?? 0),
      available: Number(row.available ?? 0),
      in_use: Number(row.in_use ?? 0),
      offline: Number(row.offline ?? 0),
      maintenance: Number(row.maintenance ?? 0),
      active_users: Number(row.active_users ?? 0),
      websites_today: Number(row.websites_today ?? 0),
      flagged_count: Number(row.flagged_count ?? 0),
    };
  }

  async rooms(): Promise<Array<Record<string, unknown>>> {
    return this.readRows(
      (await this.dataSource.query(`
        SELECT
          r.id AS room_id, r.room_name, r.status,
          COUNT(lc.id) AS machine_count,
          SUM(CASE WHEN ta.last_seen_at >= UTC_TIMESTAMP() - INTERVAL 90 SECOND
            THEN 1 ELSE 0 END) AS agent_online_count,
          SUM(CASE WHEN ps.id IS NOT NULL THEN 1 ELSE 0 END) AS active_user_count
        FROM rooms AS r
        LEFT JOIN lab_computers AS lc ON lc.room_id = r.id
        LEFT JOIN tracking_agents AS ta
          ON ta.computer_id = lc.id AND ta.is_enabled = 1
        LEFT JOIN pc_sessions AS ps
          ON ps.computer_id = lc.id AND ps.status = 'online'
        GROUP BY r.id
        ORDER BY r.room_name
      `)) as unknown,
    ).map((row) => ({
      room_id: Number(row.room_id),
      room_name: this.readString(row.room_name),
      status: row.status,
      machine_count: Number(row.machine_count ?? 0),
      agent_online_count: Number(row.agent_online_count ?? 0),
      active_user_count: Number(row.active_user_count ?? 0),
    }));
  }

  async computers(roomId?: number): Promise<Array<Record<string, unknown>>> {
    const where = roomId ? 'WHERE lc.room_id = ?' : '';
    const parameters = roomId ? [roomId] : [];
    return this.readRows(
      (await this.dataSource.query(
        `
          SELECT
            lc.id AS computer_id, lc.machine_no, lc.room_id, r.room_name,
            lc.ip_address, lc.mac_address, lc.status AS configured_status,
            ta.id AS agent_id, ta.hostname, ta.agent_version, ta.last_seen_at,
            ps.id AS session_id, ps.user_id, ps.login_time,
            u.username, u.first_name, u.last_name, u.role,
            CASE
              WHEN lc.status = 'maintenance' OR r.status = 'maintenance' THEN 'maintenance'
              WHEN r.status = 'closed' THEN 'offline'
              WHEN ta.last_seen_at IS NULL
                OR ta.last_seen_at < UTC_TIMESTAMP() - INTERVAL 90 SECOND THEN 'offline'
              WHEN ps.id IS NOT NULL THEN 'in_use'
              ELSE 'available'
            END AS display_status
          FROM lab_computers AS lc
          INNER JOIN rooms AS r ON r.id = lc.room_id
          LEFT JOIN tracking_agents AS ta
            ON ta.computer_id = lc.id AND ta.is_enabled = 1
          LEFT JOIN pc_sessions AS ps
            ON ps.computer_id = lc.id AND ps.status = 'online'
          LEFT JOIN users AS u ON u.id = ps.user_id
          ${where}
          ORDER BY r.room_name, lc.machine_no
        `,
        parameters,
      )) as unknown,
    );
  }

  async activity(limit = 500): Promise<Array<Record<string, unknown>>> {
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    return this.readRows(
      (await this.dataSource.query(
        `
          SELECT
            te.id, te.event_uuid, te.event_type, te.name, te.domain,
            te.duration_minutes, te.risk_level, te.was_blocked,
            te.occurred_at, ta.computer_id, lc.machine_no,
            r.id AS room_id, r.room_name, ps.user_id, u.username
          FROM tracking_events AS te
          INNER JOIN tracking_agents AS ta ON ta.id = te.agent_id
          INNER JOIN lab_computers AS lc ON lc.id = ta.computer_id
          INNER JOIN rooms AS r ON r.id = lc.room_id
          LEFT JOIN pc_sessions AS ps ON ps.id = te.session_id
          LEFT JOIN users AS u ON u.id = ps.user_id
          ORDER BY te.occurred_at DESC, te.id DESC
          LIMIT ?
        `,
        [safeLimit],
      )) as unknown,
    );
  }

  async exportCsv(
    dto: ExportTrackingDto,
  ): Promise<{ filename: string; content: string }> {
    let headers: string[];
    let rows: Array<Record<string, unknown>>;

    if (dto.report === 'session') {
      const conditions: string[] = [];
      const parameters: unknown[] = [];
      if (dto.room_id) {
        conditions.push('r.id = ?');
        parameters.push(dto.room_id);
      }
      if (dto.from) {
        conditions.push(
          `DATE(CONVERT_TZ(ps.login_time, '+00:00', '+07:00')) >= ?`,
        );
        parameters.push(dto.from);
      }
      if (dto.to) {
        conditions.push(
          `DATE(CONVERT_TZ(ps.login_time, '+00:00', '+07:00')) <= ?`,
        );
        parameters.push(dto.to);
      }
      const where = conditions.length
        ? `WHERE ${conditions.join(' AND ')}`
        : '';
      headers = [
        'session_id',
        'username',
        'room_name',
        'machine_no',
        'login_time',
        'logout_time',
        'status',
      ];
      rows = this.readRows(
        (await this.dataSource.query(
          `
            SELECT ps.id AS session_id, u.username, r.room_name,
                   lc.machine_no, ps.login_time, ps.logout_time, ps.status
            FROM pc_sessions AS ps
            INNER JOIN users AS u ON u.id = ps.user_id
            INNER JOIN lab_computers AS lc ON lc.id = ps.computer_id
            INNER JOIN rooms AS r ON r.id = lc.room_id
            ${where}
            ORDER BY ps.login_time DESC
          `,
          parameters,
        )) as unknown,
      );
    } else {
      const conditions: string[] = [];
      const parameters: unknown[] = [];
      if (dto.report === 'flagged') {
        conditions.push(`te.risk_level <> 'none'`);
      } else {
        conditions.push('te.event_type = ?');
        parameters.push(dto.report);
      }
      if (dto.room_id) {
        conditions.push('r.id = ?');
        parameters.push(dto.room_id);
      }
      if (dto.from) {
        conditions.push(
          `DATE(CONVERT_TZ(te.occurred_at, '+00:00', '+07:00')) >= ?`,
        );
        parameters.push(dto.from);
      }
      if (dto.to) {
        conditions.push(
          `DATE(CONVERT_TZ(te.occurred_at, '+00:00', '+07:00')) <= ?`,
        );
        parameters.push(dto.to);
      }
      headers = [
        'event_id',
        'event_type',
        'username',
        'room_name',
        'machine_no',
        'name',
        'domain',
        'risk_level',
        'was_blocked',
        'occurred_at',
      ];
      rows = this.readRows(
        (await this.dataSource.query(
          `
            SELECT te.id AS event_id, te.event_type, u.username,
                   r.room_name, lc.machine_no, te.name, te.domain,
                   te.risk_level, te.was_blocked, te.occurred_at
            FROM tracking_events AS te
            INNER JOIN tracking_agents AS ta ON ta.id = te.agent_id
            INNER JOIN lab_computers AS lc ON lc.id = ta.computer_id
            INNER JOIN rooms AS r ON r.id = lc.room_id
            LEFT JOIN pc_sessions AS ps ON ps.id = te.session_id
            LEFT JOIN users AS u ON u.id = ps.user_id
            WHERE ${conditions.join(' AND ')}
            ORDER BY te.occurred_at DESC
          `,
          parameters,
        )) as unknown,
      );
    }

    const lines = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((header) => this.escapeCsv(row[header])).join(','),
      ),
    ];
    return {
      filename: `kinof-${dto.report}-${new Date().toISOString().slice(0, 10)}.csv`,
      content: `\uFEFF${lines.join('\r\n')}`,
    };
  }

  async listAgents(): Promise<Array<Record<string, unknown>>> {
    return this.readRows(
      (await this.dataSource.query(`
        SELECT
          ta.id, ta.computer_id, lc.machine_no, lc.room_id, r.room_name,
          ta.hostname, ta.agent_version, ta.is_enabled, ta.last_seen_at,
          CASE WHEN ta.is_enabled = 1
            AND ta.last_seen_at >= UTC_TIMESTAMP() - INTERVAL 90 SECOND
            THEN 1 ELSE 0 END AS is_online
        FROM tracking_agents AS ta
        INNER JOIN lab_computers AS lc ON lc.id = ta.computer_id
        INNER JOIN rooms AS r ON r.id = lc.room_id
        ORDER BY r.room_name, lc.machine_no
      `)) as unknown,
    ).map((row) => ({ ...row, is_online: Number(row.is_online) === 1 }));
  }

  async createAgent(
    adminId: number,
    dto: CreateAgentDto,
  ): Promise<{ agent_id: number; api_key: string }> {
    const rawKey = randomBytes(32).toString('base64url');
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    try {
      const result = (await this.dataSource.query(
        `
          INSERT INTO tracking_agents (computer_id, api_key_hash, hostname)
          VALUES (?, ?, ?)
        `,
        [dto.computer_id, keyHash, dto.hostname ?? null],
      )) as unknown;
      const agentId = this.readInsertId(result);
      await this.audit(
        adminId,
        `สร้าง Tracking Agent #${agentId} สำหรับเครื่อง #${dto.computer_id}`,
      );
      return { agent_id: agentId, api_key: rawKey };
    } catch (error) {
      if (this.isDuplicateEntry(error)) {
        throw new ConflictException('เครื่องนี้มี Agent อยู่แล้ว');
      }
      throw error;
    }
  }

  async queueCommand(
    adminId: number,
    computerId: number,
    dto: QueueCommandDto,
  ): Promise<{ command_id: number; status: 'pending' }> {
    const agents = this.readRows(
      (await this.dataSource.query(
        'SELECT id FROM tracking_agents WHERE computer_id = ? AND is_enabled = 1 LIMIT 1',
        [computerId],
      )) as unknown,
    );
    if (!agents[0]) {
      throw new NotFoundException('เครื่องนี้ยังไม่มี Tracking Agent');
    }
    const result = (await this.dataSource.query(
      `
        INSERT INTO agent_commands (agent_id, command_type, payload_json)
        VALUES (?, ?, ?)
      `,
      [
        Number(agents[0].id),
        dto.command_type,
        dto.payload ? JSON.stringify(dto.payload) : null,
      ],
    )) as unknown;
    const commandId = this.readInsertId(result);
    await this.audit(
      adminId,
      `ส่งคำสั่ง ${dto.command_type} ไปเครื่อง #${computerId}`,
    );
    return { command_id: commandId, status: 'pending' };
  }

  async updateRoomStatus(
    adminId: number,
    roomId: number,
    status: 'active' | 'closed' | 'maintenance',
  ): Promise<{ message: string }> {
    const result = (await this.dataSource.query(
      'UPDATE rooms SET status = ? WHERE id = ?',
      [status, roomId],
    )) as unknown;
    if (this.readAffectedRows(result) === 0) {
      throw new NotFoundException('ไม่พบห้องแล็บ');
    }
    if (status !== 'active') {
      await this.dataSource.query(
        `
          INSERT INTO agent_commands (agent_id, command_type, payload_json)
          SELECT ta.id, 'logout', JSON_OBJECT('source', 'room_status')
          FROM tracking_agents AS ta
          INNER JOIN lab_computers AS lc ON lc.id = ta.computer_id
          WHERE lc.room_id = ? AND ta.is_enabled = 1
        `,
        [roomId],
      );
    }
    await this.audit(adminId, `เปลี่ยนสถานะห้อง #${roomId} เป็น ${status}`);
    return { message: 'อัปเดตสถานะห้องสำเร็จ' };
  }

  private async audit(adminId: number, action: string): Promise<void> {
    await this.dataSource.query(
      'INSERT INTO audit_logs (action, admin_id) VALUES (?, ?)',
      [action, adminId],
    );
  }

  private readRows(result: unknown): Array<Record<string, unknown>> {
    return Array.isArray(result)
      ? result.filter(
          (row: unknown): row is Record<string, unknown> =>
            typeof row === 'object' && row !== null,
        )
      : [];
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private escapeCsv(value: unknown): string {
    if (value === null || value === undefined) return '';
    const text =
      value instanceof Date
        ? value.toISOString()
        : typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            typeof value === 'bigint'
          ? String(value)
          : JSON.stringify(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  private readAffectedRows(result: unknown): number {
    return typeof result === 'object' && result !== null
      ? Number((result as Record<string, unknown>).affectedRows ?? 0)
      : 0;
  }

  private readInsertId(result: unknown): number {
    const id =
      typeof result === 'object' && result !== null
        ? Number((result as Record<string, unknown>).insertId)
        : 0;
    if (!Number.isInteger(id) || id <= 0) {
      throw new TypeError('ฐานข้อมูลไม่ส่ง id ที่ถูกต้องกลับมา');
    }
    return id;
  }

  private isDuplicateEntry(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const driverError = (error as Record<string, unknown>).driverError;
    return (
      typeof driverError === 'object' &&
      driverError !== null &&
      (driverError as Record<string, unknown>).code === 'ER_DUP_ENTRY'
    );
  }
}
