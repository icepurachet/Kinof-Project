import React, { useEffect, useState } from "react";
import { Calendar, Check, Clock, MailOpen, Users, X } from "lucide-react";
import Card from "../../components/Card";
import Button from "../../components/Button";
import { acceptInvitation, declineInvitation, formatSlotLabel, getMyInvitations, parseStoredDate } from "../../api/bookings";

function formatDate(value) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "long" }).format(parseStoredDate(value));
}

export default function Invitation({ notify, onInvitationAccepted }) {
  const [invitations, setInvitations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestError, setRequestError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadInvitations = () => {
    setLoading(true);
    getMyInvitations()
      .then(setInvitations)
      .catch((error) => setRequestError(error.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadInvitations, []);

  const handleAccept = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const booking = await acceptInvitation(selected.id);
      setInvitations((current) => current.filter((item) => item.id !== selected.id));
      setSelected(null);
      onInvitationAccepted?.(booking);
      notify?.("ยืนยันการเข้าร่วมกลุ่มเรียบร้อยแล้ว");
    } catch (error) {
      notify?.(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async (invitation) => {
    try {
      await declineInvitation(invitation.id);
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      notify?.("ปฏิเสธคำเชิญเรียบร้อยแล้ว");
    } catch (error) {
      notify?.(error.message);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-ink tracking-tight">รายการคำเชิญเข้าร่วมกลุ่ม</h1>
        <p className="text-caption mt-0.5">ตรวจสอบคำเชิญและยืนยันการใช้ห้องแล็บร่วมกับเพื่อน</p>
      </div>

      <Card className="p-5 md:p-6">
        {loading && <p className="text-sm text-slate-500 py-10 text-center">กำลังโหลดคำเชิญ...</p>}
        {!loading && requestError && <p className="text-sm text-rose-600 py-10 text-center">{requestError}</p>}
        {!loading && !requestError && invitations.length === 0 && (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400">
            <MailOpen size={30} strokeWidth={1.5} className="text-slate-300 mb-3" />
            <span className="text-xs font-medium text-slate-500">ไม่มีรายการคำเชิญในขณะนี้</span>
          </div>
        )}
        <div className="grid gap-3">
          {!loading && invitations.map((item) => (
            <div key={item.id} className="border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Users size={16} /> {item.inviter}</div>
                <div className="text-xs text-slate-500 mt-2 flex items-center gap-2"><Calendar size={13} /> {formatDate(item.startTime)}</div>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-2"><Clock size={13} /> {formatSlotLabel(item.startTime, item.endTime)} · {item.room}</div>
                <div className="text-xs text-amber-700 mt-1">สถานะ: {item.status === "pending" ? "รอดำเนินการ" : item.status}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="danger" size="sm" icon={X} onClick={() => handleDecline(item)}>ปฏิเสธ</Button>
                <Button variant="success" size="sm" icon={Check} onClick={() => setSelected(item)}>ยอมรับ</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-ink">ยืนยันการเข้าร่วมกลุ่ม</h2>
            <p className="text-sm text-slate-600 mt-2">คุณต้องการเข้าร่วมกลุ่มของ {selected.inviter} เพื่อใช้ {selected.room} ในวันที่ {formatDate(selected.startTime)} เวลา {formatSlotLabel(selected.startTime, selected.endTime)} ใช่หรือไม่</p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">หลังยืนยัน คุณจะไม่สามารถจองห้องอื่นในวันและเวลาเดียวกันได้</p>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="secondary" onClick={() => setSelected(null)}>ยกเลิก</Button>
              <Button variant="success" icon={Check} onClick={handleAccept} disabled={submitting}>{submitting ? "กำลังยืนยัน..." : "ยืนยันการเข้าร่วม"}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
