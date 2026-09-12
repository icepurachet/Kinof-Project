import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @MaxLength(50)
  room_name: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity: number;

  @IsOptional()
  @IsEnum(['active', 'closed', 'maintenance'])
  status?: 'active' | 'closed' | 'maintenance';
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  room_name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsEnum(['active', 'closed', 'maintenance'])
  status?: 'active' | 'closed' | 'maintenance';
}

export class CreateComputerDto {
  @IsString()
  @MaxLength(10)
  machine_no: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  room_id: number;

  @IsOptional()
  @IsString()
  @MaxLength(45)
  ip_address?: string;

  @IsOptional()
  @Matches(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i)
  mac_address?: string;

  @IsOptional()
  @IsEnum(['online', 'offline', 'maintenance'])
  status?: 'online' | 'offline' | 'maintenance';
}

export class UpdateComputerDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  machine_no?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  room_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(45)
  ip_address?: string;

  @IsOptional()
  @Matches(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i)
  mac_address?: string;

  @IsOptional()
  @IsEnum(['online', 'offline', 'maintenance'])
  status?: 'online' | 'offline' | 'maintenance';
}

export class CreateTermDto {
  @IsString()
  @MaxLength(50)
  term_name: string;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @IsOptional()
  @IsEnum(['active', 'completed'])
  status?: 'active' | 'completed';
}

export class UpdateTermDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  term_name?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsEnum(['active', 'completed'])
  status?: 'active' | 'completed';
}

export class CreateSubjectDto {
  @IsString()
  @MaxLength(20)
  subject_code: string;

  @IsString()
  @MaxLength(100)
  subject_name: string;

  @IsString()
  @MaxLength(20)
  section: string;

  @IsEnum(['LAB', 'LECT'])
  class_type: 'LAB' | 'LECT';

  @IsString()
  @MaxLength(100)
  instructor_name: string;

  @IsEnum([
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ])
  day_of_week: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  start_time: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  end_time: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  term_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  room_id: number;
}

export class UpdateSubjectDto {
  @IsOptional() @IsString() @MaxLength(20) subject_code?: string;
  @IsOptional() @IsString() @MaxLength(100) subject_name?: string;
  @IsOptional() @IsString() @MaxLength(20) section?: string;
  @IsOptional() @IsEnum(['LAB', 'LECT']) class_type?: 'LAB' | 'LECT';
  @IsOptional() @IsString() @MaxLength(100) instructor_name?: string;
  @IsOptional()
  @IsEnum([
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ])
  day_of_week?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) start_time?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) end_time?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) term_id?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) room_id?: number;
}

export class AddEnrollmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  user_id: number;
}

export class UpdateUserActiveDto {
  @IsBoolean()
  is_active: boolean;
}
