import { IsEnum } from 'class-validator';

export class UpdateRoomOperationDto {
  @IsEnum(['active', 'closed', 'maintenance'])
  status: 'active' | 'closed' | 'maintenance';
}
