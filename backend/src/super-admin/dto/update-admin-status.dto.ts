import { IsEnum } from 'class-validator';

export class UpdateAdminStatusDto {
  @IsEnum(['active', 'inactive'])
  status: 'active' | 'inactive';
}
