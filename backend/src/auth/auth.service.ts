import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcrypt';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { DataSource } from 'typeorm';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { MailService } from '../mail/mail.service';

export interface AuthenticatedUser {
  id: number;
  username: string;
  role: UserRole;
  face_enrolled: boolean;
}

export type UserRole = 'student' | 'external';
export type AdminRole = 'admin' | 'super_admin';
export type AccessRole = UserRole | AdminRole;

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  user: AuthenticatedUser;
}

export interface AccessTokenPayload {
  sub: number;
  username: string;
  role: AccessRole;
  iat: number;
  exp: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @Optional() private readonly mail?: MailService,
  ) {}

  async validateUser(loginDto: LoginDto): Promise<AuthenticatedUser> {
    const user = await this.usersService.findForLogin(loginDto.identifier);

    if (!user || !user.password_hash || !user.is_active) {
      throw new UnauthorizedException(
        'อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง',
      );
    }

    const passwordMatches = await compare(
      loginDto.password,
      user.password_hash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง',
      );
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      face_enrolled: Boolean(user.face_embedding),
    };
  }

  async login(loginDto: LoginDto): Promise<LoginResult> {
    const user = await this.validateUser(loginDto);
    return this.issueLoginResult(user);
  }

  async refresh(rawToken: string): Promise<LoginResult> {
    const tokenHash = this.hashOpaqueToken(rawToken);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const rows = this.readRows(
        (await queryRunner.query(
          `
            SELECT rt.id, u.id AS user_id, u.username, u.role,
                   u.face_embedding, u.is_active
            FROM user_refresh_tokens AS rt
            INNER JOIN users AS u ON u.id = rt.user_id
            WHERE rt.token_hash = ? AND rt.revoked_at IS NULL
              AND rt.expires_at > UTC_TIMESTAMP()
            LIMIT 1 FOR UPDATE
          `,
          [tokenHash],
        )) as unknown,
      );
      const row = rows[0];
      if (!row || Number(row.is_active) !== 1) {
        throw new UnauthorizedException('Refresh token ไม่ถูกต้องหรือหมดอายุ');
      }
      await queryRunner.query(
        'UPDATE user_refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE id = ?',
        [Number(row.id)],
      );
      const user: AuthenticatedUser = {
        id: Number(row.user_id),
        username: String(row.username),
        role: row.role as UserRole,
        face_enrolled: Boolean(row.face_embedding),
      };
      const result = await this.issueLoginResult(user, queryRunner);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async logout(rawToken: string): Promise<{ message: string }> {
    await this.dataSource.query(
      `UPDATE user_refresh_tokens SET revoked_at = UTC_TIMESTAMP()
       WHERE token_hash = ? AND revoked_at IS NULL`,
      [this.hashOpaqueToken(rawToken)],
    );
    return { message: 'ออกจากระบบสำเร็จ' };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const genericMessage =
      'หากอีเมลนี้อยู่ในระบบ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้';
    const users = this.readRows(
      (await this.dataSource.query(
        'SELECT id, email FROM users WHERE email = ? AND is_active = 1 LIMIT 1',
        [email],
      )) as unknown,
    );
    const user = users[0];
    if (!user) return { message: genericMessage };

    const counts = this.readRows(
      (await this.dataSource.query(
        `SELECT COUNT(*) AS request_count FROM password_reset_tokens
         WHERE user_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 HOUR`,
        [Number(user.id)],
      )) as unknown,
    );
    if (Number(counts[0]?.request_count ?? 0) >= 3) {
      throw new HttpException(
        'ขอลิงก์ตั้งรหัสผ่านถี่เกินไป กรุณารอหนึ่งชั่วโมง',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashOpaqueToken(rawToken);
    await this.dataSource.query(
      `UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP()
       WHERE user_id = ? AND used_at IS NULL`,
      [Number(user.id)],
    );
    const insertResult = (await this.dataSource.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL 30 MINUTE)`,
      [Number(user.id), tokenHash],
    )) as unknown;
    const resetId = this.readInsertId(insertResult);
    const frontendUrl = (
      this.configService.get<string>('FRONTEND_PUBLIC_URL') ??
      this.configService.get<string>('FRONTEND_ORIGIN') ??
      'http://localhost:5173'
    ).split(',')[0];
    const resetUrl = `${frontendUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;
    try {
      await this.deliverPasswordReset(String(user.email), resetUrl);
    } catch (error) {
      await this.dataSource.query(
        'UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?',
        [resetId],
      );
      throw error;
    }
    return { message: genericMessage };
  }

  async resetPassword(
    rawToken: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const tokenHash = this.hashOpaqueToken(rawToken);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const rows = this.readRows(
        (await queryRunner.query(
          `SELECT id, user_id FROM password_reset_tokens
           WHERE token_hash = ? AND used_at IS NULL
             AND expires_at > UTC_TIMESTAMP()
           LIMIT 1 FOR UPDATE`,
          [tokenHash],
        )) as unknown,
      );
      const row = rows[0];
      if (!row) {
        throw new BadRequestException(
          'ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง ถูกใช้แล้ว หรือหมดอายุ',
        );
      }
      const passwordHash = await hash(newPassword, 12);
      await queryRunner.query(
        'UPDATE users SET password_hash = ? WHERE id = ? AND is_active = 1',
        [passwordHash, Number(row.user_id)],
      );
      await queryRunner.query(
        'UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?',
        [Number(row.id)],
      );
      await queryRunner.query(
        `UPDATE user_refresh_tokens SET revoked_at = UTC_TIMESTAMP()
         WHERE user_id = ? AND revoked_at IS NULL`,
        [Number(row.user_id)],
      );
      await queryRunner.commitTransaction();
      return { message: 'ตั้งรหัสผ่านใหม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getUserProfile(userId: number) {
    const [user, faceEnrolled] = await Promise.all([
      this.usersService.findOne(userId),
      this.usersService.hasFaceEnrollment(userId),
    ]);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      studentId: user.student_id,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      userType: user.role,
      faceEnrolled,
    };
  }

  issueAccessToken(actor: {
    id: number;
    username: string;
    role: AccessRole;
  }): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + 60 * 60;
    const header = this.encodeJwtPart({ alg: 'HS256', typ: 'JWT' });
    const payload = this.encodeJwtPart({
      sub: actor.id,
      username: actor.username,
      role: actor.role,
      iat: issuedAt,
      exp: expiresAt,
    });
    const unsignedToken = `${header}.${payload}`;
    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    const signature = createHmac('sha256', secret)
      .update(unsignedToken)
      .digest('base64url');

    return `${unsignedToken}.${signature}`;
  }

  async issueLoginResult(
    user: AuthenticatedUser,
    executor: Pick<DataSource, 'query'> = this.dataSource,
  ): Promise<LoginResult> {
    const rawRefreshToken = randomBytes(48).toString('base64url');
    await executor.query(
      `INSERT INTO user_refresh_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL 7 DAY)`,
      [user.id, this.hashOpaqueToken(rawRefreshToken)],
    );
    return {
      access_token: this.issueAccessToken(user),
      refresh_token: rawRefreshToken,
      user,
    };
  }

  private hashOpaqueToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async deliverPasswordReset(
    email: string,
    resetUrl: string,
  ): Promise<void> {
    if (this.mail?.configured()) {
      await this.mail.send(
        email,
        'KINOF: ตั้งรหัสผ่านใหม่',
        `เปิดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (30 นาที ครั้งเดียว):\n${resetUrl}\nหากไม่ได้ขอ กรุณาไม่เปิดลิงก์`,
      );
      return;
    }
    const webhookUrl = this.configService.get<string>(
      'PASSWORD_RESET_WEBHOOK_URL',
    );
    if (!webhookUrl) {
      throw new ServiceUnavailableException(
        'ยังไม่ได้ตั้งค่าระบบส่งอีเมลตั้งรหัสผ่าน',
      );
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const webhookKey = this.configService.get<string>(
      'PASSWORD_RESET_WEBHOOK_KEY',
    );
    if (webhookKey) headers.Authorization = `Bearer ${webhookKey}`;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, resetUrl, expiresInMinutes: 30 }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'ระบบส่งอีเมลตั้งรหัสผ่านไม่พร้อมใช้งาน',
      );
    }
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('invalid token parts');
      }

      const [encodedHeader, encodedPayload, encodedSignature] = parts;
      const unsignedToken = `${encodedHeader}.${encodedPayload}`;
      const secret = this.configService.getOrThrow<string>('JWT_SECRET');
      const expectedSignature = createHmac('sha256', secret)
        .update(unsignedToken)
        .digest();
      const receivedSignature = Buffer.from(encodedSignature, 'base64url');

      if (
        expectedSignature.length !== receivedSignature.length ||
        !timingSafeEqual(expectedSignature, receivedSignature)
      ) {
        throw new Error('invalid token signature');
      }

      const header = this.decodeJwtPart(encodedHeader);
      const payload = this.decodeJwtPart(encodedPayload);
      if (!this.isJwtHeader(header) || !this.isAccessTokenPayload(payload)) {
        throw new Error('invalid token payload');
      }

      if (payload.exp <= Math.floor(Date.now() / 1000)) {
        throw new Error('expired token');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('โทเคนไม่ถูกต้องหรือหมดอายุ');
    }
  }

  private encodeJwtPart(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private decodeJwtPart(value: string): unknown {
    return JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as unknown;
  }

  private isJwtHeader(value: unknown): value is { alg: 'HS256'; typ: 'JWT' } {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const header = value as Record<string, unknown>;
    return header.alg === 'HS256' && header.typ === 'JWT';
  }

  private isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const payload = value as Record<string, unknown>;
    return (
      typeof payload.sub === 'number' &&
      typeof payload.username === 'string' &&
      (payload.role === 'student' ||
        payload.role === 'external' ||
        payload.role === 'admin' ||
        payload.role === 'super_admin') &&
      typeof payload.iat === 'number' &&
      typeof payload.exp === 'number'
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
      throw new TypeError('ฐานข้อมูลไม่ส่ง token id ที่ถูกต้องกลับมา');
    }
    return id;
  }
}
