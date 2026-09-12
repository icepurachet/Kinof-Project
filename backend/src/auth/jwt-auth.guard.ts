import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AccessTokenPayload, AuthService } from './auth.service';

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('กรุณาส่ง Bearer token');
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('กรุณาส่ง Bearer token');
    }

    request.user = this.authService.verifyAccessToken(token);
    if (request.user.role !== 'student' && request.user.role !== 'external') {
      throw new UnauthorizedException('โทเคนนี้ไม่ใช่โทเคนผู้ใช้');
    }
    return true;
  }
}
