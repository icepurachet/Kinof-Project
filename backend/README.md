# KINOF Backend

NestJS + TypeORM + MySQL API ของระบบ KINOF กฎสิทธิ์และการตัดสินใจทั้งหมดอยู่ที่ Backend ไม่ให้ Frontend ตัดสินเอง

## ครอบคลุม

- User/Auth/JWT/refresh/logout/forgot-reset password
- ห้อง เครื่อง ตารางเรียน การจองเดี่ยว/กลุ่ม และคำเชิญ 5 นาที
- Face/Entry OTP/TOTP และการจัดเครื่องเมื่อเข้าห้อง
- คำขอช่วยเหลือพร้อมรูป
- Admin/Super Admin, blacklist, penalty, audit และ CSV export/import
- Tracking Agent heartbeat, session, program/domain event และ command queue

## Run

```powershell
Copy-Item .env.example .env
npm install
npm run start:dev
```

ค่าเริ่มต้นคือ `http://localhost:3000` ต้องเตรียม MySQL ตาม `../database/README.md` และ Face Service ที่ `http://127.0.0.1:8001`

## Verify

```powershell
npm test -- --runInBand
npm run build
npm run lint
```

ห้าม commit `.env` และห้ามเปิด `synchronize: true` กับฐานข้อมูลจริง
