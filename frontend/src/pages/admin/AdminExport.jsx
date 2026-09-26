import React, { useEffect, useMemo, useState } from "react";
import { CalendarRange, FileSpreadsheet } from "lucide-react";
import Card from "../../components/Card";
import Button from "../../components/Button";
import { NAVY } from "../../theme";
import { downloadAdminExport } from "../../api/admin";
import { bangkokDate, getTrackingRooms } from "../../api/tracking";

const ROWS = [
  { label: "ประวัติเข้า-ออกระบบ", key: "log" },
  { label: "โปรแกรมที่ถูกใช้งาน", key: "prog" },
  { label: "เว็บไซต์ที่เข้าชม", key: "web" },
  { label: "กิจกรรมน่าสงสัย", key: "flag" },
];

const ALL_ROOMS = "all";

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00+07:00`);
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const startOfMonth = (isoDate) => `${isoDate.slice(0, 7)}-01`;

const formatDateLabel = (isoDate) => new Date(`${isoDate}T00:00:00+07:00`).toLocaleDateString("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dayCount = (start, end) => {
  const startMs = new Date(`${start}T00:00:00+07:00`).getTime();
  const endMs = new Date(`${end}T00:00:00+07:00`).getTime();
  return Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
};

const buildPresets = (today) => [
  { key: "today", label: "วันนี้", start: today, end: today },
  { key: "last7", label: "7 วันล่าสุด", start: addDays(today, -6), end: today },
  { key: "last30", label: "30 วันล่าสุด", start: addDays(today, -29), end: today },
  { key: "thisMonth", label: "เดือนนี้", start: startOfMonth(today), end: today },
];

export default function AdminExport({ notify }) {
  const [formats, setFormats] = useState({ log: "Excel", prog: "Excel", web: "Excel", flag: "Excel" });
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState(ALL_ROOMS);
  const [exportingKey, setExportingKey] = useState(null);

  const today = useMemo(() => bangkokDate(), []);
  const presets = useMemo(() => buildPresets(today), [today]);
  const [preset, setPreset] = useState("today");
  const [startDate, setStartDate] = useState(presets[0].start);
  const [endDate, setEndDate] = useState(presets[0].end);

  useEffect(() => {
    getTrackingRooms().then(setRooms).catch(() => setRooms([]));
  }, []);

  const applyPreset = (item) => {
    setPreset(item.key);
    setStartDate(item.start);
    setEndDate(item.end);
  };

  const handleStartDateChange = (value) => {
    setPreset("custom");
    setStartDate(value);
    if (value > endDate) setEndDate(value);
  };

  const handleEndDateChange = (value) => {
    setPreset("custom");
    setEndDate(value);
    if (value < startDate) setStartDate(value);
  };

  const roomLabel = roomId === ALL_ROOMS ? "ทุกห้อง" : rooms.find((room) => room.id === roomId)?.name ?? "ทุกห้อง";
  const rangeDays = dayCount(startDate, endDate);

  const handleExport = async (row) => {
    setExportingKey(row.key);
    try {
      await downloadAdminExport({
        report: row.key,
        format: formats[row.key],
        roomId,
        startDate,
        endDate,
      });
      notify(`ส่งออก "${row.label}" (${roomLabel} · ${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}) เป็นไฟล์ ${formats[row.key]} แล้ว`);
    } catch (error) {
      notify(error.message);
    } finally {
      setExportingKey(null);
    }
  };

  return (
    <div>
      <h1 className="text-lg font-medium text-gray-900 mb-4">ส่งออกข้อมูล</h1>

      <Card className="p-5 mb-5">
        <div className="text-sm font-medium text-gray-900 mb-3">ตัวกรองข้อมูล</div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500" htmlFor="export-room">ห้องแล็บ</label>
            <select
              id="export-room"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-3 py-2 min-w-[160px]"
            >
              <option value={ALL_ROOMS}>ทุกห้อง</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-500">ช่วงเวลาด่วน</span>
            <div className="flex flex-wrap gap-2">
              {presets.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => applyPreset(item)}
                  className="text-xs px-3 py-1.5 rounded-lg border"
                  style={preset === item.key ? { background: NAVY, color: "white", borderColor: NAVY } : { borderColor: "#e5e5e5", color: "#374151" }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-500">ช่วงวันที่กำหนดเอง</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-3 py-2"
                aria-label="วันที่เริ่มต้น"
              />
              <span className="text-xs text-gray-400">ถึง</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={today}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-3 py-2"
                aria-label="วันที่สิ้นสุด"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-100 px-4 py-2.5 text-xs text-gray-600">
          <CalendarRange size={14} className="text-gray-400 shrink-0" />
          <span>
            กำลังกรอง: <b>{roomLabel}</b> · {formatDateLabel(startDate)} – {formatDateLabel(endDate)} ({rangeDays} วัน)
          </span>
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-sm font-medium text-gray-900 mb-3">รายงานพร้อมส่งออก</div>
        <div className="flex flex-col gap-2">
          {ROWS.map((r) => (
            <div key={r.key} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3">
              <span className="text-xs text-gray-700">{r.label}</span>
              <div className="flex items-center gap-2">
                <select
                  value={formats[r.key]}
                  onChange={(e) => setFormats({ ...formats, [r.key]: e.target.value })}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
                  disabled={exportingKey === r.key}
                >
                  <option>Excel</option>
                  <option>CSV</option>
                </select>
                <Button
                  size="sm"
                  icon={FileSpreadsheet}
                  iconPosition="left"
                  disabled={exportingKey !== null}
                  onClick={() => handleExport(r)}
                >
                  {exportingKey === r.key ? "กำลังส่งออก..." : "ส่งออก"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
