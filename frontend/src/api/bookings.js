import { apiFetch } from "./auth";

export function getRooms() {
  return apiFetch("/rooms");
}

export async function getAvailableRooms(startTime, endTime, requiredSeats = 1) {
  const params = new URLSearchParams({
    booking_date: formatApiDate(startTime),
    time_slot: rangeToTimeSlot(startTime, endTime),
    required_seats: String(requiredSeats),
  });
  const rooms = await apiFetch(`/rooms/available?${params.toString()}`);
  return rooms.map((room) => ({
    id: room.room_id,
    name: room.room_name,
    capacity: room.capacity,
    availableSeats: room.available_seats,
    remainingAfterAssignment: room.remaining_after_assignment,
  }));
}

export function getMyBookings() {
  return apiFetch("/bookings");
}

export async function createBooking({ roomId, startTime, endTime, inviteeUserIds = [] }) {
  const body = {
    booking_date: formatApiDate(startTime),
    time_slot: rangeToTimeSlot(startTime, endTime),
    room_id: Number(roomId),
  };
  const path = inviteeUserIds.length > 0 ? "/bookings/group" : "/bookings/solo";
  if (inviteeUserIds.length > 0) body.member_ids = inviteeUserIds.map(Number);
  const booking = await apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return normalizeBooking(booking);
}

export async function getBookingGroupStatus(bookingId) {
  const booking = await apiFetch(`/bookings/${Number(bookingId)}`);
  const members = (booking.members ?? []).map((member) => ({
    id: Number(member.user_id),
    name: member.username ?? `ผู้ใช้ #${member.user_id}`,
    status: member.invite_status,
    respondedAt: member.responded_at ?? null,
  }));

  const isExpired =
    booking.status === "expired" ||
    (booking.status === "pending" &&
      booking.expires_at &&
      new Date(booking.expires_at).getTime() <= Date.now());

  return {
    id: Number(booking.booking_id),
    status: booking.status,
    expiresAt: booking.expires_at,
    members,
    isExpired,
    canConfirm:
      booking.status === "pending" &&
      !isExpired &&
      members.length > 0 &&
      members.every((member) => member.status === "accepted"),
    hasDeclined: members.some((member) => member.status === "declined"),
  };
}

export async function confirmBooking(bookingId, roomId) {
  const booking = await apiFetch(`/bookings/${Number(bookingId)}/confirm-room`, {
    method: "PATCH",
    body: JSON.stringify({ room_id: Number(roomId) }),
  });
  return normalizeBooking(booking);
}

export function cancelPendingBooking(bookingId) {
  return apiFetch(`/bookings/${Number(bookingId)}/cancel`, {
    method: "PATCH",
  });
}

export function searchUsers(query) {
  return apiFetch(`/users/search?q=${encodeURIComponent(query)}`);
}

export async function getMyInvitations() {
  const rows = await apiFetch("/bookings/invitations");
  return rows.map((row) => {
    const range = apiSlotToRange(row.booking_date, row.time_slot);
    return {
      id: row.invitation_id,
      bookingId: row.booking_id,
      inviter: row.host?.username ?? "ผู้ใช้",
      startTime: range.start.toISOString(),
      endTime: range.end.toISOString(),
      room: row.room?.room_name ?? "รอเลือกห้อง",
      status: row.invite_status,
      expiresAt: row.expires_at,
    };
  });
}

export async function acceptInvitation(id) {
  const result = await respondInvitation(id, "accepted");
  return normalizeBooking(result);
}

export function declineInvitation(id) {
  return respondInvitation(id, "declined");
}

function respondInvitation(id, response) {
  return apiFetch(`/bookings/invitations/${id}/respond`, {
    method: "PATCH",
    body: JSON.stringify({ response }),
  });
}

export function mapBookingRow(booking) {
  const normalized = normalizeBooking(booking);
  return {
    id: normalized.id,
    roomId: normalized.roomId,
    room: normalized.room,
    building: normalized.building,
    date: formatThaiDate(normalized.startTime),
    slot: formatSlotLabel(normalized.startTime, normalized.endTime),
    startTime: normalized.startTime,
    endTime: normalized.endTime,
    status: normalized.status,
    createdAt: normalized.createdAt,
  };
}

function normalizeBooking(booking) {
  if (booking?.startTime && booking?.endTime) return booking;
  const range = apiSlotToRange(booking.booking_date, booking.time_slot);
  return {
    ...booking,
    id: booking.booking_id,
    roomId: booking.room?.id ?? null,
    room: booking.room?.room_name ?? "รอสมาชิกตอบรับ",
    building: "KINOF Lab",
    startTime: range.start.toISOString(),
    endTime: range.end.toISOString(),
    invitationsCreated: booking.members?.length ?? 0,
    invitationsRequested: booking.members?.length ?? 0,
    createdAt: new Date().toISOString(),
  };
}

function formatApiDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeToTimeSlot(startTime, endTime) {
  const hm = (date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${hm(startTime)}-${hm(endTime)}`;
}

function apiSlotToRange(dateValue, timeSlot) {
  const [startValue = "00:00", endValue = "00:00"] = String(timeSlot ?? "").split("-");
  const build = (value) => {
    const [hour, minute] = value.split(":").map(Number);
    const date = new Date(`${dateValue}T00:00:00`);
    date.setHours(hour || 0, minute || 0, 0, 0);
    return date;
  };
  return { start: build(startValue), end: build(endValue) };
}

export const BOOKING_SLOTS = [
  { id: 1, label: "รอบที่ 1  09.00 น. - 11.30 น.", startHour: 9, startMinute: 0, endHour: 11, endMinute: 30 },
  { id: 2, label: "รอบที่ 2  11.30 น. - 14.00 น.", startHour: 11, startMinute: 30, endHour: 14, endMinute: 0 },
  { id: 3, label: "รอบที่ 3  14.00 น. - 16.30 น.", startHour: 14, startMinute: 0, endHour: 16, endMinute: 30 },
  { id: 4, label: "รอบที่ 4  16.30 น. - 19.00 น.", startHour: 16, startMinute: 30, endHour: 19, endMinute: 0 },
];

export function slotToRange(dateValue, slot) {
  const start = new Date(dateValue);
  start.setHours(slot.startHour, slot.startMinute, 0, 0);
  const end = new Date(dateValue);
  end.setHours(slot.endHour, slot.endMinute, 0, 0);
  return { start, end };
}

export function formatThaiDate(dateValue) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseStoredDate(dateValue));
}

export function parseStoredDate(dateValue) {
  if (typeof dateValue === "string" && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(dateValue)) {
    return new Date(`${dateValue}Z`);
  }
  return new Date(dateValue);
}

export function formatSlotLabel(startTime, endTime) {
  const fmt = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" });
  return `${fmt.format(parseStoredDate(startTime))} - ${fmt.format(parseStoredDate(endTime))}`;
}
