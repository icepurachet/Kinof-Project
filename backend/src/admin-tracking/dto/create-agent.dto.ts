import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateAgentDto {
  @IsInt()
  @Min(1)
  computer_id: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  hostname?: string;
}
