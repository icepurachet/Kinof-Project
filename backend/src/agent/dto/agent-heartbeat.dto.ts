import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AgentHeartbeatDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  hostname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  agent_version?: string;
}
