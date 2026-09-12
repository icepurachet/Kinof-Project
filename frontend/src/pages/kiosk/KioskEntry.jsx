import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Armchair,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Delete,
  DoorOpen,
  KeyRound,
  Loader2,
  Monitor,
  RefreshCw,
  ScanFace,
  XCircle,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { getKioskRoom, verifyKioskFace, verifyKioskOtp } from "../../api/kiosk";
import { useFaceCapture } from "../../hooks/useFaceCapture";

const SUCCESS_RESET_SECONDS = 30;
const DENIED_RESET_SECONDS = 20;

// docs/AUTH_ADAPTIVE.md — ลองสแกนหน้าได้ 3 ครั้ง แล้วส่งไปทาง Entry OTP
const MAX_FACE_ATTEMPTS = 3;
const FACE_HOLD_MS = 1500;

const TIME_FORMAT = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const DATE_FORMAT = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const ROOM_STATUS = {
  open: { label: "เปิดให้บริการ", tone: "text-emerald-300 bg-emerald-500/15 border-emerald-400/30" },
  closed: { label: "ปิดให้บริการ", tone: "text-rose-300 bg-rose-500/15 border-rose-400/30" },
  maintenance: { label: "ปิดปรับปรุง", tone: "text-amber-300 bg-amber-500/15 border-amber-400/30" },
};

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export default function KioskEntry() {
  const { roomId } = useParams();
  const [room, setRoom] = useState(null);
  const [roomError, setRoomError] = useState("");
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [step, setStep] = useState("welcome");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [entry, setEntry] = useState(null);
  const [deniedMessage, setDeniedMessage] = useState("");
  const [faceNotice, setFaceNotice] = useState("");
  const [otpNotice, setOtpNotice] = useState("");
  const [faceFailCount, setFaceFailCount] = useState(0);
  const [resetIn, setResetIn] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const submittingRef = useRef(false);
  const codeRef = useRef("");
  const faceFailCountRef = useRef(0);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    faceFailCountRef.current = faceFailCount;
  }, [faceFailCount]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingRoom(true);
    getKioskRoom(roomId)
      .then((data) => {
        if (!cancelled) setRoom(data);
      })
      .catch((error) => {
        if (!cancelled) setRoomError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingRoom(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const backToWelcome = useCallback(() => {
    setStep("welcome");
    setCode("");
    setEntry(null);
    setDeniedMessage("");
    setFaceNotice("");
    setOtpNotice("");
    setFaceFailCount(0);
    setResetIn(0);
  }, []);

  const goToOtp = useCallback((notice = "") => {
    setCode("");
    setFaceNotice("");
    setOtpNotice(notice);
    setDeniedMessage("");
    setResetIn(0);
    setStep("otp");
  }, []);

  const submit = useCallback(async (value) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await verifyKioskOtp(roomId, value);
      if (result.granted) {
        setEntry(result);
        setStep("success");
        setResetIn(SUCCESS_RESET_SECONDS);
      } else {
        setDeniedMessage(result.message ?? "ไม่สามารถเข้าใช้ห้องนี้ได้");
        setStep("denied");
        setResetIn(DENIED_RESET_SECONDS);
      }
    } catch (error) {
      setDeniedMessage(error.message);
      setStep("denied");
      setResetIn(DENIED_RESET_SECONDS);
    } finally {
      setCode("");
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [roomId]);

  const submitFace = useCallback(async (imageBase64) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await verifyKioskFace(roomId, imageBase64);
      if (result.granted) {
        setFaceFailCount(0);
        setFaceNotice("");
        setEntry(result);
        setStep("success");
        setResetIn(SUCCESS_RESET_SECONDS);
        return;
      }

      const message = result.message ?? "สแกนใบหน้าไม่สำเร็จ";
      // Recognised but not entitled to this room: an OTP would hit the same check, so
      // this is a final answer rather than a scan to retry.
      if (result.identified) {
        setDeniedMessage(message);
        setStep("denied");
        setResetIn(DENIED_RESET_SECONDS);
        return;
      }

      // An unusable frame (no face / more than one face) is not a failed identification,
      // so it does not burn one of the three attempts.
      if (!result.suggestOtp) {
        setFaceNotice(message);
        return;
      }

      const attempts = faceFailCountRef.current + 1;
      setFaceFailCount(attempts);
      if (attempts >= MAX_FACE_ATTEMPTS) {
        goToOtp(`${message} — สแกนไม่ผ่าน ${attempts} ครั้ง กรุณาใช้รหัสจากเว็บ`);
      } else {
        setFaceNotice(message);
      }
    } catch (error) {
      setFaceFailCount((current) => current + 1);
      setFaceNotice(error.message);
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [goToOtp, roomId]);

  // Physical keypads and USB numpads are common on Kiosk hardware, so the on-screen
  // keys and the keyboard drive the same state.
  useEffect(() => {
    if (step !== "otp") return undefined;
    const onKeyDown = (event) => {
      if (/^\d$/.test(event.key)) {
        setCode((current) => (current.length >= 6 ? current : current + event.key));
      } else if (event.key === "Backspace") {
        setCode((current) => current.slice(0, -1));
      } else if (event.key === "Enter") {
        if (codeRef.current.length === 6) submit(codeRef.current);
      } else if (event.key === "Escape") {
        backToWelcome();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [backToWelcome, step, submit]);

  useEffect(() => {
    if (resetIn <= 0) return undefined;
    const timer = setTimeout(() => {
      if (resetIn === 1) backToWelcome();
      else setResetIn(resetIn - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [backToWelcome, resetIn]);

  const status = ROOM_STATUS[room?.status] ?? ROOM_STATUS.closed;
  const roomOpen = room?.status === "open";
  const clock = useMemo(() => TIME_FORMAT.format(now), [now]);
  const today = useMemo(() => DATE_FORMAT.format(now), [now]);

  return (
    <div className="min-h-screen w-full text-white flex flex-col bg-[radial-gradient(circle_at_20%_10%,#1E45B8_0%,#0B173D_55%,#050B22_100%)]">
      <header className="flex items-center justify-between px-8 py-6 md:px-14 md:py-8">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gold-gradient text-navy-950 flex items-center justify-center">
            <DoorOpen size={22} />
          </div>
          <div>
            <div className="text-lg md:text-xl font-bold tracking-tight">KINOF</div>
            <div className="text-xs md:text-sm text-white/60">จุดเข้าใช้ห้องแล็บ</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl md:text-5xl font-bold tabular-nums">{clock}</div>
          <div className="text-xs md:text-sm text-white/60 mt-1">{today}</div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-10 md:px-14">
        {loadingRoom ? (
          <p className="text-lg text-white/70">กำลังโหลดข้อมูลห้อง...</p>
        ) : roomError ? (
          <KioskPanel>
            <XCircle size={72} className="text-rose-400 mx-auto" />
            <h1 className="text-3xl md:text-4xl font-bold mt-6">ไม่พบห้องแล็บนี้</h1>
            <p className="text-base md:text-lg text-white/70 mt-3">{roomError}</p>
            <p className="text-sm text-white/45 mt-6">กรุณาแจ้งผู้ดูแลระบบเพื่อตั้งค่าเครื่อง Kiosk ใหม่</p>
          </KioskPanel>
        ) : step === "welcome" ? (
          <KioskPanel>
            <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold ${status.tone}`}>
              {status.label}
            </span>
            <h1 className="text-4xl md:text-6xl font-bold mt-6 tracking-tight">{room.name}</h1>
            {room.building && <p className="text-lg md:text-2xl text-white/60 mt-2">{room.building}</p>}
            <p className="text-base md:text-xl text-white/75 mt-8">
              {roomOpen ? "แตะเพื่อเริ่มเข้าใช้ห้อง" : "ห้องนี้ยังไม่เปิดให้เข้าใช้งานในขณะนี้"}
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <button
                type="button"
                disabled={!roomOpen}
                onClick={() => {
                  setFaceNotice("");
                  setFaceFailCount(0);
                  setStep("face");
                }}
                className="rounded-3xl border border-white/15 bg-white/[0.07] px-8 py-8 text-left transition-all hover:bg-white/15 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                <ScanFace size={40} className="text-white/80" />
                <div className="text-xl md:text-2xl font-bold mt-4">สแกนใบหน้า</div>
                <div className="text-sm md:text-base text-white/60 mt-1">มองกล้องค้างไว้ ระบบจับภาพเอง</div>
              </button>

              <button
                type="button"
                disabled={!roomOpen}
                onClick={() => goToOtp()}
                className="rounded-3xl border border-gold-500/40 bg-gold-500/15 px-8 py-8 text-left transition-all hover:bg-gold-500/25 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                <KeyRound size={40} className="text-gold-400" />
                <div className="text-xl md:text-2xl font-bold mt-4">ใช้รหัสจากเว็บ</div>
                <div className="text-sm md:text-base text-white/70 mt-1">กรอกรหัส 6 หลักที่ขอไว้</div>
              </button>
            </div>
          </KioskPanel>
        ) : step === "face" ? (
          <KioskFaceScan
            room={room}
            notice={faceNotice}
            attempts={faceFailCount}
            submitting={submitting}
            onCaptured={submitFace}
            onClearNotice={() => setFaceNotice("")}
            onUseOtp={() => goToOtp()}
            onCancel={backToWelcome}
          />
        ) : step === "otp" ? (
          <KioskPanel>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">กรอกรหัสที่ขอจากเว็บ KINOF</h1>
            <p className="text-base md:text-lg text-white/65 mt-3">
              {room.name} · รหัส 6 หลัก ใช้ได้ครั้งเดียวภายใน 10 นาที
            </p>
            {otpNotice && (
              <p
                className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-500/15 px-6 py-4 text-base md:text-lg text-amber-100"
                role="status"
              >
                {otpNotice}
              </p>
            )}

            <div className="flex justify-center gap-3 md:gap-4 mt-9" aria-label="รหัสเข้าห้อง 6 หลัก">
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className={`w-14 h-20 md:w-20 md:h-28 rounded-2xl border-2 flex items-center justify-center text-3xl md:text-5xl font-bold tabular-nums transition-colors ${
                    code.length === index
                      ? "border-gold-400 bg-white/10"
                      : "border-white/15 bg-white/5"
                  }`}
                >
                  {code[index] ?? ""}
                </div>
              ))}
            </div>

            <div className="mt-9 grid grid-cols-3 gap-3 md:gap-4 max-w-md mx-auto">
              {KEYPAD.map((digit) => (
                <KeypadKey
                  key={digit}
                  disabled={submitting || code.length >= 6}
                  onClick={() => setCode((current) => current + digit)}
                >
                  {digit}
                </KeypadKey>
              ))}
              <KeypadKey disabled={submitting || code.length === 0} onClick={() => setCode("")}>
                <span className="text-lg md:text-xl">ล้าง</span>
              </KeypadKey>
              <KeypadKey disabled={submitting || code.length >= 6} onClick={() => setCode((current) => current + "0")}>
                0
              </KeypadKey>
              <KeypadKey
                label="ลบตัวเลขล่าสุด"
                disabled={submitting || code.length === 0}
                onClick={() => setCode((current) => current.slice(0, -1))}
              >
                <Delete size={28} className="mx-auto" />
              </KeypadKey>
            </div>

            <div className="mt-9 flex flex-col md:flex-row-reverse items-stretch md:items-center justify-center gap-3">
              <button
                type="button"
                disabled={code.length !== 6 || submitting}
                onClick={() => submit(code)}
                className="rounded-2xl bg-gold-gradient text-navy-950 px-10 py-5 text-xl font-bold transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100"
              >
                {submitting ? "กำลังตรวจสอบ..." : "ยืนยันรหัส"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={backToWelcome}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-8 py-5 text-lg text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                <ArrowLeft size={20} /> ยกเลิก
              </button>
            </div>

            <p className="text-sm text-white/45 mt-6">
              ยังไม่มีรหัส? เปิดเว็บ KINOF บนมือถือ แล้วเลือก &quot;รหัสเข้าห้อง&quot;
            </p>
          </KioskPanel>
        ) : step === "success" ? (
          <KioskPanel>
            <CheckCircle2 size={80} className="text-emerald-400 mx-auto" />
            <h1 className="text-4xl md:text-5xl font-bold mt-6 tracking-tight">เข้าใช้ห้องได้</h1>
            <p className="text-xl md:text-2xl text-white/80 mt-3">
              {entry.user?.displayName} · {entry.room?.name}
            </p>

            <div className="mt-9 rounded-3xl border border-emerald-400/30 bg-emerald-500/10 px-8 py-10">
              <div className="flex items-center justify-center gap-2 text-emerald-200 text-sm md:text-base uppercase tracking-widest">
                <Armchair size={18} /> ที่นั่งของคุณ
              </div>
              <div className="text-6xl md:text-8xl font-bold mt-4 tabular-nums">{entry.seatLabel}</div>
              {entry.computerName && (
                <div className="flex items-center justify-center gap-2 text-white/60 text-base md:text-lg mt-4">
                  <Monitor size={18} /> {entry.computerName}
                </div>
              )}
            </div>

            <p className="text-base text-white/60 mt-8">
              กรุณาไปที่เครื่องตามหมายเลข · หน้าจอจะกลับหน้าแรกใน {resetIn} วินาที
            </p>
            <button
              type="button"
              onClick={backToWelcome}
              className="mt-5 rounded-2xl border border-white/15 px-8 py-4 text-lg text-white/80 transition-colors hover:bg-white/10"
            >
              เสร็จสิ้น
            </button>
          </KioskPanel>
        ) : (
          <KioskPanel>
            <XCircle size={80} className="text-rose-400 mx-auto" />
            <h1 className="text-4xl md:text-5xl font-bold mt-6 tracking-tight">เข้าใช้ห้องไม่ได้</h1>
            <p className="text-xl md:text-2xl text-white/80 mt-4">{deniedMessage}</p>
            <p className="text-base text-white/50 mt-6">
              หากต้องการความช่วยเหลือ กรุณาติดต่อผู้ดูแลห้องแล็บ · กลับหน้าแรกใน {resetIn} วินาที
            </p>
            <div className="mt-8 flex flex-col md:flex-row items-stretch md:items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => goToOtp()}
                className="rounded-2xl bg-gold-gradient text-navy-950 px-10 py-5 text-xl font-bold transition-all active:scale-95"
              >
                กรอกรหัสอีกครั้ง
              </button>
              <button
                type="button"
                onClick={backToWelcome}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-8 py-5 text-lg text-white/80 transition-colors hover:bg-white/10"
              >
                <ArrowLeft size={20} /> กลับหน้าแรก
              </button>
            </div>
          </KioskPanel>
        )}
      </main>
    </div>
  );
}

/**
 * Kiosk face scan. A blink challenge is required before sending the frame. This is
 * stronger than a still-image check, but is not a replacement for server-side PAD.
 */
function KioskFaceScan({
  room,
  notice,
  attempts,
  submitting,
  onCaptured,
  onClearNotice,
  onUseOtp,
  onCancel,
}) {
  const handleError = useCallback(() => {}, []);
  const { videoRef, status, hint, progress, retry, stopCamera, captureNow } = useFaceCapture({
    onCaptured,
    onError: handleError,
    requireBlink: true,
    holdMs: FACE_HOLD_MS,
    capturingHint: "กำลังตรวจสอบใบหน้า...",
  });

  const busy = submitting;
  const scanAgain = () => {
    onClearNotice();
    retry();
  };

  return (
    <KioskPanel>
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">สแกนใบหน้าเพื่อเข้าใช้ห้อง</h1>
      <p className="text-base md:text-lg text-white/65 mt-3">
        {room.name} · มองกล้องตรง ๆ ค้างไว้ครู่เดียว
      </p>

      <div className="relative mx-auto mt-8 w-full max-w-xl aspect-[4/3] overflow-hidden rounded-3xl bg-black">
        <video ref={videoRef} className="h-full w-full object-cover scale-x-[-1]" playsInline muted />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={`h-[70%] w-[48%] rounded-[50%] border-4 transition-colors ${
              progress >= 60 ? "border-emerald-400" : "border-gold-400/70"
            }`}
          />
        </div>
        {(status === "loading" || busy) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            <Loader2 size={44} className="animate-spin text-white" />
          </div>
        )}
      </div>

      <div className="mx-auto mt-6 h-2.5 w-full max-w-xl overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-gold-gradient transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-4 min-h-[1.75rem] text-lg md:text-xl text-white/80" aria-live="polite">
        {busy
          ? "กำลังตรวจสอบใบหน้า..."
          : notice
            ? "กดปุ่ม \"สแกนใหม่\" เพื่อลองอีกครั้ง"
            : hint}
      </p>

      {notice && (
        <p
          className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-6 py-4 text-base md:text-lg text-rose-100"
          role="alert"
        >
          {notice}
        </p>
      )}
      {attempts > 0 && (
        <p className="mt-3 text-sm md:text-base text-white/50">
          สแกนไม่ผ่าน {attempts} / {MAX_FACE_ATTEMPTS} ครั้ง
        </p>
      )}

      <div className="mt-8 flex flex-col md:flex-row items-stretch md:items-center justify-center gap-3">
        {status === "scanning" && !busy ? (
          <button
            type="button"
            onClick={captureNow}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gold-gradient text-navy-950 px-10 py-5 text-xl font-bold transition-all active:scale-95"
          >
            <Camera size={22} /> ถ่ายภาพเลย
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={scanAgain}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gold-gradient text-navy-950 px-10 py-5 text-xl font-bold transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100"
          >
            <RefreshCw size={22} /> สแกนใหม่
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            stopCamera();
            onUseOtp();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-8 py-5 text-lg text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <KeyRound size={20} /> ใช้รหัสจากเว็บ
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            stopCamera();
            onCancel();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-8 py-5 text-lg text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <ArrowLeft size={20} /> ยกเลิก
        </button>
      </div>
    </KioskPanel>
  );
}

function KioskPanel({ children }) {
  return (
    <div className="w-full max-w-3xl rounded-4xl border border-white/10 bg-white/[0.04] backdrop-blur-sm px-7 py-10 md:px-14 md:py-14 text-center shadow-2xl animate-fade-in">
      {children}
    </div>
  );
}

function KeypadKey({ children, disabled, label, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-16 md:h-20 rounded-2xl border border-white/15 bg-white/5 text-2xl md:text-3xl font-semibold transition-all hover:bg-white/15 active:scale-95 disabled:opacity-30 disabled:active:scale-100"
    >
      {children}
    </button>
  );
}
