import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class TrackingActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  room_id?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsIn([
    'session',
    'login',
    'logout',
    'program',
    'website',
    'suspicious',
    'flagged',
  ])
  type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
