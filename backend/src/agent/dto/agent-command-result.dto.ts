import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class AgentCommandResultDto {
  @IsEnum(['completed', 'failed'])
  status: 'completed' | 'failed';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
