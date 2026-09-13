import React from "react";
import { Calendar, Clock, Plus, ArrowRight, CheckCircle2, History, Sparkles, KeyRound } from "lucide-react";
import Card from "../../components/Card";
import Pill from "../../components/Pill";
import Button from "../../components/Button";
import { TEAL } from "../../theme";
import { getDisplayName } from "../../utils/displayName";

export default function UserHome({ setPage, myBookings = [], auth }) {
  const latest = myBookings.length > 0 ? myBookings[0] : null;
  const displayName = getDisplayName(auth?.user);

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Title */}
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-ink tracking-tight">หน้าหลัก</h1>
        <p className="text-caption mt-0.5">ภาพรวมการจองและกิจกรรมล่าสุดของคุณ</p>
      </div>

      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl text-white p-6 md:p-7 mb-7 shadow-blue-glow border border-navy-700/30 bg-brand-gradient">
        <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-gold-400 text-xs font-medium mb-3 backdrop-blur-md border border-white/10">
              <Sparkles size={14} />
              <span>ระบบจองห้องแล็บ KINOF</span>
            </div>
            <h2 className="font-bold text-lg md:text-2xl mb-1.5 tracking-tight text-white">
              {displayName}!
            </h2>
            <p className="text-xs md:text-sm text-white/95 font-light leading-relaxed">
              ตรวจสอบสถานะห้องแล็บ จัดการกลุ่มเพื่อน หรือเริ่มต้นจองพื้นที่เพื่อการเรียนรู้และการทำโครงงานได้ตลอด 24 ชั่วโมง
            </p>
          </div>

          <Button variant="gold" size="lg" icon={ArrowRight} onClick={() => setPage("book")} className="shrink-0">
            จองห้องแล็บทันที
          </Button>
        </div>
        <div className="absolute -right-10 -bottom-10 w-48 h-48 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute right-24 top-0 w-24 h-24 rounded-full blur-3xl pointer-events-none" style={{ background: `${TEAL}30` }} />
      </div>

      <Card
        className="p-5 md:p-6 mb-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:border-slate-300 transition-all duration-200"
        hoverable
        onClick={() => setPage("entry-otp")}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-navy-50 text-navy-800 flex items-center justify-center shrink-0">
            <KeyRound size={18} />
          </div>
          <div>
            <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">รหัสเข้าห้องสำรอง</div>
            <h3 className="font-bold text-ink text-base">ขอ OTP ทางอีเมลก่อนไปแล็บ</h3>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              ใช้เมื่อสแกนหน้าไม่สำเร็จที่ Kiosk เท่านั้น — รหัสใช้ได้ 10 นาที ครั้งเดียว
            </p>
          </div>
        </div>
        <Button variant="secondary" icon={ArrowRight} onClick={(event) => { event.stopPropagation(); setPage("entry-otp"); }}>
          ขอรหัสเข้าห้อง
        </Button>
      </Card>

      {/* Grid Quick Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-7">
        {/* การ์ด 1: การจองปัจจุบัน */}
        <Card className="p-5 md:p-6 flex flex-col justify-between hover:border-slate-300 transition-all duration-200">
          <div>
            <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-navy-50 text-navy-800 flex items-center justify-center">
                <Calendar size={14} />
              </div>
              <span>การจองปัจจุบันของคุณ</span>
            </div>

            <div className="font-bold text-ink text-base md:text-lg mt-1">
              {latest ? latest.room : "ยังไม่มีรายการจองที่กำลังจะถึง"}
            </div>

            {latest ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg font-medium border border-slate-200/60">
                  {latest.date}
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/50">
                  <Clock size={13} className="text-slate-400" /> {latest.slot}
                </span>
              </div>
            ) : (
              <p className="text-caption mt-2">สามารถเลือกวัน เวลา และห้องว่างเพื่อเริ่มต้นจองได้ทันที</p>
            )}
          </div>

          <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between">
            {latest ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <CheckCircle2 size={15} />
                <span>สถานะ: พร้อมเข้าใช้งาน</span>
              </div>
            ) : (
              <span className="text-caption">สถานะ: ไม่มีรอบที่รอดำเนินการ</span>
            )}
          </div>
        </Card>

        {/* การ์ด 2: จองห้องแล็บใหม่ */}
        <Card className="p-5 md:p-6 flex flex-col justify-between hover:border-slate-300 transition-all duration-200">
          <div>
            <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gold-50 text-gold-600 flex items-center justify-center">
                <Plus size={14} />
              </div>
              <span>จองห้องแล็บใหม่</span>
            </div>

            <h3 className="font-bold text-ink text-base md:text-lg mt-1">
              ค้นหาและจองช่วงเวลาว่าง
            </h3>
            <p className="text-xs text-muted mt-1.5 font-light leading-relaxed">
              คุณใช้งานระบบไปแล้วทั้งหมด{" "}
              <span className="inline-flex items-center gap-1 font-semibold text-teal-500 bg-teal-50 px-1.5 py-0.5 rounded-md">
                {myBookings.length} ครั้ง
              </span>{" "}
              ในภาคการศึกษานี้
            </p>
          </div>

          <div className="mt-5 pt-3.5 border-t border-slate-100">
            <Button variant="secondary" icon={ArrowRight} onClick={() => setPage("book")}>
              เริ่มต้นการจอง
            </Button>
          </div>
        </Card>
      </div>

      {/* ตารางประวัติการจอง */}
      <Card className="p-5 md:p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <History size={17} className="text-slate-500" />
            <h3 className="text-sm md:text-base font-bold text-ink">ประวัติการจองทั้งหมด</h3>
          </div>
          <span className="text-caption">{myBookings.length} รายการ</span>
        </div>

        {myBookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-14 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <div className="w-11 h-11 rounded-2xl bg-white flex items-center justify-center mb-3 border border-slate-100 shadow-sm">
              <History size={20} strokeWidth={1.5} className="text-slate-300" />
            </div>
            <span className="text-xs font-medium text-slate-500">คุณยังไม่มีประวัติการจองห้องแล็บ</span>
            <span className="text-caption mt-0.5">เริ่มจองห้องแรกของคุณได้จากปุ่ม "จองห้องแล็บทันที" ด้านบน</span>
          </div>
        ) : (
          <div className="border border-slate-200/80 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200/80">
                    <th className="py-3.5 px-5 font-semibold">วันที่</th>
                    <th className="py-3.5 px-5 font-semibold">ช่วงเวลา</th>
                    <th className="py-3.5 px-5 font-semibold">ห้องแล็บ</th>
                    <th className="py-3.5 px-5 font-semibold text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {myBookings.map((b, i) => (
                    <tr key={b.id || i} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-5 font-medium text-ink">{b.date}</td>
                      <td className="py-3.5 px-5 text-slate-600">{b.slot}</td>
                      <td className="py-3.5 px-5 font-medium text-slate-800">{b.room}</td>
                      <td className="py-3.5 px-5 text-center">
                        <Pill tone="green" withDot>ยืนยันแล้ว</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}