import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface UserScheduleItem {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  section: string;
  class_type: 'LAB' | 'LECT';
  instructor_name: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room_id: number;
  room_name: string;
  term_id: number;
  term_name: string;
}

@Injectable()
export class ScheduleService {
  constructor(private readonly dataSource: DataSource) {}

  async findUserSchedule(userId: number): Promise<UserScheduleItem[]> {
    const result = (await this.dataSource.query(
      `
        SELECT
          s.id AS subject_id,
          s.subject_code,
          s.subject_name,
          s.section,
          s.class_type,
          s.instructor_name,
          s.day_of_week,
          TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
          TIME_FORMAT(s.end_time, '%H:%i') AS end_time,
          s.room_id,
          r.room_name,
          at.id AS term_id,
          at.term_name
        FROM subject_enrollments AS se
        INNER JOIN subjects AS s ON s.id = se.subject_id
        INNER JOIN academic_terms AS at ON at.id = s.term_id
        INNER JOIN rooms AS r ON r.id = s.room_id
        WHERE se.user_id = ?
          AND se.status = 'active'
          AND at.status = 'active'
        ORDER BY FIELD(
          s.day_of_week,
          'Monday', 'Tuesday', 'Wednesday', 'Thursday',
          'Friday', 'Saturday', 'Sunday'
        ), s.start_time ASC
      `,
      [userId],
    )) as unknown;

    return this.readRows(result).map((row) => ({
      subject_id: Number(row.subject_id),
      subject_code: String(row.subject_code),
      subject_name: String(row.subject_name),
      section: String(row.section),
      class_type: row.class_type as UserScheduleItem['class_type'],
      instructor_name: String(row.instructor_name),
      day_of_week: String(row.day_of_week),
      start_time: String(row.start_time),
      end_time: String(row.end_time),
      room_id: Number(row.room_id),
      room_name: String(row.room_name),
      term_id: Number(row.term_id),
      term_name: String(row.term_name),
    }));
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
