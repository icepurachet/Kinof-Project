import React, { useEffect, useState } from "react";
import Card from "../../components/Card";
import Pill from "../../components/Pill";
import Button from "../../components/Button";
import { loadProblemImage, updateProblemReportStaffNote, updateProblemReportStatus } from "../../api/problemReports";
import { NAVY } from "../../theme";

const TABS = [
  { key: "all", label: "คำขอความช่วยเหลือทั้งหมด" },
  { key: "รอดำเนินการ", label: "รอดำเนินการ" },
  { key: "กำลังดำเนินการ", label: "กำลังดำเนินการ" },
  { key: "เสร็จสิ้น", label: "เสร็จสิ้น" },
];

const toneFor = (status) => status === "เสร็จสิ้น" ? "green" : status === "กำลังดำเนินการ" ? "blue" : "amber";

export default function AdminHelpCenter({ problemReports, setProblemReports, notify, onBadgesChanged }) {
  const [tab, setTab] = useState("all");
  const [selected, setSelected] = useState(null);
  const [noteReport, setNoteReport] = useState(null);
  const [statusChange, setStatusChange] = useState(null);
  const [loadedImages, setLoadedImages] = useState({});
  const [staffNoteDraft, setStaffNoteDraft] = useState("");
  const [savingStaffNote, setSavingStaffNote] = useState(false);
  const [statusComment, setStatusComment] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const shown = tab === "all"
    ? problemReports
    : problemReports.filter((report) => report.status === tab);

  useEffect(() => {
    let active = true;
    const attachments = problemReports.flatMap((report) => report.images ?? []);
    Promise.all(attachments.map(async (image) => [image.id, await loadProblemImage(image.url)]))
      .then((entries) => active && setLoadedImages(Object.fromEntries(entries)))
      .catch(() => {});
    return () => { active = false; };
  }, [problemReports]);

  useEffect(() => {
    setStaffNoteDraft(noteReport?.staffNote ?? "");
  }, [noteReport?.id, noteReport?.staffNote]);

  const openStatusChange = (report) => {
    const nextStatus = report.status === "รอดำเนินการ" ? "กำลังดำเนินการ" : "เสร็จสิ้น";
    setStatusChange({ report, nextStatus });
    setStatusComment("");
  };

  const confirmStatusChange = async () => {
    if (!statusChange || statusComment.length > 2000) return;
    const { report, nextStatus } = statusChange;
    setSavingStatus(true);
    try {
      const updated = await updateProblemReportStatus(report.id, nextStatus, statusComment.trim());
      setProblemReports((current) => current.map((item) => item.id === report.id ? updated : item));
      setSelected((current) => current?.id === report.id ? updated : current);
      setStatusChange(null);
      notify(nextStatus === "เสร็จสิ้น" ? "อัปเดตสถานะเป็นเสร็จสิ้นแล้ว" : "รับเรื่องเรียบร้อย กำลังดำเนินการ");
      onBadgesChanged?.();
    } catch (error) {
      notify(error.message);
    } finally {
      setSavingStatus(false);
    }
  };

  const saveStaffNote = async () => {
    if (!noteReport || staffNoteDraft.length > 2000) return;
    setSavingStaffNote(true);
    try {
      const updated = await updateProblemReportStaffNote(noteReport.id, staffNoteDraft);
      setProblemReports((current) => current.map((item) => item.id === noteReport.id ? updated : item));
      setSelected((current) => current?.id === noteReport.id ? updated : current);
      setNoteReport(null);
      notify("บันทึกข้อความแจ้งผู้ใช้เรียบร้อยแล้ว");
    } catch (error) {
      notify(error.message);
    } finally {
      setSavingStaffNote(false);
    }
  };

  return (
    <div>
      <h1 className="text-lg font-medium text-gray-900 mb-4">ศูนย์แก้ไขปัญหา</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map((item) => <button key={item.key} onClick={() => setTab(item.key)} className="text-xs px-3.5 py-2 rounded-lg border" style={tab === item.key ? { background: NAVY, color: "white", borderColor: NAVY } : { borderColor: "#e5e5e5", color: "#374151" }}>{item.label}</button>)}
      </div>
      <Card className="p-5 overflow-x-auto">
        <table className="w-full min-w-[980px] text-xs">
          <thead><tr className="text-gray-400 text-left border-b border-gray-100"><th className="pb-2 font-normal">ผู้ใช้งาน</th><th className="pb-2 font-normal">หัวข้อ</th><th className="pb-2 font-normal">รายละเอียด</th><th className="pb-2 font-normal">ไฟล์แนบ</th><th className="pb-2 font-normal">สถานะ</th><th className="pb-2 font-normal">การดำเนินการ</th></tr></thead>
          <tbody>
            {shown.map((report) => <tr key={report.id} className="border-b border-gray-50 align-top">
              <td className="py-3 text-gray-700">{report.user?.username}<br /><span className="text-gray-400">{report.user?.email}</span></td>
              <td className="py-3 text-gray-700">{report.category}</td>
              <td className="py-3 text-gray-500 max-w-xs">{report.description}</td>
              <td className="py-3 text-gray-500">{report.images?.length ?? 0} รูป</td>
              <td className="py-3"><Pill tone={toneFor(report.status)}>{report.status}</Pill></td>
              <td className="py-3"><div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => setSelected(report)}>ดูรายละเอียด</Button><Button variant="secondary" size="sm" onClick={() => setNoteReport(report)} className="!border-blue-200 !bg-blue-50 !text-blue-800 hover:!bg-blue-100">แจ้งความคืบหน้า</Button>{report.status !== "เสร็จสิ้น" && <button onClick={() => openStatusChange(report)} className="text-xs text-white rounded-lg px-3 py-1.5" style={{ background: NAVY }}>{report.status === "รอดำเนินการ" ? "รับเรื่อง" : "ทำเครื่องหมายเสร็จสิ้น"}</button>}</div></td>
            </tr>)}
            {shown.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-gray-400">ไม่มีรายการในหมวดนี้</td></tr>}
          </tbody>
        </table>
      </Card>

      {selected && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          <div className="flex justify-between items-start"><div><h2 className="text-lg font-semibold text-gray-900">รายละเอียดคำร้อง</h2><p className="text-xs text-gray-500 mt-1">{selected.user?.name} · {selected.user?.username} · {selected.user?.email}</p></div><button onClick={() => setSelected(null)} className="text-gray-400 text-xl" aria-label="ปิด">×</button></div>
          <div className="mt-5 space-y-3 text-sm"><div><b>หัวข้อ:</b> {selected.category}</div><div><b>รายละเอียด:</b><p className="mt-1 whitespace-pre-line text-gray-600">{selected.description}</p></div><div><b>สถานะ:</b> <Pill tone={toneFor(selected.status)}>{selected.status}</Pill></div><div className="text-xs text-gray-500">ส่งเมื่อ {new Date(selected.createdAt).toLocaleString("th-TH")}</div></div>
          {selected.adminComment && <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3"><div className="text-xs font-semibold text-emerald-900">ข้อความตอบกลับจากผู้ดูแลระบบ</div><p className="mt-1 text-xs text-emerald-800 whitespace-pre-line">{selected.adminComment}</p></div>}
          {selected.images?.length > 0 && <div className="mt-5"><h3 className="text-sm font-semibold mb-2">รูปภาพแนบ</h3><div className="grid grid-cols-3 gap-3">{selected.images.map((image) => <a key={image.id} href={loadedImages[image.id]} target="_blank" rel="noreferrer"><img src={loadedImages[image.id]} alt={image.originalFileName} className="aspect-square w-full object-cover rounded-xl border" /></a>)}</div></div>}
          <div className="flex justify-end mt-6"><Button variant="secondary" onClick={() => setSelected(null)}>ปิดหน้าต่าง</Button></div>
        </Card>
      </div>}

      {noteReport && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <Card className="w-full max-w-xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">แจ้งความคืบหน้า</h2>
              <p className="mt-1 text-xs text-gray-500">{noteReport.category} · สถานะ {noteReport.status}</p>
            </div>
            <button onClick={() => setNoteReport(null)} className="text-gray-400 text-xl" aria-label="ปิด">×</button>
          </div>
          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="staff-note" className="text-sm font-semibold text-navy-900">ข้อความแจ้งผู้ใช้</label>
              <span className="text-xs text-muted">{staffNoteDraft.length}/2000</span>
            </div>
            <p className="mt-1 text-xs text-muted">ระบุความคืบหน้า เช่น กำลังสั่งอะไหล่ หรืออยู่ระหว่างตรวจสอบ</p>
            <textarea
              id="staff-note"
              value={staffNoteDraft}
              onChange={(event) => setStaffNoteDraft(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="กรอกข้อความที่ต้องการแจ้งให้ผู้ใช้ทราบ..."
              className="mt-3 w-full resize-none rounded-xl border border-blue-200 bg-white p-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800/10"
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNoteReport(null)}>ยกเลิก</Button>
            <Button
              onClick={saveStaffNote}
              disabled={savingStaffNote || staffNoteDraft === (noteReport.staffNote ?? "")}
            >
              {savingStaffNote ? "กำลังบันทึก..." : "บันทึกข้อความ"}
            </Button>
          </div>
        </Card>
      </div>}

      {statusChange && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <Card className="w-full max-w-xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">อัปเดตสถานะเป็น &quot;{statusChange.nextStatus}&quot;</h2>
              <p className="mt-1 text-xs text-gray-500">{statusChange.report.category} · {statusChange.report.user?.username}</p>
            </div>
            <button onClick={() => setStatusChange(null)} className="text-gray-400 text-xl" aria-label="ปิด">×</button>
          </div>
          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="status-comment" className="text-sm font-semibold text-navy-900">ข้อความตอบกลับผู้ใช้ (ไม่บังคับ)</label>
              <span className="text-xs text-muted">{statusComment.length}/2000</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {statusChange.nextStatus === "เสร็จสิ้น"
                ? "เช่น: ติดตั้งซอฟต์แวร์ใหม่เรียบร้อยแล้ว"
                : "เช่น: PC #4 มีปัญหาซอฟต์แวร์ กำลังตรวจสอบ คาดว่าจะแก้ไขเสร็จภายใน 2 วัน"}
            </p>
            <textarea
              id="status-comment"
              value={statusComment}
              onChange={(event) => setStatusComment(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="กรอกข้อความตอบกลับผู้ใช้ (ถ้ามี)..."
              className="mt-3 w-full resize-none rounded-xl border border-emerald-200 bg-white p-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-800/10"
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStatusChange(null)}>ยกเลิก</Button>
            <Button onClick={confirmStatusChange} disabled={savingStatus}>
              {savingStatus ? "กำลังบันทึก..." : "ยืนยันอัปเดตสถานะ"}
            </Button>
          </div>
        </Card>
      </div>}
    </div>
  );
}
