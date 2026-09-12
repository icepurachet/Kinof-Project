import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateBlockedDomainDto {
  @IsString()
  @MaxLength(255)
  domain_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  severity?: 'low' | 'medium' | 'high' | 'critical';

  @IsOptional()
  @IsEnum(['monitor', 'warn', 'block'])
  action?: 'monitor' | 'warn' | 'block';

  @IsOptional()
  @IsEnum(['exact', 'suffix'])
  match_type?: 'exact' | 'suffix';
}

export class UpdateBlockedDomainDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  severity?: 'low' | 'medium' | 'high' | 'critical';

  @IsOptional()
  @IsEnum(['monitor', 'warn', 'block'])
  action?: 'monitor' | 'warn' | 'block';

  @IsOptional()
  @IsEnum(['exact', 'suffix'])
  match_type?: 'exact' | 'suffix';

  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;
}
