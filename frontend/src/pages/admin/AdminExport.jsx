import React, { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import Card from "../../components/Card";
import { bangkokDate, exportTrackingReport, getTrackingRooms } from "../../api/tracking";
import { NAVY } from "../../theme";

const REPORTS = [
  { label: "ประวัติเข้า-ออกระบบ", key: "session" },
  { label: "โปรแกรมที่ถูกใช้งาน", key: "program" },
  { label: "เว็บไซต์ที่เข้าชม", key: "website" },
  { label: "กิจกรรมน่าสงสัย", key: "flagged" },
];

const DATE_RANGES = { today: 0, week: -6, month: -29 };

export default function AdminExport({ notify }) {
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState("all");
  const [dateRange, setDateRange] = useState("today");
  const [busyReport, setBusyReport] = useState(null);
  const to = useMemo(() => bangkokDate(), []);

  useEffect(() => {
    getTrackingRooms().then(setRooms).catch((error) => notify?.(error.message));
  }, [notify]);

  const download = async (report) => {
    setBusyReport(report.key);
    try {
      await exportTrackingReport({
        report: report.key,
        roomId,
        from: bangkokDate(DATE_RANGES[dateRange]),
        to,
      });
      notify?.(`ดาวน์โหลด “${report.label}” เป็น CSV แล้ว`);
    } catch (error) {
      notify?.(error.message);
    } finally {
      setBusyReport(null);
    }
  };

  return (
    <div>
      <h1 className="text-lg font-medium text-gray-900 mb-4">ส่งออกข้อมูล</h1>
      <Card className="p-5">
        <div className="flex gap-3 mb-5">
          <select value={roomId} onChange={(event) => setRoomId(event.target.value)} className="text-xs border border-gray-200 rounded-lg px-3 py-2">
            <option value="all">ทุกห้อง</option>
            {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select>
          <select value={dateRange} onChange={(event) => setDateRange(event.target.value)} className="text-xs border border-gray-200 rounded-lg px-3 py-2">
            <option value="today">วันนี้</option>
            <option value="week">7 วันที่ผ่านมา</option>
            <option value="month">30 วันที่ผ่านมา</option>
          </select>
        </div>
        <div className="text-sm font-medium text-gray-900 mb-1">รายงานพร้อมส่งออก</div>
        <p className="text-xs text-gray-500 mb-3">ไฟล์ CSV รองรับภาษาไทยและเปิดด้วย Excel ได้</p>
        <div className="flex flex-col gap-2">
          {REPORTS.map((report) => (
            <div key={report.key} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3">
              <span className="text-xs text-gray-700">{report.label}</span>
              <button
                disabled={busyReport !== null}
                onClick={() => download(report)}
                className="flex items-center gap-1 text-xs text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
                style={{ background: NAVY }}
              >
                <FileSpreadsheet size={13} />
                {busyReport === report.key ? "กำลังสร้าง..." : "ดาวน์โหลด CSV"}
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
