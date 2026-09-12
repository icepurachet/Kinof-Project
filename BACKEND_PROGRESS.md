# KINOF2 implementation status

อัปเดตล่าสุด: 12 กันยายน 2026

## ขอบเขตสำเนา

- ทำงานเฉพาะ `C:\Users\User\Documents\Codex\2026-08-25\2-files-2\kinof2`
- ไม่ได้แก้ต้นฉบับ `C:\Users\User\Kinof-project`
- ยังไม่ได้รัน schema, migration หรือ seed กับ MySQL จริง

## ทำแล้วใน source code

- User: สมัครด้วย email/username/password, username ห้ามมี `@`, ดู/แก้โปรไฟล์ ค้นหาเพื่อน คะแนน ประวัติลงโทษ และ Admin เปิด/ปิดบัญชี
- Auth: bcrypt, JWT, refresh token แบบหมุน/เพิกถอนตอน logout, forgot/reset password แบบลิงก์ใช้ครั้งเดียว และ guard แยก user/admin/super-admin
- Face enrollment: ตรวจภาพ เก็บเฉพาะ embedding และตั้งบัญชีเป็น verified; ไม่เก็บภาพต้นฉบับ
- Room/Computer: Admin CRUD ห้องและเครื่อง พร้อมสถานะ online/offline/maintenance
- Booking: จองเดี่ยว/กลุ่ม ค้นหาและเลือกห้องตามจำนวนที่ว่าง รอคำเชิญ 5 นาที ยืนยันอัตโนมัติเมื่อรับครบ ยกเลิก และดูประวัติ
- Schedule: ผู้ใช้ดูตาราง; Admin CRUD ภาคเรียน วิชา รายชื่อ และนำเข้า CSV แบบ preview/validate/confirm ใน transaction
- Entry: ตรวจสิทธิ์จาก Booking/ตารางเรียน, Face, TOTP และ Entry OTP ใช้ครั้งเดียว แล้วจัดเครื่องที่ Agent online และว่างให้ใน transaction
- Issues: ผู้ใช้ส่ง/ดูคำขอพร้อมรูป; Admin รับเรื่อง ตอบ และปิดงาน
- Admin/Super Admin: Dashboard, Tracking, blacklist, penalty, suspicious usage, CSV export, จัดการ Admin และ audit log
- Tracking: Agent heartbeat, session, program/domain event, command queue, online/offline/available/in_use/maintenance และปิด session เมื่อสั่ง logout สำเร็จ
- Tracking clients: Windows Agent, Chrome/Edge extension และ simulator เก่าแยกไว้ใน `legacy/`
- Face Service: InsightFace embedding, API key, จำกัดงานพร้อมกัน และตรวจขนาด/เบลอ/แสง/จำนวนใบหน้า/ระยะใบหน้า
- Frontend: เชื่อม API ของ flow หลักทั้งหมดข้างต้น; ลบหน้า email OTP ที่ไม่ตรง scope และเก็บ Entry OTP เป็นรหัสสำรองตอนสแกนหน้าไม่ผ่าน

## ผลตรวจล่าสุด

- Backend Jest: 23 suites, 49 tests ผ่านทั้งหมด
- Backend build: ผ่าน
- Backend lint: ผ่าน
- Frontend Vite production build: ผ่าน 1,548 modules
- Frontend มีคำเตือน bundle หลักประมาณ 544 kB แต่ไม่ใช่ build error
- Face Service Python compile: ผ่าน
- Windows Agent PowerShell parse และ Browser extension JavaScript check: ผ่าน

## ยังต้องทำบนระบบจริง

1. สำรองฐาน แล้วรัน schema + migration `001` และ `002` บน MySQL ทดสอบ
2. ทดสอบ end-to-end ผ่าน Browser, Kiosk, กล้อง, Face Service, MySQL, Agent และ Extension พร้อมกัน
3. ตั้ง webhook ส่ง Entry OTP/ลิงก์ reset password และทดสอบผู้ให้บริการอีเมลจริง
4. เก็บ threshold ใบหน้าจากกล้องหน้างาน และเพิ่ม server-side presentation-attack detection; blink ฝั่งเว็บอย่างเดียวยังกัน replay video ไม่ได้
5. ติดตั้ง Agent เป็น Windows service และ deploy extension ด้วย Group Policy
6. เพิ่ม integration test กับ MySQL จริง โดยเฉพาะการจองพร้อมกันและ Agent offline
7. Google login ยังปิดไว้ เพราะต้องใช้ OAuth credentials/domain จริง

รายการด้านบนเป็นงานที่ทำให้เสร็จด้วย source code อย่างเดียวไม่ได้ หรือมีผลกับฐานข้อมูล/เครื่องจริง จึงยังไม่อ้างว่าผ่าน
