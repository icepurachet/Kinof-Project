import React, { useState } from "react";
import { ArrowLeft, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import PasswordInput from "../components/PasswordInput";
import { register } from "../api/auth";
import { GOLD, NAVY } from "../theme";

const initialForm = {
  userType: "student",
  studentId: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  firstName: "",
  lastName: "",
  phone: "",
};

export default function Register({ onOtpRequired }) {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (form.userType === "student" && !/^\d{10}$/.test(form.studentId.trim())) {
      setError("รหัสนักศึกษาต้องเป็นตัวเลข 10 หลัก");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    setLoading(true);
    try {
      const result = await register({
        username: form.username,
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        userType: form.userType,
        studentId: form.userType === "student" ? form.studentId : null,
        phone: form.phone || null,
      });
      onOtpRequired?.(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-gray-400";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: "#F4F5F8" }}>
      <Card className="w-full max-w-2xl p-7">
        <Link to="/login" className="flex items-center gap-1 text-xs text-gray-400 mb-5 hover:text-gray-600">
          <ArrowLeft size={13} /> กลับไปหน้าเข้าสู่ระบบ
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: GOLD, color: NAVY }}>
            <UserPlus size={20} />
          </div>
          <div>
            <h1 className="text-lg font-medium text-gray-900">สมัครบัญชี KINOF</h1>
            <p className="text-xs text-gray-500">สร้างบัญชีแล้วลงทะเบียนใบหน้าเพื่อใช้เข้าห้อง</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-gray-600">
            ประเภทผู้ใช้งาน
            <select value={form.userType} onChange={update("userType")} className={`${inputClass} mt-1`}>
              <option value="student">นักศึกษา</option>
              <option value="external">บุคคลภายนอก</option>
            </select>
          </label>

          {form.userType === "student" && (
            <label className="text-xs text-gray-600">
              รหัสนักศึกษา (10 หลัก)
              <input
                value={form.studentId}
                onChange={(event) => setForm((current) => ({ ...current, studentId: event.target.value.replace(/\D/g, "").slice(0, 10) }))}
                required
                inputMode="numeric"
                maxLength={10}
                pattern="\d{10}"
                title="กรุณากรอกรหัสนักศึกษา 10 หลัก"
                className={`${inputClass} mt-1`}
              />
            </label>
          )}

          <label className="text-xs text-gray-600">
            ชื่อ
            <input value={form.firstName} onChange={update("firstName")} required className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs text-gray-600">
            นามสกุล
            <input value={form.lastName} onChange={update("lastName")} required className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs text-gray-600">
            ชื่อผู้ใช้
            <input value={form.username} onChange={update("username")} minLength={3} required autoComplete="username" className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs text-gray-600">
            อีเมล
            <input value={form.email} onChange={update("email")} type="email" required autoComplete="email" className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs text-gray-600">
            เบอร์โทรศัพท์ (ไม่บังคับ)
            <input value={form.phone} onChange={update("phone")} type="tel" autoComplete="tel" className={`${inputClass} mt-1`} />
          </label>
          <div className="hidden sm:block" />
          <label className="text-xs text-gray-600">
            รหัสผ่าน
            <PasswordInput value={form.password} onChange={update("password")} minLength={8} required autoComplete="new-password" className={`${inputClass} mt-1 pr-10`} />
          </label>
          <label className="text-xs text-gray-600">
            ยืนยันรหัสผ่าน
            <PasswordInput value={form.confirmPassword} onChange={update("confirmPassword")} minLength={8} required autoComplete="new-password" className={`${inputClass} mt-1 pr-10`} />
          </label>

          {error && <p className="sm:col-span-2 text-xs text-red-600" role="alert">{error}</p>}

          <button
            disabled={loading}
            className="sm:col-span-2 text-white text-sm font-medium rounded-lg py-2.5 mt-2 disabled:opacity-60"
            style={{ background: NAVY }}
          >
            {loading ? "กำลังสร้างบัญชี..." : "สมัครสมาชิก"}
          </button>
        </form>
      </Card>
    </div>
  );
}
