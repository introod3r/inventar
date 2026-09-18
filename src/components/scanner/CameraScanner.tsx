import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";
import {
  Camera,
  CameraOff,
  Keyboard,
  RefreshCw,
  Zap,
  ZapOff,
  Focus,
  SwitchCamera,
  Maximize2,
  Minimize2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { playScanSuccess } from "@/lib/sound";

export type ScanResult = { code: string; format?: string };

// Native BarcodeDetector interface for browsers that support hardware ML acceleration
interface BarcodeDetectorInstance {
  detect(image: ImageBitmapSource): Promise<Array<{ rawValue: string; format: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats: string[] }): BarcodeDetectorInstance;
      getSupportedFormats?(): Promise<string[]>;
    };
  }
}

export function CameraScanner({
  onScan,
  paused = false,
  fullscreen = false,
  onToggleFullscreen,
}: {
  onScan: (r: ScanResult) => void;
  paused?: boolean;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const lastCodeTimeRef = useRef<{ code: string; time: number } | null>(null);

  // Touch pinch gesture tracking
  const pinchDistRef = useRef<number | null>(null);
  const baseZoomRef = useRef<number>(1);

  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [active, setActive] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [isHardwareAccelerated, setIsHardwareAccelerated] = useState(false);

  // Hardware camera capabilities
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(1);
  const [macroSupported, setMacroSupported] = useState(false);
  const [macroActive, setMacroActive] = useState(false);
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; id: number } | null>(null);
  const [flashFeedback, setFlashFeedback] = useState(false);

  // Detect HTTPS or localhost context
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

  // Handle successful code decode with throttle & green flash
  const handleDecoded = useCallback(
    (code: string, format?: string) => {
      if (!code || paused) return;
      const now = Date.now();
      if (
        lastCodeTimeRef.current &&
        lastCodeTimeRef.current.code === code &&
        now - lastCodeTimeRef.current.time < 1200
      ) {
        return;
      }
      lastCodeTimeRef.current = { code, time: now };

      // Trigger audio & haptic feedback
      playScanSuccess();

      // Visual flash on viewfinder
      setFlashFeedback(true);
      setTimeout(() => setFlashFeedback(false), 350);

      onScan({ code, format });
    },
    [paused, onScan]
  );

  // Apply hardware refocus
  const triggerRefocus = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;

    try {
      const caps = (typeof track.getCapabilities === "function" ? track.getCapabilities() : {}) as Record<
        string,
        unknown
      >;
      const focusModes = Array.isArray(caps.focusMode) ? caps.focusMode : [];

      if (focusModes.includes("single-shot")) {
        await track.applyConstraints({ advanced: [{ focusMode: "single-shot" }] as any });
        setTimeout(() => {
          track.applyConstraints({ advanced: [{ focusMode: "continuous" }] as any }).catch(() => {});
        }, 300);
      } else {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] as any });
      }
    } catch {
      // ignore
    }
  }, []);

  // Tap-to-focus with visual HUD indicator and coordinates
  const handleTapToFocus = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;
    if ("touches" in e) {
      if (e.touches.length !== 1) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const normX = Math.max(0, Math.min(1, x / rect.width));
    const normY = Math.max(0, Math.min(1, y / rect.height));

    setFocusRing({ x, y, id: Date.now() });

    // Attempt hardware pointsOfInterest focus
    const track = trackRef.current;
    if (track) {
      try {
        const caps = (typeof track.getCapabilities === "function" ? track.getCapabilities() : {}) as Record<
          string,
          unknown
        >;
        const adv: Record<string, unknown> = {};

        if (caps.pointsOfInterest) {
          adv.pointsOfInterest = [{ x: normX, y: normY }];
        }

        const focusModes = Array.isArray(caps.focusMode) ? caps.focusMode : [];
        if (focusModes.includes("single-shot")) {
          track.applyConstraints({ advanced: [{ ...adv, focusMode: "single-shot" }] as any }).catch(() => {});
          setTimeout(() => {
            track.applyConstraints({ advanced: [{ focusMode: "continuous" }] as any }).catch(() => {});
          }, 300);
        } else {
          track.applyConstraints({ advanced: [{ ...adv, focusMode: "continuous" }] as any }).catch(() => {});
        }
      } catch {
        triggerRefocus();
      }
    } else {
      triggerRefocus();
    }

    setTimeout(() => {
      setFocusRing((curr) => (curr?.x === x && curr?.y === y ? null : curr));
    }, 1200);
  };

  // Pinch-to-zoom touch handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && zoomRange) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchDistRef.current = dist;
      baseZoomRef.current = currentZoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchDistRef.current && zoomRange) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / pinchDistRef.current;
      const targetZoom = Math.min(
        zoomRange.max,
        Math.max(zoomRange.min, baseZoomRef.current * ratio)
      );
      setZoom(targetZoom);
    }
  };

  const handleTouchEnd = () => {
    pinchDistRef.current = null;
  };

  // Change camera zoom level
  const setZoom = useCallback(
    async (zoomValue: number) => {
      const track = trackRef.current;
      if (!track || !zoomRange) return;
      const clamped = Math.min(zoomRange.max, Math.max(zoomRange.min, zoomValue));
      try {
        await track.applyConstraints({ advanced: [{ zoom: clamped }] as any });
        setCurrentZoom(clamped);
      } catch {
        // ignore
      }
    },
    [zoomRange]
  );

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

  // Toggle macro mode
  const toggleMacro = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      const caps = (typeof track.getCapabilities === "function" ? track.getCapabilities() : {}) as Record<
        string,
        unknown
      >;
      const nextState = !macroActive;

      if (nextState) {
        // Activate macro
        if (caps.focusDistance && typeof caps.focusDistance === "object") {
          const fd = caps.focusDistance as { min?: number };
          await track.applyConstraints({
            advanced: [{ focusMode: "manual", focusDistance: fd.min ?? 0.05 }] as any,
          });
        } else if (zoomRange) {
          const macroZoom = Math.min(2.0, zoomRange.max);
          await track.applyConstraints({ advanced: [{ zoom: macroZoom }] as any });
          setCurrentZoom(macroZoom);
        }
        triggerRefocus();
      } else {
        // Reset from macro
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] as any });
        if (zoomRange) {
          await track.applyConstraints({ advanced: [{ zoom: 1.0 }] as any });
          setCurrentZoom(1.0);
        }
      }
      setMacroActive(nextState);
    } catch {
      // ignore
    }
  }, [macroActive, zoomRange, triggerRefocus]);

  // Flip camera between front & back lenses
  const flipCamera = useCallback(() => {
    if (devices.length < 2) return;
    const currentIndex = devices.findIndex((d) => d.deviceId === deviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    setDeviceId(devices[nextIndex].deviceId);
  }, [devices, deviceId]);

  // Start Camera Stream
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
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
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

  // Main Stream Lifecycle & Scanning Loop
  useEffect(() => {
    if (!active || paused || !permissionGranted) return;
    let cancelled = false;

    // Stop prior streams
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch {
        // ignore
      }
      zxingControlsRef.current = null;
    }

    (async () => {
      try {
        // Enumerate video devices
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
        setDevices(videoInputs);

        // Intelligently select back camera preferring main back lens over ultra-wide
        let chosen = deviceId;
        if (!chosen) {
          const backCameras = videoInputs.filter((d) => /back|rear|environment|zadnj/i.test(d.label));
          const mainBack = backCameras.find((d) => !/wide|ultra|0\.5/i.test(d.label));
          chosen = mainBack?.deviceId ?? backCameras[0]?.deviceId ?? videoInputs[0]?.deviceId;
        }

        // Build robust media constraints
        const videoConstraints: MediaTrackConstraints = {
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30, max: 60 },
          advanced: [
            { focusMode: "continuous" } as any,
            { exposureMode: "continuous" } as any,
            { whiteBalanceMode: "continuous" } as any,
          ],
        };

        if (chosen) {
          videoConstraints.deviceId = { exact: chosen };
        } else {
          videoConstraints.facingMode = { ideal: "environment" };
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const track = stream.getVideoTracks()[0] ?? null;
        trackRef.current = track;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        // Inspect hardware capabilities (torch, zoom, focus, macro)
        if (track) {
          const caps = (typeof track.getCapabilities === "function" ? track.getCapabilities() : {}) as Record<
            string,
            unknown
          >;

          setTorchSupported("torch" in caps);

          if (caps.zoom && typeof caps.zoom === "object") {
            const z = caps.zoom as { min?: number; max?: number; step?: number };
            setZoomRange({
              min: z.min ?? 1,
              max: Math.min(z.max ?? 5, 8),
              step: z.step ?? 0.1,
            });
            setCurrentZoom(z.min ?? 1);
          } else {
            setZoomRange(null);
          }

          if (
            ("focusDistance" in caps && caps.focusDistance) ||
            ("focusMode" in caps && Array.isArray(caps.focusMode) && caps.focusMode.includes("manual"))
          ) {
            setMacroSupported(true);
          } else {
            setMacroSupported(true); // Can fallback to digital macro zoom
          }

          triggerRefocus();
        }

        // Check for native BarcodeDetector API
        const BarcodeDetectorClass =
          typeof window !== "undefined" && "BarcodeDetector" in window ? window.BarcodeDetector : null;

        if (BarcodeDetectorClass) {
          try {
            const detector = new BarcodeDetectorClass({
              formats: [
                "qr_code",
                "code_128",
                "code_39",
                "code_93",
                "ean_13",
                "ean_8",
                "upc_a",
                "upc_e",
                "data_matrix",
                "itf",
                "aztec",
              ],
            });

            setIsHardwareAccelerated(true);
            isScanningRef.current = true;

            let lastScanTime = 0;
            const scanLoop = async () => {
              if (cancelled || !isScanningRef.current) return;
              const video = videoRef.current;
              const now = performance.now();

              // Throttle detection loop to ~10-12 checks per second (80ms) for high response with low CPU
              if (video && video.readyState >= 2 && !video.paused && now - lastScanTime >= 80) {
                lastScanTime = now;
                try {
                  const barcodes = await detector.detect(video);
                  if (barcodes && barcodes.length > 0) {
                    const detected = barcodes[0];
                    handleDecoded(detected.rawValue, detected.format);
                  }
                } catch {
                  // Frame capture error, continue
                }
              }

              if (!cancelled && isScanningRef.current) {
                animFrameRef.current = requestAnimationFrame(scanLoop);
              }
            };

            animFrameRef.current = requestAnimationFrame(scanLoop);
            return;
          } catch {
            // BarcodeDetector instantiation failed, fallback to ZXing below
          }
        }

        // Fallback: @zxing/browser MultiFormatReader
        setIsHardwareAccelerated(false);
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
        const controls = await reader.decodeFromStream(
          stream,
          videoRef.current!,
          (result) => {
            if (result && !cancelled) {
              const text = result.getText();
              if (text) {
                handleDecoded(text, result.getBarcodeFormat()?.toString());
              }
            }
          }
        );
        zxingControlsRef.current = controls;
      } catch (e) {
        const err = e as Error;
        setError(err.message ?? "Greška pri radu sa kamerom.");
      }
    })();

    return () => {
      cancelled = true;
      isScanningRef.current = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (zxingControlsRef.current) {
        try {
          zxingControlsRef.current.stop();
        } catch {
          // ignore
        }
        zxingControlsRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      trackRef.current = null;
      setTorchSupported(false);
      setTorchOn(false);
      setZoomRange(null);
      setMacroActive(false);
    };
  }, [active, paused, deviceId, permissionGranted, handleDecoded, triggerRefocus]);

  return (
    <div className="space-y-3">
      {/* Viewfinder Frame with Tap-to-focus and Touch Gestures */}
      <div
        ref={containerRef}
        className={`relative w-full bg-black rounded-2xl overflow-hidden cursor-pointer select-none transition-all duration-300 shadow-xl ${
          fullscreen
            ? "fixed inset-0 z-50 rounded-none h-screen"
            : "aspect-3/4 sm:aspect-16/10 max-h-[70vh]"
        }`}
        onClick={active && permissionGranted ? handleTapToFocus : undefined}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {active && permissionGranted ? (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />

            {/* Flash Feedback Indicator on successful read */}
            <div
              className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
                flashFeedback
                  ? "bg-emerald-500/25 border-4 border-emerald-400 opacity-100"
                  : "opacity-0"
              }`}
            />

            {/* HUD Viewfinder Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
              <div
                className={`w-full max-w-xs sm:max-w-sm aspect-square relative rounded-3xl transition-all duration-300 ${
                  flashFeedback
                    ? "border-2 border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.7)]"
                    : "border-2 border-white/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                }`}
              >
                {/* Corner reticle brackets */}
                <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />

                {/* Animated Laser Scanning Line */}
                <div className="absolute inset-x-2 top-0 h-1 bg-linear-to-r from-transparent via-primary to-transparent animate-pulse shadow-[0_0_12px_rgba(var(--primary-rgb),0.8)] [animation-duration:2.5s]" />

                {/* Status Indicator Pill */}
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur-md px-3.5 py-1 rounded-full text-[11px] text-white/95 font-medium flex items-center gap-1.5 whitespace-nowrap border border-white/10 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  {isHardwareAccelerated ? "Hardware AI skeniranje" : "Auto-fokus aktivan"}
                </div>

                {/* Bottom hint badge */}
                <div className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur-md px-3 py-1 rounded-full text-[10px] text-white/80 font-normal whitespace-nowrap border border-white/10">
                  Dodirni ekran za fokusiranje
                </div>
              </div>
            </div>

            {/* Tap Focus Ring Indicator */}
            {focusRing && (
              <div
                key={focusRing.id}
                className="absolute w-14 h-14 -ml-7 -mt-7 border-2 border-emerald-400 rounded-full pointer-events-none animate-ping shadow-[0_0_15px_rgba(52,211,153,0.8)]"
                style={{ left: focusRing.x, top: focusRing.y }}
              >
                <div className="absolute inset-0 m-auto w-2 h-2 bg-emerald-400 rounded-full" />
              </div>
            )}

            {/* Quick Floating HUD Overlay Controls */}
            <div className="absolute top-3 right-3 flex flex-col gap-2 z-20">
              {torchSupported && (
                <Button
                  type="button"
                  size="icon"
                  variant={torchOn ? "default" : "secondary"}
                  className={`h-10 w-10 rounded-full backdrop-blur-md border border-white/20 transition-all ${
                    torchOn ? "bg-amber-500 hover:bg-amber-600 text-white shadow-[0_0_15px_rgba(245,158,11,0.6)]" : "bg-black/60 text-white hover:bg-black/80"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTorch();
                  }}
                  title="Blic / Svetlo"
                >
                  {torchOn ? <ZapOff className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
                </Button>
              )}

              {devices.length > 1 && (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-10 w-10 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80 border border-white/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    flipCamera();
                  }}
                  title="Promeni kameru"
                >
                  <SwitchCamera className="h-5 w-5" />
                </Button>
              )}

              {macroSupported && (
                <Button
                  type="button"
                  size="icon"
                  variant={macroActive ? "default" : "secondary"}
                  className={`h-10 w-10 rounded-full backdrop-blur-md border border-white/20 transition-all ${
                    macroActive ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(var(--primary-rgb),0.5)]" : "bg-black/60 text-white hover:bg-black/80"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMacro();
                  }}
                  title="Makro fokus za sitne kodove"
                >
                  <Sparkles className="h-5 w-5" />
                </Button>
              )}

              {onToggleFullscreen && (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-10 w-10 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80 border border-white/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFullscreen();
                  }}
                  title={fullscreen ? "Zatvori pun ekran" : "Pun ekran"}
                >
                  {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                </Button>
              )}
            </div>

            {/* Quick Zoom Multiplier Bar on Viewfinder */}
            {zoomRange && (
              <div
                className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1.5 border border-white/15 z-20"
                onClick={(e) => e.stopPropagation()}
              >
                {[1, 1.5, 2, 3].map((z) => {
                  if (z < zoomRange.min || z > zoomRange.max) return null;
                  const isSelected = Math.abs(currentZoom - z) < 0.2;
                  return (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setZoom(z)}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-sm scale-105"
                          : "text-white/80 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      {z}x
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full grid place-items-center text-white/80 p-6 text-center">
            <div className="space-y-4 max-w-sm">
              <div className="w-16 h-16 mx-auto rounded-full bg-white/10 grid place-items-center border border-white/20 shadow-lg">
                <CameraOff className="h-8 w-8 text-white/70" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Kamera nije pokrenuta</h3>
                <p className="text-xs text-white/70 mt-1">
                  {error
                    ? error
                    : "Pritisni dugme ispod i odobri pristup kameri u pregledaču za skeniranje QR i bar kodova."}
                </p>
              </div>
              <Button
                type="button"
                onClick={startCamera}
                size="lg"
                className="w-full shadow-lg font-medium"
              >
                <Camera className="mr-2 h-5 w-5" /> Pokreni kameru
              </Button>
            </div>
          </div>
        )}

        {error && active && (
          <div className="absolute inset-x-0 bottom-0 bg-destructive/90 text-destructive-foreground text-sm p-3 z-30 flex items-center justify-between">
            <span className="truncate">{error}</span>
            <Button size="sm" variant="ghost" onClick={() => setError(null)}>
              U redu
            </Button>
          </div>
        )}
      </div>

      {/* Main Hardware Controls Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {permissionGranted && (
          <Button
            type="button"
            variant={active ? "secondary" : "default"}
            onClick={() => setActive((a) => !a)}
          >
            {active ? <CameraOff className="mr-2 h-4 w-4" /> : <Camera className="mr-2 h-4 w-4" />}
            {active ? "Zaustavi kameru" : "Pokreni kameru"}
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

        {permissionGranted && devices.length > 1 && (
          <select
            className="h-9 rounded-md border bg-background px-3 text-xs font-medium"
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

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowManual((s) => !s)}
        >
          <Keyboard className="mr-2 h-4 w-4" /> Ručni unos
        </Button>

        {permissionGranted && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              setActive(false);
              setTimeout(() => setActive(true), 100);
            }}
            title="Restartuj kameru"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Manual Input Dropdown */}
      {showManual && (
        <form
          className="flex gap-2 p-3 bg-muted/40 rounded-xl border"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) {
              handleDecoded(manual.trim(), "MANUAL");
              setManual("");
            }
          }}
        >
          <Input
            placeholder="Unesi šifru, QR ili barkod ručno..."
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
