import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { CreateSoloBookingDto } from './dto/create-solo-booking.dto';
import { LabService } from '../lab-features/lab.service';
jest.mock('../lab-features/lab.service', () => ({
  LabService: class LabService {},
}));

jest.mock('./bookings.service', () => ({
  BookingsService: class BookingsService {},
}));

jest.mock('../auth/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {},
}));

describe('BookingsController', () => {
  it('ใช้ user id จาก token เป็นเจ้าของการจอง', async () => {
    const bookingsService = {
      createSoloBooking: jest.fn().mockResolvedValue({ booking_id: 10 }),
      createGroupBooking: jest.fn().mockResolvedValue({ booking_id: 11 }),
      findPendingInvitations: jest.fn(),
      respondToInvitation: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: bookingsService },
        {
          provide: LabService,
          useValue: {
            requireScore: jest.fn().mockResolvedValue(undefined),
            requireGroupScore: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();
    const controller = module.get<BookingsController>(BookingsController);
    const request = {
      user: {
        sub: 7,
        username: 'student07',
        role: 'student',
        iat: 1,
        exp: 2,
      },
    } as AuthenticatedRequest;
    const dto: CreateSoloBookingDto = {
      booking_date: '2026-09-12',
      time_slot: '09:00-11:30',
      room_id: 3,
    };

    await controller.createSoloBooking(request, dto);

    expect(bookingsService.createSoloBooking).toHaveBeenCalledWith(7, dto);
  });

  it('ใช้ user id จาก token เป็นเจ้าของการจองกลุ่ม', async () => {
    const bookingsService = {
      createSoloBooking: jest.fn(),
      createGroupBooking: jest.fn().mockResolvedValue({ booking_id: 11 }),
      findPendingInvitations: jest.fn(),
      respondToInvitation: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: bookingsService },
        {
          provide: LabService,
          useValue: {
            requireScore: jest.fn().mockResolvedValue(undefined),
            requireGroupScore: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();
    const controller = module.get<BookingsController>(BookingsController);
    const request = {
      user: {
        sub: 7,
        username: 'student07',
        role: 'student',
        iat: 1,
        exp: 2,
      },
    } as AuthenticatedRequest;
    const dto = {
      booking_date: '2026-09-12',
      time_slot: '09:00-11:30' as const,
      member_ids: [8, 9],
    };

    await controller.createGroupBooking(request, dto);

    expect(bookingsService.createGroupBooking).toHaveBeenCalledWith(7, dto);
  });

  it('อ่านคำเชิญของผู้ใช้จาก id ใน token', async () => {
    const invitations = [{ invitation_id: 5, booking_id: 11 }];
    const bookingsService = {
      createSoloBooking: jest.fn(),
      createGroupBooking: jest.fn(),
      findPendingInvitations: jest.fn().mockResolvedValue(invitations),
      respondToInvitation: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: bookingsService },
        {
          provide: LabService,
          useValue: {
            requireScore: jest.fn().mockResolvedValue(undefined),
            requireGroupScore: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();
    const controller = module.get<BookingsController>(BookingsController);
    const request = {
      user: {
        sub: 7,
        username: 'student07',
        role: 'student',
        iat: 1,
        exp: 2,
      },
    } as AuthenticatedRequest;

    await expect(controller.findPendingInvitations(request)).resolves.toEqual(
      invitations,
    );
    expect(bookingsService.findPendingInvitations).toHaveBeenCalledWith(7);
  });

  it('ใช้ user id จาก token ตอบคำเชิญของตัวเอง', async () => {
    const bookingsService = {
      createSoloBooking: jest.fn(),
      createGroupBooking: jest.fn(),
      findPendingInvitations: jest.fn(),
      respondToInvitation: jest.fn().mockResolvedValue({
        invitation_id: 5,
        invite_status: 'accepted',
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: bookingsService },
        {
          provide: LabService,
          useValue: {
            requireScore: jest.fn().mockResolvedValue(undefined),
            requireGroupScore: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();
    const controller = module.get<BookingsController>(BookingsController);
    const request = {
      user: {
        sub: 8,
        username: 'student08',
        role: 'student',
        iat: 1,
        exp: 2,
      },
    } as AuthenticatedRequest;
    const dto = { response: 'accepted' as const };

    await controller.respondToInvitation(request, 5, dto);

    expect(bookingsService.respondToInvitation).toHaveBeenCalledWith(8, 5, dto);
  });

  it('ให้เฉพาะ host จาก token เลือกห้องของกลุ่ม', async () => {
    const bookingsService = {
      confirmGroupBookingRoom: jest.fn().mockResolvedValue({ booking_id: 11 }),
      findUserBookingDetail: jest.fn().mockResolvedValue({
        is_host: true,
        members: [{ user_id: 8 }, { user_id: 9 }],
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: bookingsService },
        {
          provide: LabService,
          useValue: {
            requireScore: jest.fn().mockResolvedValue(undefined),
            requireGroupScore: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();
    const controller = module.get<BookingsController>(BookingsController);
    const request = {
      user: {
        sub: 7,
        username: 'student07',
        role: 'student',
        iat: 1,
        exp: 2,
      },
    } as AuthenticatedRequest;
    const dto = { room_id: 3 };

    await controller.confirmGroupBookingRoom(request, 11, dto);

    expect(bookingsService.confirmGroupBookingRoom).toHaveBeenCalledWith(
      7,
      11,
      dto,
    );
    expect(module.get(LabService).requireGroupScore).toHaveBeenCalledWith([
      7, 8, 9,
    ]);
  });

  it('blocks confirmation when a persisted member score falls below 50', async () => {
    const bookings = {
      findUserBookingDetail: jest
        .fn()
        .mockResolvedValue({ is_host: true, members: [{ user_id: 8 }] }),
      confirmGroupBookingRoom: jest.fn(),
    };
    const lab = {
      requireGroupScore: jest
        .fn()
        .mockRejectedValue(new Error('คะแนนต่ำกว่า 50')),
    };
    const controller = new BookingsController(
      bookings as unknown as BookingsService,
      lab as unknown as LabService,
    );
    await expect(
      controller.confirmGroupBookingRoom(
        { user: { sub: 7 } } as AuthenticatedRequest,
        11,
        { room_id: 3 },
      ),
    ).rejects.toThrow('คะแนนต่ำกว่า 50');
    expect(lab.requireGroupScore).toHaveBeenCalledWith([7, 8]);
    expect(bookings.confirmGroupBookingRoom).not.toHaveBeenCalled();
  });

  it('blocks group creation if any invitee fails the score check', async () => {
    const bookings = { createGroupBooking: jest.fn() };
    const lab = {
      requireGroupScore: jest
        .fn()
        .mockRejectedValue(new Error('คะแนนต่ำกว่า 50')),
    };
    const controller = new BookingsController(
      bookings as unknown as BookingsService,
      lab as unknown as LabService,
    );
    await expect(
      controller.createGroupBooking(
        { user: { sub: 7 } } as AuthenticatedRequest,
        {
          booking_date: '2026-09-20',
          time_slot: '09:00-11:30',
          member_ids: [8],
        },
      ),
    ).rejects.toThrow();
    expect(bookings.createGroupBooking).not.toHaveBeenCalled();
  });
});
