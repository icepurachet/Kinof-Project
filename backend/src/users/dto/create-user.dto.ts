import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  NotContains,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(100)
  email: string;

  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @NotContains('@', { message: 'ชื่อผู้ใช้ห้ามมี @' })
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  first_name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  last_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsIn(['student', 'external'])
  role: 'student' | 'external';
}
