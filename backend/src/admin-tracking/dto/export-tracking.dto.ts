import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class ExportTrackingDto {
  @IsEnum(['session', 'program', 'website', 'flagged'])
  report: 'session' | 'program' | 'website' | 'flagged';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  room_id?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
