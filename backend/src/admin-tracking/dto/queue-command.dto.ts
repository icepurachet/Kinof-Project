import { IsEnum, IsObject, IsOptional } from 'class-validator';

export class QueueCommandDto {
  @IsEnum(['logout', 'lock', 'close_program', 'sync_blocklist'])
  command_type: 'logout' | 'lock' | 'close_program' | 'sync_blocklist';

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
