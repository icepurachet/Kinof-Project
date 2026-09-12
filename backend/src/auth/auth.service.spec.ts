import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcrypt';
import { createHmac } from 'crypto';
import { DataSource } from 'typeorm';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

jest.mock('../users/users.service', () => ({
  UsersService: class UsersService {},
}));

jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  const jwtSecret = 'unit-test-secret';
  let authService: AuthService;
  let usersService: { findForLogin: jest.Mock };
  let dataSource: { query: jest.Mock; createQueryRunner: jest.Mock };

  beforeEach(() => {
    usersService = {
      findForLogin: jest.fn(),
    };
    const configService = {
      getOrThrow: jest.fn().mockReturnValue(jwtSecret),
      get: jest.fn((name: string) =>
        name === 'NODE_ENV' ? 'development' : undefined,
      ),
    };
    dataSource = {
      query: jest.fn().mockResolvedValue({ insertId: 1 }),
      createQueryRunner: jest.fn(),
    };

    authService = new AuthService(
      usersService as unknown as UsersService,
      configService as unknown as ConfigService,
      dataSource as unknown as DataSource,
    );
  });

  it('ออก access token หลังตรวจข้อมูลเข้าสู่ระบบสำเร็จ', async () => {
    const loginDto: LoginDto = {
      identifier: 'student01',
      password: 'TestPass123!',
    };
    usersService.findForLogin.mockResolvedValue({
      id: 1,
      username: 'student01',
      password_hash: 'stored-password-hash',
      role: 'student',
      face_embedding: null,
      is_active: true,
    });
    const compareMock = compare as unknown as jest.Mock;
    compareMock.mockResolvedValue(true);

    const result = await authService.login(loginDto);
    const [encodedHeader, encodedPayload, signature] =
      result.access_token.split('.');
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as {
      sub: number;
      username: string;
      role: string;
      iat: number;
      exp: number;
    };
    const expectedSignature = createHmac('sha256', jwtSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    expect(signature).toBe(expectedSignature);
    expect(payload).toMatchObject({
      sub: 1,
      username: 'student01',
      role: 'student',
    });
    expect(payload.exp - payload.iat).toBe(60 * 60);
    expect(result.refresh_token).toHaveLength(64);
    expect(result.user).toEqual({
      id: 1,
      username: 'student01',
      role: 'student',
      face_enrolled: false,
    });
    expect(authService.verifyAccessToken(result.access_token)).toMatchObject({
      sub: 1,
      username: 'student01',
      role: 'student',
    });
  });

  it('หมุน refresh token และยกเลิกตัวเก่าใน transaction', async () => {
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 8,
            user_id: 1,
            username: 'student01',
            role: 'student',
            face_embedding: null,
            is_active: 1,
          },
        ])
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ insertId: 9 }),
    };
    dataSource.createQueryRunner.mockReturnValue(queryRunner);

    const result = await authService.refresh('a'.repeat(64));
    expect(result.access_token).toBeTruthy();
    expect(result.refresh_token).toHaveLength(64);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('ตั้งรหัสใหม่และยกเลิก refresh token เดิม', async () => {
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 4, user_id: 1 }])
        .mockResolvedValue({ affectedRows: 1 }),
    };
    dataSource.createQueryRunner.mockReturnValue(queryRunner);
    (hash as unknown as jest.Mock).mockResolvedValue('new-password-hash');

    await expect(
      authService.resetPassword('b'.repeat(64), 'NewPassword123!'),
    ).resolves.toEqual({
      message: 'ตั้งรหัสผ่านใหม่สำเร็จ กรุณาเข้าสู่ระบบอีกครั้ง',
    });
    expect(queryRunner.query).toHaveBeenCalledTimes(4);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('เพิกถอน refresh token เมื่อ logout', async () => {
    dataSource.query.mockResolvedValue({ affectedRows: 1 });

    await expect(authService.logout('raw-refresh-token')).resolves.toEqual({
      message: 'ออกจากระบบสำเร็จ',
    });
    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      expect.stringMatching(/^[a-f0-9]{64}$/),
    ]);
  });
});
