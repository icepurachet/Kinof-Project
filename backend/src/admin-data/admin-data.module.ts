import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminDataController } from './admin-data.controller';
import { AdminDataService } from './admin-data.service';
import { ScheduleImportService } from './schedule-import.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminDataController],
  providers: [AdminDataService, ScheduleImportService],
})
export class AdminDataModule {}
