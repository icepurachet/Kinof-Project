import { Body, Controller, Post } from '@nestjs/common';
import { AdminAccountService } from './admin-account.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
@Controller('auth/admin')
export class AdminAccountController {
  constructor(private readonly accounts: AdminAccountService) {}
  @Post('forgot-password') forgot(@Body() dto: ForgotPasswordDto) {
    return this.accounts.forgot(dto.email);
  }
  @Post('reset-password') reset(@Body() dto: ResetPasswordDto) {
    return this.accounts.reset(dto.token, dto.newPassword);
  }
}
