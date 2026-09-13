import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  Laptop,
  LogOut,
  Monitor,
  Power,
  Radar,
  RefreshCw,
  Save,
  UserRound,
  Wifi,
  WifiOff,
  Wrench,
} from "lucide-react";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Pill from "../../components/Pill";
import {
  bulkRoomAction,
  forceSeatLogout,
  getSeatActivity,
  getTrackingRooms,
  getTrackingSeats,
  updateRoomStatus,
} from "../../api/tracking";

const POLL_INTERVAL_MS = 25000;

const ROOM_META = {
  open: { label: "เปิดใช้งาน", tone: "green", dot: "bg-emerald-500", border: "border-emerald-300", surface: "bg-emerald-50" },
  closed: { label: "ปิด", tone: "red", dot: "bg-rose-500", border: "border-rose-300", surface: "bg-rose-50" },
  maintenance: { label: "ปรับปรุง", tone: "amber", dot: "bg-amber-500", border: "border-amber-300", surface: "bg-amber-50" },
};

const SEAT_META = {
  in_use: { label: "กำลังใช้งาน", tone: "green", dot: "bg-emerald-500", border: "border-emerald-300", surface: "bg-emerald-50" },
  available: { label: "ว่าง", tone: "blue", dot: "bg-blue-500", border: "border-blue-300", surface: "bg-blue-50" },
  offline: { label: "ออฟไลน์", tone: "red", dot: "bg-rose-500", border: "border-rose-300", surface: "bg-rose-50" },
  maintenance: { label: "ซ่อมบำรุง", tone: "amber", dot: "bg-amber-500", border: "border-amber-300", surface: "bg-amber-50" },
};

const FALLBACK_META = { label: "ไม่ทราบสถานะ", tone: "gray", dot: "bg-slate-400", border: "border-slate-200", surface: "bg-slate-50" };

const BULK_ACTIONS = {
  open: {
    title: "เปิดใช้งานทั้งห้อง",
    description: "เปิดรับการเข้าใช้งาน และตั้งเครื่องที่ Agent ออนไลน์เป็นสถานะว่าง",
    confirmLabel: "ยืนยันเปิดใช้งาน",
    variant: "success",
  },
  close: {
    title: "ระงับและออกจากระบบทั้งหมด",
    description: "ระงับการเข้าใช้งานใหม่และสั่งออกจากระบบของผู้ใช้ทุกเครื่องทันที",
    confirmLabel: "ยืนยันระงับทั้งห้อง",
    variant: "danger",
  },
  maintenance: {
    title: "ปรับปรุงทั้งห้อง",
    description: "ระงับการใช้งานและตั้งเครื่องทุกเครื่องเป็นสถานะซ่อมบำรุง",
    confirmLabel: "ยืนยันปรับปรุง",
    variant: "primary",
  },
};

const formatDateTime = (value) => value
  ? new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
  : "-";

const formatDuration = (startedAt) => {
  if (!startedAt) return "-";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes} นาที`;
  return `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
};

const seatMetaOf = (status) => SEAT_META[status] ?? FALLBACK_META;
const roomMetaOf = (status) => ROOM_META[status] ?? FALLBACK_META;

