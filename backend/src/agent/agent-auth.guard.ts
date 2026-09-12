import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Request } from 'express';
import { DataSource } from 'typeorm';

export interface TrackingAgentIdentity {
  id: number;
  computer_id: number;
  room_id: number;
}

export interface AgentAuthenticatedRequest extends Request {
  agent: TrackingAgentIdentity;
}

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AgentAuthenticatedRequest>();
    const rawKey = request.header('X-Agent-Key')?.trim();
    if (!rawKey) {
      throw new UnauthorizedException('กรุณาส่ง X-Agent-Key');
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const result = (await this.dataSource.query(
      `
        SELECT ta.id, ta.computer_id, lc.room_id
        FROM tracking_agents AS ta
        INNER JOIN lab_computers AS lc ON lc.id = ta.computer_id
        WHERE ta.api_key_hash = ? AND ta.is_enabled = 1
        LIMIT 1
      `,
      [keyHash],
    )) as unknown;
    const row = this.readRows(result)[0];
    if (!row) {
      throw new UnauthorizedException('Agent key ไม่ถูกต้องหรือถูกปิดใช้งาน');
    }

    request.agent = {
      id: Number(row.id),
      computer_id: Number(row.computer_id),
      room_id: Number(row.room_id),
    };
    return true;
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
