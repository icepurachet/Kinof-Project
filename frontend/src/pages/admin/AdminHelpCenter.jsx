import React, { useEffect, useState } from "react";
import Card from "../../components/Card";
import Pill from "../../components/Pill";
import Button from "../../components/Button";
import { loadProblemImage, updateProblemReportStatus } from "../../api/problemReports";
import { NAVY } from "../../theme";

const TABS = [
  { key: "all", label: "คำขอความช่วยเหลือทั้งหมด" },
  { key: "รอดำเนินการ", label: "รอดำเนินการ" },
  { key: "กำลังดำเนินการ", label: "กำลังดำเนินการ" },
  { key: "เสร็จสิ้น", label: "เสร็จสิ้น" },
];

const toneFor = (status) => status === "เสร็จสิ้น" ? "green" : status === "กำลังดำเนินการ" ? "blue" : "amber";

export default function AdminHelpCenter({ problemReports, setProblemReports, notify }) {
  const [tab, setTab] = useState("all");
  const [selected, setSelected] = useState(null);
  const [loadedImages, setLoadedImages] = useState({});
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

  const advance = async (report) => {
    const next = report.status === "รอดำเนินการ" ? "กำลังดำเนินการ" : "เสร็จสิ้น";
    try {
      const updated = await updateProblemReportStatus(report.id, next);
      setProblemReports((current) => current.map((item) => item.id === report.id ? updated : item));
      setSelected((current) => current?.id === report.id ? updated : current);
      notify(next === "เสร็จสิ้น" ? "อัปเดตสถานะเป็นเสร็จสิ้นแล้ว" : "รับเรื่องเรียบร้อย กำลังดำเนินการ");
    } catch (error) {
      notify(error.message);
    }
  };

  return (
    <div>
      <h1 className="text-lg font-medium text-gray-900 mb-4">ศูนย์แก้ไขปัญหา</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map((item) => <button key={item.key} onClick={() => setTab(item.key)} className="text-xs px-3.5 py-2 rounded-lg border" style={tab === item.key ? { background: NAVY, color: "white", borderColor: NAVY } : { borderColor: "#e5e5e5", color: "#374151" }}>{item.label}</button>)}
      </div>
      <Card className="p-5 overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <thead><tr className="text-gray-400 text-left border-b border-gray-100"><th className="pb-2 font-normal">ผู้ใช้งาน</th><th className="pb-2 font-normal">หัวข้อ</th><th className="pb-2 font-normal">รายละเอียด</th><th className="pb-2 font-normal">ไฟล์แนบ</th><th className="pb-2 font-normal">สถานะ</th><th className="pb-2 font-normal">การดำเนินการ</th></tr></thead>
          <tbody>
            {shown.map((report) => <tr key={report.id} className="border-b border-gray-50 align-top">
              <td className="py-3 text-gray-700">{report.user?.username}<br /><span className="text-gray-400">{report.user?.email}</span></td>
              <td className="py-3 text-gray-700">{report.category}</td>
              <td className="py-3 text-gray-500 max-w-xs">{report.description}</td>
              <td className="py-3 text-gray-500">{report.images?.length ?? 0} รูป</td>
              <td className="py-3"><Pill tone={toneFor(report.status)}>{report.status}</Pill></td>
              <td className="py-3 flex gap-2"><Button variant="secondary" size="sm" onClick={() => setSelected(report)}>ดูรายละเอียด</Button>{report.status !== "เสร็จสิ้น" && <button onClick={() => advance(report)} className="text-xs text-white rounded-lg px-3 py-1.5" style={{ background: NAVY }}>{report.status === "รอดำเนินการ" ? "รับเรื่อง" : "ทำเครื่องหมายเสร็จสิ้น"}</button>}</td>
            </tr>)}
            {shown.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-gray-400">ไม่มีรายการในหมวดนี้</td></tr>}
          </tbody>
        </table>
      </Card>

      {selected && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          <div className="flex justify-between items-start"><div><h2 className="text-lg font-semibold text-gray-900">รายละเอียดคำร้อง</h2><p className="text-xs text-gray-500 mt-1">{selected.user?.name} · {selected.user?.username} · {selected.user?.email}</p></div><button onClick={() => setSelected(null)} className="text-gray-400 text-xl" aria-label="ปิด">×</button></div>
          <div className="mt-5 space-y-3 text-sm"><div><b>หัวข้อ:</b> {selected.category}</div><div><b>รายละเอียด:</b><p className="mt-1 whitespace-pre-line text-gray-600">{selected.description}</p></div><div><b>สถานะ:</b> <Pill tone={toneFor(selected.status)}>{selected.status}</Pill></div><div className="text-xs text-gray-500">ส่งเมื่อ {new Date(selected.createdAt).toLocaleString("th-TH")}</div></div>
          {selected.images?.length > 0 && <div className="mt-5"><h3 className="text-sm font-semibold mb-2">รูปภาพแนบ</h3><div className="grid grid-cols-3 gap-3">{selected.images.map((image) => <a key={image.id} href={loadedImages[image.id]} target="_blank" rel="noreferrer"><img src={loadedImages[image.id]} alt={image.originalFileName} className="aspect-square w-full object-cover rounded-xl border" /></a>)}</div></div>}
          <div className="flex justify-end mt-6"><Button variant="secondary" onClick={() => setSelected(null)}>ปิดหน้าต่าง</Button></div>
        </Card>
      </div>}
    </div>
  );
}
