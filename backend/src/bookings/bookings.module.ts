import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { LabModule } from '../lab-features/lab.module';

@Module({
  imports: [AuthModule, LabModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
