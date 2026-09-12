# Frontend and Tracking status

Frontend มาจากงานของเพื่อน แต่ใช้ NestJS Backend ใน `backend/` เท่านั้น ไม่ได้นำ ASP.NET Backend ของเพื่อนมาใช้

## เชื่อม API แล้ว

- สมัคร/login/refresh/forgot/reset password
- ลงทะเบียนใบหน้า, Kiosk face entry และ Entry OTP สำรอง
- ค้นหาและเลือกห้อง จองเดี่ยว/กลุ่ม ตอบคำเชิญ และประวัติจอง
- ตารางเรียน รายชื่อผู้เรียน และนำเข้าตาราง CSV
- โปรไฟล์ คะแนน และประวัติลงโทษ
- คำขอความช่วยเหลือพร้อมรูป
- Admin dashboard, ห้อง, เครื่อง, ผู้ใช้, tracking, blacklist, audit และ CSV export

## Tracking ที่ใช้จริง

- `tracking-agent/windows/`: heartbeat, program event, offline queue และรับคำสั่งผู้ดูแล
- `tracking-agent/browser-extension/`: ส่งเฉพาะโดเมนและบล็อกตาม blacklist
- `tracking-agent/legacy/`: simulator เก่าของเพื่อน ใช้อ้างอิงเท่านั้น

ก่อนเดโมเต็มต้องรันและทดสอบทุก service กับฐานข้อมูล กล้อง และเครื่องห้องแล็บจริง รายละเอียดอยู่ใน `BACKEND_PROGRESS.md`
