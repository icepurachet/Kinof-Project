import React, { useState } from "react";
import { Users, ShieldAlert, ArrowLeft, Mail, Lock, Chrome } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import Card from "../components/Card";
import PasswordInput from "../components/PasswordInput";
import { NAVY, GOLD } from "../theme";
import { login } from "../api/auth";

export default function Login({ onAuthenticated }) {
  const location = useLocation();
  const [roleChoice, setRoleChoice] = useState(null);
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState(location.state?.notice ?? "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(username, pw, roleChoice);
      onAuthenticated?.(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  if (!roleChoice) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F4F5F8" }}>
        <div className="text-center">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center font-semibold text-lg mx-auto mb-4" style={{ background: GOLD, color: NAVY }}>
            KN
          </div>
          <h1 className="text-xl font-medium text-gray-900 mb-1">ระบบดูแลและจองห้องคอมพิวเตอร์ KINOF</h1>
          <p className="text-sm text-gray-500 mb-8">เลือกประเภทการเข้าใช้งาน</p>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6 max-w-md mx-auto" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-4">
            <button
              onClick={() => setRoleChoice("user")}
              className="w-56 bg-white border border-gray-200 rounded-xl p-6 hover:border-gray-400 transition text-left"
            >
              <Users size={22} className="mb-3 text-gray-700" />
              <div className="font-medium text-gray-900">ผู้ใช้งาน</div>
              <div className="text-xs text-gray-500 mt-1">นักศึกษา / บุคคลภายนอก จองห้องแล็บและขอความช่วยเหลือ</div>
            </button>
            <button
              onClick={() => setRoleChoice("admin")}
              className="w-56 bg-white border border-gray-200 rounded-xl p-6 hover:border-gray-400 transition text-left"
            >
              <ShieldAlert size={22} className="mb-3 text-gray-700" />
              <div className="font-medium text-gray-900">ผู้ดูแลระบบ</div>
              <div className="text-xs text-gray-500 mt-1">ตรวจสอบการใช้งาน ส่งออกข้อมูล และจัดการปัญหา</div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = roleChoice === "admin";

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#F4F5F8" }}>
      <Card className="w-[380px] p-7">
        <button onClick={() => setRoleChoice(null)} className="flex items-center gap-1 text-xs text-gray-400 mb-5 hover:text-gray-600">
          <ArrowLeft size={13} /> เปลี่ยนประเภทผู้ใช้งาน
        </button>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-sm" style={{ background: GOLD, color: NAVY }}>
            KN
          </div>
          <span className="font-medium text-gray-900">KINOF</span>
        </div>
        <h2 className="text-lg font-medium text-gray-900 mt-4">{isAdmin ? "เข้าสู่ระบบผู้ดูแลระบบ" : "เข้าสู่ระบบผู้ใช้งาน"}</h2>
        <p className="text-xs text-gray-500 mb-5">{isAdmin ? "สำหรับเจ้าหน้าที่ดูแลระบบห้องปฏิบัติการ" : "นักศึกษาและบุคคลภายนอกเข้าสู่ระบบที่นี่"}</p>

        <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2.5 mb-5">
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ชื่อผู้ใช้หรืออีเมล"
              autoComplete="username"
              required
              className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-gray-400"
            />
          </div>
          <PasswordInput
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            icon={Lock}
            placeholder="รหัสผ่าน"
            autoComplete="current-password"
            required
            className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-10 py-2.5 focus:outline-none focus:border-gray-400"
          />
          <Link to="/forgot-password" className="self-end text-xs text-gray-500 underline hover:text-gray-700">
            ลืมรหัสผ่าน?
          </Link>
        </div>

        {error && <p className="text-xs text-red-600 mb-3" role="alert">{error}</p>}

        <button disabled={loading} className="w-full text-white text-sm font-medium rounded-lg py-2.5 mb-4 disabled:opacity-60" style={{ background: NAVY }}>
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
        </form>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-px bg-gray-200 flex-1" />
          <span className="text-xs text-gray-400">หรือ</span>
          <div className="h-px bg-gray-200 flex-1" />
        </div>

        <div className="flex flex-col gap-2">
          <button disabled className="w-full flex items-center justify-center gap-2 border border-gray-200 rounded-lg py-2.5 text-sm text-gray-400 cursor-not-allowed">
            <Chrome size={16} /> Google (เร็ว ๆ นี้)
          </button>
        </div>

        {!isAdmin && (
          <p className="text-xs text-gray-400 text-center mt-5">
            ยังไม่มีบัญชี{" "}
            <Link to="/register" className="text-gray-600 underline">สมัครสมาชิกที่นี่</Link>
          </p>
        )}
      </Card>
    </div>
  );
}
