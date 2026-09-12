import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { DataSource } from 'typeorm';
import { EntryService } from './entry.service';

export interface TotpSetupResult {
  secret: string;
  otp_auth_url: string;
}

@Injectable()
export class TotpService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly entryService: EntryService,
  ) {}

  async setup(userId: number): Promise<TotpSetupResult> {
    const rows = this.readRows(
      (await this.dataSource.query(
        'SELECT email FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
        [userId],
      )) as unknown,
    );
    const user = rows[0];
    if (!user) {
      throw new NotFoundException('ไม่พบผู้ใช้');
    }

    const secret = this.base32Encode(randomBytes(20));
    await this.dataSource.query(
      'UPDATE users SET totp_secret = ? WHERE id = ?',
      [secret, userId],
    );
    const label = encodeURIComponent(`KINOF:${String(user.email)}`);
    return {
      secret,
      otp_auth_url: `otpauth://totp/${label}?secret=${secret}&issuer=KINOF&digits=6&period=30`,
    };
  }

  async verifyEntry(
    userId: number,
    roomId: number,
    code: string,
  ): Promise<{ allowed: true; method: 'totp'; room_id: number }> {
    const access = await this.entryService.checkAccess(userId, roomId);
    if (!access.allowed) {
      throw new ForbiddenException(access.reason);
    }

    const rows = this.readRows(
      (await this.dataSource.query(
        `
          SELECT totp_secret
          FROM users
          WHERE id = ? AND is_active = 1
          LIMIT 1
        `,
        [userId],
      )) as unknown,
    );
    const secret = rows[0]?.totp_secret;
    if (typeof secret !== 'string' || !secret) {
      throw new ConflictException('ผู้ใช้ยังไม่ได้ตั้งค่า OTP');
    }
    if (!this.verifyCode(secret, code)) {
      throw new UnauthorizedException('รหัส OTP ไม่ถูกต้องหรือหมดอายุ');
    }

    return { allowed: true, method: 'totp', room_id: roomId };
  }

  verifyCode(secret: string, code: string, timestamp = Date.now()): boolean {
    return [-1, 0, 1].some((offset) => {
      const expected = this.generateCode(secret, timestamp + offset * 30_000);
      const expectedBuffer = Buffer.from(expected);
      const codeBuffer = Buffer.from(code);
      return (
        expectedBuffer.length === codeBuffer.length &&
        timingSafeEqual(expectedBuffer, codeBuffer)
      );
    });
  }

  private generateCode(secret: string, timestamp: number): string {
    const counter = Math.floor(timestamp / 30_000);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', this.base32Decode(secret))
      .update(counterBuffer)
      .digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
    return value.toString().padStart(6, '0');
  }

  private base32Encode(value: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let accumulator = 0;
    let output = '';
    for (const byte of value) {
      accumulator = (accumulator << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(accumulator >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) {
      output += alphabet[(accumulator << (5 - bits)) & 31];
    }
    return output;
  }

  private base32Decode(value: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let accumulator = 0;
    const bytes: number[] = [];
    for (const character of value.toUpperCase().replace(/=+$/, '')) {
      const index = alphabet.indexOf(character);
      if (index < 0) {
        throw new UnauthorizedException('ข้อมูล OTP ไม่ถูกต้อง');
      }
      accumulator = (accumulator << 5) | index;
      bits += 5;
      if (bits >= 8) {
        bytes.push((accumulator >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(bytes);
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
