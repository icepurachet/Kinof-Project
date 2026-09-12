import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CheckEntryAccessDto } from './dto/check-entry-access.dto';
import { EntryAccessResult, EntryService } from './entry.service';
import { VerifyTotpDto } from './dto/verify-totp.dto';
import { TotpService, TotpSetupResult } from './totp.service';
import { RequestEntryOtpDto } from './dto/request-entry-otp.dto';
import { EntryOtpService, EntryOtpStatus } from './entry-otp.service';

@Controller('entry')
@UseGuards(JwtAuthGuard)
export class EntryController {
  constructor(
    private readonly entryService: EntryService,
    private readonly totpService: TotpService,
    private readonly entryOtpService: EntryOtpService,
  ) {}

  @Get('access')
  checkAccess(
    @Req() request: AuthenticatedRequest,
    @Query() query: CheckEntryAccessDto,
  ): Promise<EntryAccessResult> {
    return this.entryService.checkAccess(request.user.sub, query.room_id);
  }

  @Post('otp/request')
  requestEntryOtp(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RequestEntryOtpDto,
  ): Promise<EntryOtpStatus> {
    return this.entryOtpService.request(request.user.sub, dto.roomId);
  }

  @Post('otp/resend')
  resendEntryOtp(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RequestEntryOtpDto,
  ): Promise<EntryOtpStatus> {
    return this.entryOtpService.request(request.user.sub, dto.roomId);
  }

  @Get('otp/active')
  activeEntryOtp(
    @Req() request: AuthenticatedRequest,
  ): Promise<EntryOtpStatus> {
    return this.entryOtpService.active(request.user.sub);
  }

  @Post('totp/setup')
  setupTotp(@Req() request: AuthenticatedRequest): Promise<TotpSetupResult> {
    return this.totpService.setup(request.user.sub);
  }

  @Post('totp/verify')
  verifyTotp(
    @Req() request: AuthenticatedRequest,
    @Body() dto: VerifyTotpDto,
  ): Promise<{ allowed: true; method: 'totp'; room_id: number }> {
    return this.totpService.verifyEntry(
      request.user.sub,
      dto.room_id,
      dto.code,
    );
  }
}
