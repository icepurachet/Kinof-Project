import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EntryModule } from '../entry/entry.module';
import {
  FaceEnrollmentController,
  KioskFaceController,
} from './face.controller';
import { FaceService } from './face.service';

@Module({
  imports: [AuthModule, EntryModule],
  controllers: [FaceEnrollmentController, KioskFaceController],
  providers: [FaceService],
})
export class FaceModule {}
