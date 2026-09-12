import React, { useCallback, useState } from "react";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/Card";
import { registerFace } from "../../api/auth";
import { useFaceCapture } from "../../hooks/useFaceCapture";
import { GOLD, NAVY } from "../../theme";

export default function FaceEnrollScan({ onFaceEnrolled }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleCaptured = useCallback(async (imageBase64) => {
    setSubmitting(true);
    setError("");
    try {
      const result = await registerFace(imageBase64);
      onFaceEnrolled?.(result.user);
      navigate("/register/face/success", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
      setSubmitting(false);
    }
  }, [navigate, onFaceEnrolled]);

  const handleCaptureError = useCallback(() => {
    setError("");
  }, []);

  const { videoRef, status, hint, progress, retry, stopCamera } = useFaceCapture({
    onCaptured: handleCaptured,
    onError: handleCaptureError,
  });

  const handleRetry = () => {
    setError("");
    setSubmitting(false);
    retry();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: "#F4F5F8" }}>
      <Card className="w-full max-w-xl p-7">
        <button
          onClick={() => { stopCamera(); navigate("/register/face"); }}
          className="flex items-center gap-1 text-xs text-gray-400 mb-5 hover:text-gray-600"
        >
          <ArrowLeft size={13} /> กลับ
        </button>

        <h1 className="text-lg font-medium text-gray-900 mb-1">สแกนใบหน้า + กระพริบตา</h1>
        <p className="text-xs text-gray-500 mb-4">MediaPipe จะจับภาพอัตโนมัติเมื่อใบหน้าชัดและตรวจพบการกระพริบตา</p>

        <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] mb-4">
          <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" playsInline muted />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="w-52 h-64 border-2 rounded-[50%] transition-colors"
              style={{ borderColor: progress >= 60 ? "#22c55e" : GOLD }}
            />
          </div>
          {(status === "loading" || submitting) && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="animate-spin text-white" size={28} />
            </div>
          )}
        </div>

        <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
          <div className="h-full transition-all duration-200" style={{ width: `${progress}%`, background: NAVY }} />
        </div>
        <p className="text-sm text-gray-700 text-center min-h-[1.25rem]" aria-live="polite">{hint}</p>
        {(error || status === "error") && (
          <div className="mt-4 text-center" role="alert">
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
            {!submitting && (
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <RefreshCw size={14} /> ลองสแกนใหม่
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
