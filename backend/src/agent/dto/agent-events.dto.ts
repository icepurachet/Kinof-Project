import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AgentEventDto {
  @IsUUID()
  event_id: string;

  @IsEnum(['login', 'logout', 'program', 'website', 'suspicious'])
  event_type: 'login' | 'logout' | 'program' | 'website' | 'suspicious';

  @IsOptional()
  @IsInt()
  @Min(1)
  session_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  duration_minutes?: number;

  @IsDateString()
  occurred_at: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AgentEventsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AgentEventDto)
  events: AgentEventDto[];
}
