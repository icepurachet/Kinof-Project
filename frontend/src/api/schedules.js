import { apiFetch } from "./auth";
import { BOOKING_SLOTS, slotToRange } from "./bookings";

export function getMySchedule(date) {
  void date;
  return apiFetch("/schedule/me").then((items) => items.map((item) => ({
    ...item,
    dayOfWeek: dayNameToNumber(item.day_of_week),
    dayLabel: item.day_of_week,
    courseCode: item.subject_code,
    courseName: item.subject_name,
    startTime: item.start_time,
    endTime: item.end_time,
    room: item.room_name,
  })));
}

function dayNameToNumber(day) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(day);
}

export function toProfileScheduleRows(items = []) {
  return items.map((item) => ({
    day: item.dayLabel,
    course: [item.courseCode, item.courseName].filter(Boolean).join(" / "),
    time: `${item.startTime} น. - ${item.endTime} น.`,
    room: item.room,
  }));
}

function parseHm(value) {
  const [hour, minute] = String(value ?? "0:0").split(":").map(Number);
  return { hour: hour || 0, minute: minute || 0 };
}

export function scheduleOverlapsSlot(item, date, slot) {
  if (item.dayOfWeek !== date.getDay()) return false;
  const { start, end } = slotToRange(date, slot);
  const classStart = parseHm(item.startTime);
  const classEnd = parseHm(item.endTime);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const classStartMinutes = classStart.hour * 60 + classStart.minute;
  const classEndMinutes = classEnd.hour * 60 + classEnd.minute;
  return classStartMinutes < endMinutes && classEndMinutes > startMinutes;
}

export function findSlotClassConflict(items, date, slot) {
  const match = (items ?? []).find((item) => scheduleOverlapsSlot(item, date, slot));
  if (!match) return null;
  return {
    day: match.dayLabel,
    course: [match.courseCode, match.courseName].filter(Boolean).join(" / "),
    slotId: slot.id,
  };
}

export { BOOKING_SLOTS };
