import { API_URL, apiFetch, readStoredAuth } from "./auth";

function authHeaders() {
  const auth = readStoredAuth();
  return auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {};
}

export async function getAdminDashboard() {
  const [summary, rooms] = await Promise.all([
    apiFetch("/admin/dashboard"),
    apiFetch("/admin/tracking/rooms"),
  ]);
  return {
    todayBookingCount: summary.today_bookings,
    roomsOpen: rooms.filter((room) => room.status === "active").length,
    roomsTotal: rooms.length,
    rooms: rooms.map((room) => ({
      id: room.room_id,
      name: room.room_name,
      status: room.status === "active" ? "open" : room.status,
      seatCount: Number(room.machine_count ?? 0),
      todayBookingCount: Number(room.today_booking_count ?? 0),
      hasClassNow: Boolean(room.has_class_now),
    })),
  };
}

export async function getAdminRooms() {
  const rows = await apiFetch("/admin/data/rooms");
  return rows.map((row) => ({
    id: row.id,
    name: row.room_name,
    building: "อาคาร IT",
    capacity: Number(row.capacity),
    status: row.status === "active" ? "open" : row.status,
    computerCount: Number(row.computer_count ?? 0),
  }));
}

export function createAdminRoom(payload) {
  return apiFetch("/admin/data/rooms", {
    method: "POST",
    body: JSON.stringify(toRoomPayload(payload)),
  });
}

export function updateAdminRoom(id, payload) {
  return apiFetch(`/admin/data/rooms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(toRoomPayload(payload)),
  });
}

export function deleteAdminRoom(id) {
  return apiFetch(`/admin/data/rooms/${id}`, { method: "DELETE" });
}

export function getManagedUsers() {
  return apiFetch("/users").then((rows) => rows.map((row) => ({
    id: row.id,
    username: row.username,
    email: row.email,
    name: [row.first_name, row.last_name].filter(Boolean).join(" "),
    role: row.role,
    usageScore: Number(row.usage_score ?? 0),
    active: Boolean(row.is_active),
    verified: Boolean(row.is_verified),
  })));
}

export function setManagedUserActive(id, active) {
  return apiFetch(`/admin/data/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: active }),
  });
}

export async function getAdminComputers() {
  const rows = await apiFetch("/admin/data/computers");
  return rows.map((row) => ({
    id: row.id,
    machineNo: row.machine_no,
    roomId: row.room_id,
    roomName: row.room_name,
    ipAddress: row.ip_address ?? "",
    macAddress: row.mac_address ?? "",
    status: row.status,
    lastSeenAt: row.last_seen_at,
  }));
}

export function createAdminComputer(payload) {
  return apiFetch("/admin/data/computers", {
    method: "POST",
    body: JSON.stringify(toComputerPayload(payload)),
  });
}

export function updateAdminComputer(id, payload) {
  return apiFetch(`/admin/data/computers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(toComputerPayload(payload)),
  });
}

export function deleteAdminComputer(id) {
  return apiFetch(`/admin/data/computers/${id}`, { method: "DELETE" });
}

function toComputerPayload(payload) {
  return {
    machine_no: payload.machineNo,
    room_id: Number(payload.roomId),
    ip_address: payload.ipAddress || undefined,
    mac_address: payload.macAddress || undefined,
    status: payload.status,
  };
}

function toRoomPayload(payload) {
  return {
    room_name: payload.name,
    capacity: Number(payload.capacity),
    status: payload.status === "open" ? "active" : payload.status,
  };
}

export async function getAdminSchedules(active = true) {
  void active;
  const rows = await apiFetch("/admin/data/subjects");
  return rows.map(mapSubject);
}

export async function getAdminSchedule(id) {
  return mapSubjectDetail(await apiFetch(`/admin/data/subjects/${id}`));
}

export async function createAdminSchedule(payload) {
  return apiFetch("/admin/data/subjects", {
    method: "POST",
    body: JSON.stringify(await toSubjectPayload(payload)),
  });
}

export async function updateAdminSchedule(id, payload) {
  return apiFetch(`/admin/data/subjects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(await toSubjectPayload(payload)),
  });
}

export function deleteAdminSchedule(id) {
  return apiFetch(`/admin/data/subjects/${id}`, { method: "DELETE" });
}

export function addScheduleStudent(scheduleId, studentId) {
  return apiFetch(`/admin/data/subjects/${scheduleId}/enrollments`, {
    method: "POST",
    body: JSON.stringify({ user_id: Number(studentId) }),
  }).then(mapSubjectDetail);
}

