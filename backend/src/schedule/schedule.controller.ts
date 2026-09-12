import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScheduleService, UserScheduleItem } from './schedule.service';

@Controller('schedule')
@UseGuards(JwtAuthGuard)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get('me')
  findUserSchedule(
    @Req() request: AuthenticatedRequest,
  ): Promise<UserScheduleItem[]> {
    return this.scheduleService.findUserSchedule(request.user.sub);
  }
}
