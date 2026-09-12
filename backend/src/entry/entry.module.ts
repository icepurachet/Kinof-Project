import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EntryController } from './entry.controller';
import { EntryService } from './entry.service';
import { TotpService } from './totp.service';
import { EntryOtpService } from './entry-otp.service';

@Module({
  imports: [AuthModule],
  controllers: [EntryController],
  providers: [EntryService, TotpService, EntryOtpService],
  exports: [EntryService, EntryOtpService],
})
export class EntryModule {}
