import {
  Body,
  Controller,
  Get,
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
  ) {}

  @Get('rooms/:roomId')
  room(@Param('roomId', ParseIntPipe) roomId: number) {
    return this.faceService.getKioskRoom(roomId);
  }

  @Post('entry/verify-face')
  verifyFace(@Body() dto: KioskFaceDto) {
    return this.faceService.verifyAtKiosk(dto.roomId, dto.imageBase64);
  }

  @Post('entry/verify-otp')
  verifyOtp(@Body() dto: VerifyEntryOtpDto) {
    return this.entryOtpService.verify(dto.roomId, dto.code);
  }
}
