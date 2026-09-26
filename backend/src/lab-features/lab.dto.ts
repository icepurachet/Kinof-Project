import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  IsArray,
  ValidateNested,
  IsISO8601,
  IsObject,
  ArrayMaxSize,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
export class ProgramRuleDto {
  @IsString() @MaxLength(255) processName!: string;
  @IsOptional() @IsString() @MaxLength(255) displayName?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class KioskDeviceDto {
  @Type(() => Number) @IsInt() @Min(1) roomId!: number;
  @IsString() @MaxLength(100) label!: string;
}
export class ReviewActionDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) userId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) seatId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) roomId?: number;
  @IsOptional() @IsString() @MaxLength(255) website?: string;
  @IsOptional() @IsString() @MaxLength(255) program?: string;
  @IsOptional() @IsString() @MaxLength(500) activity?: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() roomName?: string;
  @IsOptional() @IsString() seatLabel?: string;
  @IsOptional() @IsString() eventType?: string;
}
export class CategoryImportDto {
  @IsString() @MaxLength(100) category!: string;
  @IsOptional() @IsInt() @Min(1) @Max(400) limit?: number;
}
export class AgentLoginDto {
  @IsString() @MaxLength(100) username!: string;
  @IsString() @MaxLength(200) password!: string;
}
export class AgentVerifyDto {
  @Type(() => Number) @IsInt() @Min(1) userId!: number;
  @IsString() @Matches(/^\d{6}$/) code!: string;
}
export class AgentResendDto {
  @Type(() => Number) @IsInt() @Min(1) userId!: number;
}
export class DesktopRegisterDto {
  @IsOptional() @IsString() @MaxLength(255) hostname?: string;
  @IsOptional() @IsString() @MaxLength(255) apiKey?: string;
}
export class DesktopEventDto {
  @IsString() @MaxLength(50) eventType!: string;
  @IsISO8601() at!: string;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
}
export class DesktopLogsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DesktopEventDto)
  events!: DesktopEventDto[];
}
export class ExportDto {
  @IsIn(['log', 'prog', 'web', 'flag']) report!: string;
  @IsIn(['CSV', 'Excel', 'csv', 'xlsx']) format!: string;
  @IsOptional() @IsString() roomId?: string;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
}
