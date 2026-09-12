import { Type } from 'class-transformer';
import { IsInt, Matches, Min } from 'class-validator';

export class VerifyEntryOtpDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roomId: number;

  @Matches(/^\d{6}$/, { message: 'code ต้องเป็นตัวเลข 6 หลัก' })
  code: string;
}
