// Orientation helpers — request iOS DeviceOrientationEvent permission and
// expose a continuous {beta, gamma} stream. Used by tilt-driven challenges
// (Tilt Maze) where we need the gravity vector relative to the screen.
//
// `beta`  — pitch around X axis. ~0 when phone is flat face-up, ~90 held
//            upright in portrait. Range: −180..180.
// `gamma` — roll around Y axis. Negative = left edge down, positive = right
//            edge down. Range: −90..90.
//
// iOS Safari requires the static requestPermission() to be called from a
// user gesture before any deviceorientation events fire.

export async function requestOrientationPermission(): Promise<boolean> {
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

export interface OrientationSample {
  beta: number;
  gamma: number;
}

export function subscribeOrientation(
  onSample: (s: OrientationSample) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: DeviceOrientationEvent) => {
    const beta = typeof e.beta === "number" ? e.beta : null;
    const gamma = typeof e.gamma === "number" ? e.gamma : null;
    if (beta === null || gamma === null) return;
    onSample({ beta, gamma });
  };
  window.addEventListener("deviceorientation", handler);
  return () => window.removeEventListener("deviceorientation", handler);
}
