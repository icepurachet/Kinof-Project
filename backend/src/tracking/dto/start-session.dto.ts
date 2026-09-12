import { IsInt, Min } from 'class-validator';

export class StartSessionDto {
  @IsInt()
  @Min(1)
  computer_id: number;
}
