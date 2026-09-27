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
    agentId: row.agent_id ? Number(row.agent_id) : null,
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
  const params = new URLSearchParams({ limit: "500" });
  if (roomId !== "all") params.set("room_id", roomId);
  if (date !== "all") params.set("date", date);
  if (type) params.set("type", type);
  const rows = await apiFetch(`/admin/tracking/activity?${params}`);
  return rows.map(toActivity);
}

export async function getSeatActivity(seatId, limit = 50) {
  const rows = await apiFetch(`/admin/tracking/computers/${encodeURIComponent(seatId)}/activity?limit=${limit}`);
  return rows.map(toActivity);
}

function toActivity(row) {
  return {
    ...row,
    at: row.occurred_at,
    userId: row.user_id,
    program: row.event_type === "program" ? row.name : null,
    activityType: row.event_type,
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

export function updateRoomStatus(roomId, status) {
  return apiFetch(`/admin/tracking/rooms/${roomId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status: status === "open" ? "active" : status }),
  });
}

export function bulkRoomAction(roomId, action) {
  return apiFetch(`/admin/tracking/rooms/${roomId}/bulk-action`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
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
export function rotateTrackingAgentKey(agentId) {
  return apiFetch(`/admin/tracking/agents/${encodeURIComponent(agentId)}/rotate-key`, {
    method: "POST",
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

export function getWebsiteBlacklistCategories() {
  return apiFetch("/lab/admin/website-blacklist/categories");
}

export function importWebsiteBlacklistCategory({ category, limit } = {}) {
  return apiFetch("/lab/admin/website-blacklist/import", {
    method: "POST",
    body: JSON.stringify({ category, limit }),
  });
}

export function removeWebsiteBlacklistCategory(category) {
  return apiFetch(`/lab/admin/website-blacklist/categories/${encodeURIComponent(category)}`, {
    method: "DELETE",
  });
}

export function getProgramBlacklist() {
  return apiFetch("/lab/admin/program-blacklist");
}

export function addProgramBlacklist({ processName, category, reason } = {}) {
  return apiFetch("/lab/admin/program-blacklist", {
    method: "POST",
    body: JSON.stringify({ processName, category, reason }),
  });
}

export function removeProgramBlacklist(id) {
  return apiFetch(`/lab/admin/program-blacklist/${id}`, { method: "DELETE" });
}

export function getProgramAllowlist() {
  return apiFetch("/lab/admin/program-allowlist");
}

export function addProgramAllowlist({ processName, displayName, category } = {}) {
  return apiFetch("/lab/admin/program-allowlist", {
    method: "POST",
    body: JSON.stringify({ processName, displayName, category }),
  });
}

export function removeProgramAllowlist(id) {
  return apiFetch(`/lab/admin/program-allowlist/${id}`, { method: "DELETE" });
}

export function getUnknownPrograms({ roomId, date } = {}) {
  const params = new URLSearchParams();
  if (roomId && roomId !== "all") params.set("roomId", roomId);
  if (date) params.set("date", date);
  const query = params.toString();
  return apiFetch(`/lab/admin/unknown-programs${query ? `?${query}` : ""}`);
}

export function getBehaviorReviews({ roomId } = {}) {
  const params = new URLSearchParams();
  if (roomId && roomId !== "all") params.set("roomId", roomId);
  const query = params.toString();
  return apiFetch(`/lab/admin/behavior/reviews${query ? `?${query}` : ""}`).then((data) => {
    if (Array.isArray(data)) return { items: data, handledKeys: [], clearedKeys: [] };
    return {
      items: data?.items ?? [],
      handledKeys: data?.handledKeys ?? [],
      clearedKeys: data?.clearedKeys ?? [],
    };
  });
}

export function clearBehaviorReview(reviewId) {
  return apiFetch(`/lab/admin/behavior/reviews/${reviewId}/clear`, { method: "POST" });
}

export function penalizeBehaviorReview(reviewId) {
  return apiFetch(`/lab/admin/behavior/reviews/${reviewId}/penalize`, { method: "POST" });
}

export function blockFlaggedActivity(body) {
  return apiFetch("/lab/admin/behavior/block", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function clearFlaggedActivity(body) {
  return apiFetch("/lab/admin/behavior/clear", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
