import { hash } from 'bcrypt';
import { DataSource } from 'typeorm';
import { SuperAdminService } from './super-admin.service';

jest.mock('bcrypt', () => ({ hash: jest.fn() }));
jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));

describe('SuperAdminService', () => {
  it('hash รหัสผ่านก่อนสร้างบัญชีผู้ดูแล', async () => {
    (hash as unknown as jest.Mock).mockResolvedValue('hashed-password');
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ insertId: 8 })
        .mockResolvedValueOnce({ insertId: 30 }),
    };
    const service = new SuperAdminService(dataSource as unknown as DataSource);

    await expect(
      service.createAdmin(1, {
        email: 'new-admin@example.com',
        password: 'TestPass123!',
        first_name: 'New',
        last_name: 'Admin',
        role: 'admin',
      }),
    ).resolves.toEqual({
      id: 8,
      email: 'new-admin@example.com',
      role: 'admin',
    });
    expect(hash).toHaveBeenCalledWith('TestPass123!', 12);
  });
});
