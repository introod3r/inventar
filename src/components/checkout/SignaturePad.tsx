import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

export type SignaturePadHandle = {
  isEmpty: () => boolean;
  clear: () => void;
  toDataURL: () => string;
  toBlob: () => Promise<Blob | null>;
};

export const SignaturePad = forwardRef<SignaturePadHandle, { height?: number; label?: string }>(
  function SignaturePad({ height = 180, label = "Potpis" }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [empty, setEmpty] = useState(true);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0a0a0a";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
    }, []);

    const pos = (e: PointerEvent | React.PointerEvent) => {
      const r = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const start = (e: React.PointerEvent) => {
      e.preventDefault();
      canvasRef.current!.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = pos(e);
    };
    const move = (e: React.PointerEvent) => {
      if (!drawing.current) return;
      const ctx = canvasRef.current!.getContext("2d")!;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.current!.x, last.current!.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
      if (empty) setEmpty(false);
    };
    const end = (e: React.PointerEvent) => {
      drawing.current = false;
      try { canvasRef.current!.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    };

    const clear = () => {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
      setEmpty(true);
    };

    useImperativeHandle(ref, () => ({
      isEmpty: () => empty,
      clear,
      toDataURL: () => canvasRef.current!.toDataURL("image/png"),
      toBlob: () => new Promise<Blob | null>((resolve) => canvasRef.current!.toBlob(resolve, "image/png")),
    }));

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
          <Button type="button" size="sm" variant="ghost" onClick={clear}>
            <Eraser className="mr-1 h-3.5 w-3.5" /> Obriši
          </Button>
        </div>
        <canvas
          ref={canvasRef}
          style={{ height, touchAction: "none" }}
          className="w-full rounded-md border border-border bg-white cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
      </div>
    );
  }
);
