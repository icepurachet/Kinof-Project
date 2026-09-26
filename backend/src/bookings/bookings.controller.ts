import {
  Body,
  Controller,
  ForbiddenException,
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
import { LabService } from '../lab-features/lab.service';
import { BookingEligibilityDto } from './dto/booking-eligibility.dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly lab: LabService,
  ) {}

  @Post('solo')
  async createSoloBooking(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateSoloBookingDto,
  ): Promise<SoloBookingResult> {
    await this.lab.requireScore(request.user.sub);
    return this.bookingsService.createSoloBooking(request.user.sub, dto);
  }

  @Get()
  findUserBookings(
    @Req() request: AuthenticatedRequest,
  ): Promise<UserBookingSummary[]> {
    return this.bookingsService.findUserBookings(request.user.sub);
  }

  @Post('group')
  async createGroupBooking(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateGroupBookingDto,
  ): Promise<GroupBookingResult> {
    await this.lab.requireGroupScore([request.user.sub, ...dto.member_ids]);
    return this.bookingsService.createGroupBooking(request.user.sub, dto);
  }

  @Post('eligibility')
  checkEligibility(
    @Req() request: AuthenticatedRequest,
    @Body() dto: BookingEligibilityDto,
  ) {
    return this.lab.groupEligibility([request.user.sub, ...dto.member_ids]);
  }

  @Get('invitations')
  findPendingInvitations(
    @Req() request: AuthenticatedRequest,
  ): Promise<BookingInvitation[]> {
    return this.bookingsService.findPendingInvitations(request.user.sub);
  }

  @Patch('invitations/:invitationId/respond')
  async respondToInvitation(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId', ParseIntPipe) invitationId: number,
    @Body() dto: RespondInvitationDto,
  ): Promise<InvitationResponseResult> {
    if (dto.response === 'accepted')
      await this.lab.requireScore(request.user.sub);
    return this.bookingsService.respondToInvitation(
      request.user.sub,
      invitationId,
      dto,
    );
  }

  @Patch(':bookingId/confirm-room')
  async confirmGroupBookingRoom(
    @Req() request: AuthenticatedRequest,
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() dto: ConfirmBookingRoomDto,
  ): Promise<ConfirmedGroupBookingResult> {
    const booking = await this.bookingsService.findUserBookingDetail(
      request.user.sub,
      bookingId,
    );
    if (!booking.is_host)
      throw new ForbiddenException('เฉพาะผู้จองหลักเท่านั้นที่ยืนยันได้');
    await this.lab.requireGroupScore([
      request.user.sub,
      ...booking.members.map((m) => Number(m.user_id)),
    ]);
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
