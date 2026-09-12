import React from "react";
import { Camera, LogOut, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/Card";
import { GOLD, NAVY } from "../../theme";

export default function FaceEnrollIntro({ onLogout }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F4F5F8" }}>
      <Card className="w-full max-w-lg p-7">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: GOLD, color: NAVY }}>
          <Camera size={20} />
        </div>
        <h1 className="text-lg font-medium text-gray-900">ลงทะเบียนใบหน้า</h1>
        <p className="text-sm text-gray-500 mt-1 mb-5">
          ใช้สำหรับเข้าใช้ห้องแล็บผ่าน Kiosk และยืนยันตัวตนแบบไม่ต้องกรอก OTP ทุกครั้ง
        </p>

        <div className="space-y-3 text-xs text-gray-600 mb-6">
          <div className="flex items-start gap-2">
            <ShieldCheck size={14} className="text-emerald-600 mt-0.5" />
            <span>ระบบใช้ MediaPipe ตรวจจับ liveness (กระพริบตา) และ InsightFace สร้าง face embedding</span>
          </div>
          <div className="flex items-start gap-2">
            <ShieldCheck size={14} className="text-emerald-600 mt-0.5" />
            <span>เก็บเฉพาะ face embedding 512 มิติ ไม่เก็บรูปถ่ายบนเซิร์ฟเวอร์</span>
          </div>
          <div className="flex items-start gap-2">
            <ShieldCheck size={14} className="text-emerald-600 mt-0.5" />
            <span>จัดใบหน้าให้อยู่ในกรอบ แล้วระบบจะจับภาพอัตโนมัติเมื่อกระพริบตา</span>
          </div>
        </div>

        <button
          onClick={() => navigate("/register/face/scan")}
          className="w-full text-white text-sm font-medium rounded-lg py-2.5"
          style={{ background: NAVY }}
        >
          เริ่มสแกนใบหน้า
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="w-full mt-3 inline-flex items-center justify-center gap-2 text-xs text-gray-500 hover:text-gray-700"
        >
          <LogOut size={13} /> ออกจากระบบและทำภายหลัง
        </button>
      </Card>
    </div>
  );
}
