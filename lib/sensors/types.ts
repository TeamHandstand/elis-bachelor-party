// Sensor interface contract. All sensor modules in lib/sensors/* must implement
// one of these shapes so the player UI can wire them up generically.

export type Unsubscribe = () => void;

/**
 * Continuous sensor: emits incremental deltas the player UI publishes
 * to PubNub as { kind: 'progress', delta }.
 *
 * Example: stepCounter, distanceTracker, tapCounter, rotationCounter (spin).
 */
export interface CountingSensor {
  /** Returns true if the device supports the underlying API. */
  isSupported(): boolean | Promise<boolean>;
  /** Request user permission if the sensor needs one (iOS motion, geo, mic). */
  requestPermission?(): Promise<boolean>;
  /**
   * Start sampling. Calls onDelta(delta) every time progress is made.
   * delta is the INCREMENT since the last call (not a cumulative value).
   * Returns an unsubscribe function.
   */
  start(onDelta: (delta: number) => void): Promise<Unsubscribe>;
}

/**
 * Live-level sensor: emits a continuous level reading (dB for scream,
 * accel-magnitude for shake). UI throttles publishes to ~250ms.
 */
export interface LevelSensor {
  isSupported(): boolean | Promise<boolean>;
  requestPermission?(): Promise<boolean>;
  /**
   * Start sampling. Calls onLevel(currentLevel) at each frame/sample.
   * UI is responsible for throttling published messages.
   */
  start(onLevel: (level: number) => void): Promise<Unsubscribe>;
}

/**
 * Instant read sensor: one-shot read (compass for Due North).
 */
export interface InstantSensor<T> {
  isSupported(): boolean | Promise<boolean>;
  requestPermission?(): Promise<boolean>;
  read(): Promise<T>;
}