export function removeScheduleStudent(scheduleId, recordId, type) {
  void type;
  return apiFetch(`/admin/data/subjects/${scheduleId}/enrollments/${recordId}`, {
    method: "DELETE",
  });
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function mapSubject(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    courseCode: row.subject_code,
    courseName: row.subject_name,
    section: row.section,
    instructorName: row.instructor_name,
    dayOfWeek: DAY_NAMES.indexOf(row.day_of_week),
    dayLabel: row.day_of_week,
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    room: row.room_name,
    term: row.term_name,
    termId: row.term_id,
    enrolledCount: Number(row.enrolled_count ?? 0),
    pendingCount: 0,
    capacity: Number(row.capacity ?? 0),
  };
}

function mapSubjectDetail(row) {
  return {
    ...mapSubject(row),
    students: (row.enrollments ?? []).filter((item) => item.status === "active").map((item) => ({
      id: item.user_id,
      studentId: item.user_id,
      name: [item.first_name, item.last_name].filter(Boolean).join(" "),
      type: "enrolled",
    })),
  };
}

async function toSubjectPayload(payload) {
  const terms = await apiFetch("/admin/data/terms");
  const gregorianYear = Number(payload.academicYear) > 2400
    ? Number(payload.academicYear) - 543
    : Number(payload.academicYear);
  const expectedTerm = `${payload.semester}/${gregorianYear}`;
  const term = terms.find((item) => item.term_name === expectedTerm)
    ?? terms.find((item) => item.status === "active");
  if (!term) throw new Error("ยังไม่มีภาคเรียนที่เปิดใช้งาน กรุณาสร้างข้อมูลภาคเรียนก่อน");
  return {
    subject_code: payload.courseCode,
    subject_name: payload.courseName,
    section: String(payload.section),
    class_type: "LAB",
    instructor_name: payload.instructorName,
    day_of_week: DAY_NAMES[Number(payload.dayOfWeek)],
    start_time: payload.startTime,
    end_time: payload.endTime,
    term_id: Number(term.id),
    room_id: Number(payload.roomId),
  };
}

export function previewScheduleImport(file) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch("/admin/data/schedules/import/preview", { method: "POST", body: form });
}

export function confirmScheduleImport(file) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch("/admin/data/schedules/import/confirm", { method: "POST", body: form });
}

export async function downloadScheduleTemplate() {
  const response = await fetch(`${API_URL}/admin/data/schedules/template`, { headers: authHeaders() });
  if (!response.ok) throw new Error("ดาวน์โหลดแม่แบบไม่สำเร็จ");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "kinof-schedule-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function getAdminUsers() {
  return apiFetch("/super-admin/admins").then((rows) => rows.map((row) => ({
    id: row.id,
    username: row.email,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    status: row.status,
  })));
}

export function createAdminUser(payload) {
  return apiFetch("/super-admin/admins", {
    method: "POST",
    body: JSON.stringify({
      email: payload.email,
      password: payload.password,
      first_name: payload.firstName,
      last_name: payload.lastName,
      role: payload.role,
    }),
  });
}

export function updateAdminUser(id, payload) {
  return apiFetch(`/super-admin/admins/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      email: payload.email,
      first_name: payload.firstName,
      last_name: payload.lastName,
      role: payload.role,
      ...(payload.password ? { password: payload.password } : {}),
    }),
  });
}

export function disableAdminUser(id) {
  return apiFetch(`/super-admin/admins/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "inactive" }),
  });
}

export function enableAdminUser(id) {
  return apiFetch(`/super-admin/admins/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active" }),
  });
}

export function resendAdminInvite(id) {
  void id;
  return Promise.reject(new Error("ระบบนี้กำหนดรหัสผ่านตอนสร้างบัญชี จึงไม่มีลิงก์เชิญ"));
}

export function getAuditLogs({ action, page = 1, limit = 50 } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (action) params.set("action", action);
  return apiFetch("/super-admin/audit-logs").then((rows) => {
    const filtered = action ? rows.filter((row) => row.action.includes(action)) : rows;
    const start = (page - 1) * limit;
    return {
      total: filtered.length,
      items: filtered.slice(start, start + limit).map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        actor: { name: row.admin_email, username: row.admin_email },
        action: row.action,
        targetType: "ระบบ",
        targetId: "",
        detail: row.action,
      })),
    };
  });
}
