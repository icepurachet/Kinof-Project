import React, { useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import { forgotPassword } from "../api/auth";
import { GOLD, NAVY } from "../theme";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [account, setAccount] = useState("user");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const result = await forgotPassword(email, account);
      setMessage(result.message);
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
            <Mail size={20} />
          </div>
          <div>
            <h1 className="text-lg font-medium text-gray-900">ลืมรหัสผ่าน</h1>
            <p className="text-xs text-gray-500">ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปทางอีเมล</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-xs text-gray-600 mb-3">ประเภทบัญชี<select value={account} onChange={event => setAccount(event.target.value)} className="w-full border rounded-lg p-2 mt-1"><option value="user">นักศึกษา / บุคคลภายนอก</option><option value="admin">ผู้ดูแล / Super Admin</option></select></label>
          <label className="text-xs text-gray-600">
            อีเมลที่ลงทะเบียน
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              required
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 mt-1 focus:outline-none focus:border-gray-400"
            />
          </label>

          {message && (
            <div className="text-xs text-green-700 bg-green-50 rounded-lg p-3 mt-4" role="status">
              <p>{message}</p>
              <p className="mt-1 text-green-800">
                หากไม่พบอีเมล กรุณาตรวจกล่อง Spam/Junk และถังขยะด้วย
              </p>
            </div>
          )}
          {error && <p className="text-xs text-red-600 mt-4" role="alert">{error}</p>}

          <button
            disabled={loading}
            className="w-full text-white text-sm font-medium rounded-lg py-2.5 mt-5 disabled:opacity-60"
            style={{ background: NAVY }}
          >
            {loading ? "กำลังส่งคำขอ..." : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}
          </button>
        </form>
      </Card>
    </div>
  );
}
