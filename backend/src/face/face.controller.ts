import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FaceImageDto, KioskFaceDto } from './dto/face-image.dto';
import { FaceService } from './face.service';
import { EntryOtpService } from '../entry/entry-otp.service';
import { VerifyEntryOtpDto } from '../entry/dto/verify-entry-otp.dto';
import { LabService } from '../lab-features/lab.service';

@Controller('auth/register/face')
@UseGuards(JwtAuthGuard)
export class FaceEnrollmentController {
  constructor(private readonly faceService: FaceService) {}

  @Post()
  enroll(@Req() request: AuthenticatedRequest, @Body() dto: FaceImageDto) {
    return this.faceService.enroll(request.user.sub, dto.imageBase64);
  }
}

@Controller('kiosk')
export class KioskFaceController {
  constructor(
    private readonly faceService: FaceService,
    private readonly entryOtpService: EntryOtpService,
    private readonly lab: LabService,
  ) {}

  @Get('rooms/:roomId')
  async room(
    @Param('roomId', ParseIntPipe) roomId: number,
    @Headers('x-kiosk-key') key?: string,
  ) {
    await this.lab.verifyKiosk(key, roomId);
    return this.faceService.getKioskRoom(roomId);
  }

  @Post('entry/verify-face')
  async verifyFace(
    @Body() dto: KioskFaceDto,
    @Headers('x-kiosk-key') key?: string,
  ) {
    await this.lab.verifyKiosk(key, dto.roomId);
    return this.faceService.verifyAtKiosk(dto.roomId, dto.imageBase64);
  }

  @Post('entry/verify-otp')
  async verifyOtp(
    @Body() dto: VerifyEntryOtpDto,
    @Headers('x-kiosk-key') key?: string,
  ) {
    await this.lab.verifyKiosk(key, dto.roomId);
    return this.entryOtpService.verify(dto.roomId, dto.code);
  }
}
