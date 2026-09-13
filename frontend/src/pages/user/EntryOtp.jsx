import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Mail, RefreshCw, ShieldAlert } from "lucide-react";
import Card from "../../components/Card";
import Button from "../../components/Button";
import { getRooms } from "../../api/bookings";
import { getActiveEntryOtp, requestEntryOtp, resendEntryOtp } from "../../api/auth";

function remainingMs(expiresAt) {
  if (!expiresAt) return 0;
  const raw = String(expiresAt);
  const parsed = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
    ? new Date(raw)
    : new Date(`${raw}Z`);
  return Math.max(0, parsed.getTime() - Date.now());
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function EntryOtp({ myBookings = [], notify }) {
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState("");
  const [active, setActive] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [quota, setQuota] = useState(null);

  const latestBookingRoomId = myBookings[0]?.roomId ?? "";

  const applyActive = useCallback((data) => {
    if (Number.isFinite(Number(data?.monthlyLimit))) {
      setQuota({
        limit: Number(data.monthlyLimit),
        used: Number(data.monthlyUsed ?? 0),
        remaining: Number(data.monthlyRemaining ?? 0),
      });
    }
    if (!data?.hasActive) {
      setActive(null);
      return;
    }
    setActive({
      expiresAt: data.expiresAt,
      roomId: data.roomId ?? null,
      roomName: data.roomName ?? null,
      maskedEmail: data.maskedEmail,
    });
    if (data.roomId) setRoomId(data.roomId);
  }, []);

  const refreshActive = useCallback(async () => {
    const data = await getActiveEntryOtp();
    applyActive(data);
    return data;
  }, [applyActive]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getRooms(), getActiveEntryOtp()])
      .then(([roomList, activeOtp]) => {
        if (cancelled) return;
        setRooms(roomList);
        applyActive(activeOtp);
        if (!activeOtp?.hasActive && latestBookingRoomId) {
          setRoomId(latestBookingRoomId);
        }
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyActive, latestBookingRoomId]);

  useEffect(() => {
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!active?.expiresAt) return undefined;
    const poll = setInterval(() => {
      refreshActive().catch(() => {});
    }, 15000);
    return () => clearInterval(poll);
  }, [active?.expiresAt, refreshActive]);

  const countdownMs = useMemo(
    () => remainingMs(active?.expiresAt),
    [active?.expiresAt, nowTick],
  );
  const hasActive = Boolean(active?.expiresAt) && countdownMs > 0;
  const quotaExhausted = quota?.remaining === 0;

  useEffect(() => {
    if (active?.expiresAt && countdownMs <= 0) {
      setActive(null);
    }
  }, [active?.expiresAt, countdownMs]);

  const selectedRoom = rooms.find((room) => room.id === roomId);

  const handleRequest = async () => {
    setError("");
    setRequesting(true);
    try {
      const result = await requestEntryOtp(roomId || null);
      applyActive({ ...result, hasActive: true });
      notify?.(result.deliveryMode === "webhook"
        ? `ส่งรหัสเข้าห้องไปที่ ${result.maskedEmail} แล้ว`
        : `รหัสทดสอบคือ ${result.developmentCode} (Production จะส่งผ่านระบบอีเมล)`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRequesting(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResending(true);
    try {
      const result = await resendEntryOtp(active?.roomId || roomId || null);
      applyActive({ ...result, hasActive: true });
      notify?.(result.deliveryMode === "webhook"
        ? `ส่งรหัสใหม่ไปที่ ${result.maskedEmail} แล้ว`
        : `รหัสทดสอบใหม่คือ ${result.developmentCode}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-ink tracking-tight">รหัสเข้าห้องสำรอง</h1>
        <p className="text-caption mt-0.5">ขอ OTP ทางอีเมลก่อนไปแล็บ ใช้เมื่อสแกนหน้าไม่สำเร็จที่ Kiosk</p>
      </div>

      <Card className="p-5 md:p-6 mb-5 border-amber-200/80 bg-amber-50/40">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <ShieldAlert size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink">ใช้เมื่อสแกนหน้าไม่สำเร็จที่ Kiosk เท่านั้น</div>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              รหัส 6 หลักใช้ได้ 10 นาที และใช้ได้ครั้งเดียว ไม่ต้องขอทุกครั้งถ้าสแกนหน้าผ่าน
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-5 md:p-6 space-y-5">
        {loading ? (
          <p className="text-sm text-muted">กำลังโหลดข้อมูลห้องและรหัสที่ยังใช้ได้...</p>
        ) : (
          <>
            {quota && (
              <div className={`rounded-xl border px-4 py-3 text-xs ${quotaExhausted ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                เดือนนี้ใช้ OTP สำรองแล้ว <strong>{quota.used} / {quota.limit}</strong> ครั้ง
                {quotaExhausted ? " — ใช้สิทธิ์ครบแล้ว" : ` — เหลือ ${quota.remaining} ครั้ง`}
              </div>
            )}

            <label className="block">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">เลือกห้องแล็บ</span>
              <select
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy-800/20 focus:border-navy-800"
              >
                <option value="">ไม่ระบุห้อง (ใช้เป็นรหัสสำรองทั่วไป)</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}{room.building ? ` · ${room.building}` : ""}
                  </option>
                ))}
              </select>
              {latestBookingRoomId && roomId === latestBookingRoomId && (
                <p className="text-caption mt-1.5">เลือกห้องจากการจองล่าสุดให้อัตโนมัติแล้ว</p>
              )}
            </label>

            {error && (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3" role="alert">
                {error}
              </div>
            )}

            {hasActive ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                  <Mail size={14} />
                  <span>รหัสถูกส่งแล้ว</span>
                </div>
                <p className="text-sm text-slate-700">
                  ส่งไปที่อีเมล <strong>{active.maskedEmail}</strong>
                  {active.roomName ? <> สำหรับห้อง <strong>{active.roomName}</strong></> : selectedRoom ? <> สำหรับห้อง <strong>{selectedRoom.name}</strong></> : " (ไม่ระบุห้อง)"}
                </p>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wider">หมดอายุใน</div>
                    <div className="text-2xl font-bold tabular-nums text-navy-900">{formatCountdown(countdownMs)}</div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={RefreshCw}
                    iconPosition="left"
                    disabled={resending || quotaExhausted}
                    onClick={handleResend}
                  >
                    {resending ? "กำลังส่งใหม่..." : "ส่งใหม่"}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">รหัสจริงอยู่ที่อีเมลหรือหน้าต่าง backend — หน้าเว็บไม่แสดงรหัส</p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={requesting || quotaExhausted}
                  onClick={handleRequest}
                >
                  {requesting ? "กำลังขอรหัสใหม่..." : "ขอรหัสใหม่สำหรับห้องที่เลือก"}
                </Button>
              </div>
            ) : (
              <Button
                variant="primary"
                icon={KeyRound}
                iconPosition="left"
                disabled={requesting || quotaExhausted}
                onClick={handleRequest}
              >
                {requesting ? "กำลังขอรหัส..." : "ขอรหัสเข้าห้อง"}
              </Button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
