'use client';

import { useState, useRef, useCallback } from 'react';
import { Camera, X, RotateCcw, Check, ImageIcon } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onCancel?: () => void;
  accept?: string;
  maxSizeMB?: number;
  quality?: number;
  label?: string;
}

export function CameraCapture({
  onCapture,
  onCancel,
  accept = 'image/*',
  maxSizeMB = 5,
  quality = 0.85,
  label = '写真を撮影',
}: CameraCaptureProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useStream, setUseStream] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ファイル入力経由（iOS Safari対応）
  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`ファイルサイズは${maxSizeMB}MB以下にしてください`);
        return;
      }

      setError(null);
      setCapturedFile(file);
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    },
    [maxSizeMB]
  );

  // カメラストリーム開始
  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setUseStream(true);
    } catch {
      setError('カメラにアクセスできません。ファイル選択をお使いください。');
    }
  }, []);

  // カメラストリーム停止
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setUseStream(false);
  }, []);

  // 撮影
  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setCapturedFile(file);
        setPreview(canvas.toDataURL('image/jpeg', quality));
        stopCamera();
      },
      'image/jpeg',
      quality
    );
  }, [quality, stopCamera]);

  // 確定
  const confirm = useCallback(() => {
    if (capturedFile) {
      onCapture(capturedFile);
      setPreview(null);
      setCapturedFile(null);
    }
  }, [capturedFile, onCapture]);

  // やり直し
  const retry = useCallback(() => {
    setPreview(null);
    setCapturedFile(null);
    setError(null);
  }, []);

  // カメラストリームモード
  if (useStream) {
    return (
      <div className="relative bg-black rounded-lg overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="w-full" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute bottom-0 inset-x-0 p-4 flex items-center justify-center gap-4 bg-gradient-to-t from-black/60">
          <button
            onClick={() => { stopCamera(); onCancel?.(); }}
            className="p-3 bg-white/20 rounded-full text-white backdrop-blur-sm"
          >
            <X className="w-6 h-6" />
          </button>
          <button
            onClick={capture}
            className="p-4 bg-white rounded-full shadow-lg"
          >
            <Camera className="w-8 h-8 text-zinc-900" />
          </button>
        </div>
      </div>
    );
  }

  // プレビューモード
  if (preview) {
    return (
      <div className="space-y-3">
        <div className="relative rounded-lg overflow-hidden border bg-zinc-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="プレビュー" className="w-full max-h-80 object-contain" />
        </div>
        <div className="flex gap-2">
          <button
            onClick={retry}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <RotateCcw className="w-4 h-4" />
            やり直す
          </button>
          <button
            onClick={confirm}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800"
          >
            <Check className="w-4 h-4" />
            この写真を使う
          </button>
        </div>
      </div>
    );
  }

  // 選択モード
  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        capture="environment"
        onChange={handleFileInput}
        className="hidden"
      />
      <div className="flex gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-zinc-300 rounded-lg text-sm font-medium text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
        >
          <Camera className="w-5 h-5" />
          {label}
        </button>
        <button
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) {
                if (file.size > maxSizeMB * 1024 * 1024) {
                  setError(`ファイルサイズは${maxSizeMB}MB以下にしてください`);
                  return;
                }
                setCapturedFile(file);
                const reader = new FileReader();
                reader.onload = () => setPreview(reader.result as string);
                reader.readAsDataURL(file);
              }
            };
            input.click();
          }}
          className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-zinc-300 rounded-lg text-sm font-medium text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
        >
          <ImageIcon className="w-5 h-5" />
          選択
        </button>
      </div>
      {'mediaDevices' in navigator && (
        <button
          onClick={startCamera}
          className="w-full text-xs text-zinc-500 hover:text-zinc-700 py-1"
        >
          カメラをストリーム表示する
        </button>
      )}
    </div>
  );
}
