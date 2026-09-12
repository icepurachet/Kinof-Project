import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminTrackingController } from './admin-tracking.controller';
import { AdminTrackingService } from './admin-tracking.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminTrackingController],
  providers: [AdminTrackingService],
})
export class AdminTrackingModule {}
