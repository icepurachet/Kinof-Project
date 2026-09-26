import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Workbook } from 'exceljs';

const HEADERS = [
  'term_name',
  'term_start_date',
  'term_end_date',
  'subject_code',
  'subject_name',
  'section',
  'class_type',
  'instructor_name',
  'day_of_week',
  'start_time',
  'end_time',
  'room_name',
  'user_id',
  'student_id',
] as const;

type CsvRow = Record<(typeof HEADERS)[number], string> & { row: number };

interface SchedulePreview {
  row: number;
  subjectCode: string;
  section: string;
  dayKey: string;
  startTime: string;
  endTime: string;
  roomName: string;
  status: 'ready' | 'error';
  messages: string[];
}

interface EnrollmentPreview {
  row: number;
  studentId: string;
  subjectCode: string;
  roomName: string;
  status: 'linked' | 'error';
  linkedName?: string;
  messages: string[];
}

export interface ScheduleImportPreview {
  term: string;
  previousTerm: null;
  willDeactivatePreviousTerm: false;
  errorCount: number;
  warningCount: number;
  canConfirm: boolean;
  schedules: SchedulePreview[];
  enrollments: EnrollmentPreview[];
}

@Injectable()
export class ScheduleImportService {
  constructor(private readonly dataSource: DataSource) {}

  template(): string {
    return `\uFEFF${HEADERS.join(',')}\r\n1/2026,2026-06-01,2026-10-15,CS101,Introduction to Computing,1,LAB,Ajarn Somchai,Monday,09:00,11:00,LAB-1,1\r\n`;
  }

  async excelTemplate(): Promise<Buffer> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Schedules');
    sheet.addRow(HEADERS.filter((h) => h !== 'user_id'));
    sheet.addRow([
      '1/2026',
      '2026-06-01',
      '2026-10-15',
      'CS101',
      'Introduction to Computing',
      '1',
      'LAB',
      'Ajarn Somchai',
      'Monday',
      '09:00',
      '11:00',
      'LAB-1',
      '6600000001',
    ]);
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((column) => {
      column.width = 24;
      column.numFmt = '@';
    });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private async readImport(file: Buffer): Promise<CsvRow[]> {
    if (file.subarray(0, 2).toString() === 'PK') {
      // Reject oversized ZIP entries before ExcelJS inflates the workbook.
      let total = 0;
      for (let i = 0; i + 46 <= file.length; i++) {
        if (file.readUInt32LE(i) !== 0x02014b50) continue;
        total += file.readUInt32LE(i + 24);
        if (total > 20 * 1024 * 1024)
          throw new BadRequestException('Excel มีขนาดข้อมูลใหญ่เกินไป');
      }
      const workbook = new Workbook();
      try {
        await workbook.xlsx.load(file as never);
      } catch {
        throw new BadRequestException('ไฟล์ Excel ไม่ถูกต้อง');
      }
      const sheet = workbook.worksheets[0];
      if (!sheet || sheet.rowCount > 5000 || sheet.columnCount > 50)
        throw new BadRequestException(
          'Excel ต้องมีไม่เกิน 5000 แถวและ 50 คอลัมน์',
        );
      const lines: string[] = [];
      sheet.eachRow((row) => {
        const values: string[] = [];
        for (let i = 1; i <= sheet.columnCount; i++) {
          const cell = row.getCell(i);
          if (cell.type === 6)
            throw new BadRequestException('ไม่รองรับสูตรในไฟล์นำเข้า');
          const value =
            cell.value instanceof Date
              ? cell.value.toISOString().slice(0, 10)
              : cell.text;
          values.push(`"${value.replaceAll('"', '""')}"`);
        }
        lines.push(values.join(','));
      });
      file = Buffer.from(lines.join('\n'));
    }
    const rows = this.parse(file);
    const ids = [...new Set(rows.map((r) => r.student_id).filter(Boolean))];
    if (ids.length) {
      const users = this.readRows(
        await this.dataSource.query(
          `SELECT id,student_id FROM users WHERE is_active=1 AND role='student' AND student_id IN (${ids.map(() => '?').join(',')})`,
          ids,
        ),
      );
      for (const row of rows)
        if (row.student_id) {
          const user = users.find((u) => u.student_id === row.student_id);
          if (row.user_id && row.user_id !== String(user?.id))
            throw new BadRequestException('student_id กับ user_id ไม่ตรงกัน');
          row.user_id = user ? String(user.id) : '';
        }
    }
    return rows;
  }

