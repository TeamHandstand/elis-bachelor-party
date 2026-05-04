// RotationCounter — accumulates absolute degrees rotated, derived from
// DeviceOrientationEvent.alpha. Implements CountingSensor and additionally
// exposes pause() / resume() / getTotalDegrees() so the UI can require the
// player to hold two on-screen buttons (release == pause).
//
// alpha is in degrees [0, 360). To handle the wraparound, we keep the
// previous reading and compute the signed shortest delta in [-180, 180].
// Both directions count toward the total (we accumulate the absolute delta).

import type { CountingSensor, Unsubscribe } from "@/lib/sensors/types";

function signedDelta(prev: number, curr: number): number {
  // shortest angular distance from prev → curr in (−180, 180]
  let d = curr - prev;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

export class RotationCounter implements CountingSensor {
  private paused = false;
  private totalDeg = 0;
  private prevAlpha: number | null = null;
  private subscribed = false;
  private handler: ((e: DeviceOrientationEvent) => void) | null = null;

  isSupported(): boolean {
    return typeof window !== "undefined" && "DeviceOrientationEvent" in window;
  }

  async requestPermission(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    const OE: any = (window as any).DeviceOrientationEvent;
    if (OE && typeof OE.requestPermission === "function") {
      try {
        return (await OE.requestPermission()) === "granted";
      } catch {
        return false;
      }
    }
    return true;
  }

  pause(): void {
    this.paused = true;
    // Reset prev so the next sample after resume doesn't produce a giant
    // delta from accumulated motion during the pause window.
    this.prevAlpha = null;
  }

  resume(): void {
    this.paused = false;
    // prevAlpha will be re-seeded by the next event.
  }

  getTotalDegrees(): number {
    return this.totalDeg;
  }

  async start(onDelta: (delta: number) => void): Promise<Unsubscribe> {
    if (!this.isSupported()) return () => {};
    if (this.subscribed) return () => {};

    this.handler = (e: DeviceOrientationEvent) => {
      if (this.paused) return;
      const alpha = e.alpha;
      if (alpha === null || alpha === undefined || Number.isNaN(alpha)) return;
      if (this.prevAlpha === null) {
        this.prevAlpha = alpha;
        return;
      }
      const d = signedDelta(this.prevAlpha, alpha);
      this.prevAlpha = alpha;
      const ad = Math.abs(d);
      if (ad > 0) {
        this.totalDeg += ad;
        onDelta(ad);
      }
    };

    window.addEventListener("deviceorientation", this.handler);
    this.subscribed = true;

    return () => {
      if (this.handler) {
        window.removeEventListener("deviceorientation", this.handler);
      }
      this.handler = null;
      this.subscribed = false;
      this.prevAlpha = null;
      // Note: totalDeg is intentionally preserved across unsubscribe so the UI
      // can read getTotalDegrees() after stopping.
    };
  }
}
