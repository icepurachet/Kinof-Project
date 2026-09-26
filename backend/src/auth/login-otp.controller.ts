import { Body, Controller, Post } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { LoginDto } from './dto/login.dto';
import { LoginOtpService } from './login-otp.service';

export class LoginChallengeDto {
  @IsString() @MinLength(40) @MaxLength(64) userId!: string;
}
export class VerifyLoginOtpDto extends LoginChallengeDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
}
@Controller('auth')
export class LoginOtpController {
  constructor(private readonly otp: LoginOtpService) {}
  @Post('login') login(@Body() dto: LoginDto) {
    return this.otp.start(dto);
  }
  @Post('admin/login') adminLogin(@Body() dto: LoginDto) {
    return this.otp.start(dto, true);
  }
  @Post('verify-email-otp') verify(@Body() dto: VerifyLoginOtpDto) {
    return this.otp.verify(dto.userId, dto.code);
  }
  @Post('resend-email-otp') resend(@Body() dto: LoginChallengeDto) {
    return this.otp.resend(dto.userId);
  }
}
