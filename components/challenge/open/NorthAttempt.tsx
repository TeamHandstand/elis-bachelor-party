"use client";

// Open Play "Due North": one shot. Aim the phone at true north, lock in, and
// the score is the angular error in degrees (lower is better). Self-contained —
// reuses the compass math from NorthView but no team store / PubNub.

import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "aiming" | "done";

async function requestOrientationPerm(): Promise<boolean> {
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

function angularError(heading: number): number {
  let d = ((heading % 360) + 360) % 360;
  if (d > 180) d = 360 - d;
  return Math.abs(d);
}

const TICK_COUNT = 72;

export default function NorthAttempt({
  onSubmit,
}: {
  onSubmit: (score: number, meta?: Record<string, unknown>) => Promise<void> | void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [liveHeading, setLiveHeading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finalError, setFinalError] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const listenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  // Attach/detach the live compass listener while aiming.
  useEffect(() => {
    if (phase !== "aiming" || typeof window === "undefined") return;
    const handler = (e: DeviceOrientationEvent) => {
      const ev: any = e;
      let heading: number | null = null;
      if (typeof ev.webkitCompassHeading === "number") {
        heading = ev.webkitCompassHeading;
      } else if (typeof e.alpha === "number") {
        heading = (360 - e.alpha) % 360;
      }
      if (heading !== null && !Number.isNaN(heading)) setLiveHeading(heading);
    };
    listenerRef.current = handler;
    window.addEventListener("deviceorientation", handler);
    return () => {
      if (listenerRef.current) {
        window.removeEventListener("deviceorientation", listenerRef.current);
        listenerRef.current = null;
      }
    };
  }, [phase]);

  async function start() {
    setError(null);
    const ok = await requestOrientationPerm().catch(() => false);
    if (!ok) {
      setError("Compass access denied — enable Motion & Orientation and retry.");
      return;
    }
    setPhase("aiming");
  }

  function lockIn() {
    if (liveHeading === null) return;
    setFinalError(angularError(liveHeading));
    setPhase("done");
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(finalError);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t submit.");
      setSubmitting(false);
    }
  }

  const dialRotation = liveHeading === null ? 0 : -liveHeading;

  return (
    <div className="flex flex-col items-center gap-4">
      {phase === "idle" && (
        <div className="rounded-2xl bg-bg-card p-6 flex flex-col gap-5 text-center w-full">
          <div className="text-4xl">🧭</div>
          <div className="text-sm opacity-80">
            Aim the top of your phone where you think TRUE NORTH is. No cheats,
            no map apps — just vibes. Closest guess wins.
          </div>
          <button
            type="button"
            onClick={start}
            className="w-full py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest"
          >
            START ▶
          </button>
        </div>
      )}

      {phase === "aiming" && (
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="relative w-64 h-64 my-2">
            <div className="absolute inset-0 rounded-full bg-bg-card border-2 border-accent-orange/30" />
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 transition-transform duration-100"
              style={{ transform: `rotate(${dialRotation}deg)` }}
            >
              {Array.from({ length: TICK_COUNT }).map((_, i) => {
                const angle = (i * 360) / TICK_COUNT;
                const a = (angle - 90) * (Math.PI / 180);
                const x1 = 50 + Math.cos(a) * 47;
                const y1 = 50 + Math.sin(a) * 47;
                const x2 = 50 + Math.cos(a) * 41;
                const y2 = 50 + Math.sin(a) * 41;
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(255,255,255,0.45)"
                    strokeWidth={1}
                    strokeLinecap="round"
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-4xl">
              🧭
            </div>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-7 bg-accent-orange rounded-b" />
          </div>
          <div className="text-[10px] uppercase tracking-widest opacity-50">
            the orange notch = top of your phone
          </div>
          <button
            type="button"
            onClick={lockIn}
            disabled={liveHeading === null}
            className="w-full py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest disabled:opacity-50"
          >
            {liveHeading === null ? "WAITING FOR COMPASS…" : "LOCK IN"}
          </button>
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-2xl bg-bg-card p-6 flex flex-col gap-5 text-center w-full">
          <div className="text-xs uppercase tracking-widest opacity-60">
            locked in · you were
          </div>
          <div className="font-display text-4xl font-extrabold">
            {finalError.toFixed(0)}° off
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest disabled:opacity-50"
          >
            {submitting ? "SAVING…" : "SUBMIT 🔒"}
          </button>
          <div className="text-[11px] opacity-50">
            One shot — this locks in your guess.
          </div>
        </div>
      )}

      {error && <div className="text-accent-pink text-sm text-center">{error}</div>}
    </div>
  );
}
