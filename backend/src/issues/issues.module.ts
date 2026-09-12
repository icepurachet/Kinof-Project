import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IssueFilesController, IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { IssueFilesService } from './issue-files.service';

@Module({
  imports: [AuthModule],
  controllers: [IssuesController, IssueFilesController],
  providers: [IssuesService, IssueFilesService],
})
export class IssuesModule {}