export default function AdminTracking({
  notify,
  initialRoomId,
  initialSeatId,
  onOpenMonitor,
}) {
  const [view, setView] = useState(initialSeatId ? "seat" : initialRoomId ? "room" : "rooms");
  const [selectedRoomId, setSelectedRoomId] = useState(initialRoomId ?? null);
  const [selectedSeatId, setSelectedSeatId] = useState(initialSeatId ?? null);

  const [rooms, setRooms] = useState([]);
  const [seats, setSeats] = useState([]);
  const [seatActivity, setSeatActivity] = useState([]);
  const [roomStatusDraft, setRoomStatusDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bulkAction, setBulkAction] = useState(null);

  // Keeps polling from flipping the page back into a loading skeleton.
  const loadedOnceRef = useRef(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const nextRooms = await getTrackingRooms();
      setRooms(nextRooms);

      if (selectedRoomId) {
        setSeats(await getTrackingSeats(selectedRoomId));
      } else {
        setSeats([]);
      }
      if (selectedSeatId) {
        setSeatActivity(await getSeatActivity(selectedSeatId));
      } else {
        setSeatActivity([]);
      }
      setError("");
      loadedOnceRef.current = true;
    } catch (loadError) {
      if (!silent || !loadedOnceRef.current) setError(loadError.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedRoomId, selectedSeatId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => load({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (initialSeatId) {
      setSelectedRoomId(initialRoomId ?? null);
      setSelectedSeatId(initialSeatId);
      setView("seat");
    } else if (initialRoomId) {
      setSelectedRoomId(initialRoomId);
      setSelectedSeatId(null);
      setView("room");
    } else {
      // Sidebar "Tracking" clears the cross-nav target and returns to the room list.
      setSelectedRoomId(null);
      setSelectedSeatId(null);
      setView("rooms");
    }
  }, [initialRoomId, initialSeatId]);

  const room = rooms.find((item) => item.id === selectedRoomId);
  const seat = seats.find((item) => item.id === selectedSeatId);
  const session = seat?.session ?? null;

  useEffect(() => {
    if (room) setRoomStatusDraft(room.status);
  }, [room?.id, room?.status]);

  const roomCounts = useMemo(() => Object.keys(SEAT_META).reduce((counts, status) => ({
    ...counts,
    [status]: seats.filter((item) => item.status === status).length,
  }), {}), [seats]);

  const openRoom = (roomId) => {
    setSelectedRoomId(roomId);
    setSelectedSeatId(null);
    setView("room");
  };

  const openSeat = (seatId) => {
    setSelectedSeatId(seatId);
    setView("seat");
  };

  const runAction = async (action, successMessage) => {
    setBusy(true);
    try {
      await action();
      await load({ silent: true });
      notify?.(successMessage);
    } catch (actionError) {
      notify?.(actionError.message);
    } finally {
      setBusy(false);
    }
  };

  const saveRoom = () => room && runAction(
    () => updateRoomStatus(room.id, roomStatusDraft),
    `บันทึกสถานะ ${room.name} แล้ว`,
  );

  const applyBulkAction = () => {
    if (!bulkAction || !room) return;
    const action = bulkAction;
    setBulkAction(null);
    runAction(
      () => bulkRoomAction(room.id, action),
      action === "close"
        ? `ระงับ ${room.name} และสั่งออกจากระบบผู้ใช้ทั้งหมดแล้ว`
        : `${BULK_ACTIONS[action].title}แล้ว`,
    );
  };

  const logoutSeat = () => seat && runAction(
    () => forceSeatLogout(seat.id),
    `สั่งออกจากระบบ ${seat.label} แล้ว`,
  );

  if (loading) {
    return (
      <Page>
        <Card className="p-8 text-center text-sm text-muted">กำลังโหลดข้อมูล Tracking...</Card>
      </Page>
    );
  }

  if (error) {
    return (
      <Page>
        <Card className="p-8 text-center">
          <p className="text-sm text-rose-700">{error}</p>
          <Button variant="secondary" size="sm" className="mt-4" icon={RefreshCw} onClick={() => load()}>
            ลองใหม่
          </Button>
        </Card>
      </Page>
    );
  }

  if (view === "rooms" || !room) {
    return (
      <Page>
        <PageTitle title="Tracking ห้องแล็บ" description="เลือกห้องเพื่อดูสถานะเครื่องและจัดการการใช้งานแบบเจาะลึก" />
        <Legend items={Object.entries(ROOM_META).map(([key, meta]) => ({ key, ...meta }))} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {rooms.map((item) => {
            const meta = roomMetaOf(item.status);
            return (
              <Card
                key={item.id}
                hoverable
                role="button"
                tabIndex={0}
                onClick={() => openRoom(item.id)}
                onKeyDown={(event) => event.key === "Enter" && openRoom(item.id)}
                className={`p-5 md:p-6 border-l-4 ${meta.border}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-ink">{item.name}</h2>
                    <p className="text-xs text-muted mt-1">{item.activeUserCount} คนกำลังใช้งาน</p>
                  </div>
                  <Pill tone={meta.tone} withDot>{meta.label}</Pill>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-6">
                  <Metric label="Agent ออนไลน์" value={`${item.agentOnlineCount}/${item.seatCount}`} icon={Wifi} />
                  <Metric label="เครื่องทั้งหมด" value={item.seatCount} icon={Monitor} />
                </div>
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <span className="flex w-full items-center justify-center rounded-xl bg-navy-800 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-navy-900">
                    จัดการห้องและเครื่อง
                  </span>
                </div>
              </Card>
            );
          })}
          {rooms.length === 0 && (
            <div className="md:col-span-2 py-10 text-center text-sm text-muted">ยังไม่มีข้อมูลห้องแล็บ</div>
          )}
        </div>
      </Page>
    );
  }

  if (view === "room") {
    return (
      <Page>
        <BackButton onClick={() => { setSelectedRoomId(null); setView("rooms"); }}>ห้องแล็บทั้งหมด</BackButton>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
          <PageTitle title={room.name} description="จัดการสถานะห้องและเลือกเครื่องเพื่อดูรายละเอียด" compact />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={roomStatusDraft}
              onChange={(event) => setRoomStatusDraft(event.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700"
              aria-label="สถานะห้อง"
            >
              {Object.entries(ROOM_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
            </select>
            <Button icon={Save} onClick={saveRoom} disabled={busy}>บันทึกข้อมูล</Button>
          </div>
        </div>

        <Card className="p-4 mb-5">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {Object.entries(SEAT_META).map(([key, meta]) => (
              <div key={key} className="flex items-center gap-2 text-xs text-slate-600">
                <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                {meta.label} ({roomCounts[key] || 0})
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 mb-5 border-l-4 border-l-navy-800">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-ink">ควบคุมสถานะทั้งห้อง</h2>
              <p className="text-xs text-muted mt-1">
                เปลี่ยนสถานะเครื่องทั้ง {seats.length} เครื่องพร้อมกัน
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={Power} disabled={busy} onClick={() => setBulkAction("open")} className="!border-emerald-200 !bg-emerald-50 !text-emerald-800 hover:!bg-emerald-100">
                เปิดใช้งานทั้งหมด
              </Button>
              <Button size="sm" variant="secondary" icon={LogOut} disabled={busy} onClick={() => setBulkAction("close")} className="!border-rose-200 !bg-rose-50 !text-rose-800 hover:!bg-rose-100">
                ระงับและออกจากระบบ
              </Button>
              <Button size="sm" variant="secondary" icon={Wrench} disabled={busy} onClick={() => setBulkAction("maintenance")} className="!border-amber-200 !bg-amber-50 !text-amber-800 hover:!bg-amber-100">
                ปรับปรุงทั้งหมด
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-3">
          {seats.map((item) => {
            const meta = seatMetaOf(item.status);
            return (
              <button
                key={item.id}
                onClick={() => openSeat(item.id)}
                className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-card ${meta.border} ${meta.surface}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <Laptop size={19} className="text-slate-600" />
                  {item.agentOnline ? <Wifi size={14} className="text-emerald-600" /> : <WifiOff size={14} className="text-rose-500" />}
                </div>
                <div className="font-bold text-ink mt-3">{item.label}</div>
                <div className="text-xs text-slate-600 mt-1">{meta.label}</div>
                {item.session && (
                  <div className="text-xs text-slate-500 truncate mt-2">{item.session.user.displayName}</div>
                )}
              </button>
            );
          })}
          {seats.length === 0 && (
            <div className="col-span-2 sm:col-span-4 xl:col-span-5 py-10 text-center text-sm text-muted">
              ห้องนี้ยังไม่มีเครื่องคอมพิวเตอร์
            </div>
          )}
        </div>
        {bulkAction && (
          <BulkConfirm
            action={bulkAction}
            room={room}
            machineCount={seats.length}
            activeSessionCount={seats.filter((item) => item.session).length}
            onCancel={() => setBulkAction(null)}
            onConfirm={applyBulkAction}
          />
        )}
      </Page>
    );
  }

  if (!seat) {
    return (
      <Page>
        <BackButton onClick={() => { setSelectedSeatId(null); setView("room"); }}>{room.name}</BackButton>
        <Card className="p-8 text-center text-sm text-muted">ไม่พบเครื่องที่เลือกในห้องนี้</Card>
      </Page>
    );
  }

  const seatMeta = seatMetaOf(seat.status);

  return (
    <Page>
      <BackButton onClick={() => { setSelectedSeatId(null); setView("room"); }}>{room.name}</BackButton>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
        <PageTitle title={`${seat.label} · ${room.name}`} description="ข้อมูลผู้ใช้ เซสชัน กิจกรรม และการจัดการเครื่อง" compact />
        <Button
          variant="secondary"
          icon={Radar}
          onClick={() => onOpenMonitor?.({ seatId: seat.id, roomId: room.id })}
        >
          ดูภาพรวม
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <Card className="p-5 md:p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <h2 className="text-sm font-bold text-ink flex items-center gap-2"><UserRound size={17} /> ผู้ใช้ปัจจุบัน</h2>
              <Pill tone={seatMeta.tone} withDot>{seatMeta.label}</Pill>
            </div>
            {session ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Info label="ชื่อผู้ใช้" value={session.user.displayName} />
                <Info label="รหัสผู้ใช้" value={session.user.username || "-"} />
                <Info label="ประเภทผู้ใช้" value={session.user.userType || "-"} />
                <Info label="เริ่มเซสชัน" value={formatDateTime(session.startedAt)} className="sm:col-span-2" />
                <Info label="ระยะเวลา" value={formatDuration(session.startedAt)} />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-xs text-muted">
                ไม่มีผู้ใช้กำลังใช้งานเครื่องนี้
              </div>
            )}
          </Card>

          <Card className="p-5 md:p-6 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <Clock3 size={17} className="text-navy-800" />
              <h2 className="text-sm font-bold text-ink">ประวัติของเครื่องนี้</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-3 font-semibold">เวลา</th>
                    <th className="py-3 font-semibold">ผู้ใช้</th>
                    <th className="py-3 font-semibold">กิจกรรม</th>
                    <th className="py-3 font-semibold">ระยะเวลา</th>
                    <th className="py-3 font-semibold">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {seatActivity.map((activity) => (
                    <tr key={activity.id}>
                      <td className="py-3 text-slate-600">{formatDateTime(activity.at)}</td>
                      <td className="py-3 font-medium text-ink">{activity.user?.displayName || "-"}</td>
                      <td className="py-3 text-slate-700">{activity.activity}</td>
                      <td className="py-3 text-slate-600">{activity.durationMinutes ? `${activity.durationMinutes} นาที` : "-"}</td>
                      <td className="py-3"><Pill tone={activity.suspicious ? "red" : "gray"}>{activity.suspicious ? "น่าสงสัย" : "ปกติ"}</Pill></td>
                    </tr>
                  ))}
                  {seatActivity.length === 0 && (
                    <tr><td colSpan={5} className="py-10 text-center text-muted">ยังไม่มีประวัติกิจกรรมของเครื่องนี้</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <Card className="p-5 md:p-6 h-fit">
          <h2 className="text-sm font-bold text-ink mb-1">จัดการคอมพิวเตอร์</h2>
          <p className="text-xs text-muted mb-5">สถานะเครื่องมาจาก Agent และเซสชันปัจจุบันโดยอัตโนมัติ</p>
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 flex items-center justify-between">
              <span className="text-xs text-slate-600">สถานะเครื่อง</span>
              <Pill tone={seatMeta.tone} withDot>{seatMeta.label}</Pill>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 flex items-center justify-between">
              <span className="text-xs text-slate-600">Tracking Agent</span>
              <Pill tone={seat.agentOnline ? "green" : "red"} withDot>
                {seat.agentOnline ? "ออนไลน์" : seat.agentRegistered ? "ออฟไลน์" : "ยังไม่ติดตั้ง"}
              </Pill>
            </div>
            <Info label="ชื่อเครื่อง" value={seat.computerName || "-"} />
            <Info label="Heartbeat ล่าสุด" value={formatDateTime(seat.lastHeartbeat)} />
          </div>
          <Button
            fullWidth
            variant="danger"
            icon={LogOut}
            className="mt-5"
            disabled={busy || !seat.agentRegistered}
            onClick={logoutSeat}
          >
            สั่งออกจากระบบ
          </Button>
        </Card>
      </div>
    </Page>
  );
}

function BulkConfirm({
  action,
  room,
  machineCount,
  activeSessionCount,
  onCancel,
  onConfirm,
}) {
  const config = BULK_ACTIONS[action];
  const isClose = action === "close";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <Card className="w-full max-w-lg p-6 animate-scale-in">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-4 ${isClose ? "bg-rose-50 text-rose-600" : "bg-navy-50 text-navy-800"}`}>
          {isClose ? <AlertTriangle size={21} /> : action === "open" ? <Power size={21} /> : <Wrench size={21} />}
        </div>
        <h2 className="text-lg font-bold text-ink">{config.title}</h2>
        <p className="text-xs text-muted mt-1.5 leading-relaxed">{config.description}</p>

        <div className="grid grid-cols-2 gap-3 my-5">
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
            <div className="text-xs text-muted">ห้องที่ควบคุม</div>
            <div className="text-sm font-bold text-ink mt-1">{room.name}</div>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
            <div className="text-xs text-muted">เครื่องที่ได้รับผลกระทบ</div>
            <div className="text-sm font-bold text-ink mt-1">{machineCount} เครื่อง</div>
          </div>
        </div>

        {isClose && activeSessionCount > 0 && (
          <div className="rounded-xl bg-rose-50 border border-rose-100 px-3.5 py-3 text-xs text-rose-700 flex items-start gap-2 mb-5">
            <LogOut size={15} className="shrink-0 mt-0.5" />
            <span>
              มีผู้ใช้กำลังเข้าสู่ระบบ {activeSessionCount} เครื่อง ระบบจะจบเซสชันและออกจากระบบทั้งหมด
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>ยกเลิก</Button>
          <Button variant={config.variant} onClick={onConfirm}>{config.confirmLabel}</Button>
        </div>
      </Card>
    </div>
  );
}

function Page({ children }) {
  return <div className="w-full max-w-7xl mx-auto">{children}</div>;
}

function PageTitle({ title, description, compact = false }) {
  return (
    <div className={compact ? "" : "mb-6"}>
      <h1 className="text-xl md:text-2xl font-bold text-ink tracking-tight">{title}</h1>
      <p className="text-xs text-muted mt-1">{description}</p>
    </div>
  );
}

function BackButton({ children, onClick }) {
  return (
    <button onClick={onClick} className="mb-3 text-xs font-medium text-slate-500 hover:text-navy-800 flex items-center gap-1">
      <ArrowLeft size={14} /> {children}
    </button>
  );
}

function Legend({ items }) {
  return (
    <Card variant="flat" className="p-4 mb-5 flex flex-wrap gap-x-5 gap-y-2">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-2 text-xs text-slate-600">
          <span className={`w-3 h-3 rounded-full ${item.dot} ring-2 ring-white shadow-sm`} /> {item.label}
        </div>
      ))}
    </Card>
  );
}

function Metric({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
      <Icon size={14} className="text-slate-400 mb-2" />
      <div className="text-lg font-bold text-ink">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function Info({ label, value, className = "" }) {
  return (
    <div className={`rounded-xl bg-slate-50 border border-slate-100 p-3 ${className}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-sm font-semibold text-ink mt-1">{value}</div>
    </div>
  );
}
