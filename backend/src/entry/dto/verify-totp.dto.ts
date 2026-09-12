import { Type } from 'class-transformer';
import { IsInt, Matches, Min } from 'class-validator';

export class VerifyTotpDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  room_id: number;

  @Matches(/^\d{6}$/)
  code: string;
}
