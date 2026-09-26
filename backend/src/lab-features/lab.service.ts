import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { AuthService } from '../auth/auth.service';
import { EntryService } from '../entry/entry.service';
import { TrackingAgentIdentity } from '../agent/agent-auth.guard';
import { AgentService } from '../agent/agent.service';
import { ProgramRuleDto, ReviewActionDto, DesktopEventDto } from './lab.dto';
import { MailService } from '../mail/mail.service';

type Row = Record<string, unknown>;
export const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? (value as Row[]) : [];
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const monthStart = () => {
  const local = new Date(Date.now() + 7 * 3600000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 7 * 3600000,
  );
};
export function processName(value: string): string {
  const name =
    value.trim().toLowerCase().replaceAll('\\', '/').split('/').pop() ?? '';
  if (!/^[a-z0-9][a-z0-9 ._+-]{0,249}(?:\.exe)?$/.test(name))
    throw new BadRequestException('ชื่อโปรแกรมไม่ถูกต้อง');
  return name.endsWith('.exe') ? name : `${name}.exe`;
}

@Injectable()
export class LabService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly entry: EntryService,
    private readonly agentService: AgentService,
    @Optional() private readonly mail?: MailService,
  ) {}

  async audit(manager: EntityManager, admin: number, action: string) {
    await manager.query(
      'INSERT INTO audit_logs (admin_id, action) VALUES (?,?)',
      [admin, action.slice(0, 255)],
    );
  }
  async rules(type: 'allow' | 'block') {
    return rows(
      await this.db.query(
        'SELECT id,process_name AS processName,display_name AS displayName,category,reason,created_at AS createdAt FROM program_rules WHERE rule_type=? ORDER BY process_name',
        [type],
      ),
    );
  }
  async addRule(admin: number, type: 'allow' | 'block', dto: ProgramRuleDto) {
    const name = processName(dto.processName);
    // Never allow a remote rule to terminate the OS, Agent or security infrastructure.
    if (
      type === 'block' &&
      /^(system|registry|smss|csrss|wininit|winlogon|services|lsass|svchost|dwm|explorer|kinof\.agent|msmpeng)\.exe$/.test(
        name,
      )
    )
      throw new BadRequestException('ไม่อนุญาตให้บล็อกโปรแกรมระบบ');
    await this.db.transaction(async (m) => {
      await m.query(
        'DELETE FROM program_rules WHERE process_name=? AND rule_type<>?',
        [name, type],
      );
      await m.query(
        'INSERT INTO program_rules (process_name,rule_type,display_name,category,reason) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),category=VALUES(category),reason=VALUES(reason)',
        [
          name,
          type,
          dto.displayName ?? null,
          dto.category ?? null,
          dto.reason ?? null,
        ],
      );
      await this.audit(m, admin, `program ${type}: ${name}`);
    });
    return { processName: name, message: 'บันทึกรายการโปรแกรมแล้ว' };
  }
  async removeRule(admin: number, type: 'allow' | 'block', id: number) {
    await this.db.transaction(async (m) => {
      await m.query('DELETE FROM program_rules WHERE id=? AND rule_type=?', [
        id,
        type,
      ]);
      await this.audit(m, admin, `remove program ${type} #${id}`);
    });
    return { message: 'ลบรายการแล้ว' };
  }

  async settleNoShows() {
    // A unique source key makes repeated requests/workers idempotent.
    await this.db
      .query(`INSERT IGNORE INTO behavior_penalties (user_id,source_key,points,reason,created_at)
     SELECT members.user_id,CONCAT('no_show:',b.id),5,'ไม่เข้าใช้งานตามการจอง',
       CONVERT_TZ(TIMESTAMP(b.booking_date,SUBSTRING_INDEX(b.time_slot,'-',-1)),'+07:00','+00:00')
     FROM bookings b JOIN (
       SELECT id AS booking_id,host_id AS user_id FROM bookings
       UNION SELECT booking_id,user_id FROM booking_members WHERE invite_status='accepted'
     ) members ON members.booking_id=b.id
     WHERE b.status IN ('confirmed','completed')
       AND b.booking_date >= DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+07:00')) - INTERVAL 32 DAY
       AND TIMESTAMP(b.booking_date,SUBSTRING_INDEX(b.time_slot,'-',-1)) < CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+07:00')
       AND NOT EXISTS (SELECT 1 FROM pc_sessions ps JOIN lab_computers lc ON lc.id=ps.computer_id
         WHERE ps.user_id=members.user_id AND lc.room_id=b.room_id
           AND ps.login_time < CONVERT_TZ(TIMESTAMP(b.booking_date,SUBSTRING_INDEX(b.time_slot,'-',-1)),'+07:00','+00:00')
           AND COALESCE(ps.logout_time,UTC_TIMESTAMP()) >= CONVERT_TZ(TIMESTAMP(b.booking_date,SUBSTRING_INDEX(b.time_slot,'-',1)),'+07:00','+00:00'))
       AND NOT EXISTS (SELECT 1 FROM entry_verifications ev WHERE ev.user_id=members.user_id AND ev.room_id=b.room_id
         AND ev.result='success' AND ev.created_at BETWEEN
         CONVERT_TZ(TIMESTAMP(b.booking_date,SUBSTRING_INDEX(b.time_slot,'-',1)),'+07:00','+00:00') AND
         CONVERT_TZ(TIMESTAMP(b.booking_date,SUBSTRING_INDEX(b.time_slot,'-',-1)),'+07:00','+00:00'))`);
  }
  async behavior(user: number) {
    await this.settleNoShows();
    const penalties = rows(
      await this.db.query(
        'SELECT id,created_at AS at,points,reason,source_key AS source FROM behavior_penalties WHERE user_id=? AND created_at>=? ORDER BY created_at DESC',
        [user, monthStart()],
      ),
    );
    const score = Math.max(
      0,
      100 - penalties.reduce((sum, r) => sum + Number(r.points), 0),
    );
    const local = new Date(Date.now() + 7 * 3600000);
    const next = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) -
        7 * 3600000,
    );
    return {
      score,
      maxScore: 100,
      minScoreToBook: 50,
      canBook: score >= 50,
      resetsAt: next.toISOString(),
      penalties,
    };
  }
  async groupEligibility(userIds: number[]) {
    const ids = [...new Set(userIds)];
    if (!ids.length) throw new ForbiddenException('ไม่พบผู้เข้าร่วมการจอง');
    await this.settleNoShows();
    const participants = rows(
      await this.db.query(
        `SELECT u.id,u.username,GREATEST(0,100-COALESCE(SUM(p.points),0)) AS score
       FROM users u LEFT JOIN behavior_penalties p ON p.user_id=u.id AND p.created_at>=?
       WHERE u.id IN (${ids.map(() => '?').join(',')}) GROUP BY u.id,u.username`,
        [monthStart(), ...ids],
      ),
    );
    const blockedMembers = ids.flatMap((id) => {
      const participant = participants.find((p) => Number(p.id) === id);
      if (participant && Number(participant.score) >= 50) return [];
      return [
        {
          id,
          username: String(participant?.username ?? `ผู้ใช้ ${id}`),
          score: participant ? Number(participant.score) : null,
        },
      ];
    });
    return {
      canBook: blockedMembers.length === 0,
      minScoreToBook: 50,
      blockedMembers,
    };
  }

  async requireGroupScore(userIds: number[]) {
    const eligibility = await this.groupEligibility(userIds);
    if (!eligibility.canBook)
      throw new ForbiddenException(
        `ไม่สามารถจองได้: ${eligibility.blockedMembers.map((m) => m.username).join(', ')} คะแนนต่ำกว่า 50 หรือไม่พบบัญชี`,
      );
  }

  async requireScore(user: number) {
    if (!(await this.behavior(user)).canBook)
      throw new ForbiddenException(
        'คะแนนพฤติกรรมต่ำกว่า 50 ไม่สามารถจองห้องได้',
      );
  }

  async reviews(room?: number) {
    await this.db
      .query(`INSERT IGNORE INTO behavior_reviews (event_id,user_id,kind,target,queue_key)
      SELECT te.id,ps.user_id,IF(te.domain IS NOT NULL,'website',IF(te.event_type='program','program','suspicious')),
        COALESCE(te.domain,te.name,te.event_type),CONCAT(COALESCE(ps.user_id,'anon'),':',IF(te.domain IS NOT NULL,'website',IF(te.event_type='program','program','suspicious')),':',LOWER(COALESCE(te.domain,te.name,te.event_type)))
      FROM tracking_events te LEFT JOIN pc_sessions ps ON ps.id=te.session_id
      WHERE te.risk_level<>'none' AND te.occurred_at>=UTC_TIMESTAMP()-INTERVAL 32 DAY ORDER BY te.id DESC`);
    const all = rows(
      await this.db.query(
        `SELECT br.*,lc.room_id,lc.id AS computer_id,lc.machine_no,r.room_name,u.username,u.first_name,u.last_name,te.occurred_at
      FROM behavior_reviews br JOIN tracking_events te ON te.id=br.event_id JOIN tracking_agents ta ON ta.id=te.agent_id
      JOIN lab_computers lc ON lc.id=ta.computer_id JOIN rooms r ON r.id=lc.room_id LEFT JOIN users u ON u.id=br.user_id
      ${room ? 'WHERE lc.room_id=?' : ''} ORDER BY te.occurred_at DESC`,
        room ? [room] : [],
      ),
    );
    return {
      items: all
        .filter((r) => r.status === 'pending')
        .map((r) => ({
          id: r.id,
          userId: r.user_id,
          kind: r.kind,
          target: r.target,
          queueKey: r.queue_key,
          roomId: r.room_id,
          seatId: r.computer_id,
          roomName: r.room_name,
          seatLabel: r.machine_no,
          activity: r.target,
          lastSeenAt: r.occurred_at,
          occurrenceCount: 1,
          website: r.kind === 'website' ? r.target : null,
          program: r.kind === 'program' ? r.target : null,
          user: {
            id: r.user_id,
            username: r.username,
            displayName: [r.first_name, r.last_name].filter(Boolean).join(' '),
          },
        })),
      handledKeys: all
        .filter((r) => r.status !== 'pending')
        .map((r) => r.queue_key),
      clearedKeys: all
        .filter((r) => r.status === 'cleared')
        .map((r) => r.queue_key),
    };
  }
  async handleReview(
    admin: number,
    id: number,
    action: 'cleared' | 'penalized',
  ) {
    const result: {
      already: boolean;
      deducted: boolean;
      points: number;
      blocked: string | null;
      userId: number | null;
      score: number | null;
    } = {
      already: false,
      deducted: false,
      points: 0,
      blocked: null,
      userId: null,
      score: null,
    };
    await this.db.transaction(async (m) => {
      const review = rows(
        await m.query('SELECT * FROM behavior_reviews WHERE id=? FOR UPDATE', [
          id,
        ]),
      )[0];
      if (!review) throw new NotFoundException('ไม่พบรายการตรวจสอบ');
      result.userId = review.user_id ? Number(review.user_id) : null;
      if (review.status !== 'pending') {
        result.already = true;
        return;
      }
      if (action === 'penalized') {
        result.blocked = String(review.target);
        if (review.kind === 'program') {
          const name = processName(String(review.target));
          if (
            /^(system|registry|smss|csrss|wininit|winlogon|services|lsass|svchost|dwm|explorer|kinof\.agent|msmpeng)\.exe$/.test(
              name,
            )
          )
            throw new BadRequestException('ไม่อนุญาตให้บล็อกโปรแกรมระบบ');
          await m.query(
            "DELETE FROM program_rules WHERE process_name=? AND rule_type='allow'",
            [name],
          );
          await m.query(
            "INSERT IGNORE INTO program_rules (process_name,rule_type,reason) VALUES (?,'block',?)",
            [name, 'ผ่านการตรวจสอบโดยผู้ดูแล'],
          );
        } else if (review.kind === 'website') {
          await m.query(
            "INSERT INTO blocked_domains (domain_name,category,severity,action,match_type,is_enabled) VALUES (?,'review','high','block','suffix',1) ON DUPLICATE KEY UPDATE action='block',is_enabled=1",
            [String(review.target)],
          );
        }
        if (review.user_id) {
          const inserted = await m.query(
            'INSERT IGNORE INTO behavior_penalties (user_id,source_key,points,reason) VALUES (?,?,5,?)',
            [
              review.user_id,
              `review:${id}`,
              `ผู้ดูแลยืนยันกิจกรรม: ${String(review.target)}`,
            ],
          );
          result.deducted = inserted.affectedRows > 0;
          result.points = result.deducted ? 5 : 0;
        }
      }
      await m.query(
        'UPDATE behavior_reviews SET status=?,handled_by=?,handled_at=UTC_TIMESTAMP() WHERE id=?',
        [action, admin, id],
      );
      await this.audit(m, admin, `behavior review #${id}: ${action}`);
    });
    if (result.userId)
      result.score = (await this.behavior(result.userId)).score;
    return {
      ...result,
      message:
        action === 'cleared' ? 'ยกเว้นรายการแล้ว' : 'บล็อกและบันทึกคะแนนแล้ว',
    };
  }
  async handleActivity(
    admin: number,
    dto: ReviewActionDto,
    action: 'cleared' | 'penalized',
  ) {
    await this.reviews();
    const kind = dto.website
      ? 'website'
      : dto.program
        ? 'program'
        : 'suspicious';
    const target = (dto.website ?? dto.program ?? dto.activity ?? '')
      .trim()
      .toLowerCase();
    const key = `${dto.userId ?? 'anon'}:${kind}:${target}`;
    const review = rows(
      await this.db.query('SELECT id FROM behavior_reviews WHERE queue_key=?', [
        key,
      ]),
    )[0];
    if (!review) throw new NotFoundException('ไม่พบกิจกรรมจริงที่ต้องตรวจสอบ');
    return this.handleReview(admin, Number(review.id), action);
  }
  async unknown(room?: number, date?: string) {
    if (date && date !== 'all' && !/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new BadRequestException('วันที่ไม่ถูกต้อง');
    return rows(
      await this.db.query(
        `SELECT te.name AS processName,MAX(te.occurred_at) AS lastSeenAt,COUNT(*) AS occurrenceCount,
       COUNT(DISTINCT lc.id) AS machineCount
     FROM tracking_events te JOIN tracking_agents ta ON ta.id=te.agent_id JOIN lab_computers lc ON lc.id=ta.computer_id JOIN rooms r ON r.id=lc.room_id
     WHERE te.event_type='program' AND NOT EXISTS (SELECT 1 FROM program_rules pr WHERE pr.process_name=LOWER(te.name))
       ${room ? 'AND lc.room_id=?' : ''}
       ${date && date !== 'all' ? "AND DATE(CONVERT_TZ(te.occurred_at,'+00:00','+07:00'))=?" : ''}
       GROUP BY te.name ORDER BY lastSeenAt DESC LIMIT 500`,
        [...(room ? [room] : []), ...(date && date !== 'all' ? [date] : [])],
      ),
    );
  }
  async kioskDevices(room?: number) {
    return rows(
      await this.db.query(
        `SELECT kd.id,kd.room_id AS roomId,r.room_name AS roomName,kd.label,kd.created_at AS createdAt,kd.last_seen_at AS lastSeenAt,kd.revoked_at AS revokedAt FROM kiosk_devices kd JOIN rooms r ON r.id=kd.room_id ${room ? 'WHERE kd.room_id=?' : ''} ORDER BY kd.id DESC`,
        room ? [room] : [],
      ),
    ).map((device) => ({ ...device, revoked: Boolean(device.revokedAt) }));
  }
  async createKiosk(admin: number, room: number, label: string) {
    if (
      !rows(await this.db.query('SELECT id FROM rooms WHERE id=?', [room]))[0]
    )
      throw new NotFoundException('ไม่พบห้อง');
    const apiKey = randomBytes(32).toString('hex');
    const id = await this.db.transaction(async (m) => {
      const result = await m.query(
        'INSERT INTO kiosk_devices (room_id,label,key_hash) VALUES (?,?,?)',
        [room, label, digest(apiKey)],
      );
      await this.audit(m, admin, `create kiosk #${result.insertId}`);
      return result.insertId;
    });
    return { id, roomId: room, label, apiKey };
  }
  async revokeKiosk(admin: number, id: number) {
    await this.db.transaction(async (m) => {
      await m.query(
        'UPDATE kiosk_devices SET revoked_at=UTC_TIMESTAMP() WHERE id=?',
        [id],
      );
      await this.audit(m, admin, `revoke kiosk #${id}`);
    });
    return { message: 'เพิกถอนแล้ว' };
  }
  async verifyKiosk(key: string | undefined, room: number) {
    if (!key) throw new UnauthorizedException('ต้องตั้งคีย์ Kiosk ก่อน');
    const device = rows(
      await this.db.query(
        'SELECT id FROM kiosk_devices WHERE key_hash=? AND room_id=? AND revoked_at IS NULL',
        [digest(key.trim()), room],
      ),
    )[0];
    if (!device)
      throw new UnauthorizedException('คีย์ Kiosk ไม่ถูกต้องหรือถูกเพิกถอน');
    await this.db.query(
      'UPDATE kiosk_devices SET last_seen_at=UTC_TIMESTAMP() WHERE id=?',
      [device.id],
    );
  }

  async desktopRegister(agent: TrackingAgentIdentity, hostname?: string) {
    const value = await this.agentService.register(agent, { hostname });
    return {
      agentId: agent.id,
      seatId: agent.computer_id,
      roomId: agent.room_id,
      seatNumber:
        parseInt(String(value.machine_no).replace(/\D/g, ''), 10) ||
        agent.computer_id,
      hostname,
    };
  }
  async desktopHeartbeat(agent: TrackingAgentIdentity, hostname?: string) {
    // Desktop agent obeys logout by clearing its KINOF session, without logging out Windows.
    await this.db.transaction(async (m) => {
      await m.query(
        'UPDATE tracking_agents SET last_seen_at=UTC_TIMESTAMP(),hostname=COALESCE(?,hostname) WHERE id=?',
        [hostname ?? null, agent.id],
      );
      await m.query(
        'UPDATE lab_computers SET last_seen_at=UTC_TIMESTAMP() WHERE id=?',
        [agent.computer_id],
      );
      const logout = rows(
        await m.query(
          "SELECT id FROM agent_commands WHERE agent_id=? AND command_type='logout' AND status IN ('pending','delivered') FOR UPDATE",
          [agent.id],
        ),
      );
      if (logout.length) {
        await m.query(
          "UPDATE pc_sessions SET status='offline',logout_time=UTC_TIMESTAMP() WHERE computer_id=? AND status='online'",
          [agent.computer_id],
        );
        for (const command of logout)
          await m.query(
            "UPDATE agent_commands SET status='completed',completed_at=UTC_TIMESTAMP() WHERE id=?",
            [command.id],
          );
      }
    });
    const session =
      rows(
        await this.db.query(
          "SELECT u.id AS userId,u.username,CONCAT(u.first_name,' ',u.last_name) AS displayName,u.role AS userType FROM pc_sessions ps JOIN users u ON u.id=ps.user_id WHERE ps.computer_id=? AND ps.status='online' LIMIT 1",
          [agent.computer_id],
        ),
      )[0] ?? null;
    return {
      ok: true,
      seatStatus: session ? 'in_use' : 'available',
      session,
      programBlacklist: (await this.rules('block')).map((r) => r.processName),
      programAllowlist: (await this.rules('allow')).map((r) => r.processName),
    };
  }
  async startLogin(
    agent: TrackingAgentIdentity,
    username: string,
    password: string,
  ) {
    const user = await this.auth.validateUser({
      identifier: username,
      password,
    });
    return this.issueChallenge(agent, user.id);
  }
  async resend(agent: TrackingAgentIdentity, user: number) {
    const exists = rows(
      await this.db.query(
        'SELECT id FROM agent_login_challenges WHERE agent_id=? AND user_id=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP()',
        [agent.id, user],
      ),
    )[0];
    if (!exists) throw new UnauthorizedException('กรุณาเข้าสู่ระบบใหม่');
    return this.issueChallenge(agent, user);
  }
  private async issueChallenge(agent: TrackingAgentIdentity, user: number) {
    if (!(await this.entry.checkAccess(user, agent.room_id)).allowed)
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าใช้ห้องในเวลานี้');
    const count = rows(
      await this.db.query(
        'SELECT COUNT(*) AS total FROM agent_login_challenges WHERE agent_id=? AND created_at>UTC_TIMESTAMP()-INTERVAL 10 MINUTE',
        [agent.id],
      ),
    )[0];
    if (Number(count?.total) > 5)
      throw new ForbiddenException('ขอ OTP ถี่เกินไป กรุณารอ 10 นาที');
    const person = rows(
      await this.db.query(
        'SELECT email FROM users WHERE id=? AND is_active=1',
        [user],
      ),
    )[0];
    if (!person) throw new UnauthorizedException();
    const code = randomInt(100000, 1000000).toString();
    const secret = this.config.getOrThrow<string>('ENTRY_OTP_SECRET');
    await this.db.query(
      'UPDATE agent_login_challenges SET used_at=UTC_TIMESTAMP() WHERE agent_id=? AND user_id=? AND used_at IS NULL',
      [agent.id, user],
    );
    const result = await this.db.query(
      'INSERT INTO agent_login_challenges (agent_id,user_id,code_hash,expires_at) VALUES (?,?,?,UTC_TIMESTAMP()+INTERVAL 10 MINUTE)',
      [agent.id, user, digest(`${secret}:${agent.id}:${user}:${code}`)],
    );
    const hook = this.config.get<string>('ENTRY_OTP_WEBHOOK_URL');
    try {
      if (this.mail?.configured()) {
        await this.mail.sendOtp(
          String(person.email),
          code,
          'เข้าใช้เครื่องแล็บ',
        );
      } else if (hook) {
        const key = this.config.get<string>('ENTRY_OTP_WEBHOOK_KEY');
        const response = await fetch(hook, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          body: JSON.stringify({
            email: person.email,
            code,
            expiresInMinutes: 10,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('delivery failed');
      } else throw new Error('delivery not configured');
    } catch {
      await this.db.query(
        'UPDATE agent_login_challenges SET used_at=UTC_TIMESTAMP() WHERE id=?',
        [result.insertId],
      );
      throw new ServiceUnavailableException('ส่ง OTP ไม่สำเร็จ');
    }
    const email = String(person.email);
    const at = email.indexOf('@');
    return {
      requiresOtp: true,
      userId: user,
      maskedEmail: `${email.slice(0, 2)}***${email.slice(at)}`,
      deliveryMode: 'smtp',
    };
  }
  async verifyLogin(agent: TrackingAgentIdentity, user: number, code: string) {
    const secret = this.config.getOrThrow<string>('ENTRY_OTP_SECRET');
    // Persist failed attempts even when verification is denied.
    const valid = await this.db.transaction(async (m) => {
      const challenge = rows(
        await m.query(
          'SELECT * FROM agent_login_challenges WHERE agent_id=? AND user_id=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP() ORDER BY id DESC LIMIT 1 FOR UPDATE',
          [agent.id, user],
        ),
      )[0];
      if (!challenge || Number(challenge.attempts) >= 5) return false;
      await m.query(
        'UPDATE agent_login_challenges SET attempts=attempts+1 WHERE id=?',
        [challenge.id],
      );
      if (
        !timingSafeEqual(
          Buffer.from(String(challenge.code_hash), 'hex'),
          Buffer.from(digest(`${secret}:${agent.id}:${user}:${code}`), 'hex'),
        )
      )
        return false;
      await m.query(
        'UPDATE agent_login_challenges SET used_at=UTC_TIMESTAMP() WHERE id=?',
        [challenge.id],
      );
      return true;
    });
    if (!valid)
      throw new UnauthorizedException('OTP ไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว');
    if (!(await this.entry.checkAccess(user, agent.room_id)).allowed)
      throw new ForbiddenException('สิทธิ์เข้าใช้ห้องหมดอายุ');
    await this.db.transaction(async (m) => {
      const person = rows(
        await m.query(
          'SELECT id FROM users WHERE id=? AND is_active=1 FOR UPDATE',
          [user],
        ),
      )[0];
      if (!person) throw new ForbiddenException('บัญชีถูกปิด');
      const pc = rows(
        await m.query(
          "SELECT lc.id FROM lab_computers lc JOIN rooms r ON r.id=lc.room_id WHERE lc.id=? AND lc.status<>'maintenance' AND r.status='active' FOR UPDATE",
          [agent.computer_id],
        ),
      )[0];
      if (!pc) throw new ForbiddenException('เครื่องหรือห้องปิดใช้งาน');
      const active = rows(
        await m.query(
          "SELECT user_id,computer_id FROM pc_sessions WHERE (computer_id=? OR user_id=?) AND status='online' FOR UPDATE",
          [agent.computer_id, user],
        ),
      );
      if (
        active.some(
          (r) =>
            Number(r.user_id) !== user ||
            Number(r.computer_id) !== agent.computer_id,
        )
      )
        throw new ConflictException('เครื่องหรือผู้ใช้อยู่ระหว่างใช้งาน');
      if (!active.length)
        await m.query(
          "INSERT INTO pc_sessions (computer_id,user_id,status,login_time) VALUES (?,?,'online',UTC_TIMESTAMP())",
          [agent.computer_id, user],
        );
    });
    const person = rows(
      await this.db.query(
        "SELECT id,username,CONCAT(first_name,' ',last_name) AS displayName,role AS userType FROM users WHERE id=?",
        [user],
      ),
    )[0];
    return { ok: true, user: person };
  }
  async logout(agent: TrackingAgentIdentity) {
    await this.db.query(
      "UPDATE pc_sessions SET status='offline',logout_time=UTC_TIMESTAMP() WHERE computer_id=? AND status='online'",
      [agent.computer_id],
    );
    return { ok: true };
  }
  async logs(agent: TrackingAgentIdentity, events: DesktopEventDto[]) {
    if (events.length > 100)
      throw new BadRequestException('ส่งได้ไม่เกิน 100 events');
    const block = new Set(
      (await this.rules('block')).map((r) => String(r.processName)),
    );
    const result = await this.agentService.ingestEvents(
      agent,
      events.map((event) => {
        const data =
          event.data && typeof event.data === 'object' ? event.data : {};
        const domain =
          typeof data.website === 'string'
            ? data.website
            : typeof data.domain === 'string'
              ? data.domain
              : undefined;
        const name = String(
          data.program ?? data.processName ?? data.activity ?? event.eventType,
        ).slice(0, 255);
        const type = domain
          ? 'website'
          : event.eventType.includes('program')
            ? 'program'
            : event.eventType.includes('logout')
              ? 'logout'
              : event.eventType.includes('login')
                ? 'login'
                : 'suspicious';
        return {
          event_id: digest(
            `${agent.id}:${event.at}:${event.eventType}:${JSON.stringify(data)}`,
          ).slice(0, 32),
          event_type: type,
          occurred_at: event.at,
          name,
          domain,
          metadata: {
            ...data,
            desktopEventType: event.eventType,
            programBlocked: block.has(name.toLowerCase()),
          },
        };
      }),
    );
    await this.db.query(
      `UPDATE tracking_events te JOIN program_rules pr ON pr.process_name=LOWER(te.name) AND pr.rule_type='block'
     SET te.risk_level='high',te.was_blocked=1 WHERE te.agent_id=? AND te.event_type='program' AND te.occurred_at>=UTC_TIMESTAMP()-INTERVAL 1 DAY`,
      [agent.id],
    );
    return result;
  }
}
