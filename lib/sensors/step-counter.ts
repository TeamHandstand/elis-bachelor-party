// StepCounter — counts walking steps from DeviceMotionEvent.
// Implements CountingSensor. Emits delta = 1 per detected step.
//
// Algorithm:
//   1. Take accelerationIncludingGravity magnitude each tick.
//   2. Run a simple high-pass filter to remove the gravity baseline, leaving
//      the dynamic component (a poor man's bandpass — DeviceMotion samples at
//      ~60Hz so we don't need explicit low-pass smoothing for step cadence).
//   3. Peak-detect: when the filtered signal crosses `threshold` and is a
//      local maximum AND we're past a refractory window since the last
//      detected step, count it as a step.
//
// Tunables:
//   - threshold: m/s² above gravity baseline (default 1.2)
//   - refractoryMs: minimum gap between counted steps (default 250ms)

import type { CountingSensor, Unsubscribe } from "@/lib/sensors/types";

interface StepCounterOptions {
  /** Acceleration threshold (m/s² above gravity baseline). */
  threshold?: number;
  /** Refractory period between counted steps in ms. */
  refractoryMs?: number;
}

export class StepCounter implements CountingSensor {
  private threshold: number;
  private refractoryMs: number;

  constructor(opts: StepCounterOptions = {}) {
    this.threshold = opts.threshold ?? 1.2;
    this.refractoryMs = opts.refractoryMs ?? 250;
  }

  isSupported(): boolean {
    return typeof window !== "undefined" && "DeviceMotionEvent" in window;
  }

  async requestPermission(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    const ME: any = (window as any).DeviceMotionEvent;
    if (ME && typeof ME.requestPermission === "function") {
      try {
        return (await ME.requestPermission()) === "granted";
      } catch {
        return false;
      }
    }
    return true; // Android / desktop: implicit
  }

  async start(onDelta: (delta: number) => void): Promise<Unsubscribe> {
    if (!this.isSupported()) return () => {};

    // High-pass filter state. A simple exponential moving average tracks the
    // slow-varying gravity baseline; the residual is the dynamic component.
    let baseline = 9.8;
    const baselineAlpha = 0.1; // EMA coefficient

    // Peak detection state.
    let lastResidual = 0;
    let rising = false;
    let peakValue = 0;
    let lastStepTs = 0;

    const handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const x = a.x ?? 0;
      const y = a.y ?? 0;
      const z = a.z ?? 0;
      const mag = Math.sqrt(x * x + y * y + z * z);

      // Update gravity baseline (low-pass).
      baseline = baseline * (1 - baselineAlpha) + mag * baselineAlpha;
      const residual = mag - baseline;

      // Track rising/falling edge to find local maxima of the residual.
      if (residual > lastResidual) {
        rising = true;
        if (residual > peakValue) peakValue = residual;
      } else if (rising && residual < lastResidual) {
        // Just hit a local maximum at lastResidual.
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        if (
          peakValue >= this.threshold &&
          now - lastStepTs >= this.refractoryMs
        ) {
          lastStepTs = now;
          onDelta(1);
        }
        rising = false;
        peakValue = 0;
      }
      lastResidual = residual;
    };

    window.addEventListener("devicemotion", handler);

    return () => {
      window.removeEventListener("devicemotion", handler);
    };
  }
}
