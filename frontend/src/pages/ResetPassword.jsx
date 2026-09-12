import React, { useState } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/Card";
import { resetPassword } from "../api/auth";
import { GOLD, NAVY } from "../theme";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (password !== confirmPassword) {
      setError("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      navigate("/login", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F4F5F8" }}>
      <Card className="w-full max-w-[420px] p-7">
        <Link to="/login" className="flex items-center gap-1 text-xs text-gray-400 mb-5 hover:text-gray-600">
          <ArrowLeft size={13} /> กลับไปหน้าเข้าสู่ระบบ
        </Link>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: GOLD, color: NAVY }}>
            <LockKeyhole size={20} />
          </div>
          <div>
            <h1 className="text-lg font-medium text-gray-900">ตั้งรหัสผ่านใหม่</h1>
            <p className="text-xs text-gray-500">รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร</p>
          </div>
        </div>

        {!token ? (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg p-3" role="alert">
            ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง กรุณาส่งคำขอใหม่
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="text-xs text-gray-600">
              รหัสผ่านใหม่
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 mt-1 focus:outline-none focus:border-gray-400"
              />
            </label>
            <label className="text-xs text-gray-600">
              ยืนยันรหัสผ่านใหม่
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 mt-1 focus:outline-none focus:border-gray-400"
              />
            </label>

            {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

            <button
              disabled={loading}
              className="w-full text-white text-sm font-medium rounded-lg py-2.5 mt-2 disabled:opacity-60"
              style={{ background: NAVY }}
            >
              {loading ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่"}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
