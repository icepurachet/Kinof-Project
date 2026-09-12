import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateUsageLogDto } from './dto/create-usage-log.dto';
import { StartSessionDto } from './dto/start-session.dto';
import {
  TrackingService,
  TrackingSessionResult,
  UsageLogResult,
} from './tracking.service';

@Controller('tracking')
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post('sessions')
  startSession(
    @Req() request: AuthenticatedRequest,
    @Body() dto: StartSessionDto,
  ): Promise<{ session_id: number; status: 'online' }> {
    return this.trackingService.startSession(request.user.sub, dto.computer_id);
  }

  @Patch('sessions/:sessionId/end')
  endSession(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ): Promise<{ session_id: number; status: 'offline' }> {
    return this.trackingService.endSession(request.user.sub, sessionId);
  }

  @Post('usage-logs')
  createUsageLog(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateUsageLogDto,
  ): Promise<UsageLogResult> {
    return this.trackingService.createUsageLog(request.user.sub, dto);
  }

  @Get('sessions')
  findUserSessions(
    @Req() request: AuthenticatedRequest,
  ): Promise<TrackingSessionResult[]> {
    return this.trackingService.findUserSessions(request.user.sub);
  }

  @Get('sessions/:sessionId/logs')
  findSessionLogs(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ): Promise<UsageLogResult[]> {
    return this.trackingService.findSessionLogs(request.user.sub, sessionId);
  }
}
