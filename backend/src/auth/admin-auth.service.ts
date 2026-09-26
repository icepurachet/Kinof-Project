import { Injectable, UnauthorizedException } from '@nestjs/common';
import { compare } from 'bcrypt';
import { DataSource } from 'typeorm';
import { LoginDto } from './dto/login.dto';
import { AdminRole, AuthService } from './auth.service';

export interface AuthenticatedAdmin {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: AdminRole;
}

export interface AdminLoginResult {
  access_token: string;
  admin: AuthenticatedAdmin;
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly authService: AuthService,
  ) {}

  async login(loginDto: LoginDto): Promise<AdminLoginResult> {
    const admin = await this.validateAdmin(loginDto);
    return {
      access_token: this.authService.issueAccessToken({
        id: admin.id,
        username: admin.email,
        role: admin.role,
      }),
      admin,
    };
  }

  async validateAdmin(loginDto: LoginDto): Promise<AuthenticatedAdmin> {
    const rows = this.readRows(
      (await this.dataSource.query(
        `
          SELECT id, email, first_name, last_name, password_hash, role, status, password_setup_required
          FROM admins
          WHERE email = ? OR username = ?
          LIMIT 1
        `,
        [loginDto.identifier, loginDto.identifier],
      )) as unknown,
    );
    const row = rows[0];
    const passwordHash = row?.password_hash;
    if (
      !row ||
      row.status !== 'active' ||
      Number(row.password_setup_required ?? 0) === 1 ||
      typeof passwordHash !== 'string' ||
      !(await compare(loginDto.password, passwordHash))
    ) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }

    const role = row.role as AdminRole;
    if (role !== 'admin' && role !== 'super_admin') {
      throw new UnauthorizedException('บัญชีผู้ดูแลไม่ถูกต้อง');
    }

    const admin: AuthenticatedAdmin = {
      id: Number(row.id),
      email: String(row.email),
      first_name: String(row.first_name),
      last_name: String(row.last_name),
      role,
    };
    return admin;
  }

  async me(adminId: number): Promise<AuthenticatedAdmin> {
    const rows = this.readRows(
      (await this.dataSource.query(
        `SELECT id, email, first_name, last_name, role
         FROM admins WHERE id = ? AND status = 'active' LIMIT 1`,
        [adminId],
      )) as unknown,
    );
    const row = rows[0];
    if (!row || (row.role !== 'admin' && row.role !== 'super_admin')) {
      throw new UnauthorizedException('ไม่พบบัญชีผู้ดูแลที่เปิดใช้งาน');
    }
    return {
      id: Number(row.id),
      email: String(row.email),
      first_name: String(row.first_name),
      last_name: String(row.last_name),
      role: row.role,
    };
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
