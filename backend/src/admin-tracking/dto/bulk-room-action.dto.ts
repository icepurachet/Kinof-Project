import { IsIn } from 'class-validator';

export class BulkRoomActionDto {
  @IsIn(['open', 'close', 'maintenance'])
  action: 'open' | 'close' | 'maintenance';
}
