import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  NotContains,
  ValidateIf,
} from 'class-validator';

export class UpdateUserDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @NotContains('@', { message: 'ชื่อผู้ใช่ห้ามมี @' })
  username?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  first_name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;
}
