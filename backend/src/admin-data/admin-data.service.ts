import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AddEnrollmentDto,
  CreateComputerDto,
  CreateRoomDto,
  CreateSubjectDto,
  CreateTermDto,
  UpdateComputerDto,
  UpdateRoomDto,
  UpdateSubjectDto,
  UpdateTermDto,
} from './dto/admin-data.dto';

@Injectable()
export class AdminDataService {
  constructor(private readonly dataSource: DataSource) {}

  findRooms(): Promise<Array<Record<string, unknown>>> {
    return this.queryRows(`
      SELECT r.id, r.room_name, r.capacity, r.status,
             COUNT(lc.id) AS computer_count
      FROM rooms AS r
      LEFT JOIN lab_computers AS lc ON lc.room_id = r.id
      GROUP BY r.id
      ORDER BY r.room_name
    `);
  }

  async createRoom(adminId: number, dto: CreateRoomDto) {
    return this.createAndAudit(
      `INSERT INTO rooms (room_name, capacity, status) VALUES (?, ?, ?)`,
      [dto.room_name, dto.capacity, dto.status ?? 'active'],
      adminId,
      (id) => `สร้างห้อง #${id} ${dto.room_name}`,
    );
  }

  async updateRoom(adminId: number, id: number, dto: UpdateRoomDto) {
    await this.updateById('rooms', id, dto, [
      'room_name',
      'capacity',
      'status',
    ]);
    await this.audit(adminId, `แก้ไขห้อง #${id}`);
    return { message: 'แก้ไขห้องสำเร็จ' };
  }

  async deleteRoom(adminId: number, id: number) {
    await this.deleteById('rooms', id, 'ห้องนี้มีข้อมูลอื่นอ้างอิงอยู่');
    await this.audit(adminId, `ลบห้อง #${id}`);
    return { message: 'ลบห้องสำเร็จ' };
  }

  findComputers(roomId?: number): Promise<Array<Record<string, unknown>>> {
    return this.queryRows(
      `
        SELECT lc.*, r.room_name
        FROM lab_computers AS lc
        INNER JOIN rooms AS r ON r.id = lc.room_id
        ${roomId ? 'WHERE lc.room_id = ?' : ''}
        ORDER BY r.room_name, lc.machine_no
      `,
      roomId ? [roomId] : [],
    );
  }

  async createComputer(adminId: number, dto: CreateComputerDto) {
    return this.createAndAudit(
      `
        INSERT INTO lab_computers
          (machine_no, room_id, ip_address, mac_address, status)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        dto.machine_no,
        dto.room_id,
        dto.ip_address ?? null,
        dto.mac_address ?? null,
        dto.status ?? 'offline',
      ],
      adminId,
      (id) => `สร้างเครื่อง #${id} ${dto.machine_no}`,
    );
  }

  async updateComputer(adminId: number, id: number, dto: UpdateComputerDto) {
    await this.updateById('lab_computers', id, dto, [
      'machine_no',
      'room_id',
      'ip_address',
      'mac_address',
      'status',
    ]);
    await this.audit(adminId, `แก้ไขเครื่อง #${id}`);
    return { message: 'แก้ไขเครื่องสำเร็จ' };
  }

  async deleteComputer(adminId: number, id: number) {
    await this.deleteById(
      'lab_computers',
      id,
      'เครื่องนี้มี session หรือ Agent อ้างอิงอยู่',
    );
    await this.audit(adminId, `ลบเครื่อง #${id}`);
    return { message: 'ลบเครื่องสำเร็จ' };
  }

  findTerms(): Promise<Array<Record<string, unknown>>> {
    return this.queryRows(
      'SELECT * FROM academic_terms ORDER BY start_date DESC',
    );
  }

  async createTerm(adminId: number, dto: CreateTermDto) {
    this.validateDateRange(dto.start_date, dto.end_date);
    return this.createAndAudit(
      `
        INSERT INTO academic_terms (term_name, start_date, end_date, status)
        VALUES (?, ?, ?, ?)
      `,
      [dto.term_name, dto.start_date, dto.end_date, dto.status ?? 'active'],
      adminId,
      (id) => `สร้างภาคเรียน #${id} ${dto.term_name}`,
    );
  }

  async updateTerm(adminId: number, id: number, dto: UpdateTermDto) {
    if (dto.start_date && dto.end_date) {
      this.validateDateRange(dto.start_date, dto.end_date);
    }
    await this.updateById('academic_terms', id, dto, [
      'term_name',
      'start_date',
      'end_date',
      'status',
    ]);
    await this.audit(adminId, `แก้ไขภาคเรียน #${id}`);
    return { message: 'แก้ไขภาคเรียนสำเร็จ' };
  }

