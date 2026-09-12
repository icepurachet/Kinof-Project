import { Type } from 'class-transformer';
import { IsIn, IsInt, Matches, Min } from 'class-validator';

export const BOOKING_TIME_SLOTS = [
  '09:00-11:30',
  '11:30-14:00',
  '14:00-16:30',
  '16:30-19:00',
] as const;

export type BookingTimeSlot = (typeof BOOKING_TIME_SLOTS)[number];

export class FindAvailableRoomsDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'booking_date ต้องอยู่ในรูปแบบ YYYY-MM-DD',
  })
  booking_date: string;

  @IsIn(BOOKING_TIME_SLOTS)
  time_slot: BookingTimeSlot;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  required_seats: number;
}
