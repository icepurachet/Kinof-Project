import asyncio
import os
import secrets
from contextlib import asynccontextmanager
from typing import Annotated

import cv2
import numpy as np
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from insightface.app import FaceAnalysis
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

MAX_IMAGE_BYTES = 5 * 1024 * 1024
SUPPORTED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MIN_IMAGE_SIDE = int(os.getenv("FACE_MIN_IMAGE_SIDE", "320"))
MIN_FACE_AREA_RATIO = float(os.getenv("FACE_MIN_AREA_RATIO", "0.06"))
MIN_BLUR_SCORE = float(os.getenv("FACE_MIN_BLUR_SCORE", "55"))
MIN_BRIGHTNESS = float(os.getenv("FACE_MIN_BRIGHTNESS", "35"))
MAX_BRIGHTNESS = float(os.getenv("FACE_MAX_BRIGHTNESS", "225"))

face_analyzer: FaceAnalysis | None = None
inference_semaphore = asyncio.Semaphore(
    max(1, int(os.getenv("FACE_MAX_CONCURRENT_INFERENCE", "1")))
)


class QualityResult(BaseModel):
    blur_score: float
    brightness: float
    face_area_ratio: float


class EmbeddingResponse(BaseModel):
    embedding: list[float]
    quality: QualityResult


def create_analyzer() -> FaceAnalysis:
    model_name = os.getenv("INSIGHTFACE_MODEL", "buffalo_l")
    detector_size = int(os.getenv("INSIGHTFACE_DET_SIZE", "640"))
    configured_providers = os.getenv(
        "INSIGHTFACE_PROVIDERS", "CPUExecutionProvider"
    )
    providers = [provider.strip() for provider in configured_providers.split(",") if provider.strip()]
    analyzer = FaceAnalysis(name=model_name, providers=providers)
    analyzer.prepare(ctx_id=-1, det_size=(detector_size, detector_size))
    return analyzer


@asynccontextmanager
async def lifespan(_: FastAPI):
    global face_analyzer
    face_analyzer = await run_in_threadpool(create_analyzer)
    yield
    face_analyzer = None


app = FastAPI(
    title="KINOF Face Service",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ready" if face_analyzer is not None else "loading"}


def extract_embedding(image_bytes: bytes) -> tuple[list[float], QualityResult]:
    if face_analyzer is None:
        raise HTTPException(status_code=503, detail="Face Service ยังไม่พร้อมใช้งาน")

    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="ไม่สามารถอ่านข้อมูลภาพได้")

    height, width = image.shape[:2]
    if min(height, width) < MIN_IMAGE_SIDE:
        raise HTTPException(
            status_code=422,
            detail=f"ภาพเล็กเกินไป ด้านสั้นต้องไม่น้อยกว่า {MIN_IMAGE_SIDE} พิกเซล",
        )

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())
    if blur_score < MIN_BLUR_SCORE:
        raise HTTPException(
            status_code=422,
            detail="ภาพเบลอเกินไป กรุณาถือกล้องให้นิ่งและลองใหม่",
        )
    if brightness < MIN_BRIGHTNESS or brightness > MAX_BRIGHTNESS:
        raise HTTPException(
            status_code=422,
            detail="แสงในภาพไม่เหมาะสม กรุณาหลีกเลี่ยงบริเวณมืดหรือสว่างเกินไป",
        )

    faces = face_analyzer.get(image)
    if not faces:
        raise HTTPException(
            status_code=422,
            detail="ไม่พบใบหน้าในภาพ กรุณาจัดใบหน้าให้อยู่ในกรอบแล้วลองใหม่",
        )
    if len(faces) > 1:
        raise HTTPException(
            status_code=422,
            detail="พบมากกว่าหนึ่งใบหน้า กรุณาอยู่ในภาพเพียงคนเดียว",
        )

    bbox = np.asarray(faces[0].bbox, dtype=np.float32)
    face_width = max(0.0, float(bbox[2] - bbox[0]))
    face_height = max(0.0, float(bbox[3] - bbox[1]))
    face_area_ratio = (face_width * face_height) / float(width * height)
    if face_area_ratio < MIN_FACE_AREA_RATIO:
        raise HTTPException(
            status_code=422,
            detail="ใบหน้าอยู่ไกลเกินไป กรุณาขยับเข้าใกล้กล้อง",
        )

    embedding = np.asarray(faces[0].normed_embedding, dtype=np.float32)
    if embedding.shape != (512,) or not np.isfinite(embedding).all():
        raise HTTPException(status_code=500, detail="โมเดลส่งผลลัพธ์ไม่ถูกต้อง")

    norm = float(np.linalg.norm(embedding))
    if norm <= 0:
        raise HTTPException(status_code=500, detail="โมเดลส่งผลลัพธ์ไม่ถูกต้อง")

    quality = QualityResult(
        blur_score=round(blur_score, 2),
        brightness=round(brightness, 2),
        face_area_ratio=round(face_area_ratio, 4),
    )
    return (embedding / norm).tolist(), quality


def verify_service_key(received_key: str | None) -> None:
    expected_key = os.getenv("FACE_SERVICE_API_KEY")
    if not expected_key:
        return
    if received_key is None or not secrets.compare_digest(received_key, expected_key):
        raise HTTPException(status_code=401, detail="Face Service API key ไม่ถูกต้อง")


@app.post("/api/v1/embeddings", response_model=EmbeddingResponse)
async def create_embedding(
    image: UploadFile = File(...),
    x_face_service_key: Annotated[str | None, Header()] = None,
) -> EmbeddingResponse:
    verify_service_key(x_face_service_key)
    if image.content_type not in SUPPORTED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail="รองรับเฉพาะภาพ JPEG, PNG หรือ WebP",
        )

    image_bytes = await image.read(MAX_IMAGE_BYTES + 1)
    await image.close()
    if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="ภาพต้องมีขนาดไม่เกิน 5 MB",
        )

    async with inference_semaphore:
        embedding, quality = await run_in_threadpool(extract_embedding, image_bytes)
    return EmbeddingResponse(embedding=embedding, quality=quality)
