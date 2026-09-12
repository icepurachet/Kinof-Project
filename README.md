# KINOF2

สำเนาที่จัดระเบียบใหม่สำหรับระบบจองและดูแลห้องคอมพิวเตอร์ โดยไม่แก้โปรเจกต์ต้นฉบับ

## ส่วนประกอบ

- `frontend/` เว็บผู้ใช้ ผู้ดูแล และ Kiosk
- `backend/` NestJS API และกฎธุรกิจทั้งหมด
- `face-service/` FastAPI + InsightFace สำหรับสร้าง embedding
- `tracking-agent/windows/` Agent ประจำเครื่อง Windows
- `tracking-agent/browser-extension/` ติดตาม/บล็อกเฉพาะชื่อโดเมน
- `database/` schema, migration และ demo seed

อ่านสถานะที่ตรวจจริงและสิ่งที่ยังต้องทำใน `BACKEND_PROGRESS.md`

## เริ่มแบบ Development

เปิดคนละ Terminal แล้วทำตามลำดับ:

```powershell
cd C:\Users\User\Documents\Codex\2026-08-25\2-files-2\kinof2\face-service
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

```powershell
cd C:\Users\User\Documents\Codex\2026-08-25\2-files-2\kinof2\backend
npm run start:dev
```

```powershell
cd C:\Users\User\Documents\Codex\2026-08-25\2-files-2\kinof2\frontend
npm run dev
```

ก่อนรันต้องสร้าง `.env` จาก `.env.example` และเตรียมฐานข้อมูลตาม `database/README.md` การรัน migration เปลี่ยนฐานข้อมูลจริง จึงต้องสำรองข้อมูลก่อนเสมอ
