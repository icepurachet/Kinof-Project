import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TrackingAgentIdentity } from './agent-auth.guard';
import { AgentCommandResultDto } from './dto/agent-command-result.dto';
import { AgentEventDto } from './dto/agent-events.dto';
import { AgentHeartbeatDto } from './dto/agent-heartbeat.dto';

export interface BlockRule {
  domain_name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: 'monitor' | 'warn' | 'block';
  match_type: 'exact' | 'suffix';
}

@Injectable()
export class AgentService {
  constructor(private readonly dataSource: DataSource) {}

  async register(
    agent: TrackingAgentIdentity,
    dto: AgentHeartbeatDto,
  ): Promise<Record<string, unknown>> {
    await this.touchAgent(agent.id, dto);
    const rows = this.readRows(
      (await this.dataSource.query(
        `
          SELECT lc.machine_no, r.room_name
          FROM lab_computers AS lc
          INNER JOIN rooms AS r ON r.id = lc.room_id
          WHERE lc.id = ?
          LIMIT 1
        `,
        [agent.computer_id],
      )) as unknown,
    );
    return {
      agent_id: agent.id,
      computer_id: agent.computer_id,
      room_id: agent.room_id,
      machine_no: this.readString(rows[0]?.machine_no),
      room_name: this.readString(rows[0]?.room_name),
    };
  }

  async heartbeat(
    agent: TrackingAgentIdentity,
    dto: AgentHeartbeatDto,
  ): Promise<{ ok: true; commands: Array<Record<string, unknown>> }> {
    await this.touchAgent(agent.id, dto);
    await this.dataSource.query(
      `
        UPDATE lab_computers
        SET last_seen_at = NOW()
        WHERE id = ? AND status <> 'maintenance'
      `,
      [agent.computer_id],
    );

    const commands = this.readRows(
      (await this.dataSource.query(
        `
          SELECT id, command_type, payload_json, created_at
          FROM agent_commands
          WHERE agent_id = ? AND status = 'pending'
          ORDER BY created_at ASC, id ASC
          LIMIT 20
        `,
        [agent.id],
      )) as unknown,
    );
    if (commands.length > 0) {
      const ids = commands.map((row) => Number(row.id));
      await this.dataSource.query(
        `
          UPDATE agent_commands
          SET status = 'delivered', delivered_at = NOW()
          WHERE agent_id = ? AND status = 'pending' AND id IN (?)
        `,
        [agent.id, ids],
      );
    }
    return {
      ok: true,
      commands: commands.map((row) => ({
        id: Number(row.id),
        type: String(row.command_type),
        payload: this.parseJson(row.payload_json),
        created_at: row.created_at,
      })),
    };
  }

