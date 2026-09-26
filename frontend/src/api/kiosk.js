import { API_URL } from "./auth";

export const KIOSK_KEY_HEADER = "X-Kiosk-Key";
const STORAGE_PREFIX = "kinofKioskKey:";

export function kioskKeyStorageId(roomId) {
  return `${STORAGE_PREFIX}${roomId}`;
}

export function readKioskKey(roomId) {
  if (!roomId) return "";
  try {
    return localStorage.getItem(kioskKeyStorageId(roomId))?.trim() ?? "";
  } catch {
    return "";
  }
}

export function writeKioskKey(roomId, apiKey) {
  const key = apiKey?.trim() ?? "";
  if (!roomId || !key) return;
  localStorage.setItem(kioskKeyStorageId(roomId), key);
}

export function clearKioskKey(roomId) {
  if (!roomId) return;
  localStorage.removeItem(kioskKeyStorageId(roomId));
}

export class KioskAuthError extends Error {
  constructor(message) {
    super(message || "คีย์เครื่อง Kiosk ไม่ถูกต้อง");
    this.name = "KioskAuthError";
    this.status = 401;
  }
}

// Staff can provision a door PC once with ?key=... (saved to this browser's
// localStorage) or reopen setup with ?setup=1. Both query flags are stripped
// so the public scan screen never shows the key.
export function consumeKioskProvisionParams() {
  const url = new URL(window.location.href);
  const key = url.searchParams.get("key")?.trim() ?? "";
  const setup = url.searchParams.get("setup") === "1";
  if (key || setup) {
    url.searchParams.delete("key");
    url.searchParams.delete("setup");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return { key, setup };
}

function kioskHeaders(apiKey, json = false) {
  const headers = { [KIOSK_KEY_HEADER]: apiKey };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

export async function getKioskRoom(roomId, apiKey) {
  const response = await fetch(`${API_URL}/kiosk/rooms/${roomId}`, {
    headers: kioskHeaders(apiKey),
  });
  const data = await readJson(response);
  if (response.status === 401) {
    throw new KioskAuthError(data.message);
  }
  if (!response.ok) {
    throw new Error(data.message ?? "ไม่สามารถโหลดข้อมูลห้องได้");
  }
  return { ...data, status: data.status === "active" ? "open" : data.status };
}

export async function verifyKioskOtp(roomId, code, apiKey) {
  return postEntry("verify-otp", { roomId, code }, apiKey);
}

// The face path answers with the same shape as verify-otp plus `suggestOtp`, which tells
// the Kiosk whether another scan can help or the user should fall back to the emergency
// entry OTP. Neither path assigns a seat.
export async function verifyKioskFace(roomId, imageBase64, apiKey) {
  return postEntry("verify-face", { roomId, imageBase64 }, apiKey);
}

async function postEntry(path, body, apiKey) {
  const response = await fetch(`${API_URL}/kiosk/entry/${path}`, {
    method: "POST",
    headers: kioskHeaders(apiKey, true),
    body: JSON.stringify(body),
  });
  const data = await readJson(response);
  if (response.status === 401) {
    throw new KioskAuthError(data.message);
  }
  // Denied results (including rate limiting) carry granted:false and are shown on
  // screen instead of being thrown as connection errors.
  if (typeof data.granted === "boolean") {
    return data;
  }
  throw new Error(data.message ?? "ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่");
}
