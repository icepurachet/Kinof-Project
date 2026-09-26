import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Min,
} from 'class-validator';

export class BookingEligibilityDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  member_ids!: number[];
}
