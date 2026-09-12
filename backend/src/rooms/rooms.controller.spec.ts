import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FindAvailableRoomsDto } from './dto/find-available-rooms.dto';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

jest.mock('./rooms.service', () => ({
  RoomsService: class RoomsService {},
}));

jest.mock('../auth/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {},
}));

describe('RoomsController', () => {
  let roomsController: RoomsController;
  let roomsService: { findAvailableRooms: jest.Mock };

  beforeEach(async () => {
    roomsService = {
      findAvailableRooms: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [
        { provide: RoomsService, useValue: roomsService },
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();

    roomsController = module.get<RoomsController>(RoomsController);
  });

  it('ส่งเงื่อนไขค้นหาห้องไปยัง RoomsService', async () => {
    const query: FindAvailableRoomsDto = {
      booking_date: '2026-09-12',
      time_slot: '09:00-11:30',
      required_seats: 3,
    };
    const rooms = [
      {
        room_id: 1,
        room_name: 'Lab 1',
        capacity: 30,
        used_seats: 20,
        available_seats: 10,
        remaining_after_assignment: 7,
      },
    ];
    roomsService.findAvailableRooms.mockResolvedValue(rooms);

    await expect(roomsController.findAvailableRooms(query)).resolves.toEqual(
      rooms,
    );
    expect(roomsService.findAvailableRooms).toHaveBeenCalledWith(query);
  });
});