  async preview(file: Buffer): Promise<ScheduleImportPreview> {
    const rows = await this.readImport(file);
    const rooms = this.readRows(
      (await this.dataSource.query(
        'SELECT id, room_name FROM rooms WHERE status = ?',
        ['active'],
      )) as unknown,
    );
    const roomNames = new Set(rooms.map((room) => String(room.room_name)));
    const userIds = [
      ...new Set(
        rows
          .map((row) => Number(row.user_id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    const users = userIds.length
      ? this.readRows(
          (await this.dataSource.query(
            `SELECT id, first_name, last_name FROM users
             WHERE is_active = 1 AND id IN (${userIds.map(() => '?').join(', ')})`,
            userIds,
          )) as unknown,
        )
      : [];
    const usersById = new Map(users.map((user) => [Number(user.id), user]));
    const existingTerms = this.readRows(
      (await this.dataSource.query(
        `SELECT term_name, start_date, end_date FROM academic_terms
         WHERE term_name = ? LIMIT 1`,
        [rows[0].term_name],
      )) as unknown,
    );

    const term = rows[0].term_name;
    const commonErrors: string[] = [];
    if (rows.some((row) => row.term_name !== term)) {
      commonErrors.push('หนึ่งไฟล์ต้องมีภาคเรียนเดียวกันทุกแถว');
    }
    if (
      rows.some(
        (row) =>
          row.term_start_date !== rows[0].term_start_date ||
          row.term_end_date !== rows[0].term_end_date,
      )
    ) {
      commonErrors.push('วันที่เริ่มและสิ้นสุดภาคเรียนต้องตรงกันทุกแถว');
    }
    if (
      !this.isDate(rows[0].term_start_date) ||
      !this.isDate(rows[0].term_end_date)
    ) {
      commonErrors.push('วันที่ภาคเรียนต้องเป็นรูปแบบ YYYY-MM-DD');
    } else if (rows[0].term_end_date <= rows[0].term_start_date) {
      commonErrors.push('วันสิ้นสุดภาคเรียนต้องอยู่หลังวันเริ่ม');
    }
    const existingTerm = existingTerms[0];
    if (
      existingTerm &&
      (this.dateOnly(existingTerm.start_date) !== rows[0].term_start_date ||
        this.dateOnly(existingTerm.end_date) !== rows[0].term_end_date)
    ) {
      commonErrors.push(
        'ชื่อภาคเรียนนี้มีอยู่แล้ว แต่ช่วงวันที่ไม่ตรงกับฐานข้อมูล',
      );
    }

    const schedulesByKey = new Map<
      string,
      SchedulePreview & { signature: string }
    >();
    const enrollments: EnrollmentPreview[] = [];
    for (const row of rows) {
      const messages = [
        ...commonErrors,
        ...this.validateSchedule(row, roomNames),
      ];
      const key = `${row.subject_code}\u0000${row.section}`;
      const signature = [
        row.subject_name,
        row.class_type,
        row.instructor_name,
        row.day_of_week,
        row.start_time,
        row.end_time,
        row.room_name,
      ].join('\u0000');
      const existing = schedulesByKey.get(key);
      if (existing && existing.signature !== signature) {
        const duplicateMessage =
          'วิชาและ section เดียวกันมีรายละเอียดตารางไม่ตรงกัน';
        if (!existing.messages.includes(duplicateMessage)) {
          existing.messages.push(duplicateMessage);
          existing.status = 'error';
        }
        messages.push(duplicateMessage);
      }
      if (!existing) {
        schedulesByKey.set(key, {
          row: row.row,
          subjectCode: row.subject_code,
          section: row.section,
          dayKey: row.day_of_week,
          startTime: row.start_time,
          endTime: row.end_time,
          roomName: row.room_name,
          status: messages.length ? 'error' : 'ready',
          messages,
          signature,
        });
      }

      if (row.user_id || row.student_id) {
        const id = Number(row.user_id);
        const user = usersById.get(id);
        const enrollmentMessages: string[] = [];
        if (!Number.isInteger(id) || id <= 0) {
          enrollmentMessages.push('user_id ต้องเป็นจำนวนเต็มบวก');
        } else if (!user) {
          enrollmentMessages.push('ไม่พบผู้ใช้ที่เปิดใช้งาน');
        }
        enrollments.push({
          row: row.row,
          studentId: row.student_id || row.user_id,
          subjectCode: row.subject_code,
          roomName: row.room_name,
          status: enrollmentMessages.length ? 'error' : 'linked',
          linkedName: user
            ? [user.first_name, user.last_name].filter(Boolean).join(' ')
            : undefined,
          messages: enrollmentMessages,
        });
      }
    }

    const schedules = [...schedulesByKey.values()].map((item) => ({
      row: item.row,
      subjectCode: item.subjectCode,
      section: item.section,
      dayKey: item.dayKey,
      startTime: item.startTime,
      endTime: item.endTime,
      roomName: item.roomName,
      status: item.status,
      messages: item.messages,
    }));
    const errorCount =
      schedules.filter((item) => item.status === 'error').length +
      enrollments.filter((item) => item.status === 'error').length;
    return {
      term,
      previousTerm: null,
      willDeactivatePreviousTerm: false,
      errorCount,
      warningCount: 0,
      canConfirm: errorCount === 0,
      schedules,
      enrollments,
    };
  }

  async confirm(adminId: number, file: Buffer) {
    const preview = await this.preview(file);
    if (!preview.canConfirm) {
      throw new BadRequestException(
        'ไฟล์ยังมีข้อมูลผิดพลาด กรุณาแก้ไขแล้วดูตัวอย่างอีกครั้ง',
      );
    }
    const rows = await this.readImport(file);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const roomRows = this.readRows(
        (await queryRunner.query(
          'SELECT id, room_name FROM rooms WHERE status = ? FOR UPDATE',
          ['active'],
        )) as unknown,
      );
      const roomIds = new Map(
        roomRows.map((room) => [String(room.room_name), Number(room.id)]),
      );
      const termRows = this.readRows(
        (await queryRunner.query(
          'SELECT id FROM academic_terms WHERE term_name = ? LIMIT 1 FOR UPDATE',
          [rows[0].term_name],
        )) as unknown,
      );
      let termId = Number(termRows[0]?.id ?? 0);
      if (!termId) {
        const inserted = (await queryRunner.query(
          `INSERT INTO academic_terms (term_name, start_date, end_date, status)
           VALUES (?, ?, ?, 'active')`,
          [rows[0].term_name, rows[0].term_start_date, rows[0].term_end_date],
        )) as unknown;
        termId = this.readInsertId(inserted);
      }

      const subjectIds = new Map<string, number>();
      for (const row of rows) {
        const key = `${row.subject_code}\u0000${row.section}`;
        if (subjectIds.has(key)) continue;
        const roomId = roomIds.get(row.room_name);
        if (!roomId)
          throw new BadRequestException(`ไม่พบห้อง ${row.room_name}`);
        await queryRunner.query(
          `INSERT INTO subjects (
             subject_code, subject_name, section, class_type, instructor_name,
             day_of_week, start_time, end_time, term_id, room_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE subject_name = VALUES(subject_name),
             class_type = VALUES(class_type), instructor_name = VALUES(instructor_name),
             day_of_week = VALUES(day_of_week), start_time = VALUES(start_time),
             end_time = VALUES(end_time), room_id = VALUES(room_id)`,
          [
            row.subject_code,
            row.subject_name,
            row.section,
            row.class_type,
            row.instructor_name,
            row.day_of_week,
            row.start_time,
            row.end_time,
            termId,
            roomId,
          ],
        );
        const subjects = this.readRows(
          (await queryRunner.query(
            `SELECT id FROM subjects
             WHERE term_id = ? AND subject_code = ? AND section = ? LIMIT 1`,
            [termId, row.subject_code, row.section],
          )) as unknown,
        );
        const subjectId = Number(subjects[0]?.id ?? 0);
        if (!subjectId) {
          throw new TypeError('ฐานข้อมูลไม่ส่ง id รายวิชาที่ถูกต้องกลับมา');
        }
        subjectIds.set(key, subjectId);
      }

      let enrolled = 0;
      for (const row of rows) {
        if (!row.user_id) continue;
        const active = this.readRows(
          await queryRunner.query(
            'SELECT id FROM users WHERE id=? AND is_active=1 FOR UPDATE',
            [Number(row.user_id)],
          ),
        );
        if (!active.length)
          throw new BadRequestException('สมาชิกถูกระงับหรือไม่มีบัญชีแล้ว');
        const subjectId = subjectIds.get(
          `${row.subject_code}\u0000${row.section}`,
        );
        await queryRunner.query(
          `INSERT INTO subject_enrollments (subject_id, user_id, status)
           VALUES (?, ?, 'active')
           ON DUPLICATE KEY UPDATE status = 'active', enrolled_at = NOW()`,
          [subjectId, Number(row.user_id)],
        );
        enrolled += 1;
      }
      await queryRunner.query(
        'INSERT INTO audit_logs (action, admin_id) VALUES (?, ?)',
        [`นำเข้าตารางเรียนภาคเรียน ${rows[0].term_name}`, adminId],
      );
      await queryRunner.commitTransaction();
      return { schedules: subjectIds.size, enrolled, pending: 0 };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private parse(file: Buffer): CsvRow[] {
    if (!file.length) throw new BadRequestException('ไฟล์ CSV ว่างเปล่า');
    const table = this.parseCsv(file.toString('utf8').replace(/^\uFEFF/, ''));
    if (table.length < 2) {
      throw new BadRequestException(
        'ไฟล์ต้องมีหัวตารางและข้อมูลอย่างน้อย 1 แถว',
      );
    }
    const headers = table[0].map((value) => value.trim());
    const missing = HEADERS.filter(
      (header) =>
        !['user_id', 'student_id'].includes(header) &&
        !headers.includes(header),
    );
    if (!headers.includes('user_id') && !headers.includes('student_id'))
      missing.push('student_id');
    if (missing.length) {
      throw new BadRequestException(`ไฟล์ขาดคอลัมน์: ${missing.join(', ')}`);
    }
    return table
      .slice(1)
      .filter((values) => values.some((value) => value.trim()))
      .map((values, index) => {
        const row = { row: index + 2 } as CsvRow;
        for (const header of HEADERS) {
          row[header] = (values[headers.indexOf(header)] ?? '').trim();
        }
        return row;
      });
  }

  private parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (character === '"') {
        if (quoted && text[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === ',' && !quoted) {
        row.push(value);
        value = '';
      } else if ((character === '\n' || character === '\r') && !quoted) {
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        row.push(value);
        rows.push(row);
        row = [];
        value = '';
      } else {
        value += character;
      }
    }
    if (quoted)
      throw new BadRequestException('เครื่องหมายคำพูดใน CSV ไม่ครบคู่');
    if (value || row.length) {
      row.push(value);
      rows.push(row);
    }
    return rows;
  }

  private validateSchedule(row: CsvRow, roomNames: Set<string>): string[] {
    const messages: string[] = [];
    const required = HEADERS.filter(
      (header) => !['user_id', 'student_id'].includes(header),
    );
    if (required.some((header) => !row[header]))
      messages.push('มีช่องบังคับว่าง');
    if (!['LAB', 'LECT'].includes(row.class_type)) {
      messages.push('class_type ต้องเป็น LAB หรือ LECT');
    }
    if (
      ![
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ].includes(row.day_of_week)
    ) {
      messages.push('day_of_week ไม่ถูกต้อง');
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.start_time)) {
      messages.push('start_time ต้องเป็น HH:mm');
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.end_time)) {
      messages.push('end_time ต้องเป็น HH:mm');
    } else if (row.end_time <= row.start_time) {
      messages.push('end_time ต้องมากกว่า start_time');
    }
    if (row.room_name && !roomNames.has(row.room_name)) {
      messages.push('ไม่พบห้องที่เปิดใช้งาน');
    }
    return [...new Set(messages)];
  }

  private isDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  private dateOnly(value: unknown): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }

  private readRows(result: unknown): Array<Record<string, unknown>> {
    return Array.isArray(result)
      ? result.filter(
          (row): row is Record<string, unknown> =>
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
      throw new TypeError('ฐานข้อมูลไม่ส่ง id ภาคเรียนที่ถูกต้องกลับมา');
    }
    return id;
  }
}
