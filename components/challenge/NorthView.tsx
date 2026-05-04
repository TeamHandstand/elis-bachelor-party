"use client";

import { useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { usePublisher } from "@/lib/store/bootstrap";

interface Props {
  code: string;
  myPlayerId: string;
}

// Read the device's compass heading (degrees clockwise from north).
// iOS provides webkitCompassHeading (already true heading); Android exposes
// alpha (degrees, but rotation around z-axis from device coord — used as
// approximate heading). This is intentionally a thin inline helper because
// there's no Compass sensor module yet.
async function readHeading(): Promise<number | null> {
  if (typeof window === "undefined") return null;
  const OE: any = (window as any).DeviceOrientationEvent;
  if (OE && typeof OE.requestPermission === "function") {
    try {
      const res = await OE.requestPermission();
      if (res !== "granted") return null;
    } catch {
      return null;
    }
  }
  return new Promise<number | null>((resolve) => {
    let done = false;
    const handler = (e: DeviceOrientationEvent) => {
      if (done) return;
      const ev: any = e;
      let heading: number | null = null;
      if (typeof ev.webkitCompassHeading === "number") {
        heading = ev.webkitCompassHeading;
      } else if (typeof e.alpha === "number") {
        // Android: alpha is rotation around z; convert to compass heading.
        heading = (360 - e.alpha) % 360;
      }
      if (heading === null || Number.isNaN(heading)) return;
      done = true;
      window.removeEventListener("deviceorientation", handler);
      resolve(heading);
    };
    window.addEventListener("deviceorientation", handler);
    setTimeout(() => {
      if (!done) {
        done = true;
        window.removeEventListener("deviceorientation", handler);
        resolve(null);
      }
    }, 3000);
  });
}

function angularError(heading: number): number {
  // Distance from 0° (north), in degrees, smallest absolute.
  let d = ((heading % 360) + 360) % 360;
  if (d > 180) d = 360 - d;
  return Math.abs(d);
}

export function NorthView({ code, myPlayerId }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());

  const [liveHeading, setLiveHeading] = useState<number | null>(null);
  const [permError, setPermError] = useState(false);
  const [result, setResult] = useState<{ heading: number; err: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const liveListenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  const myGuess = myProgress?.north.guesses?.find((g) => g.playerId === myPlayerId);

  // Live compass display
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      const OE: any = (window as any).DeviceOrientationEvent;
      if (OE && typeof OE.requestPermission === "function") {
        try {
          const r = await OE.requestPermission();
          if (r !== "granted") {
            if (!cancelled) setPermError(true);
            return;
          }
        } catch {
          if (!cancelled) setPermError(true);
          return;
        }
      }
      if (cancelled) return;
      const handler = (e: DeviceOrientationEvent) => {
        const ev: any = e;
        let heading: number | null = null;
        if (typeof ev.webkitCompassHeading === "number") {
          heading = ev.webkitCompassHeading;
        } else if (typeof e.alpha === "number") {
          heading = (360 - e.alpha) % 360;
        }
        if (heading !== null && !Number.isNaN(heading)) {
          setLiveHeading(heading);
        }
      };
      liveListenerRef.current = handler;
      window.addEventListener("deviceorientation", handler);
    })();

    return () => {
      cancelled = true;
      if (liveListenerRef.current) {
        window.removeEventListener("deviceorientation", liveListenerRef.current);
        liveListenerRef.current = null;
      }
    };
  }, []);

  async function submitGuess() {
    if (!myTeamId || myGuess || submitting) return;
    setSubmitting(true);
    let heading = liveHeading;
    if (heading === null) {
      heading = await readHeading();
    }
    if (heading === null) {
      setPermError(true);
      setSubmitting(false);
      return;
    }
    const err = angularError(heading);
    setResult({ heading, err });
    publisher({
      kind: "guess",
      playerId: myPlayerId,
      teamId: myTeamId,
      challenge: "north",
      errorDeg: err,
      ts: Date.now(),
    }).catch(() => {});
    setSubmitting(false);
  }

  const dialRotation = liveHeading === null ? 0 : -liveHeading;
  const alreadyGuessed = !!myGuess;

  return (
    <div className="flex flex-col items-center flex-1 p-6 text-center">
      <div className="text-xs uppercase tracking-widest opacity-60 mb-2">
        Point the top of your phone at TRUE NORTH. Then GUESS.
      </div>
      <div className="text-sm mb-6 font-bold">
        Lower error = better. Used as tiebreaker.
      </div>

      <div className="relative w-64 h-64 my-2">
        <div className="absolute inset-0 rounded-full bg-bg-card border-2 border-accent-orange/40" />
        <div
          className="absolute inset-0 transition-transform duration-100"
          style={{ transform: `rotate(${dialRotation}deg)` }}
        >
          <div className="absolute top-2 left-1/2 -translate-x-1/2 text-accent-pink font-extrabold text-2xl">
            N
          </div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-50 font-bold">
            S
          </div>
          <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50 font-bold">
            W
          </div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 font-bold">
            E
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-4xl">🧭</div>
        </div>
        {/* Phone-pointer indicator (always points up - represents the phone's top edge) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-6 bg-accent-orange rounded-b" />
      </div>

      <div className="font-display text-3xl font-extrabold tabular-nums mt-2">
        {liveHeading === null ? "--" : `${Math.round(liveHeading)}°`}
      </div>
      <div className="text-[10px] uppercase tracking-widest opacity-60">
        current heading
      </div>

      {alreadyGuessed ? (
        <div className="mt-6 px-6 py-4 rounded-2xl bg-bg-card">
          <div className="text-xs uppercase tracking-widest opacity-60">
            you guessed
          </div>
          <div className="font-display text-4xl font-extrabold text-accent-orange">
            {myGuess.errorDeg.toFixed(0)}°
          </div>
          <div className="text-xs opacity-70">error from north</div>
        </div>
      ) : result ? (
        <div className="mt-6 px-6 py-4 rounded-2xl bg-gradient-party">
          <div className="text-xs uppercase tracking-widest opacity-90">
            {result.err < 15 ? "DAMN, NICE" : result.err < 45 ? "decent" : "lol"}
          </div>
          <div className="font-display text-4xl font-extrabold">
            {result.err.toFixed(0)}° off
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={submitGuess}
          disabled={submitting || liveHeading === null}
          className="mt-6 px-10 py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest disabled:opacity-50"
        >
          {submitting ? "..." : "GUESS"}
        </button>
      )}

      {permError && (
        <div className="mt-4 text-accent-pink text-xs">
          Compass denied or unavailable. iOS — refresh and accept.
        </div>
      )}
    </div>
  );
}
