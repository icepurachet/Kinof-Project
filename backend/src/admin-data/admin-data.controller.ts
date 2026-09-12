import {
  BadRequestException,
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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import {
  AdminAuthenticatedRequest,
  AdminJwtAuthGuard,
} from '../auth/admin-jwt-auth.guard';
import { AdminDataService } from './admin-data.service';
import {
  AddEnrollmentDto,
  CreateComputerDto,
  CreateRoomDto,
  CreateSubjectDto,
  CreateTermDto,
  UpdateComputerDto,
  UpdateRoomDto,
  UpdateSubjectDto,
  UpdateTermDto,
  UpdateUserActiveDto,
} from './dto/admin-data.dto';
import { ScheduleImportService } from './schedule-import.service';

interface UploadedCsvFile {
  originalname: string;
  buffer: Buffer;
}

@Controller('admin/data')
@UseGuards(AdminJwtAuthGuard)
export class AdminDataController {
  constructor(
    private readonly service: AdminDataService,
    private readonly scheduleImport: ScheduleImportService,
  ) {}

  @Get('schedules/template')
  scheduleTemplate(@Res() response: Response): void {
    response
      .type('text/csv; charset=utf-8')
      .attachment('kinof-schedule-template.csv')
      .send(this.scheduleImport.template());
  }

  @Post('schedules/import/preview')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  previewScheduleImport(@UploadedFile() file?: UploadedCsvFile) {
    this.assertCsv(file);
    return this.scheduleImport.preview(file.buffer);
  }

  @Post('schedules/import/confirm')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  confirmScheduleImport(
    @Req() req: AdminAuthenticatedRequest,
    @UploadedFile() file?: UploadedCsvFile,
  ) {
    this.assertCsv(file);
    return this.scheduleImport.confirm(req.admin.sub, file.buffer);
  }

  @Get('rooms') findRooms() {
    return this.service.findRooms();
  }
  @Post('rooms') createRoom(
    @Req() req: AdminAuthenticatedRequest,
    @Body() dto: CreateRoomDto,
  ) {
    return this.service.createRoom(req.admin.sub, dto);
  }
  @Patch('rooms/:id') updateRoom(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.service.updateRoom(req.admin.sub, id, dto);
  }
  @Delete('rooms/:id') deleteRoom(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deleteRoom(req.admin.sub, id);
  }

  @Get('computers') findComputers(@Query('room_id') roomId?: string) {
    if (roomId === undefined) {
      return this.service.findComputers();
    }
    const parsedRoomId = Number(roomId);
    if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
      throw new BadRequestException('room_id ต้องเป็นจำนวนเต็มบวก');
    }
    return this.service.findComputers(parsedRoomId);
  }
  @Post('computers') createComputer(
    @Req() req: AdminAuthenticatedRequest,
    @Body() dto: CreateComputerDto,
  ) {
    return this.service.createComputer(req.admin.sub, dto);
  }
  @Patch('computers/:id') updateComputer(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateComputerDto,
  ) {
    return this.service.updateComputer(req.admin.sub, id, dto);
  }
  @Delete('computers/:id') deleteComputer(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deleteComputer(req.admin.sub, id);
  }

  @Get('terms') findTerms() {
    return this.service.findTerms();
  }
  @Post('terms') createTerm(
    @Req() req: AdminAuthenticatedRequest,
    @Body() dto: CreateTermDto,
  ) {
    return this.service.createTerm(req.admin.sub, dto);
  }
  @Patch('terms/:id') updateTerm(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTermDto,
  ) {
    return this.service.updateTerm(req.admin.sub, id, dto);
  }

  @Get('subjects') findSubjects() {
    return this.service.findSubjects();
  }
  @Get('subjects/:id') findSubject(@Param('id', ParseIntPipe) id: number) {
    return this.service.findSubject(id);
  }
  @Post('subjects') createSubject(
    @Req() req: AdminAuthenticatedRequest,
    @Body() dto: CreateSubjectDto,
  ) {
    return this.service.createSubject(req.admin.sub, dto);
  }
  @Patch('subjects/:id') updateSubject(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.service.updateSubject(req.admin.sub, id, dto);
  }
  @Delete('subjects/:id') deleteSubject(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deleteSubject(req.admin.sub, id);
  }

  @Post('subjects/:id/enrollments') addEnrollment(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddEnrollmentDto,
  ) {
    return this.service.addEnrollment(req.admin.sub, id, dto);
  }
  @Delete('subjects/:id/enrollments/:userId') removeEnrollment(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.service.removeEnrollment(req.admin.sub, id, userId);
  }

  @Patch('users/:id/status') updateUserActive(
    @Req() req: AdminAuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserActiveDto,
  ) {
    return this.service.updateUserActive(req.admin.sub, id, dto.is_active);
  }

  private assertCsv(file?: UploadedCsvFile): asserts file is UploadedCsvFile {
    if (!file) throw new BadRequestException('กรุณาแนบไฟล์ CSV');
    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('รองรับเฉพาะไฟล์ .csv');
    }
  }
}
