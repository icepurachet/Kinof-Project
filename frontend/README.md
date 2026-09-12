# KINOF Frontend

React + Vite frontend สำหรับผู้ใช้ ผู้ดูแล และ Kiosk เชื่อมกับ NestJS API ใน `../backend`

## หน้าหลัก

- สมัคร/login/forgot-reset password และลงทะเบียนใบหน้า
- ค้นหาห้อง จองเดี่ยว/กลุ่ม คำเชิญ ตารางเรียน โปรไฟล์ และคำขอช่วยเหลือ
- Kiosk สแกนหน้าและ Entry OTP สำรอง
- Admin dashboard, tracking, blacklist, export, ห้อง, เครื่อง, ผู้ใช้ ตารางเรียน และ Admin account

## Run

```powershell
npm install
npm run dev
```

ค่าเริ่มต้นเรียก API ที่ `http://localhost:3000` หรือกำหนด `VITE_API_URL` ใน `.env.local` ห้าม commit ไฟล์ environment จริง

## Build

```powershell
npm run build
```

ระบบยังต้องทดสอบร่วมกับ MySQL, Face Service, กล้อง, Agent และ Extension จริงก่อนใช้งานหน้างาน
