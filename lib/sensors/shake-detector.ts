// ShakeDetector — emits the absolute deviation of acceleration magnitude from
// gravity (|magnitude − 9.8|) at each devicemotion tick. Implements LevelSensor.
//
// The UI is responsible for thresholding (~12 m/s² total magnitude is a
// reasonable "shaking" cutoff, which corresponds to a deviation of ~2.2 m/s²).

import type { LevelSensor, Unsubscribe } from "@/lib/sensors/types";

const GRAVITY = 9.8;

export class ShakeDetector implements LevelSensor {
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

  async start(onLevel: (level: number) => void): Promise<Unsubscribe> {
    if (!this.isSupported()) return () => {};

    const handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const x = a.x ?? 0;
      const y = a.y ?? 0;
      const z = a.z ?? 0;
      const mag = Math.sqrt(x * x + y * y + z * z);
      onLevel(Math.abs(mag - GRAVITY));
    };

    window.addEventListener("devicemotion", handler);

    return () => {
      window.removeEventListener("devicemotion", handler);
    };
  }
}
