import { API_URL, apiFetch, readStoredAuth } from "./auth";

export function bangkokDate(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export async function getTrackingSummary() {
  const summary = await apiFetch("/admin/tracking/summary");
  return {
    activeUsers: Number(summary.active_users || 0),
    machinesReady: Number(summary.available || 0),
    machinesTotal: Number(summary.machines_total || 0),
    websitesToday: Number(summary.websites_today || 0),
    flaggedCount: Number(summary.flagged_count || 0),
  };
}

export async function getTrackingRooms() {
  const rooms = await apiFetch("/admin/tracking/rooms");
  return rooms.map((room) => ({
    id: room.room_id,
    name: room.room_name,
    status: room.status === "active" ? "open" : room.status,
    seatCount: Number(room.machine_count || 0),
    agentOnlineCount: Number(room.agent_online_count || 0),
    activeUserCount: Number(room.active_user_count || 0),
  }));
}

export async function getTrackingSeats(roomId) {
  const rows = await apiFetch(`/admin/tracking/computers?room_id=${encodeURIComponent(roomId)}`);
  return rows.map((row) => ({
    id: row.computer_id,
    label: row.machine_no,
    status: row.display_status,
    computerName: row.hostname,
    lastHeartbeat: row.last_seen_at,
    agentRegistered: Boolean(row.agent_id),
    agentOnline: Boolean(row.agent_id) && row.display_status !== "offline",
    session: row.session_id ? {
      id: row.session_id,
      startedAt: row.login_time,
      user: {
        id: row.user_id,
        username: row.username,
        displayName: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.username,
        userType: row.role,
      },
    } : null,
  }));
}

export async function getTrackingActivity({ roomId = "all", date = "all", type } = {}) {
  const rows = await apiFetch("/admin/tracking/activity?limit=500");
  return rows
    .filter((row) => roomId === "all" || Number(row.room_id) === Number(roomId))
    .filter((row) => date === "all" || bangkokDateOf(row.occurred_at) === date)
    .filter((row) => {
      if (type === "flagged") return row.risk_level !== "none";
      return !type || row.event_type === type;
    })
    .map(toActivity);
}

export async function getSeatActivity(seatId, limit = 50) {
  const fetchLimit = Math.min(Math.max(limit * 10, 50), 500);
  const rows = await apiFetch(`/admin/tracking/activity?limit=${fetchLimit}`);
  return rows.filter((row) => row.computer_id === seatId).slice(0, limit).map(toActivity);
}

function toActivity(row) {
  return {
    ...row,
    at: row.occurred_at,
    roomId: row.room_id,
    roomName: row.room_name,
    seatId: row.computer_id,
    seatLabel: row.machine_no,
    website: row.event_type === "website" ? row.domain : null,
    activity: row.domain || row.name || row.event_type,
    durationMinutes: row.duration_minutes,
    suspicious: row.risk_level !== "none",
    blocked: Boolean(row.was_blocked),
    user: row.user_id ? { id: row.user_id, username: row.username, displayName: row.username } : null,
  };
}

function bangkokDateOf(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}

export function updateRoomStatus(roomId, status) {
  return apiFetch(`/admin/tracking/rooms/${roomId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status: status === "open" ? "active" : status }),
  });
}

export function bulkRoomAction(roomId, action) {
  const status = action === "open" ? "active" : action === "close" ? "closed" : "maintenance";
  return updateRoomStatus(roomId, status);
}

export function forceSeatLogout(seatId) {
  return apiFetch(`/admin/tracking/computers/${seatId}/commands`, {
    method: "POST",
    body: JSON.stringify({ command_type: "logout" }),
  });
}

export async function getWebsiteBlacklist() {
  const rows = await apiFetch("/admin/blocked-domains");
  return rows.map((row) => ({ ...row, domain: row.domain_name }));
}
export function addWebsiteBlacklist({ domain, category, reason } = {}) {
  return apiFetch("/admin/blocked-domains", {
    method: "POST",
    body: JSON.stringify({ domain_name: domain, category, reason, action: "block" }),
  });
}
export function removeWebsiteBlacklist(id) {
  return apiFetch(`/admin/blocked-domains/${id}`, { method: "DELETE" });
}
export function getTrackingAgents() { return apiFetch("/admin/tracking/agents"); }
export function createTrackingAgent(seatId) {
  return apiFetch("/admin/tracking/agents", {
    method: "POST",
    body: JSON.stringify({ computer_id: seatId }),
  });
}

export async function exportTrackingReport({ report, roomId, from, to }) {
  const params = new URLSearchParams({ report });
  if (roomId && roomId !== "all") params.set("room_id", roomId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const auth = readStoredAuth();
  const response = await fetch(`${API_URL}/admin/tracking/export?${params}`, {
    headers: auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {},
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "ส่งออกรายงานไม่สำเร็จ");
  }
  const disposition = response.headers.get("Content-Disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1]
    || `kinof-${report}.csv`;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return filename;
}
