import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AdminAuthenticatedRequest,
  AdminJwtAuthGuard,
} from '../auth/admin-jwt-auth.guard';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AgentAuthenticatedRequest,
  AgentAuthGuard,
} from '../agent/agent-auth.guard';
import { DataSource } from 'typeorm';
import { LabService, rows } from './lab.service';
import {
  AgentLoginDto,
  AgentResendDto,
  AgentVerifyDto,
  CategoryImportDto,
  DesktopLogsDto,
  DesktopRegisterDto,
  KioskDeviceDto,
  ProgramRuleDto,
  ReviewActionDto,
} from './lab.dto';
import { DomainCatalogService } from './domain-catalog.service';
const roomId = (value?: string) =>
  value && value !== 'all' && /^\d+$/.test(value) ? Number(value) : undefined;

@Controller('lab/admin')
@UseGuards(AdminJwtAuthGuard)
export class LabAdminController {
  constructor(
    private readonly lab: LabService,
    private readonly catalog: DomainCatalogService,
    private readonly db: DataSource,
  ) {}
  @Get('program-blacklist') blocked() {
    return this.lab.rules('block');
  }
  @Get('program-allowlist') allowed() {
    return this.lab.rules('allow');
  }
  @Post('program-blacklist') addBlock(
    @Req() req: AdminAuthenticatedRequest,
    @Body() dto: ProgramRuleDto,
  ) {
    return this.lab.addRule(req.admin.sub, 'block', dto);
  }
  @Post('program-allowlist') addAllow(
    @Req() req: AdminAuthenticatedRequest,
    @Body() dto: ProgramRuleDto,
  ) {
    return this.lab.addRule(req.admin.sub, 'allow', dto);
  }
  @Delete('program-blacklist/:id') removeBlock(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.lab.removeRule(req.admin.sub, 'block', id);
  }
  @Delete('program-allowlist/:id') removeAllow(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.lab.removeRule(req.admin.sub, 'allow', id);
  }
  @Get('unknown-programs') unknown(
    @Query('roomId') room?: string,
    @Query('date') date?: string,
  ) {
    return this.lab.unknown(roomId(room), date);
  }
  @Get('behavior/reviews') reviews(@Query('roomId') room?: string) {
    return this.lab.reviews(roomId(room));
  }
  @Post('behavior/reviews/:id/clear') clear(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.lab.handleReview(req.admin.sub, id, 'cleared');
  }
  @Post('behavior/reviews/:id/penalize') penalize(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.lab.handleReview(req.admin.sub, id, 'penalized');
  }
  @Post('behavior/block') blockActivity(
    @Req() req: AdminAuthenticatedRequest,
    @Body() dto: ReviewActionDto,
  ) {
    return this.lab.handleActivity(req.admin.sub, dto, 'penalized');
  }
  @Post('behavior/clear') clearActivity(
    @Req() req: AdminAuthenticatedRequest,
    @Body() dto: ReviewActionDto,
  ) {
    return this.lab.handleActivity(req.admin.sub, dto, 'cleared');
  }
  @Get('website-blacklist/categories') categories() {
    return this.catalog.list();
  }
  @Post('website-blacklist/import') import(
    @Req() req: AdminAuthenticatedRequest,
    @Body() dto: CategoryImportDto,
  ) {
    return this.catalog.import(req.admin.sub, dto.category, dto.limit);
  }
  @Delete('website-blacklist/categories/:category') removeCategory(
    @Req() req: AdminAuthenticatedRequest,
    @Param('category') category: string,
  ) {
    return this.catalog.remove(req.admin.sub, category);
  }
  @Get('kiosk-devices') kiosks(@Query('roomId') room?: string) {
    return this.lab.kioskDevices(roomId(room));
  }
  @Post('kiosk-devices') createKiosk(
    @Req() req: AdminAuthenticatedRequest,
    @Body() dto: KioskDeviceDto,
  ) {
    return this.lab.createKiosk(req.admin.sub, dto.roomId, dto.label);
  }
  @Post('kiosk-devices/:id/revoke') revoke(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.lab.revokeKiosk(req.admin.sub, id);
  }
  @Get('nav-badges') async badges() {
    const review = await this.lab.reviews();
    const issue = rows(
      await this.db.query(
        "SELECT COUNT(*) AS total FROM issues WHERE status='pending'",
      ),
    )[0];
    return {
      invite: 0,
      monitor: review.items.length,
      helpcenter: Number(issue?.total ?? 0),
    };
  }
}
@Controller('lab')
@UseGuards(JwtAuthGuard)
export class LabUserController {
  constructor(
    private readonly lab: LabService,
    private readonly db: DataSource,
  ) {}
  @Get('behavior') behavior(@Req() req: AuthenticatedRequest) {
    return this.lab.behavior(req.user.sub);
  }
  @Get('nav-badges') async badges(@Req() req: AuthenticatedRequest) {
    const row = rows(
      await this.db.query(
        "SELECT COUNT(*) AS total FROM booking_members bm JOIN bookings b ON b.id=bm.booking_id WHERE bm.user_id=? AND bm.invite_status='pending' AND b.status='pending' AND b.created_at>NOW()-INTERVAL 5 MINUTE",
        [req.user.sub],
      ),
    )[0];
    return { invite: Number(row?.total ?? 0), monitor: 0, helpcenter: 0 };
  }
}
@Controller('lab/agent')
@UseGuards(AgentAuthGuard)
export class DesktopAgentController {
  constructor(
    private readonly lab: LabService,
    private readonly db: DataSource,
  ) {}
  @Post('register') register(
    @Req() req: AgentAuthenticatedRequest,
    @Body() dto: DesktopRegisterDto,
  ) {
    return this.lab.desktopRegister(req.agent, dto.hostname);
  }
  @Post('heartbeat') heartbeat(
    @Req() req: AgentAuthenticatedRequest,
    @Body() dto: DesktopRegisterDto,
  ) {
    return this.lab.desktopHeartbeat(req.agent, dto.hostname);
  }
  @Post('session/login') login(
    @Req() req: AgentAuthenticatedRequest,
    @Body() dto: AgentLoginDto,
  ) {
    return this.lab.startLogin(req.agent, dto.username, dto.password);
  }
  @Post('session/verify-otp') verify(
    @Req() req: AgentAuthenticatedRequest,
    @Body() dto: AgentVerifyDto,
  ) {
    return this.lab.verifyLogin(req.agent, dto.userId, dto.code);
  }
  @Post('session/resend-otp') resend(
    @Req() req: AgentAuthenticatedRequest,
    @Body() dto: AgentResendDto,
  ) {
    return this.lab.resend(req.agent, dto.userId);
  }
  @Post('session/logout') logout(@Req() req: AgentAuthenticatedRequest) {
    return this.lab.logout(req.agent);
  }
  @Get('program-blacklist') async blocked() {
    return {
      processNames: (await this.lab.rules('block')).map((r) => r.processName),
    };
  }
  @Get('program-allowlist') async allowed() {
    return {
      processNames: (await this.lab.rules('allow')).map((r) => r.processName),
    };
  }
  @Get('website-blacklist') async websites() {
    return {
      domains: rows(
        await this.db.query(
          "SELECT domain_name FROM blocked_domains WHERE is_enabled=1 AND action='block'",
        ),
      ).map((r) => r.domain_name),
    };
  }
  @Post('logs') logs(
    @Req() req: AgentAuthenticatedRequest,
    @Body() dto: DesktopLogsDto,
  ) {
    return this.lab.logs(req.agent, dto.events);
  }
}
