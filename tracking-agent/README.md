# KINOF Tracking Agent

- `windows/kinof-agent.ps1` คือ Agent จริงที่สอดคล้องกับ NestJS Backend ของเรา
- `browser-extension/` คือ Chrome/Edge extension สำหรับ domain tracking และ blocklist
- `legacy/simulate-agent.ps1` คือไฟล์จำลองจากโปรเจกต์เพื่อน เก็บไว้ใช้อ้างอิงเท่านั้นและใช้กับ API รุ่นนี้ไม่ได้

## ทำงานอะไร

- ส่ง heartbeat เพื่อให้ Dashboard แยก `available`, `in_use`, `offline`, `maintenance`
- ส่งชื่อโปรแกรมที่เริ่มทำงาน โดยไม่เก็บคีย์บอร์ด เนื้อหาไฟล์ หรือรหัสผ่าน
- เก็บ event ลงคิวเมื่อเครือข่ายล่ม แล้วส่งซ้ำด้วย UUID ป้องกันข้อมูลซ้ำ
- รับคำสั่ง `lock`, `logout`, `close_program`, `sync_blocklist`
- เมื่อ Agent ยืนยันว่า `logout` สำเร็จ Backend จะปิด `pc_session` ด้วย เพื่อไม่ให้ Dashboard ค้างเป็น `in_use`
- ซิงก์เว็บที่ action=`block` ลง Windows hosts file เมื่อเปิด `-EnableHostsBlocking`

## เริ่มใช้งาน

1. Admin สร้าง Agent ผ่าน `POST /admin/tracking/agents` แล้วคัดลอก `api_key` ซึ่งแสดงครั้งเดียว
2. เปิด PowerShell แบบ Administrator เฉพาะกรณีใช้ hosts blocking
3. รัน:

```powershell
.\windows\kinof-agent.ps1 -ApiKey "KEY_FROM_ADMIN" -ApiUrl "http://localhost:3000"
```

เปิดการบล็อกเว็บไซต์และคำสั่งจัดการ session แบบชัดเจน:

```powershell
.\windows\kinof-agent.ps1 -ApiKey "KEY_FROM_ADMIN" -ApiUrl "https://kinof.example" -EnableHostsBlocking -AllowRemoteSessionCommands
```

## Tracking เว็บไซต์บน Chrome/Edge

โฟลเดอร์ `browser-extension` เป็น Manifest V3 extension ที่ส่งเฉพาะชื่อโดเมนและใช้ Declarative Net Request บล็อกโดเมนจาก Backend โดยไม่ดัก HTTPS และไม่เก็บ path/query/เนื้อหาหน้า/รหัสผ่าน

ติดตั้งแบบทดสอบที่ `chrome://extensions` หรือ `edge://extensions` → Developer mode → Load unpacked → เลือกโฟลเดอร์ `browser-extension` แล้วเปิด Options ใส่ Backend URL และ Agent API key สำหรับเครื่องนั้น การใช้งานจริงควร deploy ด้วย Group Policy เพื่อไม่ให้ผู้ใช้ปิด extension เอง

ข้อจำกัด: hosts file บล็อกได้ระดับโดเมนและอาจถูก DNS-over-HTTPS บางแบบหลบได้ จึงควรใช้ extension ร่วมกัน ส่วนระบบนี้ตั้งใจไม่ดัก HTTPS หรือเก็บข้อความส่วนตัวของผู้ใช้
