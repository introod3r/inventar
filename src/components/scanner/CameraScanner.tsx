import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";
import { Camera, CameraOff, Keyboard, RefreshCw, Zap, ZapOff, Focus, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ScanResult = { code: string; format?: string };

export function CameraScanner({
  onScan,
  paused = false,
}: {
  onScan: (r: ScanResult) => void;
  paused?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [active, setActive] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);

  // Focus & Camera capabilities
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(1);
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; id: number } | null>(null);

  // Detect insecure context up-front (camera requires https or localhost)
  const isSecure =
    typeof window === "undefined"
      ? true
      : window.isSecureContext ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

  const hasMediaApi =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function";

  // User-gesture handler: request permission synchronously, then enumerate.
  const startCamera = async () => {
    setError(null);

    if (!isSecure) {
      setError("Kamera zahteva HTTPS vezu. Otvori aplikaciju preko https:// adrese.");
      return;
    }
    if (!hasMediaApi) {
      setError("Ovaj pregledač ne podržava pristup kameri. Pokušaj sa Chrome ili Safari.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // @ts-expect-error non-standard advanced constraints for autofocus
          advanced: [{ focusMode: "continuous" }, { focusMode: "auto" }],
        },
        audio: false,
      });
      stream.getTracks().forEach((t) => t.stop());
      setPermissionGranted(true);
      setActive(true);
    } catch (e) {
      const err = e as DOMException;
      if (err.name === "NotAllowedError" || err.name === "SecurityError") {
        setError("Pristup kameri je odbijen. Dozvoli kameru u podešavanjima pregledača i pokušaj ponovo.");
      } else if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
        setError("Nije pronađena kamera na ovom uređaju.");
      } else if (err.name === "NotReadableError") {
        setError("Kameru koristi druga aplikacija. Zatvori je i pokušaj ponovo.");
      } else {
        setError(err.message || "Greška pri pristupu kameri.");
      }
    }
  };

  // Helper to trigger hardware refocus
  const triggerRefocus = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;

    try {
      const caps = (typeof track.getCapabilities === "function" ? track.getCapabilities() : {}) as Record<string, any>;

      if (caps.focusMode && Array.isArray(caps.focusMode)) {
        if (caps.focusMode.includes("single-shot")) {
          await track.applyConstraints({ advanced: [{ focusMode: "single-shot" }] as any });
          setTimeout(() => {
            track.applyConstraints({ advanced: [{ focusMode: "continuous" }] as any }).catch(() => {});
          }, 300);
        } else if (caps.focusMode.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] as any });
        }
      } else {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] as any });
      }
    } catch {
      // ignore constraint error
    }
  }, []);

  // Handle tap on camera view to set visual focus ring and trigger refocus
  const handleTapToFocus = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setFocusRing({ x, y, id: Date.now() });

    triggerRefocus();

    setTimeout(() => {
      setFocusRing((curr) => (curr?.x === x && curr?.y === y ? null : curr));
    }, 1000);
  };

  // Change camera zoom level
  const setZoom = useCallback(async (zoomValue: number) => {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: zoomValue }] as any });
      setCurrentZoom(zoomValue);
    } catch {
      // ignore
    }
  }, []);

  // Toggle torch / flashlight
  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      const nextState = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: nextState }] as any });
      setTorchOn(nextState);
    } catch {
      // ignore
    }
  }, [torchOn]);

  useEffect(() => {
    if (!active || paused || !permissionGranted) return;
    let cancelled = false;

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.ITF,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints);

    (async () => {
      try {
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(list);

        let chosen =
          deviceId ??
          list.find((d) => /back|rear|environment|zadnj/i.test(d.label))?.deviceId ??
          list[0]?.deviceId;

        // Build video constraints with 1080p ideal resolution and focusMode
        const videoConstraints: MediaTrackConstraints = {
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 30 },
          // @ts-expect-error non-standard advanced autofocus constraint
          advanced: [{ focusMode: "continuous" }, { focusMode: "auto" }],
        };

        if (chosen) {
          videoConstraints.deviceId = { exact: chosen };
        } else {
          videoConstraints.facingMode = { ideal: "environment" };
        }

        const controls = await reader.decodeFromConstraints(
          { video: videoConstraints, audio: false },
          videoRef.current!,
          (result) => {
            if (result) {
              const text = result.getText();
              if (text) onScan({ code: text, format: result.getBarcodeFormat()?.toString() });
            }
          }
        );
        controlsRef.current = controls;

        // Inspect running track capabilities for focus, torch, zoom
        setTimeout(() => {
          if (cancelled) return;
          const stream = videoRef.current?.srcObject as MediaStream | null;
          const track = stream?.getVideoTracks()[0] ?? null;
          trackRef.current = track;

          if (track) {
            const caps = (typeof track.getCapabilities === "function" ? track.getCapabilities() : {}) as Record<string, any>;

            if ("torch" in caps) {
              setTorchSupported(true);
            } else {
              setTorchSupported(false);
            }

            if (caps.zoom && typeof caps.zoom === "object") {
              setZoomRange({
                min: caps.zoom.min ?? 1,
                max: Math.min(caps.zoom.max ?? 4, 5),
                step: caps.zoom.step ?? 0.1,
              });
              setCurrentZoom(caps.zoom.min ?? 1);
            } else {
              setZoomRange(null);
            }

            triggerRefocus();
          }
        }, 300);

      } catch (e) {
        const err = e as Error;
        setError(err.message ?? "Greška pri pristupu kameri.");
      }
    })();

    return () => {
      cancelled = true;
      trackRef.current = null;
      setTorchSupported(false);
      setTorchOn(false);
      setZoomRange(null);
      try {
        controlsRef.current?.stop();
      } catch {
        // noop
      }
      controlsRef.current = null;
    };
  }, [active, paused, deviceId, onScan, permissionGranted, triggerRefocus]);

  return (
    <div className="space-y-3">
      <div
        className="relative aspect-3/4 sm:aspect-video w-full bg-black rounded-xl overflow-hidden cursor-pointer select-none"
        onClick={active && permissionGranted ? handleTapToFocus : undefined}
      >
        {active && permissionGranted ? (
          <>
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />

            {/* Viewfinder Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-3/4 max-w-sm aspect-square border-2 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-3 py-0.5 rounded-full text-[11px] text-white/90 font-medium whitespace-nowrap">
                  Dodirni ekran za fokusiranje
                </div>
              </div>
            </div>

            {/* Focus Ring Indicator on Tap */}
            {focusRing && (
              <div
                key={focusRing.id}
                className="absolute w-12 h-12 -ml-6 -mt-6 border-2 border-primary rounded-full animate-ping pointer-events-none"
                style={{ left: focusRing.x, top: focusRing.y }}
              />
            )}
          </>
        ) : (
          <div className="w-full h-full grid place-items-center text-white/80 p-6 text-center">
            <div className="space-y-3">
              <CameraOff className="h-10 w-10 mx-auto opacity-80" />
              <p className="text-sm text-white/80 max-w-xs">
                {error
                  ? error
                  : 'Pritisni „Pokreni kameru" i dozvoli pristup kada pregledač pita.'}
              </p>
              <Button type="button" onClick={startCamera} variant="secondary">
                <Camera className="mr-2 h-4 w-4" /> Pokreni kameru
              </Button>
            </div>
          </div>
        )}
        {error && active && (
          <div className="absolute inset-x-0 bottom-0 bg-destructive/90 text-destructive-foreground text-sm p-3">
            {error}
          </div>
        )}
      </div>

      {/* Controls & Quick Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {permissionGranted && (
          <Button
            type="button"
            variant={active ? "secondary" : "default"}
            onClick={() => setActive((a) => !a)}
          >
            {active ? <CameraOff className="mr-2 h-4 w-4" /> : <Camera className="mr-2 h-4 w-4" />}
            {active ? "Zaustavi" : "Pokreni"}
          </Button>
        )}

        {permissionGranted && active && (
          <Button
            type="button"
            variant="outline"
            onClick={triggerRefocus}
            title="Refokusiraj kameru"
          >
            <Focus className="mr-2 h-4 w-4 text-primary" /> Fokusiraj
          </Button>
        )}

        {permissionGranted && active && torchSupported && (
          <Button
            type="button"
            variant={torchOn ? "default" : "outline"}
            onClick={toggleTorch}
            title="Blic / Svetlo"
          >
            {torchOn ? <ZapOff className="mr-2 h-4 w-4" /> : <Zap className="mr-2 h-4 w-4" />}
            {torchOn ? "Blic uključen" : "Blic"}
          </Button>
        )}

        {permissionGranted && devices.length > 1 && (
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={deviceId ?? ""}
            onChange={(e) => setDeviceId(e.target.value || undefined)}
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Kamera ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
        )}

        <Button type="button" variant="ghost" onClick={() => setShowManual((s) => !s)}>
          <Keyboard className="mr-2 h-4 w-4" /> Ručni unos
        </Button>

        {permissionGranted && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              setActive(false);
              setTimeout(() => setActive(true), 50);
            }}
            title="Osveži kameru"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Zoom controls if hardware zoom is supported */}
      {permissionGranted && active && zoomRange && (
        <div className="flex items-center gap-3 p-2 bg-muted/40 rounded-lg text-sm">
          <ZoomIn className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium">Zum:</span>
          <div className="flex gap-1.5">
            {[1, 1.5, 2, 2.5, 3].map((z) => {
              if (z < zoomRange.min || z > zoomRange.max) return null;
              return (
                <Button
                  key={z}
                  type="button"
                  size="sm"
                  variant={Math.abs(currentZoom - z) < 0.1 ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setZoom(z)}
                >
                  {z}x
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {showManual && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) {
              onScan({ code: manual.trim(), format: "MANUAL" });
              setManual("");
            }
          }}
        >
          <Input
            placeholder="Unesi šifru / QR / barkod"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            autoFocus
          />
          <Button type="submit">Potvrdi</Button>
        </form>
      )}
    </div>
  );
}

