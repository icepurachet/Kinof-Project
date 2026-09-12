import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import {
  CreateBlockedDomainDto,
  UpdateBlockedDomainDto,
} from './dto/create-blocked-domain.dto';
import { CreatePenaltyDto } from './dto/create-penalty.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';

export interface AdminDashboardResult {
  users: number;
  active_computers: number;
  today_bookings: number;
  pending_issues: number;
  suspicious_logs_today: number;
}

@Injectable()
export class AdminService {
  constructor(private readonly dataSource: DataSource) {}

  async dashboard(): Promise<AdminDashboardResult> {
    const rows = this.readRows(
      (await this.dataSource.query(`
        SELECT
          (SELECT COUNT(*) FROM users WHERE is_active = 1) AS users,
          (SELECT COUNT(*) FROM lab_computers WHERE status = 'online')
            AS active_computers,
          (SELECT COUNT(*) FROM bookings
            WHERE booking_date = DATE(
              CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00')
            ) AND status = 'confirmed') AS today_bookings,
          (SELECT COUNT(*) FROM issues WHERE status = 'pending')
            AS pending_issues,
          (SELECT COUNT(*) FROM usage_logs
            WHERE is_suspicious = 1
              AND DATE(start_time) = DATE(
                CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00')
              )) AS suspicious_logs_today
      `)) as unknown,
    );
    const row = rows[0] ?? {};
    return {
      users: Number(row.users ?? 0),
      active_computers: Number(row.active_computers ?? 0),
      today_bookings: Number(row.today_bookings ?? 0),
      pending_issues: Number(row.pending_issues ?? 0),
      suspicious_logs_today: Number(row.suspicious_logs_today ?? 0),
    };
  }

  async findIssues(status?: string): Promise<Array<Record<string, unknown>>> {
    const parameters: unknown[] = [];
    const where = status ? 'WHERE i.status = ?' : '';
    if (status) {
      parameters.push(status);
    }
    const result = (await this.dataSource.query(
      `
        SELECT
          i.id, i.category, i.title, i.description, i.status,
          i.admin_reply, i.created_at, i.user_id, i.admin_id,
          COALESCE(
            (SELECT JSON_ARRAYAGG(ii.image_url)
             FROM issue_images AS ii WHERE ii.issue_id = i.id),
            JSON_ARRAY()
          ) AS image_urls,
          u.username, u.email
        FROM issues AS i
        INNER JOIN users AS u ON u.id = i.user_id
        ${where}
        ORDER BY i.created_at DESC, i.id DESC
      `,
      parameters,
    )) as unknown;
    return this.readRows(result);
  }

  async updateIssue(
    adminId: number,
    issueId: number,
    dto: UpdateIssueDto,
  ): Promise<{ message: string }> {
    if (dto.status === undefined && dto.admin_reply === undefined) {
      throw new BadRequestException(
        'ต้องส่ง status หรือ admin_reply อย่างน้อยหนึ่งค่า',
      );
    }

    const fields: string[] = ['admin_id = ?'];
    const values: unknown[] = [adminId];
    if (dto.status !== undefined) {
      fields.push('status = ?');
      values.push(dto.status);
    }
    if (dto.admin_reply !== undefined) {
      fields.push('admin_reply = ?');
      values.push(dto.admin_reply);
    }
    values.push(issueId);

    const result = (await this.dataSource.query(
      `UPDATE issues SET ${fields.join(', ')} WHERE id = ?`,
      values,
    )) as unknown;
    if (this.readAffectedRows(result) === 0) {
      throw new NotFoundException('ไม่พบคำขอความช่วยเหลือนี้');
    }
    await this.writeAudit(
      this.dataSource,
      adminId,
      `อัปเดตคำขอความช่วยเหลือ #${issueId}`,
    );
    return { message: 'อัปเดตคำขอความช่วยเหลือสำเร็จ' };
  }

  async findBlockedDomains(): Promise<Array<Record<string, unknown>>> {
    return this.readRows(
      (await this.dataSource.query(`
        SELECT bd.id, bd.domain_name, bd.reason, bd.category,
               bd.severity, bd.action, bd.match_type, bd.is_enabled,
               bd.created_at, bd.updated_at,
               bd.added_by, a.email AS added_by_email
        FROM blocked_domains AS bd
        INNER JOIN admins AS a ON a.id = bd.added_by
        ORDER BY bd.domain_name ASC
      `)) as unknown,
    );
  }

