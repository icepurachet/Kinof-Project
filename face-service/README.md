# KINOF Face Service

FastAPI service สำหรับสร้าง InsightFace `buffalo_l` embedding 512 มิติจากภาพที่ Backend ส่งมา ภาพอยู่ในหน่วยความจำเฉพาะระหว่างประมวลผลและไม่ถูกบันทึกลงดิสก์หรือฐานข้อมูล

## Requirements

- Python 3.10 หรือ 3.11 (64-bit)
- RAM อย่างน้อย 4 GB
- อินเทอร์เน็ตในครั้งแรกเพื่อดาวน์โหลดโมเดล `buffalo_l`

## Run

```powershell
cd C:\Users\User\Documents\Codex\2026-08-25\2-files-2\kinof2\face-service
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

ครั้งแรก InsightFace จะดาวน์โหลดโมเดลไว้ใน user cache ของเครื่อง จากนั้นตรวจสถานะที่ `http://localhost:8001/health`

## API

`POST /api/v1/embeddings` รับ multipart field ชื่อ `image` (`image/jpeg`, `image/png` หรือ `image/webp`) และคืน:

```json
{
  "embedding": [0.0123, -0.0456],
  "quality": {
    "blur_score": 132.5,
    "brightness": 118.2,
    "face_area_ratio": 0.18
  }
}
```

ระบบจะปฏิเสธภาพที่ไม่มีใบหน้า มีมากกว่าหนึ่งใบหน้า เล็ก เบลอ มืด/สว่างเกินไป หน้าอยู่ไกล หรือมีขนาดเกิน 5 MB ถ้าตั้ง `FACE_SERVICE_API_KEY` ทุก request ต้องส่งค่าเดียวกันใน header `X-Face-Service-Key`

หมายเหตุ: quality check และ blink ที่ Frontend ช่วยลดภาพเสีย แต่ยังไม่ใช่ anti-spoof/liveness ระดับผลิตจริง เพราะภาพหรือวิดีโอ replay ยังมีโอกาสผ่านได้ ระบบจริงควรเพิ่มโมเดล presentation-attack detection และทดสอบกับกล้องหน้างาน

Environment variables:

- `INSIGHTFACE_MODEL` ค่าเริ่มต้น `buffalo_l`
- `INSIGHTFACE_DET_SIZE` ค่าเริ่มต้น `640`
- `INSIGHTFACE_PROVIDERS` ค่าเริ่มต้น `CPUExecutionProvider`
- `FACE_SERVICE_API_KEY` คีย์ลับระหว่าง Backend กับ Face Service
- `FACE_MIN_IMAGE_SIDE` ค่าเริ่มต้น `320`
- `FACE_MIN_AREA_RATIO` ค่าเริ่มต้น `0.06`
- `FACE_MIN_BLUR_SCORE` ค่าเริ่มต้น `55`
- `FACE_MIN_BRIGHTNESS` / `FACE_MAX_BRIGHTNESS` ค่าเริ่มต้น `35` / `225`
- `FACE_MAX_CONCURRENT_INFERENCE` ค่าเริ่มต้น `1`
