import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Copy, DoorOpen, Shield, Upload, Download, Plus, Pencil, Trash2, Users, Monitor } from "lucide-react";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Pill from "../../components/Pill";
import { NAVY } from "../../theme";
import { isSuperAdmin } from "../../utils/roles";
import {
  addScheduleStudent,
  confirmScheduleImport,
  createAdminComputer,
  createAdminRoom,
  createAdminSchedule,
  createAdminUser,
  deleteAdminRoom,
  deleteAdminSchedule,
  deleteAdminComputer,
  disableAdminUser,
  downloadScheduleTemplate,
  enableAdminUser,
  getAdminRooms,
  getKioskDevices,
  createKioskDevice,
  revokeKioskDevice,
  getAdminComputers,
  getAdminSchedule,
  getAdminSchedules,
  getAdminUsers,
  getManagedUsers,
  previewScheduleImport,
  removeScheduleStudent,
  setManagedUserActive,
  updateAdminRoom,
  updateAdminComputer,
  updateAdminSchedule,
  updateAdminUser,
} from "../../api/admin";

const DAYS = [
  { value: 0, label: "อาทิตย์" },
  { value: 1, label: "จันทร์" },
  { value: 2, label: "อังคาร" },
  { value: 3, label: "พุธ" },
  { value: 4, label: "พฤหัสบดี" },
  { value: 5, label: "ศุกร์" },
  { value: 6, label: "เสาร์" },
];

const inputClass = "w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-navy-100";

export default function AdminData({ auth, notify }) {
  const superadmin = isSuperAdmin(auth?.user?.userType);
  const tabs = useMemo(() => {
    const items = [
      { key: "schedules", label: "ตารางเรียน", icon: CalendarDays },
      { key: "rooms", label: "ห้องแล็บ", icon: DoorOpen },
      { key: "computers", label: "เครื่องคอม", icon: Monitor },
      { key: "users", label: "ผู้ใช้งาน", icon: Users },
    ];
    if (superadmin) items.push({ key: "admins", label: "ผู้ดูแลระบบ", icon: Shield });
    return items;
  }, [superadmin]);
  const [tab, setTab] = useState("schedules");

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-ink tracking-tight">จัดการข้อมูล</h1>
        <p className="text-xs text-muted mt-1">ตารางเรียน ห้องแล็บ {superadmin ? "และบัญชีผู้ดูแลระบบ" : ""}</p>
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className="text-xs px-3.5 py-2 rounded-lg border inline-flex items-center gap-1.5"
            style={tab === item.key ? { background: NAVY, color: "white", borderColor: NAVY } : { borderColor: "#e5e5e5", color: "#374151" }}
          >
            <item.icon size={13} /> {item.label}
          </button>
        ))}
      </div>
      {tab === "schedules" && <SchedulesTab notify={notify} />}
      {tab === "rooms" && <RoomsTab notify={notify} />}
      {tab === "computers" && <ComputersTab notify={notify} />}
      {tab === "users" && <UsersTab notify={notify} />}
      {tab === "admins" && superadmin && <AdminsTab notify={notify} />}
    </div>
  );
}

