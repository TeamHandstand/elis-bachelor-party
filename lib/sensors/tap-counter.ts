// TapCounter — counts pointerdown events on a target DOM element.
//
// NOTE: This intentionally diverges from the CountingSensor.start() signature
// because it needs a target element. It's still spiritually a CountingSensor
// (delta = 1 per tap) — the player UI knows to pass an element to this one.

import type { Unsubscribe } from "@/lib/sensors/types";

export class TapCounter {
  isSupported(): boolean {
    return typeof window !== "undefined" && "PointerEvent" in window;
  }

  // No permission gate needed; tapping is implicit user action.
  async requestPermission(): Promise<boolean> {
    return true;
  }

  /**
   * Start listening for taps on `target`. Calls `onDelta(1)` per pointerdown.
   * Returns an unsubscribe function.
   *
   * Diverges from CountingSensor.start() in that it requires a target element.
   */
  async start(
    target: HTMLElement,
    onDelta: (n: number) => void,
  ): Promise<Unsubscribe> {
    if (!this.isSupported() || !target) return () => {};

    const handler = (_e: PointerEvent) => {
      onDelta(1);
    };

    target.addEventListener("pointerdown", handler);

    return () => {
      target.removeEventListener("pointerdown", handler);
    };
  }
}
