import {
  IsEmail,
  IsEnum,
  IsString,
  IsOptional,
  NotContains,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAdminDto {
  @IsEmail()
  @MaxLength(100)
  email: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @NotContains('@')
  username?: string;
  @IsOptional() @IsString() @MaxLength(100) job_title?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;

  @IsString()
  @MaxLength(50)
  first_name: string;

  @IsString()
  @MaxLength(50)
  last_name: string;

  @IsEnum(['admin', 'super_admin'])
  role: 'admin' | 'super_admin';
}
