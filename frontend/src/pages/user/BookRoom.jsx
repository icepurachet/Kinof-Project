import React, { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  ArrowRight,
  Plus,
  Check,
  AlertTriangle,
  CalendarPlus,
  Search,
  Users,
  UserCheck,
  AlertCircle
} from "lucide-react";
import Card from "../../components/Card";
import Pill from "../../components/Pill";
import Button from "../../components/Button";
import {
  BOOKING_SLOTS,
  cancelPendingBooking,
  confirmBooking,
  createBooking,
  getAvailableRooms,
  getBookingGroupStatus,
  parseStoredDate,
  searchUsers,
  slotToRange,
} from "../../api/bookings";
import { findSlotClassConflict, getMySchedule } from "../../api/schedules";

const BOOK_ROOM_DRAFT_KEY = "kinofBookRoomDraft";

function readBookRoomDraft() {
  try {
    const raw = sessionStorage.getItem(BOOK_ROOM_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function slotById(slotId) {
  return BOOKING_SLOTS.find((item) => item.id === slotId) ?? null;
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

const DAYS_OF_WEEK = [
  "วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"
];

const morningSlots = BOOKING_SLOTS.slice(0, 2);
const afternoonSlots = BOOKING_SLOTS.slice(2);

export default function BookRoom({ onBookingCreated, notify, existingBookings = [], setPage, auth }) {
  const draft = readBookRoomDraft();
  const [step, setStep] = useState(draft?.step ?? 1);
  const [isSubmitted, setIsSubmitted] = useState(draft?.isSubmitted ?? false);
  const [selectedDate, setSelectedDate] = useState(() => (draft?.selectedDate ? new Date(draft.selectedDate) : new Date()));
  const [viewDate, setViewDate] = useState(() => (draft?.viewDate ? new Date(draft.viewDate) : new Date()));
  const [slot, setSlot] = useState(() => slotById(draft?.slotId));

  const [friends, setFriends] = useState(draft?.friends ?? []);
  const [friendSearchInput, setFriendSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [emailError, setEmailError] = useState(false);

  const [hasSearchedRooms, setHasSearchedRooms] = useState(draft?.hasSearchedRooms ?? false);
  const [isSearchingRooms, setIsSearchingRooms] = useState(false);
  const [availableRooms, setAvailableRooms] = useState(draft?.availableRooms ?? []);
  const [selectedRoom, setSelectedRoom] = useState(draft?.selectedRoom ?? null);
  const [requestError, setRequestError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mySchedule, setMySchedule] = useState([]);
  const [pendingBookingId, setPendingBookingId] = useState(draft?.pendingBookingId ?? null);
  const [groupStatus, setGroupStatus] = useState(null);
  const [invitesSent, setInvitesSent] = useState(Boolean(draft?.pendingBookingId));

  const [bookingsList, setBookingsList] = useState([...existingBookings]);

  useEffect(() => {
    setBookingsList([...existingBookings]);
  }, [existingBookings]);

  useEffect(() => {
    getMySchedule()
      .then(setMySchedule)
      .catch(() => setMySchedule([]));
  }, []);

  useEffect(() => {
    if (isSubmitted) {
      sessionStorage.removeItem(BOOK_ROOM_DRAFT_KEY);
      return;
    }
    sessionStorage.setItem(
      BOOK_ROOM_DRAFT_KEY,
      JSON.stringify({
        step,
        isSubmitted,
        selectedDate: selectedDate.toISOString(),
        viewDate: viewDate.toISOString(),
        slotId: slot?.id ?? null,
        friends,
        hasSearchedRooms,
        availableRooms,
        selectedRoom,
        pendingBookingId,
      }),
    );
  }, [
    step,
    isSubmitted,
    selectedDate,
    viewDate,
    slot,
    friends,
    hasSearchedRooms,
    availableRooms,
    selectedRoom,
    pendingBookingId,
  ]);

  useEffect(() => {
    if (step !== 3 || friends.length === 0 || pendingBookingId || isSubmitted || !selectedRoom || !slot) return undefined;
    let cancelled = false;

    (async () => {
      setIsSubmitting(true);
      setRequestError("");
      try {
        const { start, end } = slotToRange(selectedDate, slot);
        const booking = await createBooking({
          roomId: selectedRoom.id,
          startTime: start,
          endTime: end,
          inviteeUserIds: friends.map((friend) => friend.id),
        });
        if (cancelled) return;
        setPendingBookingId(booking.id);
        setInvitesSent(true);
        notify?.(`ส่งคำเชิญ ${booking.invitationsCreated ?? friends.length} คนแล้ว — รอให้ตอบรับก่อนยืนยันการจอง`);
      } catch (error) {
        if (!cancelled) {
          setRequestError(error.message);
          notify?.(error.message);
          setStep(2);
        }
      } finally {
        if (!cancelled) setIsSubmitting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, friends, pendingBookingId, isSubmitted, selectedRoom, slot, selectedDate, notify]);

  useEffect(() => {
    if (!pendingBookingId) return undefined;

    const refreshGroupStatus = async () => {
      try {
        const status = await getBookingGroupStatus(pendingBookingId);
        setGroupStatus(status);
        setFriends((current) =>
          current.map((friend) => {
            const member = status.members?.find((item) => item.id === friend.id);
            if (!member) return friend;
            const nextStatus =
              member.status === "accepted" ? "joined" : member.status === "declined" ? "declined" : "pending";
            return { ...friend, status: nextStatus };
          }),
        );
      } catch (error) {
        setRequestError(error.message);
      }
    };

    refreshGroupStatus();
    const timer = setInterval(refreshGroupStatus, 3000);
    return () => clearInterval(timer);
  }, [pendingBookingId]);

  const userEmail = auth?.user?.email ?? "—";
  const hasFriends = friends.length > 0;
  const canConfirmBooking = !hasFriends || Boolean(groupStatus?.canConfirm && !groupStatus?.hasDeclined);
  const steps = ["1. เลือกวัน-เวลา", "2. จัดการสมาชิก-ดูห้อง", "3. ยืนยันการจอง"];
  const formattedDate = `${selectedDate.getDate()} ${THAI_MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear() + 543}`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isPastDate = (date) => {
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return target < today;
  };

  const isSlotBooked = (checkSlot) => {
    const { start, end } = slotToRange(selectedDate, checkSlot);
    return bookingsList.some((booking) => {
      if (booking.startTime && booking.endTime) {
        return parseStoredDate(booking.startTime).getTime() === start.getTime()
          && parseStoredDate(booking.endTime).getTime() === end.getTime();
      }
      return booking.date === formattedDate && booking.slot === checkSlot.label;
    });
  };

  const getSlotClassConflict = (checkSlot) => findSlotClassConflict(mySchedule, selectedDate, checkSlot);

  const handleSelectDate = (date) => {
    if (isPastDate(date)) return;
    setSelectedDate(date);
    setSlot(null);
    setHasSearchedRooms(false);
    setSelectedRoom(null);
  };

  const handlePrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const handleNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const generateCalendarDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const thaiFirstDayIndex = (firstDayIndex + 6) % 7;
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];
    for (let i = thaiFirstDayIndex - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, daysInPrevMonth - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= daysInCurrentMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    const remainingDays = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    return days;
  };

  const isSameDate = (d1, d2) => {
    if (!d1 || !d2) return false;
    return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
  };

  const formatSlotDisplay = (slotStr) => {
    if (!slotStr) return "";
    const match = slotStr.match(/(รอบที่ \d+)\s+(.+)/);
    return match ? `${match[2]} (${match[1]})` : slotStr;
  };

  const addFriend = (foundUser) => {
    if (foundUser.email.toLowerCase() === userEmail.toLowerCase() || friends.some((f) => f.id === foundUser.id)) {
      notify?.("ผู้ใช้นี้อยู่ในกลุ่มแล้ว หรือเป็นบัญชีของคุณเอง");
      return;
    }
    setFriends((current) => [...current, { ...foundUser, status: "pending" }]);
    setFriendSearchInput("");
    setSearchResults([]);
    setEmailError(false);
    notify?.(`เพิ่ม ${foundUser.name} เข้าสู่กลุ่มแล้ว`);
  };

  const handleAddFriend = async () => {
    setEmailError(false);
    const query = friendSearchInput.trim();
    if (!query) return;
    if (friends.length >= 4) {
      notify?.("สามารถเชิญสมาชิกเข้าร่วมกลุ่มได้สูงสุด 5 คน รวมคุณแล้ว");
      return;
    }
    setIsSearchingUsers(true);
    try {
      const results = await searchUsers(query);
      setSearchResults(results);
      if (results.length === 1) addFriend(results[0]);
      else if (results.length === 0) setEmailError(true);
    } catch (error) {
      notify?.(error.message);
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleRemoveFriend = (id) => {
    setFriends(friends.filter((f) => f.id !== id));
  };

  const handleClearGroup = () => {
    setFriends([]);
    setFriendSearchInput("");
    setSearchResults([]);
    setEmailError(false);
    notify?.("ลบรายชื่อสมาชิกในกลุ่มทั้งหมดแล้ว");
  };

  const handleSearchAvailableRooms = async () => {
    if (!slot) return;
    setIsSearchingRooms(true);
    setRequestError("");
    setSelectedRoom(null);
    try {
      const { start, end } = slotToRange(selectedDate, slot);
      const rooms = await getAvailableRooms(start, end, friends.length + 1);
      setAvailableRooms(rooms);
      setHasSearchedRooms(true);
    } catch (error) {
      setAvailableRooms([]);
      setHasSearchedRooms(false);
      setRequestError(error.message);
      notify?.(error.message);
    } finally {
      setIsSearchingRooms(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedRoom || !slot) return;
    if (hasFriends && !canConfirmBooking) return;

    setIsSubmitting(true);
    setRequestError("");
    try {
      let booking;
      if (hasFriends) {
        booking = await confirmBooking(pendingBookingId, selectedRoom.id);
      } else {
        const { start, end } = slotToRange(selectedDate, slot);
        booking = await createBooking({
          roomId: selectedRoom.id,
          startTime: start,
          endTime: end,
          inviteeUserIds: [],
        });
      }

      setBookingsList((prev) => [...prev, booking]);
      onBookingCreated?.(booking);
      notify?.("ยืนยันการจองเรียบร้อยแล้ว");
      setPendingBookingId(null);
      setGroupStatus(null);
      setInvitesSent(false);
      setIsSubmitted(true);
    } catch (error) {
      setRequestError(error.message);
      notify?.(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelPendingIfNeeded = async () => {
    if (!pendingBookingId) return;
    try {
      await cancelPendingBooking(pendingBookingId);
    } catch {
      // Ignore stale pending bookings when navigating away.
    }
    setPendingBookingId(null);
    setGroupStatus(null);
    setInvitesSent(false);
  };

  const handleBackFromStep3 = async () => {
    await cancelPendingIfNeeded();
    setStep(2);
  };

  const handleReset = async () => {
    await cancelPendingIfNeeded();
    sessionStorage.removeItem(BOOK_ROOM_DRAFT_KEY);
    setIsSubmitted(false);
    setStep(1);
    setSlot(null);
    setSelectedRoom(null);
    setHasSearchedRooms(false);
    setAvailableRooms([]);
    setFriends([]);
    setFriendSearchInput("");
    setSearchResults([]);
    setEmailError(false);
    setRequestError("");
  };

  const handleBackToHome = () => {
    if (setPage) setPage("home");
  };

  const calendarDays = generateCalendarDays();

  const renderSlotButton = (slotOption) => {
    const booked = isSlotBooked(slotOption);
    const classConflict = getSlotClassConflict(slotOption);
    const isDisabled = booked || !!classConflict;

    return (
      <button
        type="button"
        key={slotOption.id}
        disabled={isDisabled}
        onClick={() => {
          setSlot(slotOption);
          setHasSearchedRooms(false);
          setSelectedRoom(null);
          setRequestError("");
        }}
        className={`text-xs text-left rounded-xl px-4 py-3 border transition-all duration-150 flex items-center justify-between ${
          classConflict
            ? "bg-rose-50/50 border-rose-200 text-rose-400 cursor-not-allowed"
            : booked
            ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
            : slot?.id === slotOption.id
            ? "text-white font-medium shadow-blue-glow scale-[1.01] bg-navy-800 border-navy-800"
            : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 bg-white"
        }`}
      >
        <span className="font-medium">{slotOption.label}</span>
        {classConflict ? (
          <span className="text-xs bg-rose-100 text-rose-700 font-medium px-2.5 py-0.5 rounded-full" title={classConflict.course}>
            ติดเรียน
          </span>
        ) : booked ? (
          <span className="text-xs bg-slate-200 text-slate-600 font-medium px-2.5 py-0.5 rounded-full">
            จองแล้ว
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-ink tracking-tight">จองห้องแล็บ</h1>
        <p className="text-caption mt-0.5">เลือกวัน เวลา และห้องปฏิบัติการที่ต้องการใช้งาน</p>
      </div>

      {/* Stepper Banner */}
      <div className="rounded-3xl text-white p-5 md:p-6 mb-7 shadow-blue-glow border border-navy-700/30 bg-brand-gradient">
        <div className="flex items-center justify-center max-w-xl mx-auto overflow-x-auto py-1">
          {steps.map((s, i) => {
            const isStepCompleted = isSubmitted && i === 2;
            const stepNum = i + 1;
            const isActive = step === stepNum;
            const isPast = step > stepNum;

            return (
              <React.Fragment key={s}>
                <div className="flex flex-col items-center shrink-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-2 transition-all duration-200 shadow-sm ${
                      isStepCompleted
                        ? "bg-emerald-500 text-white"
                        : isActive
                        ? "bg-white text-navy-800 scale-110"
                        : isPast
                        ? "bg-teal-500 text-white"
                        : "bg-white/15 text-slate-300"
                    }`}
                  >
                    {isStepCompleted || isPast ? <Check size={16} strokeWidth={3} /> : `${stepNum}`}
                  </div>
                  <span className={`text-xs font-medium whitespace-nowrap ${isActive ? "text-white font-semibold" : "text-slate-300"}`}>
                    {s}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className="flex-1 min-w-[30px] md:min-w-[60px] h-[2px] bg-white/20 mx-3 -mt-6" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* STEP 1: ปฏิทินและเวลา */}
      {!isSubmitted && step === 1 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* เลือกวันที่ */}
            <div>
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">1. เลือกวันที่</h2>
              <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-soft bg-white">
                <div className="text-white px-5 py-4 bg-navy-800">
                  <div className="flex items-center justify-between text-sm font-semibold mb-3">
                    <button type="button" onClick={handlePrevMonth} className="hover:bg-white/10 p-1.5 rounded-lg transition-colors">
                      <ChevronLeft size={16} />
                    </button>
                    <div className="flex items-center gap-2">
                      <span>{THAI_MONTHS[viewDate.getMonth()]} {viewDate.getFullYear() + 543}</span>
                      <CalendarIcon size={16} className="text-gold-400" />
                    </div>
                    <button type="button" onClick={handleNextMonth} className="hover:bg-white/10 p-1.5 rounded-lg transition-colors">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 text-center text-xs text-slate-300 font-medium">
                    <span>จ</span><span>อ</span><span>พ</span><span>พฤ</span><span>ศ</span><span>ส</span><span>อา</span>
                  </div>
                </div>

                <div className="p-4 grid grid-cols-7 gap-y-2 text-center text-xs">
                  {calendarDays.map((item, index) => {
                    const isSelected = isSameDate(item.date, selectedDate);
                    const isCurrentToday = isSameDate(item.date, today);
                    const past = isPastDate(item.date);
                    const isDisabled = !item.isCurrentMonth || past;

                    return (
                      <div key={index} className="flex justify-center items-center py-1">
                        <button
                          type="button"
                          onClick={() => !isDisabled && handleSelectDate(item.date)}
                          disabled={isDisabled}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 ${
                            !item.isCurrentMonth
                              ? "text-slate-300 cursor-default"
                              : past
                              ? "text-slate-300 cursor-not-allowed line-through opacity-50"
                              : isSelected
                              ? "text-white font-bold shadow-md bg-navy-800"
                              : isCurrentToday
                              ? "bg-slate-200 text-slate-900 font-bold"
                              : "text-slate-700 hover:bg-slate-100 font-medium"
                          }`}
                        >
                          {item.date.getDate()}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* เลือกช่วงเวลา */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">2. เลือกช่วงเวลา</h2>
                <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60">
                  {DAYS_OF_WEEK[selectedDate.getDay()]}
                </span>
              </div>

              <Card className="p-5 flex flex-col gap-4">
                <div>
                  <span className="text-xs font-semibold text-muted block mb-2">ช่วงเช้า</span>
                  <div className="flex flex-col gap-2">
                    {morningSlots.map((s) => renderSlotButton(s))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <span className="text-xs font-semibold text-muted block mb-2">ช่วงบ่าย</span>
                  <div className="flex flex-col gap-2">
                    {afternoonSlots.map((s) => renderSlotButton(s))}
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="primary" icon={ArrowRight} disabled={!slot} onClick={() => setStep(2)}>
              ถัดไป
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: จัดการกลุ่มและเลือกห้อง */}
      {!isSubmitted && step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-bold text-ink tracking-tight mb-0.5">เชิญเพื่อนเข้าร่วมกลุ่ม</h2>
            <p className="text-caption">สามารถเชิญสมาชิกเข้าร่วมกลุ่มได้สูงสุด 5 คน รวมคุณแล้ว</p>
          </div>

          <Card className="p-5 md:p-6 space-y-4">
            {friends.map((f) => (
              <div
                key={f.email}
                className="flex items-center justify-between border border-slate-200/80 rounded-xl px-4 py-3 text-xs bg-slate-50/40"
              >
                <div className="flex items-center gap-2">
                  <UserCheck size={15} className="text-slate-400" />
                  <span className="text-slate-800 font-medium">{f.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  {f.status === "joined" ? (
                    <Pill tone="green" withDot>เข้าร่วมแล้ว</Pill>
                  ) : f.status === "declined" ? (
                    <Pill tone="red" withDot>ปฏิเสธแล้ว</Pill>
                  ) : (
                    <Pill tone="amber" withDot>ยังไม่เข้าร่วม</Pill>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveFriend(f.id)}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs px-3 py-1 rounded-lg font-medium transition-colors"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))}

            <div>
              <input
                type="email"
                value={friendSearchInput}
                onChange={(e) => {
                  setFriendSearchInput(e.target.value);
                  setEmailError(false);
                  setSearchResults([]);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleAddFriend()}
                placeholder="ค้นหาด้วยชื่อหรืออีเมลของเพื่อน"
                className="w-full text-xs border border-slate-200 rounded-xl px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-navy-800 focus:ring-2 focus:ring-navy-800/10 transition-all"
              />
              {searchResults.length > 1 && (
                <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {searchResults.map((result) => (
                    <button
                      type="button"
                      key={result.id}
                      onClick={() => addFriend(result)}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-slate-50 border-b last:border-b-0 border-slate-100"
                    >
                      <span className="block font-medium text-slate-800">{result.name}</span>
                      <span className="text-slate-500">{result.email}</span>
                    </button>
                  ))}
                </div>
              )}
              {emailError && (
                <div className="mt-2.5 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-900 text-xs px-3.5 py-2 rounded-xl">
                  <AlertCircle size={14} className="text-amber-600 shrink-0" />
                  <span>ไม่พบบัญชีผู้ใช้นี้ในระบบ กรุณาตรวจสอบอีกครั้ง</span>
                </div>
              )}
            </div>

            {/* Utility actions (เพิ่ม/ลบสมาชิก) — เป็น secondary/danger ทั้งคู่ เพราะ primary ของหน้านี้คือ "ค้นหาห้องว่าง" ด้านล่าง */}
            <div className="flex justify-end items-center gap-2.5 pt-3 border-t border-slate-100">
              <Button variant="danger" size="sm" onClick={handleClearGroup}>
                ลบกลุ่ม
              </Button>
                <Button variant="secondary" size="sm" icon={Plus} iconPosition="left" onClick={handleAddFriend} disabled={isSearchingUsers}>
                {isSearchingUsers ? "กำลังค้นหา..." : "ค้นหาและเพิ่มเพื่อน"}
              </Button>
            </div>
          </Card>

          <p className="text-xs text-muted italic">เมื่อไปหน้ายืนยันการจอง ระบบจะส่งคำเชิญให้สมาชิก และต้องรอให้ทุกคนตอบรับก่อนยืนยันได้</p>

          <div className="flex justify-center pt-2">
            <Button
              variant="primary"
              size="lg"
              icon={Search}
              iconPosition="left"
              onClick={handleSearchAvailableRooms}
              className="w-full max-w-sm"
            >
              ค้นหาห้องว่าง
            </Button>
          </div>

          {/* Loading — skeleton cards แทนข้อความ pulse เดิม ให้เห็นโครงผลลัพธ์ที่กำลังจะมา */}
          {isSearchingRooms && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[0, 1].map((i) => (
                <div key={i} className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="h-3.5 w-20 bg-slate-200 rounded-md" />
                    <div className="h-5 w-5 rounded-full bg-slate-200" />
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full" />
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <div className="h-3 w-16 bg-slate-100 rounded-md" />
                    <div className="h-3 w-14 bg-slate-100 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {requestError && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3" role="alert">
              {requestError}
            </div>
          )}

          {hasSearchedRooms && !isSearchingRooms && (
            <Card className="p-5 md:p-6 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-sm font-bold text-ink">เลือกห้องแล็บที่ต้องการจอง:</span>
                <span className="text-caption">พบห้องว่าง {availableRooms.length} ห้อง</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {availableRooms.length === 0 && (
                  <div className="sm:col-span-2 text-xs text-muted text-center py-8">
                    ไม่มีห้องว่างในช่วงเวลานี้
                  </div>
                )}
                {availableRooms.map((r) => {
                  const isSelected = selectedRoom?.id === r.id;

                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRoom(r)}
                      className={`p-4 rounded-2xl border text-left transition-all duration-150 flex flex-col gap-3 ${
                        isSelected
                          ? "border-navy-800 bg-slate-50/80 shadow-md ring-2 ring-navy-800/10"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-ink">{r.name}</span>
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-white shadow-sm bg-navy-800">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-slate-300" />
                        )}
                      </div>

                      {/* แถบแสดงที่นั่งคงเหลือ — สื่อ "เหลือเยอะ/น้อย" ได้เร็วกว่าตัวเลขล้วน */}
                      <div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300 bg-teal-500"
                            style={{ width: "100%" }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <Users size={13} />
                          <span>ความจุ {r.capacity} ที่นั่ง</span>
                        </div>
                        <span className="font-medium px-2.5 py-0.5 rounded-full text-xs border text-emerald-700 bg-emerald-50 border-emerald-200/60">
                          พร้อมจอง
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end pt-3">
                <Button variant="primary" icon={ArrowRight} disabled={!selectedRoom} onClick={() => setStep(3)}>
                  ถัดไป: ตรวจสอบข้อมูล
                </Button>
              </div>
            </Card>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              ย้อนกลับและแก้ไข
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: ตรวจสอบข้อมูลก่อนยืนยัน */}
      {!isSubmitted && step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-bold text-ink tracking-tight">ยืนยันรายละเอียดการจอง</h2>
            <p className="text-caption">กรุณาตรวจสอบความถูกต้องของข้อมูลก่อนกดยืนยัน</p>
          </div>

          {hasFriends && invitesSent && (
            <div className={`rounded-2xl border px-4 py-3 text-xs ${
              groupStatus?.isExpired || groupStatus?.hasDeclined
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : canConfirmBooking
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}>
              {groupStatus?.isExpired
                ? "รายการจองหมดเวลา 5 นาทีแล้ว กรุณาย้อนกลับเพื่อสร้างคำเชิญใหม่"
                : groupStatus?.hasDeclined
                ? "มีสมาชิกปฏิเสธคำเชิญ กรุณาย้อนกลับเพื่อแก้ไขกลุ่มหรือยกเลิกการจอง"
                : canConfirmBooking
                ? "สมาชิกตอบรับครบแล้ว กดยืนยันการจองได้"
                : "ส่งคำเชิญแล้ว กำลังรอให้สมาชิกทุกคนเปิดเมนู \"คำเชิญ\" และกดยอมรับ"}
            </div>
          )}

          <div className="border border-slate-200/80 rounded-3xl overflow-hidden bg-white shadow-soft">
            <div className="p-5 md:p-6 text-white bg-brand-gradient">
              <h3 className="text-sm md:text-base font-bold mb-0.5">รายละเอียดสรุปการจองห้องปฏิบัติการ</h3>
              <p className="text-xs text-slate-200 font-light">ข้อมูลสำหรับระบบตรวจสอบและบันทึกสิทธิ์</p>
            </div>

            <div className="divide-y divide-slate-100 text-xs text-slate-700">
              <div className="grid grid-cols-3 px-5 md:px-6 py-4 items-center">
                <span className="text-muted font-medium">ผู้จองหลัก</span>
                <span className="col-span-2 font-semibold text-ink truncate">{userEmail}</span>
              </div>
              <div className="grid grid-cols-3 px-5 md:px-6 py-4 items-center">
                <span className="text-muted font-medium">วันที่จอง</span>
                <span className="col-span-2 font-semibold text-ink">{formattedDate} ({DAYS_OF_WEEK[selectedDate.getDay()]})</span>
              </div>
              <div className="grid grid-cols-3 px-5 md:px-6 py-4 items-center">
                <span className="text-muted font-medium">ช่วงเวลา</span>
                <span className="col-span-2 font-semibold text-ink">{formatSlotDisplay(slot?.label)}</span>
              </div>
              <div className="grid grid-cols-3 px-5 md:px-6 py-4 items-center">
                <span className="text-muted font-medium">ห้องที่เลือก</span>
                <span className="col-span-2 font-semibold text-navy-800">
                  {selectedRoom?.name} (รองรับ {selectedRoom?.capacity} ที่นั่ง)
                </span>
              </div>
              <div className="grid grid-cols-3 px-5 md:px-6 py-4 items-start">
                <span className="text-muted font-medium">สมาชิกกลุ่ม ({friends.length} คน)</span>
                <div className="col-span-2 space-y-1.5">
                  {friends.length > 0 ? (
                    friends.map((f) => (
                      <div key={f.email} className="font-medium text-slate-800 flex items-center gap-2">
                        <span>• {f.email}</span>
                        <Pill tone={f.status === "joined" ? "green" : f.status === "declined" ? "red" : "amber"}>
                          {f.status === "joined" ? "เข้าร่วมแล้ว" : f.status === "declined" ? "ปฏิเสธแล้ว" : "ยังไม่เข้าร่วม"}
                        </Pill>
                      </div>
                    ))
                  ) : (
                    <span className="text-muted font-light">ไม่มีสมาชิกเพิ่มเติม (ใช้งานคนเดียว)</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {requestError && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3" role="alert">
              {requestError}
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <Button variant="secondary" onClick={handleBackFromStep3}>
              ย้อนกลับและแก้ไข
            </Button>
            <Button
              variant="primary"
              icon={Check}
              disabled={isSubmitting || (hasFriends && (!invitesSent || !canConfirmBooking))}
              onClick={handleConfirmBooking}
            >
              {isSubmitting
                ? "กำลังยืนยัน..."
                : hasFriends && !canConfirmBooking
                ? "รอสมาชิกตอบรับ..."
                : "ยืนยันการจอง"}
            </Button>
          </div>
        </div>
      )}

      {/* SUCCESS STATE */}
      {isSubmitted && (
        <Card className="p-6 md:p-10 text-center flex flex-col items-center animate-scale-in">
          <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
            <Check size={36} strokeWidth={3} />
          </div>

          <h2 className="text-lg md:text-xl font-bold text-ink mb-1">ยืนยันการจองสำเร็จ!</h2>
          <p className="text-xs md:text-sm text-muted mb-7">ข้อมูลการจองของคุณได้รับการบันทึกลงสู่ระบบเรียบร้อยแล้ว</p>

          <div className="w-full max-w-2xl border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50 text-left mb-6">
            <div className="p-4 bg-slate-100/70 border-b border-slate-200">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">รายละเอียดการจองของคุณ</h3>
            </div>
            <div className="divide-y divide-slate-200/60 text-xs text-slate-700">
              <div className="grid grid-cols-3 px-5 py-3.5">
                <span className="text-slate-500">อีเมล</span>
                <span className="col-span-2 font-medium truncate">{userEmail}</span>
              </div>
              <div className="grid grid-cols-3 px-5 py-3.5">
                <span className="text-slate-500">วันที่</span>
                <span className="col-span-2 font-medium">{formattedDate}</span>
              </div>
              <div className="grid grid-cols-3 px-5 py-3.5">
                <span className="text-slate-500">ช่วงเวลา</span>
                <span className="col-span-2 font-medium">{formatSlotDisplay(slot?.label)}</span>
              </div>
              <div className="grid grid-cols-3 px-5 py-3.5">
                <span className="text-slate-500">ห้องแล็บ</span>
                <span className="col-span-2 font-medium">{selectedRoom?.name || "-"}</span>
              </div>
              <div className="grid grid-cols-3 px-5 py-3.5">
                <span className="text-slate-500">เพื่อนร่วมกลุ่ม</span>
                <span className="col-span-2 font-medium">
                  {friends.length > 0 ? friends.map(f => f.email).join(", ") : "-"}
                </span>
              </div>
            </div>
          </div>

          <div className="w-full max-w-2xl bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3.5 text-left mb-8">
            <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <AlertTriangle size={16} />
            </div>
            <span className="text-xs text-amber-900 font-medium leading-relaxed">
              หากคุณไม่มาใช้ห้องแล็บตามเวลาที่จองไว้โดยไม่ยกเลิกล่วงหน้า คุณจะถูกหักคะแนนพฤติกรรมการใช้งาน 5 คะแนน
            </span>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 w-full max-w-2xl">
            <Button variant="secondary" icon={CalendarPlus} iconPosition="left" onClick={handleReset}>
              จองห้องแล็บเพิ่ม
            </Button>
            <Button variant="primary" onClick={handleBackToHome}>
              กลับสู่หน้าหลัก
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
