import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  NotContains,
} from 'class-validator';

export class UpdateAdminDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @NotContains('@')
  username?: string;
  @IsOptional() @IsString() @MaxLength(100) job_title?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  last_name?: string;

  @IsOptional()
  @IsEnum(['admin', 'super_admin'])
  role?: 'admin' | 'super_admin';
}
