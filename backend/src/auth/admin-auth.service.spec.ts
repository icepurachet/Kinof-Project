import { compare } from 'bcrypt';
import { DataSource } from 'typeorm';
import { AdminAuthService } from './admin-auth.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({ compare: jest.fn() }));
jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));
jest.mock('../users/users.service', () => ({
  UsersService: class UsersService {},
}));

describe('AdminAuthService', () => {
  it('เข้าสู่ระบบผู้ดูแลและออก token ที่มี role admin', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          id: 2,
          email: 'admin@example.com',
          first_name: 'Admin',
          last_name: 'One',
          password_hash: 'stored-hash',
          role: 'admin',
          status: 'active',
        },
      ]),
    };
    const authService = {
      issueAccessToken: jest.fn().mockReturnValue('admin-token'),
    };
    (compare as unknown as jest.Mock).mockResolvedValue(true);
    const service = new AdminAuthService(
      dataSource as unknown as DataSource,
      authService as unknown as AuthService,
    );

    await expect(
      service.login({ identifier: 'admin@example.com', password: 'pass1234' }),
    ).resolves.toMatchObject({
      access_token: 'admin-token',
      admin: { id: 2, role: 'admin' },
    });
  });
});
