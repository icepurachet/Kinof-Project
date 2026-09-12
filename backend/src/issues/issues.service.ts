import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateIssueDto } from './dto/create-issue.dto';

export interface IssueResult {
  issue_id: number;
  category: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  admin_reply: string | null;
  created_at: string;
  image_urls: string[];
}

@Injectable()
export class IssuesService {
  constructor(private readonly dataSource: DataSource) {}

  async createIssue(userId: number, dto: CreateIssueDto): Promise<IssueResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const insertResult = (await queryRunner.query(
        `
          INSERT INTO issues (category, title, description, status, user_id)
          VALUES (?, ?, ?, 'pending', ?)
        `,
        [dto.category, dto.title, dto.description, userId],
      )) as unknown;
      const issueId = this.readInsertId(insertResult);
      const imageUrls = dto.image_urls ?? [];

      if (imageUrls.length > 0) {
        const values = imageUrls.map(() => '(?, ?)').join(', ');
        const parameters = imageUrls.flatMap((url) => [issueId, url]);
        await queryRunner.query(
          `INSERT INTO issue_images (issue_id, image_url) VALUES ${values}`,
          parameters,
        );
      }

      await queryRunner.commitTransaction();
      return {
        issue_id: issueId,
        category: dto.category,
        title: dto.title,
        description: dto.description,
        status: 'pending',
        admin_reply: null,
        created_at: new Date().toISOString(),
        image_urls: imageUrls,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findUserIssues(userId: number): Promise<IssueResult[]> {
    const result = (await this.dataSource.query(
      `
        SELECT
          i.id AS issue_id,
          i.category,
          i.title,
          i.description,
          i.status,
          i.admin_reply,
          DATE_FORMAT(i.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
          COALESCE(
            JSON_ARRAYAGG(CASE WHEN ii.id IS NOT NULL THEN ii.image_url END),
            JSON_ARRAY()
          ) AS image_urls
        FROM issues AS i
        LEFT JOIN issue_images AS ii ON ii.issue_id = i.id
        WHERE i.user_id = ?
        GROUP BY i.id
        ORDER BY i.created_at DESC, i.id DESC
      `,
      [userId],
    )) as unknown;

    return this.readRows(result).map((row) => this.toIssue(row));
  }

  async findUserIssue(userId: number, issueId: number): Promise<IssueResult> {
    const issues = await this.findUserIssues(userId);
    const issue = issues.find((item) => item.issue_id === issueId);
    if (!issue) {
      throw new NotFoundException('ไม่พบคำขอความช่วยเหลือนี้');
    }
    return issue;
  }

  private toIssue(row: Record<string, unknown>): IssueResult {
    return {
      issue_id: Number(row.issue_id),
      category: String(row.category),
      title: String(row.title),
      description: String(row.description),
      status: row.status as IssueResult['status'],
      admin_reply: typeof row.admin_reply === 'string' ? row.admin_reply : null,
      created_at: String(row.created_at),
      image_urls: this.readImageUrls(row.image_urls),
    };
  }

  private readImageUrls(value: unknown): string[] {
    const parsed: unknown =
      typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
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
    if (typeof result !== 'object' || result === null) {
      throw new TypeError('ฐานข้อมูลไม่ส่ง issue_id กลับมา');
    }
    const id = Number((result as Record<string, unknown>).insertId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new TypeError('ฐานข้อมูลส่ง issue_id ไม่ถูกต้อง');
    }
    return id;
  }
}
