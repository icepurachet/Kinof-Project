import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

jest.mock('./auth.service', () => ({
  AuthService: class AuthService {},
}));

describe('JwtAuthGuard', () => {
  it('ตรวจ Bearer token และแนบผู้ใช้ไว้กับ request', () => {
    const payload = {
      id: 1,
      sub: 1,
      username: 'student01',
      role: 'student' as const,
      iat: 1,
      exp: 2,
    };
    const authService = {
      verifyAccessToken: jest.fn().mockReturnValue(payload),
    };
    const request = {
      headers: { authorization: 'Bearer valid-token' },
    } as { headers: { authorization: string }; user?: typeof payload };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const guard = new JwtAuthGuard(authService as unknown as AuthService);

    expect(guard.canActivate(context)).toBe(true);
    expect(authService.verifyAccessToken).toHaveBeenCalledWith('valid-token');
    expect(request.user).toEqual(payload);
  });

  it('ปฏิเสธ request ที่ไม่มี Bearer token', () => {
    const authService = { verifyAccessToken: jest.fn() };
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;
    const guard = new JwtAuthGuard(authService as unknown as AuthService);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });
});
