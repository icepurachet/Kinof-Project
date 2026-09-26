import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService, type LoginResult } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // HTTP login is owned by LoginOtpController; password alone must not issue tokens.
  login(@Body() loginDto: LoginDto): Promise<LoginResult> {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto): Promise<LoginResult> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.getUserProfile(request.user.sub);
  }
}
