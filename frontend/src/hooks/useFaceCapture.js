import { useCallback, useEffect, useRef, useState } from "react";
import { FaceDetector, FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const FACE_DETECTOR_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";
const FACE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

function eyeAspectRatio(landmarks, indices) {
  const verticalA = Math.hypot(
    landmarks[indices[1]].x - landmarks[indices[5]].x,
    landmarks[indices[1]].y - landmarks[indices[5]].y,
  );
  const verticalB = Math.hypot(
    landmarks[indices[2]].x - landmarks[indices[4]].x,
    landmarks[indices[2]].y - landmarks[indices[4]].y,
  );
  const horizontal = Math.hypot(
    landmarks[indices[0]].x - landmarks[indices[3]].x,
    landmarks[indices[0]].y - landmarks[indices[3]].y,
  );
  if (horizontal === 0) return 1;
  return (verticalA + verticalB) / (2 * horizontal);
}

function captureFrame(video) {
  const maxWidth = 720;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("ไม่สามารถเตรียมภาพจากกล้องได้");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function cameraErrorMessage(error) {
  if (error?.name === "NotAllowedError") {
    return "ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตกล้องแล้วลองใหม่";
  }
  if (error?.name === "NotFoundError") {
    return "ไม่พบกล้องที่พร้อมใช้งาน";
  }
  if (error?.name === "NotReadableError") {
    return "กล้องกำลังถูกใช้งานโดยโปรแกรมอื่น";
  }
  return error?.message || "ไม่สามารถเปิดกล้องได้";
}

function isFaceCentered(box, width, height) {
  const centerX = box.originX + box.width / 2;
  const centerY = box.originY + box.height / 2;
  const dx = Math.abs(centerX - width / 2) / width;
  const dy = Math.abs(centerY - height / 2) / height;
  const size = box.width / width;
  return dx < 0.12 && dy < 0.12 && size > 0.28 && size < 0.62;
}

/**
 * Camera + MediaPipe capture loop shared by face enrollment and Kiosk face entry.
 *
 * `requireBlink` lets each caller require a simple active challenge before capture.
 * Both enrollment and the Kiosk currently enable it. This rejects a static photo,
 * but it is not a replacement for a server-side presentation-attack detector.
 */
export function useFaceCapture({
  onCaptured,
  onError,
  requireBlink = true,
  holdMs = 1500,
  capturingHint = "กำลังบันทึกใบหน้า...",
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const landmarkerRef = useRef(null);
  const frameRef = useRef(null);
  const stableSinceRef = useRef(null);
  const blinkArmedRef = useRef(false);
  const blinkSeenRef = useRef(false);
  const capturedRef = useRef(false);

  const [status, setStatus] = useState("loading");
  const [hint, setHint] = useState("กำลังเตรียมกล้อง...");
  const [progress, setProgress] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const stopCamera = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const retry = useCallback(() => {
    stopCamera();
    setProgress(0);
    setAttempt((current) => current + 1);
  }, [stopCamera]);

  // Grabs the current frame right away — the auto-capture loop and the Kiosk's manual
  // "ถ่ายภาพ" button both end up here.
  const captureNow = useCallback(() => {
    const video = videoRef.current;
    if (capturedRef.current || !video?.videoWidth) return;
    capturedRef.current = true;
    setStatus("capturing");
    setProgress(100);
    setHint(capturingHint);
    try {
      const imageBase64 = captureFrame(video);
      stopCamera();
      onCaptured?.(imageBase64);
    } catch (error) {
      capturedRef.current = false;
      setStatus("error");
      setHint(cameraErrorMessage(error));
      onError?.(error);
    }
  }, [capturingHint, onCaptured, onError, stopCamera]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        capturedRef.current = false;
        stableSinceRef.current = null;
        blinkArmedRef.current = false;
        blinkSeenRef.current = false;
        setProgress(0);
        setStatus("loading");
        setHint("กำลังโหลด MediaPipe...");
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
        let detector;
        let landmarker = null;
        try {
          detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: FACE_DETECTOR_MODEL, delegate: "GPU" },
            runningMode: "VIDEO",
          });
        } catch {
          detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: FACE_DETECTOR_MODEL },
            runningMode: "VIDEO",
          });
        }
        detectorRef.current = detector;
        if (requireBlink) {
          try {
            landmarker = await FaceLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: "GPU" },
              runningMode: "VIDEO",
              numFaces: 1,
              outputFaceBlendshapes: false,
            });
          } catch {
            landmarker = await FaceLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL },
              runningMode: "VIDEO",
              numFaces: 1,
              outputFaceBlendshapes: false,
            });
          }
        }
        landmarkerRef.current = landmarker ?? null;
        if (cancelled) {
          detector.close();
          landmarker?.close();
          detectorRef.current = null;
          landmarkerRef.current = null;
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();

        setStatus("scanning");
        setHint("จัดใบหน้าให้อยู่ในกรอบวงรี");

        let lastVideoTime = -1;
        const leftEye = [33, 160, 158, 133, 153, 144];
        const rightEye = [362, 385, 387, 263, 373, 380];

        const tick = () => {
          if (cancelled) return;
          if (capturedRef.current || !video.videoWidth) {
            frameRef.current = requestAnimationFrame(tick);
            return;
          }

          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const detections = detector.detectForVideo(video, performance.now()).detections;
            const face = detections[0];

            if (!face?.boundingBox) {
              stableSinceRef.current = null;
              blinkArmedRef.current = false;
              blinkSeenRef.current = false;
              setProgress(0);
              setHint("จัดใบหน้าให้อยู่ในกรอบวงรี");
            } else {
              const box = face.boundingBox;
              const centered = isFaceCentered(box, video.videoWidth, video.videoHeight);
              if (!centered) {
                stableSinceRef.current = null;
                blinkArmedRef.current = false;
                blinkSeenRef.current = false;
                setProgress(10);
                setHint("ขยับใบหน้าให้อยู่กึ่งกลางกรอบ");
              } else if (!requireBlink) {
                if (!stableSinceRef.current) stableSinceRef.current = performance.now();
                const stableMs = performance.now() - stableSinceRef.current;
                setProgress(Math.min(99, 10 + Math.floor((stableMs / holdMs) * 90)));
                setHint("อยู่นิ่ง ๆ กำลังจับภาพ...");
                if (stableMs >= holdMs) {
                  captureNow();
                  return;
                }
              } else if (!blinkArmedRef.current) {
                if (!stableSinceRef.current) stableSinceRef.current = performance.now();
                const stableMs = performance.now() - stableSinceRef.current;
                const nextProgress = Math.min(55, 10 + Math.floor(stableMs / 20));
                setProgress(nextProgress);
                if (stableMs > 900) {
                  blinkArmedRef.current = true;
                  setHint("กระพริบตาหนึ่งครั้งเพื่อยืนยันตัวตน");
                } else {
                  setHint("อยู่นิ่ง ๆ สักครู่...");
                }
              } else {
                const landmarkResult = landmarker.detectForVideo(video, performance.now());
                const landmarks = landmarkResult.faceLandmarks?.[0];
                if (landmarks) {
                  const leftEar = eyeAspectRatio(landmarks, leftEye);
                  const rightEar = eyeAspectRatio(landmarks, rightEye);
                  const ear = (leftEar + rightEar) / 2;
                  if (ear < 0.19) blinkSeenRef.current = true;
                  if (blinkSeenRef.current && ear > 0.24) {
                    captureNow();
                    return;
                  }
                  setProgress(Math.max(60, Math.min(95, 60 + Math.floor((0.24 - ear) * 200))));
                }
              }
            }
          }

          frameRef.current = requestAnimationFrame(tick);
        };

        frameRef.current = requestAnimationFrame(tick);
      } catch (error) {
        if (!cancelled) {
          stopCamera();
          detectorRef.current?.close();
          landmarkerRef.current?.close();
          detectorRef.current = null;
          landmarkerRef.current = null;
          setStatus("error");
          setHint(cameraErrorMessage(error));
          onError?.(error);
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      stopCamera();
      detectorRef.current?.close();
      landmarkerRef.current?.close();
      detectorRef.current = null;
      landmarkerRef.current = null;
    };
  }, [attempt, captureNow, holdMs, onError, requireBlink, stopCamera]);

  return { videoRef, status, hint, progress, retry, stopCamera, captureNow };
}
