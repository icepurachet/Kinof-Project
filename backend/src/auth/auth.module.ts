import { forwardRef, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';
import { SuperAdminGuard } from './super-admin.guard';
import { LoginOtpService } from './login-otp.service';
import { LoginOtpController } from './login-otp.controller';
import { AdminAccountService } from './admin-account.service';
import { AdminAccountController } from './admin-account.controller';

@Module({
  imports: [forwardRef(() => UsersModule)],
  controllers: [
    AuthController,
    AdminAuthController,
    LoginOtpController,
    AdminAccountController,
  ],
  providers: [
    LoginOtpService,
    AdminAccountService,
    AuthService,
    JwtAuthGuard,
    AdminAuthService,
    AdminJwtAuthGuard,
    SuperAdminGuard,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    AdminJwtAuthGuard,
    SuperAdminGuard,
    AdminAccountService,
  ],
})
export class AuthModule {}