  findSubjects(): Promise<Array<Record<string, unknown>>> {
    return this.queryRows(`
      SELECT s.*, r.room_name, r.capacity, at.term_name,
             SUM(se.status = 'active') AS enrolled_count
      FROM subjects AS s
      INNER JOIN rooms AS r ON r.id = s.room_id
      INNER JOIN academic_terms AS at ON at.id = s.term_id
      LEFT JOIN subject_enrollments AS se ON se.subject_id = s.id
      GROUP BY s.id
      ORDER BY at.start_date DESC, s.subject_code, s.section
    `);
  }

  async findSubject(id: number): Promise<Record<string, unknown>> {
    const subjects = await this.queryRows(
      `
        SELECT s.*, r.room_name, at.term_name
        FROM subjects AS s
        INNER JOIN rooms AS r ON r.id = s.room_id
        INNER JOIN academic_terms AS at ON at.id = s.term_id
        WHERE s.id = ? LIMIT 1
      `,
      [id],
    );
    if (!subjects[0]) throw new NotFoundException('ไม่พบรายวิชา');
    const enrollments = await this.queryRows(
      `
        SELECT se.id, se.user_id, se.status, se.enrolled_at,
               u.username, u.first_name, u.last_name, u.email, u.student_id
        FROM subject_enrollments AS se
        INNER JOIN users AS u ON u.id = se.user_id
        WHERE se.subject_id = ?
        ORDER BY u.username
      `,
      [id],
    );
    return { ...subjects[0], enrollments };
  }

  async createSubject(adminId: number, dto: CreateSubjectDto) {
    this.validateTimeRange(dto.start_time, dto.end_time);
    return this.createAndAudit(
      `
        INSERT INTO subjects (
          subject_code, subject_name, section, class_type,
          instructor_name, day_of_week, start_time, end_time, term_id, room_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        dto.subject_code,
        dto.subject_name,
        dto.section,
        dto.class_type,
        dto.instructor_name,
        dto.day_of_week,
        dto.start_time,
        dto.end_time,
        dto.term_id,
        dto.room_id,
      ],
      adminId,
      (id) => `สร้างรายวิชา #${id} ${dto.subject_code}`,
    );
  }

  async updateSubject(adminId: number, id: number, dto: UpdateSubjectDto) {
    if (dto.start_time && dto.end_time) {
      this.validateTimeRange(dto.start_time, dto.end_time);
    }
    await this.updateById('subjects', id, dto, [
      'subject_code',
      'subject_name',
      'section',
      'class_type',
      'instructor_name',
      'day_of_week',
      'start_time',
      'end_time',
      'term_id',
      'room_id',
    ]);
    await this.audit(adminId, `แก้ไขรายวิชา #${id}`);
    return { message: 'แก้ไขรายวิชาสำเร็จ' };
  }

  async deleteSubject(adminId: number, id: number) {
    await this.deleteById(
      'subjects',
      id,
      'รายวิชานี้มีรายชื่อนักศึกษาอ้างอิงอยู่',
    );
    await this.audit(adminId, `ลบรายวิชา #${id}`);
    return { message: 'ลบรายวิชาสำเร็จ' };
  }

  async addEnrollment(
    adminId: number,
    subjectId: number,
    dto: AddEnrollmentDto,
  ) {
    let userId = dto.user_id;
    if (dto.student_id) {
      const students = await this.queryRows(
        "SELECT id FROM users WHERE student_id=? AND role='student' AND is_active=1",
        [dto.student_id],
      );
      if (!students[0])
        throw new NotFoundException('ไม่พบรหัสนักศึกษาที่เปิดใช้งาน');
      if (userId && userId !== Number(students[0].id))
        throw new BadRequestException('ข้อมูลนักศึกษาไม่ตรงกัน');
      userId = Number(students[0].id);
    }
    if (!userId) throw new BadRequestException('กรุณาระบุรหัสนักศึกษา');
    await this.dataSource.query(
      `
        INSERT INTO subject_enrollments (subject_id, user_id, status)
        VALUES (?, ?, 'active')
        ON DUPLICATE KEY UPDATE status = 'active', enrolled_at = NOW()
      `,
      [subjectId, userId],
    );
    await this.audit(adminId, `เพิ่มผู้ใช้ #${userId} ในรายวิชา #${subjectId}`);
    return this.findSubject(subjectId);
  }

