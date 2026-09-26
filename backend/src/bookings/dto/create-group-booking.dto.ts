import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  Matches,
  Min,
} from 'class-validator';
import {
  BOOKING_TIME_SLOTS,
  BookingTimeSlot,
} from '../../rooms/dto/find-available-rooms.dto';

export class CreateGroupBookingDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'booking_date ต้องอยู่ในรูปแบบ YYYY-MM-DD',
  })
  booking_date: string;

  @IsIn(BOOKING_TIME_SLOTS)
  time_slot: BookingTimeSlot;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  member_ids: number[];
}
