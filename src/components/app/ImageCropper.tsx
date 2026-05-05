"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X, ZoomIn, ZoomOut } from "@/components/ui/icons";

export type CropShape = "circle" | "wide";

interface ImageCropperProps {
  open: boolean;
  src: string | null;
  shape: CropShape;
  /** Output width in pixels (defaults: 512 / 1280). */
  outputWidth?: number;
  /** Output height in pixels (defaults: 512 / 460). */
  outputHeight?: number;
  /** Modal title. */
  title?: string;
  onCancel: () => void;
  /** Returns a JPEG data URL of the cropped region. */
  onSave: (dataUrl: string) => void;
}

export function ImageCropper({
  open,
  src,
  shape,
  outputWidth,
  outputHeight,
  title,
  onCancel,
  onSave,
}: ImageCropperProps) {
  const FRAME_W = shape === "circle" ? 320 : 560;
  const FRAME_H = shape === "circle" ? 320 : 200;
  const OUT_W = outputWidth ?? (shape === "circle" ? 512 : 1280);
  const OUT_H = outputHeight ?? (shape === "circle" ? 512 : 460);

  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [maxScale, setMaxScale] = useState(3);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [saving, setSaving] = useState(false);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
  } | null>(null);

  const clamp = useCallback(
    (nx: number, ny: number, s: number) => {
      if (!imgNatural) return { x: nx, y: ny };
      const renderedW = imgNatural.w * s;
      const renderedH = imgNatural.h * s;
      const maxX = Math.max(0, (renderedW - FRAME_W) / 2);
      const maxY = Math.max(0, (renderedH - FRAME_H) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, nx)),
        y: Math.max(-maxY, Math.min(maxY, ny)),
      };
    },
    [imgNatural, FRAME_W, FRAME_H],
  );

  // When a fresh image loads, fit it so it covers the crop frame and reset translation.
  useEffect(() => {
    if (!imgNatural || !open) return;
    const cover = Math.max(FRAME_W / imgNatural.w, FRAME_H / imgNatural.h);
    setMinScale(cover);
    setMaxScale(cover * 4);
    setScale(cover);
    setTx(0);
    setTy(0);
  }, [imgNatural, open, FRAME_W, FRAME_H]);

  // Keep translation valid when zoom changes.
  useEffect(() => {
    setTx((prev) => clamp(prev, ty, scale).x);
    setTy((prev) => clamp(tx, prev, scale).y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // Reset state when the modal closes (so reopening with a new file feels fresh).
  useEffect(() => {
    if (!open) {
      setImgNatural(null);
      setScale(1);
      setTx(0);
      setTy(0);
      setSaving(false);
    }
  }, [open]);

  // Esc to cancel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTx: tx, startTy: ty };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const next = clamp(dragRef.current.startTx + dx, dragRef.current.startTy + dy, scale);
    setTx(next.x);
    setTy(next.y);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.06 : 0.94;
    setScale((s) => Math.max(minScale, Math.min(maxScale, s * factor)));
  };

  const handleSave = () => {
    if (!src || !imgNatural || saving) return;
    setSaving(true);

    const sourceW = FRAME_W / scale;
    const sourceH = FRAME_H / scale;
    const sourceX = imgNatural.w / 2 - tx / scale - sourceW / 2;
    const sourceY = imgNatural.h / 2 - ty / scale - sourceH / 2;

    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setSaving(false);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, OUT_W, OUT_H);
      try {
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        onSave(dataUrl);
      } catch {
        // Tainted canvas (cross-origin without CORS) — fall back to PNG.
        const dataUrl = canvas.toDataURL("image/png");
        onSave(dataUrl);
      } finally {
        setSaving(false);
      }
    };
    img.onerror = () => setSaving(false);
    img.src = src;
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-[640px] overflow-hidden rounded-3xl bg-white text-neutral-900 shadow-2xl dark:bg-neutral-950 dark:text-white">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-900">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-[15px] font-semibold tracking-tight">{title ?? "Edit photo"}</h2>
          <button
            type="button"
            onClick={handleSave}
            disabled={!src || !imgNatural || saving}
            className={`inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold transition-colors ${
              !src || !imgNatural || saving
                ? "bg-vibo-primary/40 text-white/70"
                : "bg-vibo-primary text-white hover:bg-vibo-primary/90"
            }`}
          >
            {saving ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
            Done
          </button>
        </div>

        <div className="bg-black px-6 py-8">
          <div
            className="relative mx-auto select-none overflow-hidden bg-neutral-900"
            style={{
              width: FRAME_W,
              height: FRAME_H,
              borderRadius: shape === "circle" ? "9999px" : "16px",
              touchAction: "none",
              cursor: dragRef.current ? "grabbing" : "grab",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                draggable={false}
                onLoad={(e) => {
                  const t = e.currentTarget;
                  setImgNatural({ w: t.naturalWidth, h: t.naturalHeight });
                }}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale})`,
                  transformOrigin: "center",
                  willChange: "transform",
                  pointerEvents: "none",
                  userSelect: "none",
                  maxWidth: "none",
                  maxHeight: "none",
                  width: imgNatural?.w ?? "auto",
                  height: imgNatural?.h ?? "auto",
                }}
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-xs text-neutral-500">
                No image
              </div>
            )}
            {/* Subtle inner ring */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15)",
                borderRadius: shape === "circle" ? "9999px" : "16px",
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-neutral-200 px-6 py-4 dark:border-neutral-900">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setScale((s) => Math.max(minScale, s - (maxScale - minScale) * 0.05))}
            className="grid h-8 w-8 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={minScale || 1}
            max={maxScale || 3}
            step={0.001}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="flex-1"
            style={{ accentColor: "#4b0415" }}
          />
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setScale((s) => Math.min(maxScale, s + (maxScale - minScale) * 0.05))}
            className="grid h-8 w-8 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Helper for callers: read a File into a data URL string. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