  async ingestEvents(
    agent: TrackingAgentIdentity,
    events: AgentEventDto[],
  ): Promise<{
    accepted: number;
    skipped: number;
    flagged: number;
    blocked: number;
  }> {
    const now = Date.now();
    for (const event of events) {
      const occurredAt = new Date(event.occurred_at).getTime();
      if (occurredAt > now + 5 * 60_000 || occurredAt < now - 7 * 86_400_000) {
        throw new BadRequestException(
          'occurred_at ต้องไม่เกินอนาคต 5 นาทีหรือย้อนหลังเกิน 7 วัน',
        );
      }
    }

    const activeSessionId = await this.findActiveSessionId(agent.computer_id);
    const rules = await this.loadBlockRules();
    let accepted = 0;
    let skipped = 0;
    let flagged = 0;
    let blocked = 0;

    for (const event of events) {
      const domain =
        event.event_type === 'website'
          ? this.toHostname(event.domain ?? event.name ?? '')
          : null;
      const rule = domain ? this.matchRule(domain, rules) : null;
      const riskLevel =
        event.event_type === 'suspicious' ? 'high' : (rule?.severity ?? 'none');
      const wasBlocked = rule?.action === 'block';
      const result = (await this.dataSource.query(
        `
          INSERT IGNORE INTO tracking_events (
            event_uuid, agent_id, session_id, event_type, name, domain,
            duration_minutes, risk_level, was_blocked, occurred_at, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          event.event_id,
          agent.id,
          event.session_id ?? activeSessionId,
          event.event_type,
          event.name ?? null,
          domain,
          event.duration_minutes ?? null,
          riskLevel,
          wasBlocked ? 1 : 0,
          new Date(event.occurred_at),
          event.metadata ? JSON.stringify(event.metadata) : null,
        ],
      )) as unknown;
      if (this.readAffectedRows(result) === 0) {
        skipped++;
        continue;
      }
      accepted++;
      if (riskLevel !== 'none') flagged++;
      if (wasBlocked) blocked++;
    }

    await this.touchAgent(agent.id, {});
    return { accepted, skipped, flagged, blocked };
  }

  async completeCommand(
    agentId: number,
    commandId: number,
    dto: AgentCommandResultDto,
  ): Promise<{ message: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const command = this.readRows(
        (await queryRunner.query(
          `
            SELECT ac.id, ac.command_type, ta.computer_id
            FROM agent_commands AS ac
            INNER JOIN tracking_agents AS ta ON ta.id = ac.agent_id
            WHERE ac.id = ? AND ac.agent_id = ?
              AND ac.status IN ('pending', 'delivered')
            LIMIT 1 FOR UPDATE
          `,
          [commandId, agentId],
        )) as unknown,
      )[0];
      if (!command) {
        throw new NotFoundException('ไม่พบคำสั่งนี้หรือคำสั่งจบไปแล้ว');
      }

      await queryRunner.query(
        `
          UPDATE agent_commands
          SET status = ?, completed_at = NOW(), result_message = ?
          WHERE id = ?
        `,
        [dto.status, dto.message ?? null, commandId],
      );

      if (dto.status === 'completed' && command.command_type === 'logout') {
        const computerId = Number(command.computer_id);
        await queryRunner.query(
          `
            UPDATE pc_sessions
            SET status = 'offline', logout_time = NOW()
            WHERE computer_id = ? AND status = 'online'
          `,
          [computerId],
        );
        await queryRunner.query(
          `
            UPDATE lab_computers
            SET status = 'offline', last_seen_at = NOW()
            WHERE id = ? AND status <> 'maintenance'
          `,
          [computerId],
        );
      }

      await queryRunner.commitTransaction();
      return { message: 'บันทึกผลคำสั่งสำเร็จ' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getBlocklist(): Promise<BlockRule[]> {
    return this.loadBlockRules();
  }

  private async touchAgent(
    agentId: number,
    dto: AgentHeartbeatDto,
  ): Promise<void> {
    await this.dataSource.query(
      `
        UPDATE tracking_agents
        SET hostname = COALESCE(?, hostname),
            agent_version = COALESCE(?, agent_version),
            last_seen_at = NOW()
        WHERE id = ?
      `,
      [dto.hostname ?? null, dto.agent_version ?? null, agentId],
    );
  }

  private async findActiveSessionId(
    computerId: number,
  ): Promise<number | null> {
    const rows = this.readRows(
      (await this.dataSource.query(
        `
          SELECT id FROM pc_sessions
          WHERE computer_id = ? AND status = 'online'
          ORDER BY login_time DESC LIMIT 1
        `,
        [computerId],
      )) as unknown,
    );
    return rows[0] ? Number(rows[0].id) : null;
  }

  private async loadBlockRules(): Promise<BlockRule[]> {
    return this.readRows(
      (await this.dataSource.query(`
        SELECT domain_name, severity, action, match_type
        FROM blocked_domains
        WHERE is_enabled = 1
        ORDER BY FIELD(severity, 'critical', 'high', 'medium', 'low')
      `)) as unknown,
    ).map((row) => ({
      domain_name: String(row.domain_name).toLowerCase(),
      severity: row.severity as BlockRule['severity'],
      action: row.action as BlockRule['action'],
      match_type: row.match_type as BlockRule['match_type'],
    }));
  }

  private matchRule(domain: string, rules: BlockRule[]): BlockRule | null {
    return (
      rules.find((rule) =>
        rule.match_type === 'exact'
          ? domain === rule.domain_name
          : domain === rule.domain_name ||
            domain.endsWith(`.${rule.domain_name}`),
      ) ?? null
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

  private parseJson(value: unknown): unknown {
    if (typeof value !== 'string') return value ?? null;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
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

  private readString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}
