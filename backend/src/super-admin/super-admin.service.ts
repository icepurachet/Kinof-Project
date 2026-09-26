import {
  ConflictException,
  Injectable,
  Optional,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcrypt';
import { DataSource } from 'typeorm';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { AdminAccountService } from '../auth/admin-account.service';

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly accounts?: AdminAccountService,
  ) {}

  async findAdmins(): Promise<Array<Record<string, unknown>>> {
    return this.readRows(
      (await this.dataSource.query(`
        SELECT id, email, first_name, last_name, role, status, username, job_title, phone, password_setup_required
        FROM admins
        ORDER BY id ASC
      `)) as unknown,
    );
  }

  async createAdmin(
    actorAdminId: number,
    dto: CreateAdminDto,
  ): Promise<{ id: number; email: string; role: string }> {
    if (!dto.password) {
      if (!this.accounts) throw new Error('ADMIN_INVITE_SERVICE_UNAVAILABLE');
      return this.accounts.createInvite(actorAdminId, dto);
    }
    const passwordHash = await hash(dto.password, 12);
    try {
      const result = (await this.dataSource.query(
        `
          INSERT INTO admins (
            email, first_name, last_name, password_hash, role, status
          ) VALUES (?, ?, ?, ?, ?, 'active')
        `,
        [dto.email, dto.first_name, dto.last_name, passwordHash, dto.role],
      )) as unknown;
      const id = this.readInsertId(result);
      await this.audit(actorAdminId, `สร้างบัญชีผู้ดูแล #${id} (${dto.role})`);
      return { id, email: dto.email, role: dto.role };
    } catch (error) {
      if (this.isDuplicateEntry(error)) {
        throw new ConflictException('อีเมลผู้ดูแลนี้ถูกใช้แล้ว');
      }
      throw error;
    }
  }

  async updateAdminStatus(
    actorAdminId: number,
    targetAdminId: number,
    status: 'active' | 'inactive',
  ): Promise<{ message: string }> {
    if (actorAdminId === targetAdminId && status === 'inactive') {
      throw new ConflictException('ไม่สามารถปิดบัญชีตัวเองได้');
    }
    const result = (await this.dataSource.query(
      'UPDATE admins SET status = ? WHERE id = ?',
      [status, targetAdminId],
    )) as unknown;
    if (this.readAffectedRows(result) === 0) {
      throw new NotFoundException('ไม่พบบัญชีผู้ดูแล');
    }
    await this.audit(
      actorAdminId,
      `เปลี่ยนสถานะผู้ดูแล #${targetAdminId} เป็น ${status}`,
    );
    return { message: 'อัปเดตสถานะผู้ดูแลสำเร็จ' };
  }

  async updateAdmin(
    actorAdminId: number,
    targetAdminId: number,
    dto: UpdateAdminDto,
  ): Promise<{ message: string }> {
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const field of [
      'email',
      'first_name',
      'last_name',
      'role',
      'username',
      'job_title',
      'phone',
    ] as const) {
      if (dto[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(dto[field]);
      }
    }
    if (dto.password !== undefined) {
      fields.push('password_hash = ?');
      values.push(await hash(dto.password, 12));
      fields.push('password_setup_required = 0');
    }
    if (fields.length === 0) {
      return { message: 'ไม่มีข้อมูลเปลี่ยนแปลง' };
    }
    values.push(targetAdminId);
    try {
      const result = (await this.dataSource.query(
        `UPDATE admins SET ${fields.join(', ')} WHERE id = ?`,
        values,
      )) as unknown;
      if (this.readAffectedRows(result) === 0) {
        throw new NotFoundException('ไม่พบบัญชีผู้ดูแล');
      }
    } catch (error) {
      if (this.isDuplicateEntry(error)) {
        throw new ConflictException('อีเมลผู้ดูแลนี้ถูกใช้แล้ว');
      }
      throw error;
    }
    await this.audit(actorAdminId, `แก้ไขบัญชีผู้ดูแล #${targetAdminId}`);
    return { message: 'แก้ไขบัญชีผู้ดูแลสำเร็จ' };
  }

  async findAuditLogs(): Promise<Array<Record<string, unknown>>> {
    return this.readRows(
      (await this.dataSource.query(`
        SELECT al.id, al.action, al.created_at, al.admin_id,
               a.email AS admin_email
        FROM audit_logs AS al
        INNER JOIN admins AS a ON a.id = al.admin_id
        ORDER BY al.created_at DESC, al.id DESC
        LIMIT 1000
      `)) as unknown,
    );
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

  private readInsertId(result: unknown): number {
    const id =
      typeof result === 'object' && result !== null
        ? Number((result as Record<string, unknown>).insertId)
        : 0;
    if (!Number.isInteger(id) || id <= 0) {
      throw new TypeError('ฐานข้อมูลไม่ส่ง admin_id ที่ถูกต้องกลับมา');
    }
    return id;
  }

  private readAffectedRows(result: unknown): number {
    return typeof result === 'object' && result !== null
      ? Number((result as Record<string, unknown>).affectedRows ?? 0)
      : 0;
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
