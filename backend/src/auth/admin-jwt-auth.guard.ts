import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AccessTokenPayload, AuthService } from './auth.service';

export interface AdminAuthenticatedRequest extends Request {
  admin: AccessTokenPayload & { role: 'admin' | 'super_admin' };
}

@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AdminAuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('กรุณาส่ง Bearer token ของผู้ดูแล');
    }

    const payload = this.authService.verifyAccessToken(
      authorization.slice('Bearer '.length).trim(),
    );
    if (payload.role !== 'admin' && payload.role !== 'super_admin') {
      throw new ForbiddenException('ไม่มีสิทธิ์ผู้ดูแลระบบ');
    }

    request.admin = payload as AdminAuthenticatedRequest['admin'];
    return true;
  }
}
