import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EntryModule } from '../entry/entry.module';
import {
  FaceEnrollmentController,
  KioskFaceController,
} from './face.controller';
import { FaceService } from './face.service';
import { LabModule } from '../lab-features/lab.module';

@Module({
  imports: [AuthModule, EntryModule, LabModule],
  controllers: [FaceEnrollmentController, KioskFaceController],
  providers: [FaceService],
})
export class FaceModule {}
