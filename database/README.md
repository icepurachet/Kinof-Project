# Database setup order

ฐานข้อมูลในโฟลเดอร์นี้เป็นสำเนาสำหรับ `kinof2` โดยเฉพาะ

1. รัน `base/kinof_schema_final.sql` เพื่อสร้าง schema ตั้งต้น
2. รัน `migrations/001_tracking_face_admin.sql` เพื่อเพิ่ม Tracking, Face, Admin และ Entry OTP
3. รัน `migrations/002_auth_tokens.sql` เพื่อเพิ่ม refresh token และ password reset token
4. ถ้าต้องการข้อมูลทดสอบ ค่อยรัน `base/kinof_demo_seed.sql`
5. ใช้ `base/kinof_validation.sql` ตรวจโครงสร้าง

ยังไม่มีการรันไฟล์เหล่านี้ใส่ MySQL จริงโดยอัตโนมัติ เพราะ migration เปลี่ยนฐานข้อมูลและต้องสำรองข้อมูลก่อน
