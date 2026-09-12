export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

function readStoredAuth() {
  try {
    return JSON.parse(sessionStorage.getItem("kinofAuth"));
  } catch {
    return null;
  }
}

function storeAuth(auth) {
  sessionStorage.setItem("kinofAuth", JSON.stringify(auth));
}

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message ?? "ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return parseResponse(response);
}

async function get(path, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, { headers });
  return parseResponse(response);
}

export async function apiFetch(path, options = {}) {
  const auth = readStoredAuth();
  const headers = {
    ...(options.headers ?? {}),
  };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (auth?.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  }

  let response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && auth?.refreshToken) {
    try {
      const refreshed = await post("/auth/refresh", { refreshToken: auth.refreshToken });
      const nextAuth = {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        user: {
          ...refreshed.user,
          userType: refreshed.user.role,
          faceEnrolled: refreshed.user.face_enrolled ?? false,
        },
      };
      storeAuth(nextAuth);
      headers.Authorization = `Bearer ${nextAuth.accessToken}`;
      response = await fetch(`${API_URL}${path}`, { ...options, headers });
    } catch {
      sessionStorage.removeItem("kinofAuth");
      throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
    }
  }

  return parseResponse(response);
}

export async function login(username, password, expectedRole) {
  if (expectedRole === "admin") {
    const result = await post("/auth/admin/login", { identifier: username, password });
    return {
      accessToken: result.access_token,
      refreshToken: null,
      user: { ...result.admin, userType: result.admin.role, faceEnrolled: true },
    };
  }
  try {
    const result = await post("/auth/login", { identifier: username, password });
    return normalizeUserLogin(result);
  } catch (error) {
    if (error.status !== 401 || expectedRole === "user") throw error;
    const result = await post("/auth/admin/login", { identifier: username, password });
    return {
      accessToken: result.access_token,
      refreshToken: null,
      user: { ...result.admin, userType: result.admin.role, faceEnrolled: true },
    };
  }
}

function normalizeUserLogin(result) {
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    user: {
      ...result.user,
      userType: result.user.role,
      faceEnrolled: result.user.face_enrolled ?? false,
    },
  };
}

export function register(details) {
  return post("/users", {
    email: details.email,
    username: details.username,
    password: details.password,
    first_name: details.firstName,
    last_name: details.lastName,
    phone: details.phone || undefined,
    role: details.userType,
  }).then(() => login(details.username, details.password, "user"));
}

export function refreshToken(refreshTokenValue) {
  return post("/auth/refresh", { refreshToken: refreshTokenValue });
}

export function logout() {
  const auth = readStoredAuth();
  if (!auth?.refreshToken) return Promise.resolve();
  return post("/auth/logout", { refreshToken: auth.refreshToken });
}

export function forgotPassword(email) {
  return post("/auth/forgot-password", { email });
}

export function resetPassword(token, newPassword) {
  return post("/auth/reset-password", { token, newPassword });
}

export function getMe() {
  const auth = readStoredAuth();
  const isAdmin = auth?.user?.userType === "admin" || auth?.user?.userType === "super_admin";
  return apiFetch(isAdmin ? "/auth/admin/me" : "/auth/me").then((user) => ({
    ...user,
    firstName: user.first_name,
    lastName: user.last_name,
    userType: user.role,
    faceEnrolled: isAdmin ? true : Boolean(user.faceEnrolled),
  }));
}

export function getMyProfileStats() {
  return apiFetch("/users/me/stats").then((result) => ({
    usageScore: Number(result.usage_score || 0),
    bookingCount: Number(result.booking_count || 0),
    totalUsageMinutes: Number(result.total_usage_minutes || 0),
    penalties: (result.penalties || []).map((item) => ({
      id: item.id,
      points: Number(item.points),
      reason: item.reason,
      createdAt: item.created_at,
    })),
  }));
}

export function registerFace(imageBase64) {
  return apiFetch("/auth/register/face", {
    method: "POST",
    body: JSON.stringify({ imageBase64 }),
  });
}

export function requestEntryOtp(roomId) {
  return apiFetch("/entry/otp/request", {
    method: "POST",
    body: JSON.stringify({ roomId: roomId ? Number(roomId) : undefined }),
  });
}

export function resendEntryOtp(roomId) {
  return apiFetch("/entry/otp/resend", {
    method: "POST",
    body: JSON.stringify({ roomId: roomId ? Number(roomId) : undefined }),
  });
}

export function getActiveEntryOtp() {
  return apiFetch("/entry/otp/active").then((result) => ({
    ...result,
    hasActive: result.active,
  }));
}

export { readStoredAuth, storeAuth };
