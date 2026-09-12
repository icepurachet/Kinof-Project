import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class RequestEntryOtpDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roomId?: number;
}
