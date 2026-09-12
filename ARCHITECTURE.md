# โครงสร้าง KINOF2

```text
frontend/                         เว็บผู้ใช้ ผู้ดูแล และหน้าจอ Kiosk
    │ HTTP
    ▼
backend/                          กฎธุรกิจ สิทธิ์ JWT การจอง OTP และ API กลาง
    ├── MySQL ◄── database/       ข้อมูลถาวรและ migration
    └── HTTP ──► face-service/    แปลงภาพเป็น face embedding เท่านั้น

tracking-agent/windows/           สถานะเครื่อง โปรแกรม และรับคำสั่งผู้ดูแล
tracking-agent/browser-extension/ โดเมนเว็บไซต์และกฎบล็อกเว็บ
           └──────── HTTP ──────► backend/

tracking-agent/legacy/            ตัวจำลองเก่า เก็บอ้างอิง ห้ามใช้เป็น Agent จริง
```

## ขอบเขตแต่ละส่วน

- `frontend`: แสดงผล รับข้อมูล และจับกล้อง แต่ไม่ตัดสินสิทธิ์เข้าห้องเอง
- `backend`: เป็นแหล่งตัดสินจริงทั้งหมด เช่น รหัสผ่าน ห้องว่าง การตอบคำเชิญ สิทธิ์เข้าห้อง คะแนน และคำสั่ง Agent
- `face-service`: ไม่รู้จักผู้ใช้หรือห้อง ทำเพียงตรวจคุณภาพภาพและคืน embedding 512 ค่าให้ Backend
- `tracking-agent/windows`: รันบนเครื่องห้องแล็บ ส่ง heartbeat/โปรแกรม และทำคำสั่งที่ Admin อนุญาต
- `tracking-agent/browser-extension`: ส่งเฉพาะชื่อโดเมนและบล็อกตามรายการจาก Backend ไม่เก็บ path, query, เนื้อหาหน้า หรือรหัสผ่าน
- `database/base`: schema ตั้งต้น, demo seed และ validation
- `database/migrations`: ส่วนเพิ่มสำหรับ Tracking, Face, Admin, Entry OTP และ Auth token

## หลักความปลอดภัย

- Browser และ Kiosk ห้ามคุยกับ MySQL หรือ Face Service โดยตรง
- Face Service รับได้เฉพาะ Backend ผ่าน `FACE_SERVICE_API_KEY`
- Agent แต่ละเครื่องมี API key ของตัวเอง และ Backend เก็บเฉพาะ hash
- OTP ใช้ครั้งเดียว มีเวลาหมดอายุ และ Backend เก็บเฉพาะ HMAC hash ของรหัส
- การกระพริบตาที่ Frontend ลดการใช้รูปนิ่ง แต่ยังไม่ใช่ PAD/liveness ระดับผลิตจริง
