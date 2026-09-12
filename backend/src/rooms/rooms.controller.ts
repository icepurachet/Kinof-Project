import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FindAvailableRoomsDto } from './dto/find-available-rooms.dto';
import { AvailableRoom, RoomsService } from './rooms.service';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  findActiveRooms() {
    return this.roomsService.findActiveRooms();
  }

  @Get('available')
  findAvailableRooms(
    @Query() query: FindAvailableRoomsDto,
  ): Promise<AvailableRoom[]> {
    return this.roomsService.findAvailableRooms(query);
  }
}
