import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class CreatePenaltyDto {
  @IsInt()
  @Min(1)
  user_id: number;

  @IsInt()
  @Min(1)
  points: number;

  @IsString()
  @MaxLength(255)
  reason: string;
}