  async createBlockedDomain(
    adminId: number,
    dto: CreateBlockedDomainDto,
  ): Promise<{ id: number; domain_name: string }> {
    const domain = this.toHostname(dto.domain_name);
    if (!domain || !domain.includes('.')) {
      throw new BadRequestException('domain_name ไม่ถูกต้อง');
    }
    try {
      const result = (await this.dataSource.query(
        `
          INSERT INTO blocked_domains
            (domain_name, reason, category, severity, action, match_type, added_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          domain,
          dto.reason ?? null,
          dto.category ?? null,
          dto.severity ?? 'medium',
          dto.action ?? 'block',
          dto.match_type ?? 'suffix',
          adminId,
        ],
      )) as unknown;
      const id = this.readInsertId(result, 'blocked_domain_id');
      await this.writeAudit(
        this.dataSource,
        adminId,
        `เพิ่มเว็บไซต์ต้องห้าม ${domain}`,
      );
      return { id, domain_name: domain };
    } catch (error) {
      if (this.isDuplicateEntry(error)) {
        throw new ConflictException('โดเมนนี้อยู่ในรายการแล้ว');
      }
      throw error;
    }
  }

  async updateBlockedDomain(
    adminId: number,
    domainId: number,
    dto: UpdateBlockedDomainDto,
  ): Promise<{ message: string }> {
    const record = dto as Record<string, unknown>;
    const allowed = [
      'reason',
      'category',
      'severity',
      'action',
      'match_type',
      'is_enabled',
    ];
    const fields = allowed.filter((field) => record[field] !== undefined);
    if (fields.length === 0) {
      throw new BadRequestException('ไม่มีข้อมูลสำหรับแก้ไข');
    }
    const values = fields.map((field) =>
      field === 'is_enabled' ? (record[field] ? 1 : 0) : record[field],
    );
    const result = (await this.dataSource.query(
      `UPDATE blocked_domains SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
      [...values, domainId],
    )) as unknown;
    if (this.readAffectedRows(result) === 0) {
      throw new NotFoundException('ไม่พบโดเมนนี้');
    }
    await this.writeAudit(
      this.dataSource,
      adminId,
      `แก้ไขเว็บไซต์ต้องห้าม #${domainId}`,
    );
    return { message: 'แก้ไขเว็บไซต์ต้องห้ามสำเร็จ' };
  }

  async removeBlockedDomain(
    adminId: number,
    domainId: number,
  ): Promise<{ message: string }> {
    const result = (await this.dataSource.query(
      'DELETE FROM blocked_domains WHERE id = ?',
      [domainId],
    )) as unknown;
    if (this.readAffectedRows(result) === 0) {
      throw new NotFoundException('ไม่พบโดเมนนี้');
    }
    await this.writeAudit(
      this.dataSource,
      adminId,
      `ลบเว็บไซต์ต้องห้าม #${domainId}`,
    );
    return { message: 'ลบเว็บไซต์ต้องห้ามสำเร็จ' };
  }

  async createPenalty(
    adminId: number,
    dto: CreatePenaltyDto,
  ): Promise<{ penalty_id: number; remaining_score: number }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const users = this.readRows(
        (await queryRunner.query(
          'SELECT id, usage_score FROM users WHERE id = ? FOR UPDATE',
          [dto.user_id],
        )) as unknown,
      );
      const user = users[0];
      if (!user) {
        throw new NotFoundException('ไม่พบผู้ใช้');
      }

      const remainingScore = Math.max(0, Number(user.usage_score) - dto.points);
      const insertResult = (await queryRunner.query(
        `
          INSERT INTO penalty_logs (points, reason, user_id, admin_id)
          VALUES (?, ?, ?, ?)
        `,
        [dto.points, dto.reason, dto.user_id, adminId],
      )) as unknown;
      const penaltyId = this.readInsertId(insertResult, 'penalty_id');
      await queryRunner.query('UPDATE users SET usage_score = ? WHERE id = ?', [
        remainingScore,
        dto.user_id,
      ]);
      await this.writeAudit(
        queryRunner,
        adminId,
        `หักคะแนนผู้ใช้ #${dto.user_id} จำนวน ${dto.points} คะแนน`,
      );
      await queryRunner.commitTransaction();
      return { penalty_id: penaltyId, remaining_score: remainingScore };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findSuspiciousUsage(): Promise<Array<Record<string, unknown>>> {
    return this.readRows(
      (await this.dataSource.query(`
        SELECT
          ul.id, ul.log_type, ul.name, ul.duration_minutes,
          ul.start_time, ul.end_time, ps.user_id, u.username,
          ps.computer_id, lc.machine_no, r.room_name
        FROM usage_logs AS ul
        INNER JOIN pc_sessions AS ps ON ps.id = ul.session_id
        INNER JOIN users AS u ON u.id = ps.user_id
        INNER JOIN lab_computers AS lc ON lc.id = ps.computer_id
        INNER JOIN rooms AS r ON r.id = lc.room_id
        WHERE ul.is_suspicious = 1
        ORDER BY ul.start_time DESC, ul.id DESC
        LIMIT 500
      `)) as unknown,
    );
  }

  private async writeAudit(
    executor: Pick<DataSource | QueryRunner, 'query'>,
    adminId: number,
    action: string,
  ): Promise<void> {
    await executor.query(
      'INSERT INTO audit_logs (action, admin_id) VALUES (?, ?)',
      [action, adminId],
    );
  }

  private toHostname(value: string): string {
    try {
      return new URL(
        value.includes('://') ? value : `https://${value}`,
      ).hostname
        .toLowerCase()
        .replace(/^www\./, '');
    } catch {
      return '';
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

  private readAffectedRows(result: unknown): number {
    return typeof result === 'object' && result !== null
      ? Number((result as Record<string, unknown>).affectedRows ?? 0)
      : 0;
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

  private isDuplicateEntry(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    const record = error as Record<string, unknown>;
    const driverError = record.driverError;
    return (
      typeof driverError === 'object' &&
      driverError !== null &&
      (driverError as Record<string, unknown>).code === 'ER_DUP_ENTRY'
    );
  }
}
