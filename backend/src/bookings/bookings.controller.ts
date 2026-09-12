import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  BookingsService,
  BookingInvitation,
  ConfirmedGroupBookingResult,
  GroupBookingResult,
  InvitationResponseResult,
  SoloBookingResult,
  UserBookingSummary,
} from './bookings.service';
import { ConfirmBookingRoomDto } from './dto/confirm-booking-room.dto';
import { CreateGroupBookingDto } from './dto/create-group-booking.dto';
import { RespondInvitationDto } from './dto/respond-invitation.dto';
import { CreateSoloBookingDto } from './dto/create-solo-booking.dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post('solo')
  createSoloBooking(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateSoloBookingDto,
  ): Promise<SoloBookingResult> {
    return this.bookingsService.createSoloBooking(request.user.sub, dto);
  }

  @Get()
  findUserBookings(
    @Req() request: AuthenticatedRequest,
  ): Promise<UserBookingSummary[]> {
    return this.bookingsService.findUserBookings(request.user.sub);
  }

  @Post('group')
  createGroupBooking(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateGroupBookingDto,
  ): Promise<GroupBookingResult> {
    return this.bookingsService.createGroupBooking(request.user.sub, dto);
  }

  @Get('invitations')
  findPendingInvitations(
    @Req() request: AuthenticatedRequest,
  ): Promise<BookingInvitation[]> {
    return this.bookingsService.findPendingInvitations(request.user.sub);
  }

  @Patch('invitations/:invitationId/respond')
  respondToInvitation(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId', ParseIntPipe) invitationId: number,
    @Body() dto: RespondInvitationDto,
  ): Promise<InvitationResponseResult> {
    return this.bookingsService.respondToInvitation(
      request.user.sub,
      invitationId,
      dto,
    );
  }

  @Patch(':bookingId/confirm-room')
  confirmGroupBookingRoom(
    @Req() request: AuthenticatedRequest,
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: ConfirmBookingRoomDto,
  ): Promise<ConfirmedGroupBookingResult> {
    return this.bookingsService.confirmGroupBookingRoom(
      request.user.sub,
      bookingId,
      dto,
    );
  }

  @Get(':bookingId')
  findUserBookingDetail(
    @Req() request: AuthenticatedRequest,
    @Param('bookingId', ParseIntPipe) bookingId: number,
  ) {
    return this.bookingsService.findUserBookingDetail(
      request.user.sub,
      bookingId,
    );
  }

  @Patch(':bookingId/cancel')
  cancelBooking(
    @Req() request: AuthenticatedRequest,
    @Param('bookingId', ParseIntPipe) bookingId: number,
  ): Promise<{ message: string }> {
    return this.bookingsService.cancelBooking(request.user.sub, bookingId);
  }
}
