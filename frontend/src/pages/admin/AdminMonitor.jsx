import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Ban, Globe2, Monitor, RefreshCw, Users, X } from "lucide-react";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Pill from "../../components/Pill";
import { NAVY } from "../../theme";
import {
  addWebsiteBlacklist,
  bangkokDate,
  getTrackingActivity,
  getTrackingRooms,
  getTrackingSummary,
  getWebsiteBlacklist,
  removeWebsiteBlacklist,
} from "../../api/tracking";

const POLL_INTERVAL_MS = 30000;

const TABS = [
  { key: "session", label: "เข้า-ออก" },
  { key: "program", label: "โปรแกรม" },
  { key: "website", label: "เว็บไซต์" },
  { key: "flagged", label: "น่าสงสัย" },
  { key: "blacklist", label: "Blacklist เว็บ" },
];

const formatDateTime = (value) => new Date(value).toLocaleString("th-TH", {
  dateStyle: "short",
  timeStyle: "short",
});

const formatDateLabel = (isoDate) => new Date(`${isoDate}T00:00:00+07:00`).toLocaleDateString("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default function AdminMonitor({ notify, onOpenTrackingSeat }) {
  const today = useMemo(() => bangkokDate(), []);
  const yesterday = useMemo(() => bangkokDate(-1), []);

  const [tab, setTab] = useState("session");
  const [roomFilter, setRoomFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(today);
  const [newSite, setNewSite] = useState("");

  const [summary, setSummary] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [rows, setRows] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadedOnceRef = useRef(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [nextSummary, nextRooms, nextBlacklist] = await Promise.all([
        getTrackingSummary(),
        getTrackingRooms(),
        getWebsiteBlacklist(),
      ]);
      setSummary(nextSummary);
      setRooms(nextRooms);
      setBlacklist(nextBlacklist);
      if (tab !== "blacklist") {
        setRows(await getTrackingActivity({ roomId: roomFilter, date: dateFilter, type: tab }));
      }
      setError("");
      loadedOnceRef.current = true;
    } catch (loadError) {
      if (!silent || !loadedOnceRef.current) setError(loadError.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tab, roomFilter, dateFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => load({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const blacklistDomains = useMemo(
    () => new Set(blacklist.map((item) => item.domain)),
    [blacklist],
  );

  const addToBlacklist = async (domain) => {
    const value = domain?.trim().toLowerCase();
    if (!value) return;
    if (blacklistDomains.has(value)) {
      notify?.(`${value} อยู่ใน Blacklist แล้ว`);
      return;
    }
    setBusy(true);
    try {
      await addWebsiteBlacklist({ domain: value });
      await load({ silent: true });
      notify?.(`เพิ่ม ${value} ใน Blacklist แล้ว`);
    } catch (addError) {
      notify?.(addError.message);
    } finally {
      setBusy(false);
    }
  };

  const removeFromBlacklist = async (entry) => {
    setBusy(true);
    try {
      await removeWebsiteBlacklist(entry.id);
      await load({ silent: true });
      notify?.(`นำ ${entry.domain} ออกจาก Blacklist แล้ว`);
    } catch (removeError) {
      notify?.(removeError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-ink tracking-tight">ตรวจสอบการใช้งาน</h1>
        <p className="text-xs text-muted mt-1">Audit กิจกรรมจากทุกห้องและทุกเครื่องในภาพรวม</p>
      </div>

      {error && (
        <Card className="p-6 mb-5 text-center">
          <p className="text-sm text-rose-700">{error}</p>
          <Button variant="secondary" size="sm" className="mt-4" icon={RefreshCw} onClick={() => load()}>
            ลองใหม่
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Summary icon={Users} label="ผู้ใช้งานปัจจุบัน" value={summary ? `${summary.activeUsers} คน` : "-"} tone="bg-navy-50 text-navy-800" />
        <Summary icon={Monitor} label="เครื่องพร้อมใช้งาน" value={summary ? `${summary.machinesReady}/${summary.machinesTotal}` : "-"} tone="bg-teal-50 text-teal-500" />
        <Summary icon={Globe2} label="เว็บไซต์วันนี้" value={summary ? `${summary.websitesToday} รายการ` : "-"} tone="bg-blue-50 text-blue-600" />
        <Summary icon={AlertTriangle} label="รายการน่าสงสัย" value={summary ? `${summary.flaggedCount} รายการ` : "-"} tone="bg-amber-50 text-amber-600" />
      </div>

      <Card variant="flat" className="p-4 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="flex-1 text-xs font-medium text-slate-600">
            ห้อง
            <select
              value={roomFilter}
              onChange={(event) => setRoomFilter(event.target.value)}
              className="block w-full mt-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700"
            >
              <option value="all">ทุกห้อง</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </label>
          <label className="flex-1 text-xs font-medium text-slate-600">
            วันที่
            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="block w-full mt-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700"
            >
              <option value={today}>วันนี้ ({formatDateLabel(today)})</option>
              <option value={yesterday}>เมื่อวาน ({formatDateLabel(yesterday)})</option>
              <option value="all">ทุกวันที่มีข้อมูล</option>
            </select>
          </label>
        </div>
      </Card>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className="shrink-0 text-xs px-3.5 py-2 rounded-xl border transition-colors"
            style={tab === item.key
              ? { background: NAVY, color: "white", borderColor: NAVY }
              : { background: "white", borderColor: "#e2e8f0", color: "#475569" }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "blacklist" ? (
        <Blacklist
          entries={blacklist}
          newSite={newSite}
          setNewSite={setNewSite}
          onAdd={addToBlacklist}
          onRemove={removeFromBlacklist}
          busy={busy}
        />
      ) : (
        <ActivityTable
          rows={rows}
          tab={tab}
          loading={loading}
          onOpenTrackingSeat={onOpenTrackingSeat}
          onAddToBlacklist={addToBlacklist}
          blacklistDomains={blacklistDomains}
          busy={busy}
        />
      )}
    </div>
  );
}

function Summary({ icon: Icon, label, value, tone }) {
  return (
    <Card className="p-4 md:p-5">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${tone}`}><Icon size={17} /></div>
      <div className="text-xl font-bold text-ink">{value}</div>
      <div className="text-[11px] text-muted mt-1">{label}</div>
    </Card>
  );
}

function ActivityTable({ rows, tab, loading, onOpenTrackingSeat, onAddToBlacklist, blacklistDomains, busy }) {
  return (
    <Card className="p-5 md:p-6 overflow-hidden">
      {tab === "flagged" && !loading && (
        <div className="flex items-center gap-2 mb-4 text-amber-700 text-xs bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
          <AlertTriangle size={14} /> พบกิจกรรมน่าสงสัย {rows.length} รายการตามตัวกรอง
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-xs text-left">
          <thead>
            <tr className="text-slate-500 border-b border-slate-200">
              <th className="pb-3 font-semibold">เวลา</th>
              <th className="pb-3 font-semibold">ผู้ใช้</th>
              <th className="pb-3 font-semibold">ห้อง / เครื่อง</th>
              <th className="pb-3 font-semibold">กิจกรรม</th>
              <th className="pb-3 font-semibold">สถานะ</th>
              <th className="pb-3 font-semibold text-right">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/70">
                <td className="py-3.5 text-slate-600">{formatDateTime(row.at)}</td>
                <td className="py-3.5 font-medium text-ink">{row.user?.displayName || "-"}</td>
                <td className="py-3.5 text-slate-600">{row.roomName}<br /><span className="text-slate-400">{row.seatLabel}</span></td>
                <td className="py-3.5 text-slate-700 max-w-xs">{row.activity}</td>
                <td className="py-3.5"><Pill tone={row.suspicious ? "red" : "green"}>{row.suspicious ? "น่าสงสัย" : "ปกติ"}</Pill></td>
                <td className="py-3.5">
                  <div className="flex justify-end gap-2">
                    {row.website && !blacklistDomains.has(row.website) && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => onAddToBlacklist(row.website)}
                      >
                        เพิ่ม Blacklist
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onOpenTrackingSeat?.({ roomId: row.roomId, seatId: row.seatId })}
                    >
                      ไปที่เครื่อง
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted">
                  {loading ? "กำลังโหลดข้อมูล..." : "ไม่พบข้อมูลตามตัวกรอง"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Blacklist({ entries, newSite, setNewSite, onAdd, onRemove, busy }) {
  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Ban size={17} className="text-rose-600" />
        <h2 className="text-sm font-bold text-ink">Blacklist เว็บไซต์</h2>
      </div>
      <p className="text-xs text-muted mb-5">จัดการโดเมนที่ไม่อนุญาตให้เข้าจากเครื่องในห้องแล็บ</p>
      <div className="space-y-2 mb-5">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-3 border border-rose-100 bg-rose-50 rounded-xl px-3.5 py-3 text-xs">
            <div>
              <span className="font-medium text-rose-700">{entry.domain}</span>
              {entry.category && <span className="text-rose-400 ml-2">{entry.category}</span>}
            </div>
            <button
              onClick={() => onRemove(entry)}
              disabled={busy}
              className="text-rose-600 flex items-center gap-1 hover:text-rose-800 disabled:opacity-50"
            >
              <X size={13} /> นำออก
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="py-8 text-center text-xs text-muted">ยังไม่มีโดเมนใน Blacklist</div>
        )}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={newSite}
          onChange={(event) => setNewSite(event.target.value)}
          placeholder="เช่น example.com"
          className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2.5"
        />
        <Button
          variant="danger"
          icon={Ban}
          disabled={busy}
          onClick={async () => {
            await onAdd(newSite);
            setNewSite("");
          }}
        >
          เพิ่มใน Blacklist
        </Button>
      </div>
    </Card>
  );
}