function SchedulesTab({ notify }) {
  const emptyForm = {
    roomId: "",
    courseCode: "",
    courseName: "",
    section: "1",
    instructorName: "",
    dayOfWeek: 1,
    startTime: "08:40",
    endTime: "11:00",
    academicYear: "2569",
    semester: "1",
  };
  const [rooms, setRooms] = useState([]);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [studentId, setStudentId] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [scheduleRows, roomRows] = await Promise.all([getAdminSchedules(true), getAdminRooms()]);
    setRows(scheduleRows);
    setRooms(roomRows);
    if (!form.roomId && roomRows[0]) setForm((current) => ({ ...current, roomId: roomRows[0].id }));
  };

  useEffect(() => { load().catch((error) => notify(error.message)); }, []);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, dayOfWeek: Number(form.dayOfWeek) };
      if (editingId) await updateAdminSchedule(editingId, payload);
      else await createAdminSchedule(payload);
      setForm({ ...emptyForm, roomId: rooms[0]?.id ?? "" });
      setEditingId(null);
      await load();
      notify(editingId ? "บันทึกตารางเรียนแล้ว" : "เพิ่มตารางเรียนแล้ว");
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  };

  const editRow = (row) => {
    setEditingId(row.id);
    setForm({
      roomId: row.roomId,
      courseCode: row.courseCode,
      courseName: row.courseName ?? "",
      section: row.section ?? "1",
      instructorName: row.instructorName ?? "",
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      academicYear: row.academicYear ?? "2569",
      semester: row.semester ?? "1",
    });
  };

  const removeRow = async (row) => {
    if (!window.confirm(`ปิดตาราง ${row.courseCode} หรือไม่? ข้อมูลยังอยู่ในระบบ`)) return;
    try {
      await deleteAdminSchedule(row.id);
      if (selected?.id === row.id) setSelected(null);
      await load();
      notify("ปิดตารางเรียนแล้ว");
    } catch (error) {
      notify(error.message);
    }
  };

  const openDetail = async (row) => {
    try {
      setSelected(await getAdminSchedule(row.id));
    } catch (error) {
      notify(error.message);
    }
  };

  const addStudent = async (event) => {
    event.preventDefault();
    if (!selected) return;
    try {
      const detail = await addScheduleStudent(selected.id, studentId);
      setSelected(detail);
      setStudentId("");
      await load();
      notify("เพิ่มนักศึกษาแล้ว");
    } catch (error) {
      notify(error.message);
    }
  };

  const removeStudent = async (item) => {
    try {
      const detail = await removeScheduleStudent(selected.id, item.id, item.type);
      setSelected(detail);
      await load();
      notify("ลบรายชื่อแล้ว");
    } catch (error) {
      notify(error.message);
    }
  };

  const runPreview = async () => {
    if (!file) return notify("กรุณาเลือกไฟล์ CSV");
    setBusy(true);
    try {
      setPreview(await previewScheduleImport(file));
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  };

  const runConfirm = async () => {
    if (!file || !preview?.canConfirm) return;
    if (preview.willDeactivatePreviousTerm &&
      !window.confirm(`นำเข้าเทอม ${preview.term} จะปิดเทอมเก่า ${preview.previousTerm} ทั้งระบบ ต้องการดำเนินการต่อหรือไม่?`)) {
      return;
    }
    setBusy(true);
    try {
      const result = await confirmScheduleImport(file);
      setPreview(null);
      setFile(null);
      await load();
      notify(`นำเข้า ${result.schedules} คาบแล้ว (ลงทะเบียน ${result.enrolled}, รอ ${result.pending})`);
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-bold text-ink">นำเข้าตารางเรียนจาก CSV</h2>
          <Button variant="secondary" size="sm" icon={Download} iconPosition="left" onClick={() => downloadScheduleTemplate().catch((error) => notify(error.message))}>
            ดาวน์โหลดแม่แบบ
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input type="file" accept=".xlsx,.csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); }} className="text-xs" />
          <Button size="sm" icon={Upload} iconPosition="left" disabled={busy} onClick={runPreview}>ดูตัวอย่าง</Button>
          {preview?.canConfirm && <Button size="sm" disabled={busy} onClick={runConfirm}>ยืนยันนำเข้า</Button>}
        </div>
        {preview && (
          <div className="mt-4 text-xs space-y-2">
            <div className="flex flex-wrap gap-2">
              <Pill tone="navy">เทอม {preview.term || "—"}</Pill>
              {preview.willDeactivatePreviousTerm && <Pill tone="amber">จะปิดเทอมเก่า {preview.previousTerm}</Pill>}
              <Pill tone={preview.errorCount ? "red" : "green"}>{preview.errorCount} ข้อผิดพลาด</Pill>
              <Pill tone="amber">{preview.warningCount} คำเตือน</Pill>
            </div>
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full min-w-[720px]">
                <thead><tr className="text-muted text-left border-b"><th className="p-2 font-normal">แถว</th><th className="p-2 font-normal">วิชา</th><th className="p-2 font-normal">วัน/เวลา</th><th className="p-2 font-normal">ห้อง</th><th className="p-2 font-normal">สถานะ</th></tr></thead>
                <tbody>
                  {preview.schedules?.map((row) => (
                    <tr key={`s-${row.row}`} className="border-b border-slate-50">
                      <td className="p-2">{row.row}</td>
                      <td className="p-2">{row.subjectCode} {row.section}</td>
                      <td className="p-2">{row.dayKey} {row.startTime}-{row.endTime}</td>
                      <td className="p-2">{row.roomName}</td>
                      <td className="p-2"><Pill tone={row.status === "error" ? "red" : "green"}>{row.status}</Pill> {row.messages?.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.enrollments?.length > 0 && (
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full min-w-[640px]">
                  <thead><tr className="text-muted text-left border-b"><th className="p-2 font-normal">User ID</th><th className="p-2 font-normal">วิชา</th><th className="p-2 font-normal">สถานะ</th></tr></thead>
                  <tbody>
                    {preview.enrollments.map((row) => (
                      <tr key={`e-${row.row}-${row.studentId}`} className="border-b border-slate-50">
                        <td className="p-2">{row.studentId}</td>
                        <td className="p-2">{row.subjectCode} / {row.roomName}</td>
                        <td className="p-2"><Pill tone={row.status === "error" ? "red" : row.status === "pending" ? "amber" : "green"}>{row.status === "pending" ? "รอลงทะเบียน" : row.status === "linked" ? "ผูกบัญชีแล้ว" : "ผิดพลาด"}</Pill> {row.linkedName} {row.messages?.join(" ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-ink mb-3">{editingId ? "แก้ไขตารางเรียน" : "เพิ่มตารางเรียน"}</h2>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="รหัสวิชา"><input required value={form.courseCode} onChange={(e) => setForm({ ...form, courseCode: e.target.value })} className={inputClass} /></Field>
          <Field label="ชื่อวิชา"><input value={form.courseName} onChange={(e) => setForm({ ...form, courseName: e.target.value })} className={inputClass} /></Field>
          <Field label="ตอน"><input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className={inputClass} /></Field>
          <Field label="ผู้สอน"><input value={form.instructorName} onChange={(e) => setForm({ ...form, instructorName: e.target.value })} className={inputClass} /></Field>
          <Field label="วัน">
            <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })} className={inputClass}>
              {DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
            </select>
          </Field>
          <Field label="เริ่ม"><input type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className={inputClass} /></Field>
          <Field label="สิ้นสุด"><input type="time" required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className={inputClass} /></Field>
          <Field label="ห้อง">
            <select required value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })} className={inputClass}>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </Field>
          <Field label="ปีการศึกษา"><input required value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} className={inputClass} /></Field>
          <Field label="เทอม">
            <select value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} className={inputClass}>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <Button size="sm" icon={Plus} iconPosition="left" disabled={busy}>{editingId ? "บันทึก" : "เพิ่มคาบ"}</Button>
            {editingId && <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingId(null); setForm({ ...emptyForm, roomId: rooms[0]?.id ?? "" }); }}>ยกเลิก</Button>}
          </div>
        </form>
      </Card>

      <Card className="p-5 overflow-x-auto">
        <table className="w-full min-w-[860px] text-xs">
          <thead>
            <tr className="text-muted text-left border-b border-slate-100">
              <th className="pb-2 font-normal">วิชา</th>
              <th className="pb-2 font-normal">วัน/เวลา</th>
              <th className="pb-2 font-normal">ห้อง</th>
              <th className="pb-2 font-normal">เทอม</th>
              <th className="pb-2 font-normal">นักศึกษา</th>
              <th className="pb-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-50">
                <td className="py-3">{row.courseCode} {row.section && <span className="text-muted">ตอน {row.section}</span>}<div className="text-muted">{row.courseName}</div></td>
                <td className="py-3">{row.dayLabel}<div>{row.startTime}–{row.endTime}</div></td>
                <td className="py-3">{row.room}</td>
                <td className="py-3">{row.term || "—"}</td>
                <td className="py-3">{row.enrolledCount + row.pendingCount}/{row.capacity}{row.pendingCount > 0 && <span className="text-amber-700"> (รอ {row.pendingCount})</span>}</td>
                <td className="py-3">
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" size="sm" onClick={() => openDetail(row)}>รายชื่อ</Button>
                    <Button variant="ghost" size="sm" icon={Pencil} onClick={() => editRow(row)}>แก้</Button>
                    <Button variant="danger" size="sm" icon={Trash2} onClick={() => removeRow(row)}>ปิด</Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted">ยังไม่มีตารางเรียนที่เปิดใช้</td></tr>}
          </tbody>
        </table>
      </Card>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">{selected.courseCode} ตอน {selected.section}</h2>
                <p className="text-xs text-muted mt-1">{selected.dayLabel} {selected.startTime}–{selected.endTime} · {selected.room}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 text-xl" aria-label="ปิด">×</button>
            </div>
            <form onSubmit={addStudent} className="flex gap-2 mb-4">
              <input value={studentId} onChange={(e) => setStudentId(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="รหัสนักศึกษา 10 หลัก" className={inputClass} />
              <Button size="sm">เพิ่ม</Button>
            </form>
            <table className="w-full text-xs">
              <thead><tr className="text-muted text-left border-b"><th className="pb-2 font-normal">รหัส</th><th className="pb-2 font-normal">ชื่อ</th><th className="pb-2 font-normal">สถานะ</th><th></th></tr></thead>
              <tbody>
                {selected.students?.map((item) => (
                  <tr key={item.id} className="border-b border-slate-50">
                    <td className="py-2">{item.studentId}</td>
                    <td className="py-2">{item.name || "—"}</td>
                    <td className="py-2"><Pill tone={item.type === "pending" ? "amber" : "green"}>{item.type === "pending" ? "รอลงทะเบียน" : "ลงทะเบียนแล้ว"}</Pill></td>
                    <td className="py-2 text-right"><Button variant="danger" size="sm" onClick={() => removeStudent(item)}>ลบ</Button></td>
                  </tr>
                ))}
                {selected.students?.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted">ยังไม่มีรายชื่อ</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}

function RoomsTab({ notify }) {
  const empty = { name: "", building: "อาคาร IT", capacity: 30, status: "open" };
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const load = () => getAdminRooms().then(setRows).catch((error) => notify(error.message));
  useEffect(() => { load(); }, []);

  const save = async (event) => {
    event.preventDefault();
    try {
      const payload = { ...form, capacity: Number(form.capacity) };
      if (editingId) await updateAdminRoom(editingId, payload);
      else await createAdminRoom(payload);
      setForm(empty);
      setEditingId(null);
      await load();
      notify(editingId ? "บันทึกห้องแล้ว" : "เพิ่มห้องแล้ว");
    } catch (error) {
      notify(error.message);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-sm font-bold text-ink mb-3">{editingId ? "แก้ไขห้องแล็บ" : "เพิ่มห้องแล็บ"}</h2>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="ชื่อห้อง"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></Field>
          <Field label="อาคาร"><input value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} className={inputClass} /></Field>
          <Field label="ความจุ / ที่นั่ง"><input type="number" min={1} max={200} required value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className={inputClass} /></Field>
          <Field label="สถานะ">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
              <option value="open">เปิดใช้งาน</option>
              <option value="closed">ปิด</option>
              <option value="maintenance">ปรับปรุง</option>
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <Button size="sm">{editingId ? "บันทึก" : "เพิ่มห้อง"}</Button>
            {editingId && <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingId(null); setForm(empty); }}>ยกเลิก</Button>}
          </div>
        </form>
      </Card>
      <Card className="p-5 overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead><tr className="text-muted text-left border-b"><th className="pb-2 font-normal">ห้อง</th><th className="pb-2 font-normal">อาคาร</th><th className="pb-2 font-normal">ความจุ</th><th className="pb-2 font-normal">สถานะ</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-50">
                <td className="py-3">{row.name}</td>
                <td className="py-3">{row.building || "—"}</td>
                <td className="py-3">{row.capacity} ที่นั่ง</td>
                <td className="py-3"><Pill tone={row.status === "open" ? "green" : row.status === "maintenance" ? "amber" : "red"}>{row.status}</Pill></td>
                <td className="py-3 text-right flex gap-2 justify-end">
                  <Button variant="secondary" size="sm" onClick={() => { setEditingId(row.id); setForm({ name: row.name, building: row.building ?? "", capacity: row.capacity, status: row.status }); }}>แก้ไข</Button>
                  <Button variant="danger" size="sm" onClick={async () => {
                    if (!window.confirm(`ลบหรือปิดห้อง ${row.name}?`)) return;
                    try {
                      const result = await deleteAdminRoom(row.id);
                      notify(result.action === "closed" ? result.message : "ลบห้องแล้ว");
                      await load();
                    } catch (error) {
                      notify(error.message);
                    }
                  }}>ลบ</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <KioskDevicesCard rooms={rows} notify={notify} />
    </div>
  );
}

function formatKioskWhen(value) {
  if (!value) return "ยังไม่เคยใช้";
  return new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
}

async function copyText(value) {
  await navigator.clipboard.writeText(value);
}

function KioskDevicesCard({ rooms, notify }) {
  const [roomId, setRoomId] = useState("");
  const [label, setLabel] = useState("เครื่องประตู");
  const [devices, setDevices] = useState([]);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async (selectedRoomId = roomId) => {
    const rows = await getKioskDevices(selectedRoomId || undefined);
    setDevices(rows);
  };

  useEffect(() => {
    if (!roomId && rooms[0]) setRoomId(rooms[0].id);
  }, [roomId, rooms]);

  useEffect(() => {
    load(roomId).catch((error) => notify(error.message));
  }, [roomId]);

  const createDevice = async (event) => {
    event.preventDefault();
    if (!roomId) return;
    setBusy(true);
    try {
      const result = await createKioskDevice({ roomId, label });
      setCreated(result);
      setLabel("เครื่องประตู");
      await load(roomId);
      notify("สร้างอุปกรณ์แล้ว — คัดลอกคีย์ทันที เพราะจะไม่แสดงอีก");
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  };

  const revokeDevice = async (device) => {
    if (!window.confirm(`เพิกถอนคีย์ของ ${device.label || "เครื่องประตู"}? เครื่องที่ใช้อยู่จะเข้าไม่ได้จนกว่าจะตั้งคีย์ใหม่`)) return;
    try {
      await revokeKioskDevice(device.id);
      if (created?.id === device.id) setCreated(null);
      await load(roomId);
      notify("เพิกถอนคีย์แล้ว");
    } catch (error) {
      notify(error.message);
    }
  };

  const setupUrl = created
    ? `${window.location.origin}/kiosk/${created.roomId}?key=${encodeURIComponent(created.apiKey)}`
    : "";

  return (
    <Card className="p-5">
      <h2 className="text-sm font-bold text-ink">อุปกรณ์ Kiosk ต่อห้อง</h2>
      <p className="text-xs text-muted mt-1">
        คีย์ผูกห้อง ไม่ผูกที่นั่ง — เปิดลิงก์บนเครื่องประตูครั้งเดียว แล้วคีย์จะถูกเก็บในเครื่องนั้น ไม่ต้องกรอกบนจอสแกน
      </p>
      <form onSubmit={createDevice} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <Field label="ห้อง">
          <select value={roomId} onChange={(event) => setRoomId(event.target.value)} className={inputClass}>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>{room.name}</option>
            ))}
          </select>
        </Field>
        <Field label="ชื่ออุปกรณ์">
          <input value={label} onChange={(event) => setLabel(event.target.value)} className={inputClass} placeholder="เครื่องประตู" />
        </Field>
        <div className="flex items-end">
          <Button size="sm" disabled={!roomId || busy}>{busy ? "กำลังสร้าง..." : "สร้างคีย์"}</Button>
        </div>
      </form>
      {created?.apiKey && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-900">แสดงคีย์ครั้งเดียว — คัดลอกแล้วเปิดบนเครื่องประตู</p>
          <p className="mt-2 font-mono text-xs break-all text-ink">{created.apiKey}</p>
          <p className="mt-2 text-xs text-slate-600 break-all">{setupUrl}</p>
          <div className="flex gap-2 mt-3">
            <Button type="button" variant="secondary" size="sm" icon={Copy} onClick={async () => {
              await copyText(created.apiKey);
              notify("คัดลอกคีย์แล้ว");
            }}>คัดลอกคีย์</Button>
            <Button type="button" variant="secondary" size="sm" icon={Copy} onClick={async () => {
              await copyText(setupUrl);
              notify("คัดลอกลิงก์ตั้งค่าแล้ว");
            }}>คัดลอกลิงก์เครื่องประตู</Button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto mt-4">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="text-muted text-left border-b">
              <th className="pb-2 font-normal">อุปกรณ์</th>
              <th className="pb-2 font-normal">ห้อง</th>
              <th className="pb-2 font-normal">สถานะ</th>
              <th className="pb-2 font-normal">ใช้ล่าสุด</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.id} className="border-b border-slate-50">
                <td className="py-3">{device.label || "เครื่องประตู"}</td>
                <td className="py-3">{device.roomName}</td>
                <td className="py-3">
                  <Pill tone={device.revoked ? "red" : "green"}>{device.revoked ? "เพิกถอนแล้ว" : "ใช้งานได้"}</Pill>
                </td>
                <td className="py-3">{formatKioskWhen(device.lastSeenAt)}</td>
                <td className="py-3 text-right">
                  {!device.revoked && (
                    <Button variant="danger" size="sm" onClick={() => revokeDevice(device)}>เพิกถอน</Button>
                  )}
                </td>
              </tr>
            ))}
            {devices.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-muted">ยังไม่มีอุปกรณ์ Kiosk ของห้องนี้</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ComputersTab({ notify }) {
  const empty = { machineNo: "", roomId: "", ipAddress: "", macAddress: "", status: "offline" };
  const [rows, setRows] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [computerRows, roomRows] = await Promise.all([getAdminComputers(), getAdminRooms()]);
    setRows(computerRows);
    setRooms(roomRows);
    if (!form.roomId && roomRows[0]) setForm((current) => ({ ...current, roomId: roomRows[0].id }));
  };

  useEffect(() => { load().catch((error) => notify(error.message)); }, []);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (editingId) await updateAdminComputer(editingId, form);
      else await createAdminComputer(form);
      setForm({ ...empty, roomId: rooms[0]?.id ?? "" });
      setEditingId(null);
      await load();
      notify(editingId ? "บันทึกเครื่องแล้ว" : "เพิ่มเครื่องแล้ว");
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-sm font-bold text-ink mb-3">{editingId ? "แก้ไขเครื่องคอม" : "เพิ่มเครื่องคอม"}</h2>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="หมายเลขเครื่อง"><input required maxLength={10} value={form.machineNo} onChange={(event) => setForm({ ...form, machineNo: event.target.value })} className={inputClass} /></Field>
          <Field label="ห้อง"><select required value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })} className={inputClass}>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></Field>
          <Field label="สถานะ"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className={inputClass}><option value="offline">Offline</option><option value="online">Online</option><option value="maintenance">ซ่อมบำรุง</option></select></Field>
          <Field label="IP address"><input value={form.ipAddress} onChange={(event) => setForm({ ...form, ipAddress: event.target.value })} className={inputClass} /></Field>
          <Field label="MAC address"><input placeholder="AA:BB:CC:DD:EE:FF" value={form.macAddress} onChange={(event) => setForm({ ...form, macAddress: event.target.value.toUpperCase() })} className={inputClass} /></Field>
          <div className="flex items-end gap-2"><Button size="sm" disabled={busy}>{editingId ? "บันทึก" : "เพิ่มเครื่อง"}</Button>{editingId && <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingId(null); setForm({ ...empty, roomId: rooms[0]?.id ?? "" }); }}>ยกเลิก</Button>}</div>
        </form>
      </Card>
      <Card className="p-5 overflow-x-auto">
        <table className="w-full min-w-[800px] text-xs">
          <thead><tr className="text-muted text-left border-b"><th className="pb-2 font-normal">เครื่อง</th><th className="pb-2 font-normal">ห้อง</th><th className="pb-2 font-normal">เครือข่าย</th><th className="pb-2 font-normal">สถานะ</th><th className="pb-2 font-normal">เห็นล่าสุด</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.id} className="border-b border-slate-50"><td className="py-3">{row.machineNo}</td><td className="py-3">{row.roomName}</td><td className="py-3">{row.ipAddress || "—"}<div className="text-muted">{row.macAddress || "—"}</div></td><td className="py-3"><Pill tone={row.status === "online" ? "green" : row.status === "maintenance" ? "amber" : "red"}>{row.status}</Pill></td><td className="py-3">{row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString("th-TH") : "ยังไม่เคย"}</td><td className="py-3"><div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => { setEditingId(row.id); setForm(row); }}>แก้ไข</Button><Button size="sm" variant="danger" onClick={async () => { if (!window.confirm(`ลบเครื่อง ${row.machineNo} หรือไม่?`)) return; try { await deleteAdminComputer(row.id); await load(); notify("ลบเครื่องแล้ว"); } catch (error) { notify(error.message); } }}>ลบ</Button></div></td></tr>)}
            {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted">ยังไม่มีเครื่องคอม</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function UsersTab({ notify }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const load = () => getManagedUsers().then(setRows).catch((error) => notify(error.message));

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((row) => {
    const text = `${row.username} ${row.email} ${row.name}`.toLowerCase();
    return text.includes(search.trim().toLowerCase());
  });

  const toggle = async (row) => {
    const nextActive = !row.active;
    if (!nextActive && !window.confirm(`ปิดบัญชี ${row.username} หรือไม่?`)) return;
    setBusyId(row.id);
    try {
      await setManagedUserActive(row.id, nextActive);
      await load();
      notify(nextActive ? "เปิดบัญชีผู้ใช้แล้ว" : "ปิดบัญชีผู้ใช้แล้ว");
    } catch (error) {
      notify(error.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap justify-between gap-3 items-center">
          <div>
            <h2 className="text-sm font-bold text-ink">บัญชีผู้ใช้งาน</h2>
            <p className="text-xs text-muted mt-1">ดูคะแนนและเปิดหรือปิดบัญชี โดยไม่ลบประวัติ</p>
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ อีเมล หรือ username" className={`${inputClass} max-w-xs`} />
        </div>
      </Card>
      <Card className="p-5 overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <thead><tr className="text-muted text-left border-b"><th className="pb-2 font-normal">ผู้ใช้</th><th className="pb-2 font-normal">ประเภท</th><th className="pb-2 font-normal">คะแนน</th><th className="pb-2 font-normal">สถานะ</th><th></th></tr></thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-b border-slate-50">
                <td className="py-3">{row.name || "—"}<div className="text-muted">{row.username} · {row.email}</div></td>
                <td className="py-3">{row.role === "student" ? "นักศึกษา" : "บุคคลภายนอก"}</td>
                <td className="py-3">{row.usageScore}</td>
                <td className="py-3"><Pill tone={row.active ? "green" : "red"}>{row.active ? "ใช้งาน" : "ปิดบัญชี"}</Pill></td>
                <td className="py-3 text-right"><Button size="sm" variant={row.active ? "danger" : "secondary"} disabled={busyId === row.id} onClick={() => toggle(row)}>{row.active ? "ปิดบัญชี" : "เปิดบัญชี"}</Button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-muted">ไม่พบผู้ใช้งาน</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function AdminsTab({ notify }) {
  const empty = { email: "", password: "", username: "", jobTitle: "", phone: "", firstName: "", lastName: "", role: "admin" };
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [confirmDisable, setConfirmDisable] = useState(null);

  const load = () => getAdminUsers().then(setRows).catch((error) => notify(error.message));
  useEffect(() => { load(); }, []);

  const save = async (event) => {
    event.preventDefault();
    try {
      if (editingId) {
        await updateAdminUser(editingId, {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          password: form.password,
          role: form.role,
        });
        notify("บันทึกผู้ดูแลระบบแล้ว");
      } else {
        const result = await createAdminUser(form);
        notify(result.message || "สร้างบัญชีและส่งลิงก์ตั้งรหัสแล้ว");
      }
      setForm(empty);
      setEditingId(null);
      await load();
    } catch (error) {
      notify(error.message);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-sm font-bold text-ink mb-3">{editingId ? "แก้ไขผู้ดูแลระบบ" : "เพิ่มผู้ดูแลระบบ"}</h2>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="อีเมล"><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} /></Field>
          <Field label="ชื่อ"><input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inputClass} /></Field>
          <Field label="นามสกุล"><input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inputClass} /></Field>
          {editingId && <Field label="รหัสผ่านใหม่ (ไม่บังคับ)">
            <input type="password" required={!editingId} minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
          </Field>}
          {!editingId && <><Field label="ชื่อผู้ใช้"><input minLength={3} value={form.username} onChange={e => setForm({...form, username:e.target.value})} className={inputClass} /></Field><Field label="ตำแหน่งงาน"><input value={form.jobTitle} onChange={e => setForm({...form, jobTitle:e.target.value})} className={inputClass} /></Field><Field label="โทรศัพท์"><input value={form.phone} onChange={e => setForm({...form, phone:e.target.value})} className={inputClass} /></Field></>}
          <Field label="สิทธิ์">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputClass}>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <Button size="sm">{editingId ? "บันทึก" : "สร้างบัญชี"}</Button>
            {editingId && <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingId(null); setForm(empty); }}>ยกเลิก</Button>}
          </div>
        </form>
      </Card>
      <Card className="p-5 overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <thead><tr className="text-muted text-left border-b"><th className="pb-2 font-normal">ชื่อ</th><th className="pb-2 font-normal">บัญชี</th><th className="pb-2 font-normal">ตำแหน่ง</th><th className="pb-2 font-normal">สถานะ</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-50">
                <td className="py-3">{row.firstName} {row.lastName}</td>
                <td className="py-3">{row.username}<div className="text-muted">{row.email}</div></td>
                <td className="py-3">{row.role === "super_admin" ? "Super Admin" : "Admin"}</td>
                <td className="py-3"><Pill tone={row.status === "active" ? "green" : "red"}>{row.status === "active" ? "ใช้งาน" : "ปิดบัญชี"}</Pill></td>
                <td className="py-3">
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" size="sm" onClick={() => { setEditingId(row.id); setForm({ email: row.email, password: "", firstName: row.firstName, lastName: row.lastName, role: row.role }); }}>แก้ไข</Button>
                    {row.status === "active"
                      ? <Button variant="danger" size="sm" onClick={() => setConfirmDisable(row)}>ปิดบัญชี</Button>
                      : <Button variant="secondary" size="sm" onClick={async () => { try { await enableAdminUser(row.id); await load(); notify("เปิดบัญชีแล้ว"); } catch (error) { notify(error.message); } }}>เปิดบัญชี</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {confirmDisable && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-ink">ปิดบัญชีผู้ดูแลระบบ?</h2>
            <p className="text-xs text-muted mt-2">บัญชี {confirmDisable.username} จะถูกปิด แต่ประวัติยังอยู่ ไม่ลบออกจากระบบ</p>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDisable(null)}>ยกเลิก</Button>
              <Button variant="danger" size="sm" onClick={async () => {
                try {
                  await disableAdminUser(confirmDisable.id);
                  setConfirmDisable(null);
                  await load();
                  notify("ปิดบัญชีแล้ว");
                } catch (error) {
                  notify(error.message);
                }
              }}>ปิดบัญชี</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="text-xs text-slate-600">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
