import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/Card";
import Pill from "../../components/Pill";
import Button from "../../components/Button";
import { User, Mail, Hash, BookOpen, AlertCircle, Award, KeyRound, ArrowRight, Camera } from "lucide-react";
import { getMySchedule, toProfileScheduleRows } from "../../api/schedules";
import { getBehavior } from "../../api/behavior";
import { getMyProfileStats } from "../../api/auth";

const formatPenaltyDate = (value) => new Date(value).toLocaleDateString("th-TH", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default function UserProfile({ auth, setPage }) {
  const navigate = useNavigate();
  const user = auth?.user;
  const [scheduleRows, setScheduleRows] = useState([]);
  const [userScore, setUserScore] = useState(null);
  const [stats, setStats] = useState(null);
  const [scoreError, setScoreError] = useState("");
  const [penalties, setPenalties] = useState([]);
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "ผู้ใช้งาน";
  const userTypeLabel = user?.userType === "student" ? "นักศึกษา" : "บุคคลภายนอก";
  const scoreBarClass = userScore >= 80 ? "bg-teal-500" : userScore >= 50 ? "bg-gold-gradient" : "bg-rose-500";

  useEffect(() => {
    if (user?.userType !== "student") {
      setScheduleRows([]);
      return;
    }
    getMySchedule()
      .then((items) => setScheduleRows(toProfileScheduleRows(items)))
      .catch(() => setScheduleRows([]));
  }, [user?.userType, user?.id]);

  useEffect(() => {
    getMyProfileStats().then(setStats).catch(() => setStats(null));
    getBehavior()
      .then((data) => {
        setUserScore(typeof data.score === "number" ? data.score : null);
        setScoreError("");
        setPenalties(Array.isArray(data.penalties) ? data.penalties : []);
      })
      .catch((error) => {
        setUserScore(null);
        setScoreError(error.message || "โหลดคะแนนไม่สำเร็จ");
        setPenalties([]);
      });
  }, [user?.id]);

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-ink tracking-tight">โปรไฟล์ผู้ใช้งาน</h1>
        <p className="text-caption mt-0.5">ข้อมูลส่วนตัว คะแนนพฤติกรรม และตารางเรียน</p>
      </div>

      {!user?.faceEnrolled && (
        <Card className="p-5 md:p-6 mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-amber-200/80 bg-amber-50/40">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <Camera size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">ลงทะเบียนใบหน้า</div>
              <p className="text-sm text-slate-700">ยังไม่ได้ลงทะเบียน — สแกนหน้าเพื่อเข้า Kiosk ได้เร็วขึ้น (หรือใช้ OTP สำรองแทนได้)</p>
            </div>
          </div>
          <Button variant="secondary" icon={ArrowRight} onClick={() => navigate("/register/face")}>
            ลงทะเบียนใบหน้า
          </Button>
        </Card>
      )}

      <Card className="p-5 md:p-6 mb-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-navy-50 text-navy-800 flex items-center justify-center shrink-0">
            <KeyRound size={18} />
          </div>
          <div>
            <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">รหัสเข้าห้องสำรอง</div>
            <p className="text-sm text-slate-700">ขอ OTP ทางอีเมล ใช้เมื่อสแกนหน้าไม่สำเร็จที่ Kiosk</p>
          </div>
        </div>
        {typeof setPage === "function" && (
          <Button variant="secondary" icon={ArrowRight} onClick={() => setPage("entry-otp")}>
            ขอรหัสเข้าห้อง
          </Button>
        )}
      </Card>

      {/* Grid Profile & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-7">
        {/* การ์ดข้อมูลส่วนตัว */}
        <Card className="p-5 md:p-6 lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-navy-900 font-bold text-xl shadow-md shrink-0 bg-gold-gradient">
                {user?.firstName?.[0] ?? "ผ"}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-bold text-ink text-base md:text-lg">{fullName}</h2>
                  <Pill tone="blue" withDot>{userTypeLabel}</Pill>
                </div>
                <p className="text-caption">ข้อมูลบัญชีจากระบบ KINOF</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs border-t border-slate-100 pt-5">
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                <Mail size={15} className="text-slate-400 shrink-0" />
                <div>
                  <span className="text-muted block text-xs">อีเมลมหาวิทยาลัย</span>
                  <span className="text-slate-800 font-medium">{user?.email ?? "—"}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                <User size={15} className="text-slate-400 shrink-0" />
                <div>
                  <span className="text-muted block text-xs">ประเภทผู้ใช้งาน</span>
                  <span className="text-slate-800 font-medium">{user?.userType ?? "—"}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                <Hash size={15} className="text-slate-400 shrink-0" />
                <div>
                  <span className="text-muted block text-xs">รหัสประจำตัว</span>
                  <span className="text-slate-800 font-medium">{user?.studentId ?? "—"}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                <Award size={15} className="text-slate-400 shrink-0" />
                <div>
                  <span className="text-muted block text-xs">สถานะสิทธิ์การจอง</span>
                  <span className="text-emerald-600 font-medium">ปกติ (ใช้งานได้สมบูรณ์)</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* การ์ดสถิติ, คะแนน และประวัติการหักคะแนน */}
        <Card className="p-5 md:p-6 flex flex-col gap-4 justify-between">
          <div>
            <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              สถิติการใช้งานห้องแล็บ
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="text-center border border-slate-100 bg-slate-50/60 rounded-2xl py-3">
                <div className="font-bold text-ink text-lg">{stats?.bookingCount ?? "—"}</div>
                <div className="text-xs text-muted mt-0.5">ครั้งที่จองสำเร็จ</div>
              </div>
              <div className="text-center border border-slate-100 bg-slate-50/60 rounded-2xl py-3">
                <div className="font-bold text-ink text-lg">{stats ? (stats.totalUsageMinutes / 60).toFixed(1) : "—"}</div>
                <div className="text-xs text-muted mt-0.5">ชั่วโมงที่เข้าใช้งาน</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">คะแนนพฤติกรรม</span>
                <span className="text-sm font-bold text-navy-800">{userScore ?? "—"}<span className="text-muted font-medium text-xs"> / 100</span></span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200/70 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${scoreBarClass}`}
                  style={{ width: `${userScore ?? 0}%` }}
                />
              </div>
              <p className="text-[11px] text-muted mt-2">
                {scoreError && <span className="block text-rose-600">{scoreError}</span>}
                คะแนนต่ำกว่า 50 จองห้องไม่ได้ · รีเซ็ตเป็น 100 ทุกวันที่ 1 ของเดือน
              </p>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <AlertCircle size={14} className="text-slate-400" />
              <span>ประวัติการหักคะแนน</span>
            </div>

            <div className="flex flex-col gap-2">
              {penalties.length > 0 ? (
                penalties.map((item) => (
                  <div
                    key={item.id}
                    className="border border-rose-100 rounded-xl p-3 bg-rose-50/30 text-xs"
                  >
                    <div className="font-semibold text-rose-800 mb-0.5">
                      {formatPenaltyDate(item.at)} • หัก {item.points} คะแนน
                    </div>
                    <div className="text-slate-600 font-light leading-relaxed text-xs">
                      สาเหตุ: {item.reason}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted text-center py-4 border border-dashed border-slate-200 rounded-xl">
                  ไม่มีประวัติการหักคะแนน
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* ตารางเรียน */}
      <Card className="p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen size={17} className="text-slate-500" />
          <h3 className="text-sm md:text-base font-bold text-ink">ตารางเรียนประจำภาคการศึกษา</h3>
        </div>

        <div className="border border-slate-200/80 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="flex flex-col divide-y divide-slate-100 min-w-[500px]">
              {scheduleRows && scheduleRows.length > 0 ? (
                scheduleRows.map((r, i) => (
                  <div
                    key={`${r.day}-${r.course}-${i}`}
                    className="flex items-center text-xs hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="bg-slate-50 text-slate-700 font-semibold px-5 py-3.5 w-32 shrink-0 border-r border-slate-100">
                      {r.day}
                    </div>
                    <div className="px-5 py-3.5 flex-1 font-medium text-slate-800">
                      {r.course || "— ไม่มีคาบเรียน —"}
                    </div>
                    <div className="px-5 py-3.5 text-slate-500 w-60 shrink-0 text-right font-light">
                      {r.time} {r.room && <span className="font-medium text-slate-700">· {r.room}</span>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted text-center py-8">ไม่พบข้อมูลตารางเรียน</div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
