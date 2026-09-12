import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateIssueDto {
  @IsOptional()
  @IsEnum(['pending', 'in_progress', 'completed'])
  status?: 'pending' | 'in_progress' | 'completed';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  admin_reply?: string;
}
