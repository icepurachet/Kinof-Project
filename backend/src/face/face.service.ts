import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EntryService } from '../entry/entry.service';

interface FaceCandidate {
  id: number;
  username: string;
  embedding: number[];
}

export interface KioskFaceResult {
  granted: boolean;
  identified: boolean;
  suggestOtp: boolean;
  message: string;
  user?: { id: number; username: string; displayName?: string };
  access?: unknown;
}

@Injectable()
export class FaceService {
  private readonly attempts = new Map<number, number[]>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly entryService: EntryService,
  ) {}

  async enroll(userId: number, imageBase64: string) {
    const embedding = await this.createEmbedding(imageBase64);
    const updateResult = (await this.dataSource.query(
      `UPDATE users SET face_embedding = ?, is_verified = 1
       WHERE id = ? AND is_active = 1`,
      [JSON.stringify(embedding), userId],
    )) as unknown;
    if (this.readAffectedRows(updateResult) === 0) {
      throw new BadRequestException('ไม่พบผู้ใช้ที่เปิดใช้งาน');
    }
    const rows = this.readRows(
      (await this.dataSource.query(
        `SELECT id, username, email, first_name, last_name, role
         FROM users WHERE id = ? LIMIT 1`,
        [userId],
      )) as unknown,
    );
    return {
      message: 'บันทึกใบหน้าสำเร็จ',
      user: { ...rows[0], faceEnrolled: true, face_enrolled: true },
    };
  }

  async verifyAtKiosk(
    roomId: number,
    imageBase64: string,
  ): Promise<KioskFaceResult> {
    this.checkRateLimit(roomId);
    const embedding = await this.createEmbedding(imageBase64);
    const candidates = await this.loadCandidates();
    const ranked = candidates
      .map((candidate) => ({
        candidate,
        score: this.cosineSimilarity(embedding, candidate.embedding),
      }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const second = ranked[1];
    const threshold = Number(this.config.get('FACE_MATCH_THRESHOLD') ?? 0.55);
    const margin = Number(this.config.get('FACE_MATCH_MARGIN') ?? 0.04);

    if (
      !best ||
      best.score < threshold ||
      (second && best.score - second.score < margin)
    ) {
      return {
        granted: false,
        identified: false,
        suggestOtp: true,
        message: 'ไม่สามารถยืนยันใบหน้าได้ กรุณาสแกนใหม่หรือใช้ OTP',
      };
    }

    const access = await this.entryService.authorizeDoor(
      best.candidate.id,
      roomId,
    );
    await this.logVerification(
      best.candidate.id,
      roomId,
      access.allowed ? 'success' : 'failed',
      best.score,
      access.allowed ? null : 'access_denied',
    );
    if (!access.allowed) {
      return {
        granted: false,
        identified: true,
        suggestOtp: false,
        message: access.reason,
        user: { id: best.candidate.id, username: best.candidate.username },
        access,
      };
    }
    return {
      ...access,
      granted: true,
      identified: true,
      suggestOtp: false,
      message: 'ยืนยันตัวตนและสิทธิ์เข้าห้องสำเร็จ',
      user: {
        id: best.candidate.id,
        username: best.candidate.username,
        displayName: access.user?.displayName ?? best.candidate.username,
      },
      access,
    };
  }

  async getKioskRoom(roomId: number) {
    const rows = this.readRows(
      (await this.dataSource.query(
        'SELECT id, room_name, capacity, status FROM rooms WHERE id = ? LIMIT 1',
        [roomId],
      )) as unknown,
    );
    const room = rows[0];
    if (!room) {
      throw new BadRequestException('ไม่พบห้อง');
    }
    return {
      id: Number(room.id),
      name: String(room.room_name),
      roomName: String(room.room_name),
      capacity: Number(room.capacity),
      status: room.status,
      isOpen: room.status === 'active',
    };
  }

  private async createEmbedding(imageBase64: string): Promise<number[]> {
    const { bytes, contentType } = this.decodeImage(imageBase64);
    const form = new FormData();
    form.append('image', new Blob([bytes], { type: contentType }), 'face.jpg');
    const headers = new Headers();
    const apiKey = this.config.get<string>('FACE_SERVICE_API_KEY');
    if (apiKey) headers.set('X-Face-Service-Key', apiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(
        `${this.config.get('FACE_SERVICE_URL') ?? 'http://127.0.0.1:8001'}/api/v1/embeddings`,
        { method: 'POST', body: form, headers, signal: controller.signal },
      );
      const result = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!response.ok) {
        const detail = typeof result.detail === 'string' ? result.detail : null;
        if (response.status >= 400 && response.status < 500) {
          throw new BadRequestException(detail ?? 'ภาพใบหน้าไม่ผ่านการตรวจสอบ');
        }
        throw new BadGatewayException('Face Service ประมวลผลไม่สำเร็จ');
      }
      if (!this.isEmbedding(result.embedding)) {
        throw new BadGatewayException('Face Service ส่ง embedding ไม่ถูกต้อง');
      }
      return result.embedding;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'ไม่สามารถเชื่อมต่อ Face Service ได้',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private decodeImage(value: string): {
    bytes: ArrayBuffer;
    contentType: string;
  } {
    const match = value.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!match) {
      throw new BadRequestException(
        'imageBase64 ต้องเป็นภาพ JPEG, PNG หรือ WebP แบบ data URL',
      );
    }
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('ภาพต้องมีขนาดไม่เกิน 5 MB');
    }
    return { bytes: Uint8Array.from(buffer).buffer, contentType: match[1] };
  }

  private async loadCandidates(): Promise<FaceCandidate[]> {
    const rows = this.readRows(
      (await this.dataSource.query(
        `SELECT id, username, face_embedding FROM users
         WHERE is_active = 1 AND face_embedding IS NOT NULL`,
      )) as unknown,
    );
    return rows.flatMap((row) => {
      try {
        const embedding = JSON.parse(String(row.face_embedding)) as unknown;
        return this.isEmbedding(embedding)
          ? [{ id: Number(row.id), username: String(row.username), embedding }]
          : [];
      } catch {
        return [];
      }
    });
  }

  private cosineSimilarity(left: number[], right: number[]): number {
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index++) {
      dot += left[index] * right[index];
      leftNorm += left[index] ** 2;
      rightNorm += right[index] ** 2;
    }
    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
  }

  private isEmbedding(value: unknown): value is number[] {
    return (
      Array.isArray(value) &&
      value.length === 512 &&
      value.every((item) => typeof item === 'number' && Number.isFinite(item))
    );
  }

  private checkRateLimit(roomId: number): void {
    const now = Date.now();
    const recent = (this.attempts.get(roomId) ?? []).filter(
      (time) => time > now - 15 * 60_000,
    );
    if (recent.length >= 10) {
      throw new HttpException(
        'สแกนถี่เกินไป กรุณารอแล้วลองใหม่',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.attempts.set(roomId, recent);
  }

  private async logVerification(
    userId: number,
    roomId: number,
    result: 'success' | 'failed',
    score: number,
    reason: string | null,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO entry_verifications
       (user_id, room_id, method, result, similarity_score, reason)
       VALUES (?, ?, 'face', ?, ?, ?)`,
      [userId, roomId, result, score, reason],
    );
  }

  private readAffectedRows(result: unknown): number {
    return typeof result === 'object' && result !== null
      ? Number((result as Record<string, unknown>).affectedRows ?? 0)
      : 0;
  }

  private readRows(result: unknown): Array<Record<string, unknown>> {
    return Array.isArray(result)
      ? result.filter(
          (row): row is Record<string, unknown> =>
            typeof row === 'object' && row !== null,
        )
      : [];
  }
}
