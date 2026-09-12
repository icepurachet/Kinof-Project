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
import { AgentAuthenticatedRequest, AgentAuthGuard } from './agent-auth.guard';
import { AgentService } from './agent.service';
import { AgentCommandResultDto } from './dto/agent-command-result.dto';
import { AgentEventsDto } from './dto/agent-events.dto';
import { AgentHeartbeatDto } from './dto/agent-heartbeat.dto';

@Controller('agent')
@UseGuards(AgentAuthGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('register')
  register(
    @Req() request: AgentAuthenticatedRequest,
    @Body() dto: AgentHeartbeatDto,
  ): Promise<Record<string, unknown>> {
    return this.agentService.register(request.agent, dto);
  }

  @Post('heartbeat')
  heartbeat(
    @Req() request: AgentAuthenticatedRequest,
    @Body() dto: AgentHeartbeatDto,
  ) {
    return this.agentService.heartbeat(request.agent, dto);
  }

  @Post('events')
  ingestEvents(
    @Req() request: AgentAuthenticatedRequest,
    @Body() dto: AgentEventsDto,
  ) {
    return this.agentService.ingestEvents(request.agent, dto.events);
  }

  @Post('commands/:commandId/result')
  completeCommand(
    @Req() request: AgentAuthenticatedRequest,
    @Param('commandId', ParseIntPipe) commandId: number,
    @Body() dto: AgentCommandResultDto,
  ): Promise<{ message: string }> {
    return this.agentService.completeCommand(request.agent.id, commandId, dto);
  }

  @Get('blocklist')
  getBlocklist() {
    return this.agentService.getBlocklist();
  }
}
