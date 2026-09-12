import React, { useEffect, useState } from "react";
import Card from "../../components/Card";
import Pill from "../../components/Pill";
import { getAuditLogs } from "../../api/admin";

export default function AdminAuditLog({ notify }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");

  const load = async (nextPage = page, nextAction = action) => {
    try {
      const result = await getAuditLogs({ action: nextAction || undefined, page: nextPage, limit: 50 });
      setRows(result.items ?? []);
      setTotal(result.total ?? 0);
    } catch (error) {
      notify(error.message);
    }
  };

  useEffect(() => { load(1, action); }, []);

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-ink tracking-tight">Log แอดมิน</h1>
        <p className="text-xs text-muted mt-1">เก็บบันทึก 90 วัน — ดูได้อย่างเดียว แก้หรือลบไม่ได้</p>
      </div>
      <Card className="p-5">
        <div className="flex flex-wrap gap-2 mb-4">
          <select
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
              load(1, event.target.value);
            }}
            className="text-xs border border-slate-200 rounded-lg px-3 py-2"
          >
            <option value="">ทุกการกระทำ</option>
            {["admin.create", "admin.update", "admin.disable", "admin.enable", "admin.invite_resend", "schedule.create", "schedule.update", "schedule.delete", "schedule.import", "schedule.enrollment_add", "schedule.enrollment_remove", "room.create", "room.update", "room.delete", "room.capacity_change"].map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <span className="text-xs text-muted self-center">{total} รายการ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead>
              <tr className="text-muted text-left border-b border-slate-100">
                <th className="pb-2 font-normal">เวลา</th>
                <th className="pb-2 font-normal">ผู้ทำรายการ</th>
                <th className="pb-2 font-normal">การกระทำ</th>
                <th className="pb-2 font-normal">เป้าหมาย</th>
                <th className="pb-2 font-normal">รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50">
                  <td className="py-3 whitespace-nowrap">{new Date(row.createdAt).toLocaleString("th-TH")}</td>
                  <td className="py-3">{row.actor?.name}<div className="text-muted">{row.actor?.username}</div></td>
                  <td className="py-3"><Pill tone="navy">{row.action}</Pill></td>
                  <td className="py-3">{row.targetType} {row.targetId}</td>
                  <td className="py-3 text-slate-600">{row.detail}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-muted">ยังไม่มีบันทึก</td></tr>}
            </tbody>
          </table>
        </div>
        {total > 50 && (
          <div className="flex justify-end gap-2 mt-4">
            <button
              className="text-xs px-3 py-1.5 border rounded-lg disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => { const next = page - 1; setPage(next); load(next); }}
            >
              ก่อนหน้า
            </button>
            <button
              className="text-xs px-3 py-1.5 border rounded-lg disabled:opacity-40"
              disabled={page * 50 >= total}
              onClick={() => { const next = page + 1; setPage(next); load(next); }}
            >
              ถัดไป
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
