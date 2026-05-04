// DbMeter — emits a rough SPL-ish dB level from the device microphone.
// Implements LevelSensor.
//
// Pipeline: getUserMedia({audio:true}) → AudioContext → AnalyserNode (fft 2048)
// → time-domain samples → RMS → 20*log10(rms) + ~94 dB calibration offset.
//
// CAVEAT: This is NOT a calibrated SPL meter. The 94 dB offset is a rough
// approximation that maps full-scale digital signal to ~94 dBSPL — close to
// what generic phone mics report when the input is at unity. Real-world
// readings will vary a lot between devices and depend on AGC, mic gain, and
// distance to source. The challenge UI should allow recalibration if needed.
//
// iOS gotcha: AudioContext starts in 'suspended' state until a user gesture.
// requestPermission() resumes the context AND opens the mic, so it must be
// called from a click handler.

import type { LevelSensor, Unsubscribe } from "@/lib/sensors/types";

const CALIBRATION_OFFSET_DB = 94;

export class DbMeter implements LevelSensor {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private permissionGranted = false;

  isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      (typeof (window as any).AudioContext !== "undefined" ||
        typeof (window as any).webkitAudioContext !== "undefined")
    );
  }

  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream;
      const Ctor: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctor();
      // Required on iOS — AudioContext starts suspended.
      try {
        await this.ctx.resume();
      } catch {
        // ignore
      }
      this.permissionGranted = true;
      return true;
    } catch {
      this.permissionGranted = false;
      return false;
    }
  }

  async start(onLevel: (level: number) => void): Promise<Unsubscribe> {
    if (!this.isSupported()) return () => {};

    // If permission wasn't requested separately, do it now.
    if (!this.permissionGranted || !this.ctx || !this.stream) {
      const ok = await this.requestPermission();
      if (!ok || !this.ctx || !this.stream) return () => {};
    }

    const ctx = this.ctx!;
    const stream = this.stream!;

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      // getFloatTimeDomainData gives normalized [-1, 1] samples.
      analyser.getFloatTimeDomainData(buf);
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i];
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / buf.length);
      // Avoid log(0) → -Infinity; clamp a tiny floor.
      const db =
        rms > 1e-7
          ? 20 * Math.log10(rms) + CALIBRATION_OFFSET_DB
          : CALIBRATION_OFFSET_DB - 140;
      onLevel(db);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      try {
        analyser.disconnect();
      } catch {
        /* ignore */
      }
      // Stop mic tracks and close context so the OS releases the mic.
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      try {
        void ctx.close();
      } catch {
        /* ignore */
      }
      this.stream = null;
      this.ctx = null;
      this.permissionGranted = false;
    };
  }
}
