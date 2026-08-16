"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SignaturePadProps {
  /** Called with the current signature as a PNG data URL, or null when cleared. */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  label?: string;
}

/**
 * SignaturePad — a lightweight canvas the patient signs on (mouse or touch).
 *
 * The drawn signature is exported as a PNG data URL and handed to the caller;
 * the consent server action stores it verbatim in the immutable snapshot. This
 * is the PATIENT signature capture only — the dentist signature reuses the
 * existing profiles.signature_url system and is never captured here.
 */
export function SignaturePad({ onChange, disabled = false, label = "Patient signature" }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Size the canvas backing store to its displayed size (crisp on HiDPI).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#09090B";
    }
  }, []);

  const pos = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    hasInk.current = true;
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (hasInk.current) {
      setEmpty(false);
      onChange(canvasRef.current?.toDataURL("image/png") ?? null);
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#52525B]">{label}</span>
        <Button type="button" variant="ghost" size="xs" onClick={clear} disabled={disabled || empty}>
          <Eraser className="h-3 w-3" aria-hidden />
          Clear
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className={`w-full h-40 rounded-md border border-dashed touch-none ${
          disabled ? "bg-[#F4F4F5] border-[#E4E4E7]" : "bg-white border-[#A1A1AA] cursor-crosshair"
        }`}
        aria-label={label}
      />
      {empty && (
        <p className="text-[11px] text-[#A1A1AA]">Sign in the box above using a mouse or finger.</p>
      )}
    </div>
  );
}
