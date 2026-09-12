import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class FaceImageDto {
  @IsString()
  @MaxLength(7_100_000)
  imageBase64: string;
}

export class KioskFaceDto extends FaceImageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roomId: number;
}
