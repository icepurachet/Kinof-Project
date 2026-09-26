import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AdminAuthService, AdminLoginResult } from './admin-auth.service';
import { LoginDto } from './dto/login.dto';
import {
  AdminAuthenticatedRequest,
  AdminJwtAuthGuard,
} from './admin-jwt-auth.guard';

@Controller('auth/admin')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  // HTTP login is owned by LoginOtpController.
  login(@Body() loginDto: LoginDto): Promise<AdminLoginResult> {
    return this.adminAuthService.login(loginDto);
  }

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  me(@Req() request: AdminAuthenticatedRequest) {
    return this.adminAuthService.me(request.admin.sub);
  }
}
