import { API_URL } from "./auth";

// The Kiosk stands in front of the lab door with no logged-in user, so these calls
// deliberately skip apiFetch and never send an Authorization header.

export async function getKioskRoom(roomId) {
  const response = await fetch(`${API_URL}/kiosk/rooms/${roomId}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message ?? "ไม่สามารถโหลดข้อมูลห้องได้");
  }
  return {
    ...data,
    status: data.status === "active" ? "open" : data.status,
  };
}

export async function verifyKioskOtp(roomId, code) {
  return postEntry("verify-otp", { roomId, code });
}

// The face path answers with the same shape as verify-otp plus `suggestOtp`, which tells
// the Kiosk whether another scan can help or the user should fall back to the web code.
export async function verifyKioskFace(roomId, imageBase64) {
  return postEntry("verify-face", { roomId, imageBase64 });
}

async function postEntry(path, body) {
  const response = await fetch(`${API_URL}/kiosk/entry/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  // Denied results (including rate limiting) carry granted:false and are shown on
  // screen instead of being thrown as connection errors.
  if (typeof data.granted === "boolean") {
    return data;
  }
  throw new Error(data.message ?? "ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่");
}
