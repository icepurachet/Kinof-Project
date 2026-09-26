import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EntryModule } from '../entry/entry.module';
import { AgentModule } from '../agent/agent.module';
import { LabService } from './lab.service';
import {
  LabAdminController,
  LabUserController,
  DesktopAgentController,
} from './lab.controller';
import { DomainCatalogService } from './domain-catalog.service';
@Module({
  imports: [AuthModule, EntryModule, AgentModule],
  providers: [LabService, DomainCatalogService],
  controllers: [LabAdminController, LabUserController, DesktopAgentController],
  exports: [LabService],
})
export class LabModule {}