  async removeEnrollment(adminId: number, subjectId: number, userId: number) {
    const result = (await this.dataSource.query(
      `
        UPDATE subject_enrollments SET status = 'dropped'
        WHERE subject_id = ? AND user_id = ? AND status = 'active'
      `,
      [subjectId, userId],
    )) as unknown;
    if (this.readAffectedRows(result) === 0) {
      throw new NotFoundException('ไม่พบรายชื่อนักศึกษาในวิชานี้');
    }
    await this.audit(adminId, `ถอนผู้ใช้ #${userId} จากรายวิชา #${subjectId}`);
    return { message: 'ถอนนักศึกษาออกจากรายวิชาสำเร็จ' };
  }

  async updateUserActive(adminId: number, userId: number, isActive: boolean) {
    const result = (await this.dataSource.query(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [isActive ? 1 : 0, userId],
    )) as unknown;
    if (this.readAffectedRows(result) === 0) {
      throw new NotFoundException('ไม่พบผู้ใช้');
    }
    await this.audit(
      adminId,
      `เปลี่ยนสถานะผู้ใช้ #${userId} เป็น ${isActive ? 'active' : 'inactive'}`,
    );
    return { message: 'อัปเดตสถานะผู้ใช้สำเร็จ' };
  }

  private async createAndAudit(
    sql: string,
    parameters: unknown[],
    adminId: number,
    action: (id: number) => string,
  ): Promise<{ id: number }> {
    try {
      const result = (await this.dataSource.query(sql, parameters)) as unknown;
      const id = this.readInsertId(result);
      await this.audit(adminId, action(id));
      return { id };
    } catch (error) {
      if (this.driverCode(error) === 'ER_DUP_ENTRY') {
        throw new ConflictException('ข้อมูลนี้มีอยู่แล้ว');
      }
      throw error;
    }
  }

  private async updateById(
    table: string,
    id: number,
    dto: object,
    allowedFields: string[],
  ): Promise<void> {
    const record = dto as Record<string, unknown>;
    const fields = allowedFields.filter((field) => record[field] !== undefined);
    if (fields.length === 0) {
      throw new BadRequestException('ไม่มีข้อมูลสำหรับแก้ไข');
    }
    try {
      const result = (await this.dataSource.query(
        `UPDATE ${table} SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`,
        [...fields.map((field) => record[field]), id],
      )) as unknown;
      if (this.readAffectedRows(result) === 0) {
        throw new NotFoundException('ไม่พบข้อมูล');
      }
    } catch (error) {
      if (this.driverCode(error) === 'ER_DUP_ENTRY') {
        throw new ConflictException('ข้อมูลนี้ซ้ำกับรายการที่มีอยู่');
      }
      throw error;
    }
  }

  private async deleteById(table: string, id: number, conflictMessage: string) {
    try {
      const result = (await this.dataSource.query(
        `DELETE FROM ${table} WHERE id = ?`,
        [id],
      )) as unknown;
      if (this.readAffectedRows(result) === 0)
        throw new NotFoundException('ไม่พบข้อมูล');
    } catch (error) {
      if (this.driverCode(error) === 'ER_ROW_IS_REFERENCED_2') {
        throw new ConflictException(conflictMessage);
      }
      throw error;
    }
  }

  private validateDateRange(start: string, end: string): void {
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      throw new BadRequestException('end_date ต้องมากกว่า start_date');
    }
  }

  private validateTimeRange(start: string, end: string): void {
    if (end <= start)
      throw new BadRequestException('end_time ต้องมากกว่า start_time');
  }

  private queryRows(sql: string, parameters: unknown[] = []) {
    return this.dataSource
      .query(sql, parameters)
      .then((result: unknown) => this.readRows(result));
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
          (row): row is Record<string, unknown> =>
            typeof row === 'object' && row !== null,
        )
      : [];
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
    if (!Number.isInteger(id) || id <= 0)
      throw new TypeError('ฐานข้อมูลไม่ส่ง id ที่ถูกต้องกลับมา');
    return id;
  }

  private driverCode(error: unknown): string | null {
    if (typeof error !== 'object' || error === null) return null;
    const driverError = (error as Record<string, unknown>).driverError;
    if (typeof driverError !== 'object' || driverError === null) return null;
    const code = (driverError as Record<string, unknown>).code;
    return typeof code === 'string' ? code : null;
  }
}
