import React from "react";
import { CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/Card";
import { NAVY } from "../../theme";

export default function FaceEnrollSuccess() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F4F5F8" }}>
      <Card className="w-full max-w-md p-7 text-center">
        <CheckCircle2 size={44} className="mx-auto text-emerald-600 mb-4" />
        <h1 className="text-lg font-medium text-gray-900">ลงทะเบียนใบหน้าสำเร็จ</h1>
        <p className="text-sm text-gray-500 mt-2 mb-6">
          บัญชีได้รับการยืนยันแล้ว และสามารถใช้สแกนหน้าเข้าห้องแล็บได้
        </p>
        <button
          onClick={() => navigate("/", { replace: true })}
          className="w-full text-white text-sm font-medium rounded-lg py-2.5"
          style={{ background: NAVY }}
        >
          ไปหน้าหลัก
        </button>
      </Card>
    </div>
  );
}
