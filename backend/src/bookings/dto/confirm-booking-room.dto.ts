import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class ConfirmBookingRoomDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  room_id: number;
}
