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
import {
  AdminAuthenticatedRequest,
  AdminJwtAuthGuard,
} from '../auth/admin-jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminStatusDto } from './dto/update-admin-status.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { SuperAdminService } from './super-admin.service';
import { AdminAccountService } from '../auth/admin-account.service';

@Controller('super-admin')
@UseGuards(AdminJwtAuthGuard, SuperAdminGuard)
export class SuperAdminController {
  constructor(
    private readonly superAdminService: SuperAdminService,
    private readonly accounts: AdminAccountService,
  ) {}

  @Post('admins/:adminId/resend-invite')
  resendInvite(
    @Req() request: AdminAuthenticatedRequest,
    @Param('adminId', ParseIntPipe) id: number,
  ) {
    return this.accounts.resendInvite(request.admin.sub, id);
  }

  @Get('admins')
  findAdmins(): Promise<Array<Record<string, unknown>>> {
    return this.superAdminService.findAdmins();
  }

  @Post('admins')
  createAdmin(
    @Req() request: AdminAuthenticatedRequest,
    @Body() dto: CreateAdminDto,
  ): Promise<{ id: number; email: string; role: string }> {
    return this.superAdminService.createAdmin(request.admin.sub, dto);
  }

  @Patch('admins/:adminId')
  updateAdmin(
    @Req() request: AdminAuthenticatedRequest,
    @Param('adminId', ParseIntPipe) adminId: number,
    @Body() dto: UpdateAdminDto,
  ): Promise<{ message: string }> {
    return this.superAdminService.updateAdmin(request.admin.sub, adminId, dto);
  }

  @Patch('admins/:adminId/status')
  updateAdminStatus(
    @Req() request: AdminAuthenticatedRequest,
    @Param('adminId', ParseIntPipe) adminId: number,
    @Body() dto: UpdateAdminStatusDto,
  ): Promise<{ message: string }> {
    return this.superAdminService.updateAdminStatus(
      request.admin.sub,
      adminId,
      dto.status,
    );
  }

  @Get('audit-logs')
  findAuditLogs(): Promise<Array<Record<string, unknown>>> {
    return this.superAdminService.findAuditLogs();
  }
}
