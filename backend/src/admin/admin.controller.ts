import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AdminAuthenticatedRequest,
  AdminJwtAuthGuard,
} from '../auth/admin-jwt-auth.guard';
import { AdminDashboardResult, AdminService } from './admin.service';
import {
  CreateBlockedDomainDto,
  UpdateBlockedDomainDto,
} from './dto/create-blocked-domain.dto';
import { CreatePenaltyDto } from './dto/create-penalty.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';

@Controller('admin')
@UseGuards(AdminJwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  dashboard(): Promise<AdminDashboardResult> {
    return this.adminService.dashboard();
  }

  @Get('issues')
  findIssues(
    @Query('status') status?: string,
  ): Promise<Array<Record<string, unknown>>> {
    return this.adminService.findIssues(status);
  }

  @Patch('issues/:issueId')
  updateIssue(
    @Req() request: AdminAuthenticatedRequest,
    @Param('issueId', ParseIntPipe) issueId: number,
    @Body() dto: UpdateIssueDto,
  ): Promise<{ message: string }> {
    return this.adminService.updateIssue(request.admin.sub, issueId, dto);
  }

  @Get('blocked-domains')
  findBlockedDomains(): Promise<Array<Record<string, unknown>>> {
    return this.adminService.findBlockedDomains();
  }

  @Post('blocked-domains')
  createBlockedDomain(
    @Req() request: AdminAuthenticatedRequest,
    @Body() dto: CreateBlockedDomainDto,
  ): Promise<{ id: number; domain_name: string }> {
    return this.adminService.createBlockedDomain(request.admin.sub, dto);
  }

  @Patch('blocked-domains/:domainId')
  updateBlockedDomain(
    @Req() request: AdminAuthenticatedRequest,
    @Param('domainId', ParseIntPipe) domainId: number,
    @Body() dto: UpdateBlockedDomainDto,
  ): Promise<{ message: string }> {
    return this.adminService.updateBlockedDomain(
      request.admin.sub,
      domainId,
      dto,
    );
  }

  @Delete('blocked-domains/:domainId')
  removeBlockedDomain(
    @Req() request: AdminAuthenticatedRequest,
    @Param('domainId', ParseIntPipe) domainId: number,
  ): Promise<{ message: string }> {
    return this.adminService.removeBlockedDomain(request.admin.sub, domainId);
  }

  @Post('penalties')
  createPenalty(
    @Req() request: AdminAuthenticatedRequest,
    @Body() dto: CreatePenaltyDto,
  ): Promise<{ penalty_id: number; remaining_score: number }> {
    return this.adminService.createPenalty(request.admin.sub, dto);
  }

  @Get('tracking/suspicious')
  findSuspiciousUsage(): Promise<Array<Record<string, unknown>>> {
    return this.adminService.findSuspiciousUsage();
  }
}
