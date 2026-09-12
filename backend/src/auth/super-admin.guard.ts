import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AdminAuthenticatedRequest } from './admin-jwt-auth.guard';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AdminAuthenticatedRequest>();
    if (request.admin.role !== 'super_admin') {
      throw new ForbiddenException('เฉพาะ Super Admin เท่านั้น');
    }
    return true;
  }
}
