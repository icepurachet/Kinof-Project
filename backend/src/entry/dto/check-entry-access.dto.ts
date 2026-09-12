import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class CheckEntryAccessDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  room_id: number;
}
