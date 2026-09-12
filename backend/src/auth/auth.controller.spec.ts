import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

jest.mock('./auth.service', () => ({
  AuthService: class AuthService {},
}));

describe('AuthController', () => {
  let authController: AuthController;
  let authService: { login: jest.Mock };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    authController = module.get<AuthController>(AuthController);
  });

  it('ส่งข้อมูลเข้าสู่ AuthService และคืนค่าผู้ใช้เมื่อเข้าสู่ระบบสำเร็จ', async () => {
    const loginDto: LoginDto = {
      identifier: 'student01',
      password: 'TestPass123!',
    };
    const loginResult = {
      access_token: 'header.payload.signature',
      refresh_token: 'refresh-token',
      user: {
        id: 1,
        username: 'student01',
        role: 'student' as const,
        face_enrolled: false,
      },
    };
    authService.login.mockResolvedValue(loginResult);

    await expect(authController.login(loginDto)).resolves.toEqual(loginResult);
    expect(authService.login).toHaveBeenCalledWith(loginDto);
  });
});
