import { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Maximize2, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type SignaturePadHandle = {
  isEmpty: () => boolean;
  clear: () => void;
  toDataURL: () => string;
  toBlob: () => Promise<Blob | null>;
};

export const SignaturePad = forwardRef<SignaturePadHandle, { height?: number; label?: string }>(
  function SignaturePad({ height = 180, label = "Potpis" }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const modalCanvasRef = useRef<HTMLCanvasElement>(null);
    const [empty, setEmpty] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const drawing = useRef(false);
    const modalDrawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const modalLast = useRef<{ x: number; y: number } | null>(null);

    const initCanvas = useCallback((canvas: HTMLCanvasElement, strokeWidth = 2.5) => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#09090b";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, rect.width, rect.height);
    }, []);

    useEffect(() => {
      if (canvasRef.current) {
        initCanvas(canvasRef.current, 2);
      }
    }, [initCanvas]);

    // Initialize modal canvas when opened
    useEffect(() => {
      if (modalOpen && modalCanvasRef.current) {
        const timer = setTimeout(() => {
          if (modalCanvasRef.current) {
            initCanvas(modalCanvasRef.current, 3.5);
            // Copy existing drawing if not empty
            if (!empty && canvasRef.current) {
              const mCtx = modalCanvasRef.current.getContext("2d");
              if (mCtx) {
                const rect = modalCanvasRef.current.getBoundingClientRect();
                mCtx.drawImage(canvasRef.current, 0, 0, rect.width, rect.height);
              }
            }
          }
        }, 60);
        return () => clearTimeout(timer);
      }
    }, [modalOpen, empty, initCanvas]);

    const pos = (e: PointerEvent | React.PointerEvent, canvas: HTMLCanvasElement) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    // Main inline canvas handlers
    const start = (e: React.PointerEvent) => {
      e.preventDefault();
      canvasRef.current!.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = pos(e, canvasRef.current!);
    };
    const move = (e: React.PointerEvent) => {
      if (!drawing.current) return;
      const ctx = canvasRef.current!.getContext("2d")!;
      const p = pos(e, canvasRef.current!);
      ctx.beginPath();
      ctx.moveTo(last.current!.x, last.current!.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
      if (empty) setEmpty(false);
    };
    const end = (e: React.PointerEvent) => {
      drawing.current = false;
      try {
        canvasRef.current!.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    };

    // Fullscreen modal canvas handlers
    const modalStart = (e: React.PointerEvent) => {
      e.preventDefault();
      modalCanvasRef.current!.setPointerCapture(e.pointerId);
      modalDrawing.current = true;
      modalLast.current = pos(e, modalCanvasRef.current!);
    };
    const modalMove = (e: React.PointerEvent) => {
      if (!modalDrawing.current) return;
      const ctx = modalCanvasRef.current!.getContext("2d")!;
      const p = pos(e, modalCanvasRef.current!);
      ctx.beginPath();
      ctx.moveTo(modalLast.current!.x, modalLast.current!.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      modalLast.current = p;
    };
    const modalEnd = (e: React.PointerEvent) => {
      modalDrawing.current = false;
      try {
        modalCanvasRef.current!.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    };

    const clear = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        initCanvas(canvas, 2);
      }
      setEmpty(true);
    };

    const modalClear = () => {
      const canvas = modalCanvasRef.current;
      if (canvas) {
        initCanvas(canvas, 3.5);
      }
    };

    const acceptModalSignature = () => {
      if (modalCanvasRef.current && canvasRef.current) {
        const cCtx = canvasRef.current.getContext("2d");
        const rect = canvasRef.current.getBoundingClientRect();
        if (cCtx) {
          cCtx.fillStyle = "#ffffff";
          cCtx.fillRect(0, 0, rect.width, rect.height);
          cCtx.drawImage(modalCanvasRef.current, 0, 0, rect.width, rect.height);
          setEmpty(false);
        }
      }
      setModalOpen(false);
    };

    useImperativeHandle(ref, () => ({
      isEmpty: () => empty,
      clear,
      toDataURL: () => canvasRef.current!.toDataURL("image/png"),
      toBlob: () =>
        new Promise<Blob | null>((resolve) =>
          canvasRef.current!.toBlob(resolve, "image/png")
        ),
    }));

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            {label}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs font-medium"
              onClick={() => setModalOpen(true)}
            >
              <Maximize2 className="mr-1 h-3 w-3" /> Ceo ekran
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={clear}
            >
              <Eraser className="mr-1 h-3 w-3" /> Obriši
            </Button>
          </div>
        </div>

        <div className="relative">
          <canvas
            ref={canvasRef}
            style={{ height, touchAction: "none" }}
            className="w-full rounded-xl border-2 border-dashed border-border bg-white cursor-crosshair shadow-inner"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            onPointerCancel={end}
          />
          {empty && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-muted-foreground/60 text-xs font-medium select-none">
              Potpišite se ovde ili kliknite „Ceo ekran”
            </div>
          )}
        </div>

        {/* Fullscreen Signature Modal for Mobile Ergonomics */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-2xl w-[96vw] max-h-[95vh] p-4 flex flex-col justify-between">
            <DialogHeader className="pb-2 border-b">
              <DialogTitle className="text-base font-bold flex items-center justify-between">
                <span>Digitalni Potpis</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Potpišite se prstom ili olovkom
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="relative my-3 flex-1 flex flex-col items-center">
              <canvas
                ref={modalCanvasRef}
                style={{ touchAction: "none", height: 260 }}
                className="w-full rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white cursor-crosshair shadow-md"
                onPointerDown={modalStart}
                onPointerMove={modalMove}
                onPointerUp={modalEnd}
                onPointerLeave={modalEnd}
                onPointerCancel={modalEnd}
              />
              {/* Baseline guideline */}
              <div className="absolute bottom-10 left-8 right-8 border-b-2 border-dashed border-slate-300 pointer-events-none" />
              <span className="absolute bottom-4 left-8 text-[11px] text-slate-400 font-medium pointer-events-none select-none">
                ✕ Linija za potpis
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={modalClear}
                className="h-10 px-4"
              >
                <Eraser className="mr-1.5 h-4 w-4" /> Obriši
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setModalOpen(false)}
                  className="h-10 px-4"
                >
                  <X className="mr-1.5 h-4 w-4" /> Otkaži
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={acceptModalSignature}
                  className="h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  <Check className="mr-1.5 h-4 w-4" /> Prihvati potpis
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);
