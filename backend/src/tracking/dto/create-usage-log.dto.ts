import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateUsageLogDto {
  @IsInt()
  @Min(1)
  session_id: number;

  @IsEnum(['program', 'website'])
  log_type: 'program' | 'website';

  @IsString()
  @MaxLength(255)
  name: string;

  @IsDateString()
  start_time: string;

  @IsOptional()
  @IsDateString()
  end_time?: string;
}
