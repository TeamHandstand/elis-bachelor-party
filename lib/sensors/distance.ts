// DistanceTracker — emits incremental meters walked, derived from
// navigator.geolocation.watchPosition. Implements CountingSensor.
//
// Strategy:
//   - Skip readings with accuracy > 30m to filter out GPS noise (drift while
//     standing still can otherwise inflate distance significantly).
//   - Compute haversine distance between successive accepted points.
//   - Emit each segment as a delta (meters).

import type { CountingSensor, Unsubscribe } from "@/lib/sensors/types";

const ACCURACY_THRESHOLD_M = 30;
const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export class DistanceTracker implements CountingSensor {
  isSupported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.geolocation !== "undefined"
    );
  }

  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    // Geolocation has no explicit requestPermission API; trigger the browser
    // prompt by attempting a single fix. Resolve true on success, false on
    // denial / error.
    return new Promise<boolean>((resolve) => {
      try {
        navigator.geolocation.getCurrentPosition(
          () => resolve(true),
          () => resolve(false),
          { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
        );
      } catch {
        resolve(false);
      }
    });
  }

  async start(onDelta: (delta: number) => void): Promise<Unsubscribe> {
    if (!this.isSupported()) {
      return () => {};
    }

    let lastLat: number | null = null;
    let lastLon: number | null = null;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        if (typeof accuracy === "number" && accuracy > ACCURACY_THRESHOLD_M) {
          return; // too noisy to trust
        }
        if (lastLat !== null && lastLon !== null) {
          const segment = haversine(lastLat, lastLon, latitude, longitude);
          if (segment > 0) onDelta(segment);
        }
        lastLat = latitude;
        lastLon = longitude;
      },
      () => {
        // Swallow errors — UI surfaces permission state separately.
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );

    return () => {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {
        // ignore
      }
    };
  }
}
