import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AdminAuthenticatedRequest,
  AdminJwtAuthGuard,
} from '../auth/admin-jwt-auth.guard';
import { AdminTrackingService } from './admin-tracking.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { QueueCommandDto } from './dto/queue-command.dto';
import { UpdateRoomOperationDto } from './dto/update-room-operation.dto';
import { ExportTrackingDto } from './dto/export-tracking.dto';
import { TrackingActivityQueryDto } from './dto/tracking-activity-query.dto';
import { BulkRoomActionDto } from './dto/bulk-room-action.dto';

@Controller('admin/tracking')
@UseGuards(AdminJwtAuthGuard)
export class AdminTrackingController {
  constructor(private readonly service: AdminTrackingService) {}

  @Get('summary')
  summary() {
    return this.service.summary();
  }

  @Get('rooms')
  rooms() {
    return this.service.rooms();
  }

  @Get('computers')
  computers(@Query('room_id') roomId?: string) {
    return this.service.computers(roomId ? Number(roomId) : undefined);
  }

  @Get('activity')
  activity(@Query() query: TrackingActivityQueryDto) {
    return this.service.activity(query);
  }

  @Get('computers/:computerId/activity')
  computerActivity(
    @Param('computerId', ParseIntPipe) computerId: number,
    @Query() query: TrackingActivityQueryDto,
  ) {
    return this.service.computerActivity(computerId, query.limit ?? 50);
  }

  @Get('export')
  async export(
    @Query() query: ExportTrackingDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.exportCsv(query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    return result.content;
  }

  @Put('rooms/:roomId/status')
  updateRoomStatus(
    @Req() request: AdminAuthenticatedRequest,
    @Param('roomId', ParseIntPipe) roomId: number,
    @Body() dto: UpdateRoomOperationDto,
  ) {
    return this.service.updateRoomStatus(request.admin.sub, roomId, dto.status);
  }

  @Post('rooms/:roomId/bulk-action')
  bulkRoomAction(
    @Req() request: AdminAuthenticatedRequest,
    @Param('roomId', ParseIntPipe) roomId: number,
    @Body() dto: BulkRoomActionDto,
  ) {
    return this.service.bulkRoomAction(request.admin.sub, roomId, dto.action);
  }

  @Post('computers/:computerId/commands')
  queueCommand(
    @Req() request: AdminAuthenticatedRequest,
    @Param('computerId', ParseIntPipe) computerId: number,
    @Body() dto: QueueCommandDto,
  ) {
    return this.service.queueCommand(request.admin.sub, computerId, dto);
  }

  @Get('agents')
  listAgents() {
    return this.service.listAgents();
  }

  @Post('agents')
  createAgent(
    @Req() request: AdminAuthenticatedRequest,
    @Body() dto: CreateAgentDto,
  ) {
    return this.service.createAgent(request.admin.sub, dto);
  }
}
