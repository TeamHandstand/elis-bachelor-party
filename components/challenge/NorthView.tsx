"use client";

import { useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { useTeammates } from "@/lib/store/selectors";
import { usePublisher } from "@/lib/store/bootstrap";

interface Props {
  code: string;
  myPlayerId: string;
  roundIndex: number;
}

const TICK_COUNT = 72;

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

export function NorthView({ code, myPlayerId, roundIndex }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const teammates = useTeammates();

  const [liveHeading, setLiveHeading] = useState<number | null>(null);
  const [permError, setPermError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedLocally, setSubmittedLocally] = useState(false);
  const liveListenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  const guesses = myProgress?.[roundIndex]?.guesses ?? [];
  const myGuess = guesses.find((g) => g.playerId === myPlayerId);
  const iGuessed = !!myGuess || submittedLocally;
  const allGuessed =
    teammates.length > 0 &&
    teammates.every((p) => guesses.some((g) => g.playerId === p.id));

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
    if (!myTeamId || iGuessed || submitting) return;
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
    setSubmittedLocally(true);
    publisher({
      kind: "guess",
      playerId: myPlayerId,
      teamId: myTeamId,
      roundIndex,
      challenge: "north",
      errorDeg: err,
      ts: Date.now(),
    }).catch(() => {});
    setSubmitting(false);
  }

  const dialRotation = liveHeading === null ? 0 : -liveHeading;

  return (
    <div className="flex flex-col items-center flex-1 p-6 text-center">
      <div className="text-xs uppercase tracking-widest opacity-60 mb-2">
        Aim the top of your phone where you think TRUE NORTH is. Lock in.
      </div>
      <div className="text-sm mb-6 font-bold">
        No cheats. No labels. Just vibes.
      </div>

      <div className="relative w-64 h-64 my-2">
        <div className="absolute inset-0 rounded-full bg-bg-card border-2 border-accent-orange/30" />
        {/* Rotating tick ring — uniform marks only, no cardinal letters */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 transition-transform duration-100"
          style={{ transform: `rotate(${dialRotation}deg)` }}
        >
          {Array.from({ length: TICK_COUNT }).map((_, i) => {
            const angle = (i * 360) / TICK_COUNT;
            // 0° at top → use angle - 90 in radians
            const a = (angle - 90) * (Math.PI / 180);
            const r1 = 47;
            const r2 = 41;
            const x1 = 50 + Math.cos(a) * r1;
            const y1 = 50 + Math.sin(a) * r1;
            const x2 = 50 + Math.cos(a) * r2;
            const y2 = 50 + Math.sin(a) * r2;
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
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-4xl">🧭</div>
        </div>
        {/* Phone-pointer indicator (always points up - represents the phone's top edge) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-7 bg-accent-orange rounded-b" />
      </div>

      <div className="text-[10px] uppercase tracking-widest opacity-50 mt-2">
        the orange notch = top of your phone
      </div>

      {!iGuessed ? (
        <button
          type="button"
          onClick={submitGuess}
          disabled={submitting || liveHeading === null}
          className="mt-6 px-10 py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest disabled:opacity-50"
        >
          {submitting ? "..." : "LOCK IN"}
        </button>
      ) : !allGuessed ? (
        <div className="mt-6 px-5 py-4 rounded-2xl bg-bg-card w-full max-w-xs">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-1">
            you locked in
          </div>
          <div className="font-display text-base font-extrabold mb-3">
            🤐 hidden until all teammates guess
          </div>
          <div className="space-y-1">
            {teammates.map((p) => {
              const has = guesses.some((g) => g.playerId === p.id);
              const isMe = p.id === myPlayerId;
              return (
                <div
                  key={p.id}
                  className="flex justify-between items-center text-xs py-1"
                >
                  <span className={isMe ? "font-bold" : ""}>
                    {isMe ? "you" : p.name}
                  </span>
                  <span className="opacity-80">
                    {has ? "🔒 locked in" : "⏳ pending"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-6 px-5 py-4 rounded-2xl bg-gradient-party w-full max-w-xs">
          <div className="text-xs uppercase tracking-widest opacity-90 mb-2 font-bold">
            results
          </div>
          <div className="space-y-2">
            {[...teammates]
              .map((p) => {
                const guess = guesses.find((g) => g.playerId === p.id);
                return { player: p, errorDeg: guess?.errorDeg ?? null };
              })
              .sort((a, b) => (a.errorDeg ?? 999) - (b.errorDeg ?? 999))
              .map((row, i) => {
                const isMe = row.player.id === myPlayerId;
                return (
                  <div
                    key={row.player.id}
                    className="flex justify-between items-center"
                  >
                    <span className={isMe ? "font-bold" : ""}>
                      {i === 0 ? "🥇 " : i === 1 ? "🥈 " : "🥉 "}
                      {isMe ? "you" : row.player.name}
                    </span>
                    <span className="font-display font-extrabold tabular-nums">
                      {row.errorDeg !== null ? `${row.errorDeg.toFixed(0)}°` : "--"}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {permError && (
        <div className="mt-4 text-accent-pink text-xs">
          Compass denied or unavailable. iOS — refresh and accept.
        </div>
      )}
    </div>
  );
}
