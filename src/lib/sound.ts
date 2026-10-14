// Web Audio API and Haptic feedback for warehouse scanning operations

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtx && AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Triggers a crisp commercial barcode scanner beep sound + haptic vibration.
 */
export function playScanSuccess() {
  // 1. Audio feedback
  const ctx = getAudioContext();
  if (ctx) {
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      // High pitch double-chirp tone (typical for Honeywell / Zebra enterprise scanners)
      osc.frequency.setValueAtTime(1760, now); // A6
      osc.frequency.setValueAtTime(2349.32, now + 0.05); // D7

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Audio might fail if user hasn't interacted yet
    }
  }

  // 2. Haptic vibration feedback for mobile devices
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([40, 30, 40]);
    } catch {
      // Vibration not supported or permitted
    }
  }
}

/**
 * Triggers an alert/error buzz sound + haptic vibration.
 */
export function playScanError() {
  const ctx = getAudioContext();
  if (ctx) {
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, now); // A3

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch {
      // Audio failed
    }
  }

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([120, 60, 120]);
    } catch {
      // Ignore
    }
  }
}
