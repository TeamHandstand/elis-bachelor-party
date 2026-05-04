// Compass — one-shot heading read in degrees clockwise from north (0–360).
// Implements InstantSensor<number>.
//
// Source preference:
//   1. iOS Safari exposes `e.webkitCompassHeading` which is already
//      true-north-relative and clockwise. Prefer it when present.
//   2. Otherwise fall back to `e.alpha` (DeviceOrientationEvent). Note that
//      `alpha` is the rotation around the Z axis and is NOT guaranteed to be
//      magnetic-north-relative — the spec only requires consistency, and
//      Android browsers historically report alpha relative to the device's
//      power-on orientation unless the `deviceorientationabsolute` event is
//      used. We try the absolute event first when available.
//
// CAVEAT: Even `webkitCompassHeading` and `deviceorientationabsolute` report
// MAGNETIC north, not TRUE north. For a bachelor-party game in a single
// city the magnetic declination is approximately constant, so the relative
// error between teammates is the meaningful quantity. If the host wants to
// score true north, they need to apply a local declination offset.

import type { InstantSensor } from "@/lib/sensors/types";

export class Compass implements InstantSensor<number> {
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

  /**
   * Resolve with a single heading reading in [0, 360). Listens for the next
   * orientation event(s); rejects after a short timeout if no usable reading
   * arrives.
   */
  async read(): Promise<number> {
    if (!this.isSupported()) {
      throw new Error("DeviceOrientationEvent not supported");
    }

    return new Promise<number>((resolve, reject) => {
      let settled = false;
      const useAbsolute =
        typeof window !== "undefined" &&
        "ondeviceorientationabsolute" in window;
      const eventName = useAbsolute
        ? "deviceorientationabsolute"
        : "deviceorientation";

      const cleanup = () => {
        window.removeEventListener(eventName, handler as EventListener);
        if (timeoutId) clearTimeout(timeoutId);
      };

      const handler = (e: Event) => {
        const oe = e as DeviceOrientationEvent;
        // iOS Safari: webkitCompassHeading is degrees clockwise from true(ish)
        // north. Use it if present.
        const wk = (oe as any).webkitCompassHeading;
        if (typeof wk === "number" && !Number.isNaN(wk)) {
          settled = true;
          cleanup();
          resolve(((wk % 360) + 360) % 360);
          return;
        }
        const alpha = oe.alpha;
        if (alpha !== null && alpha !== undefined && !Number.isNaN(alpha)) {
          // alpha is counter-clockwise from the device's reference; convert
          // to a clockwise heading from north by negating.
          const heading = ((360 - alpha) % 360 + 360) % 360;
          settled = true;
          cleanup();
          resolve(heading);
        }
      };

      window.addEventListener(eventName, handler as EventListener);

      const timeoutId = setTimeout(() => {
        if (!settled) {
          cleanup();
          reject(new Error("Compass read timed out"));
        }
      }, 5_000);
    });
  }
}
