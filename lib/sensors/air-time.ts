// AirTimeDetector — detects intervals of freefall via DeviceMotion and emits
// the duration (in seconds) of each completed airborne window. Implements
// CountingSensor so the team-total aggregation already in the store sums
// every player's contributions.
//
// Algorithm:
//   - Poll accelerationIncludingGravity at devicemotion's native rate (~60Hz on
//     iOS).
//   - Magnitude in normal hand-held / pocketed posture sits near 9.8 m/s² (the
//     gravity vector). When the phone is in free fall, the apparent gravity
//     drops to ~0.
//   - Treat "airborne" as any sample where mag < FREEFALL_MAG. End the window
//     when mag rises back above REST_MAG (catch impact, or held still).
//   - Filter out windows shorter than MIN_AIR_MS (sensor noise / a quick jiggle)
//     and longer than MAX_AIR_MS (likely a sensor glitch).
//
// Tunables are conservative: a 0.5s toss registers cleanly, a small jiggle
// does not.
//
// iOS: requires the same DeviceMotionEvent.requestPermission() flow as the
// shake / step sensors.

import type { CountingSensor, Unsubscribe } from "@/lib/sensors/types";

interface AirTimeOptions {
  freefallMag?: number; // m/s² — below this counts as airborne
  restMag?: number; // m/s² — above this ends an airborne window
  minAirMs?: number;
  maxAirMs?: number;
}

export class AirTimeDetector implements CountingSensor {
  private freefallMag: number;
  private restMag: number;
  private minAirMs: number;
  private maxAirMs: number;

  constructor(opts: AirTimeOptions = {}) {
    this.freefallMag = opts.freefallMag ?? 4;
    this.restMag = opts.restMag ?? 7;
    this.minAirMs = opts.minAirMs ?? 80;
    this.maxAirMs = opts.maxAirMs ?? 5000;
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
    return true;
  }

  async start(onDelta: (delta: number) => void): Promise<Unsubscribe> {
    if (!this.isSupported()) return () => {};

    let airStart: number | null = null;
    let lastMag = 9.8;

    const handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const x = a.x ?? 0;
      const y = a.y ?? 0;
      const z = a.z ?? 0;
      const mag = Math.sqrt(x * x + y * y + z * z);
      lastMag = mag;
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      if (airStart === null) {
        if (mag < this.freefallMag) airStart = now;
      } else if (mag > this.restMag) {
        const duration = now - airStart;
        airStart = null;
        if (duration >= this.minAirMs && duration <= this.maxAirMs) {
          onDelta(duration / 1000);
        }
      }
    };

    window.addEventListener("devicemotion", handler);

    return () => {
      // If the phone was still airborne when we tore down, abandon the window
      // — we can't know if it was a real toss without seeing the impact.
      airStart = null;
      void lastMag;
      window.removeEventListener("devicemotion", handler);
    };
  }
}
