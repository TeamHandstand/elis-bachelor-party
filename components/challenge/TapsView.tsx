"use client";

import { useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";
import { TapCounter } from "@/lib/sensors/tap-counter";
import type { Unsubscribe } from "@/lib/sensors/types";

interface Props {
  code: string;
  myPlayerId: string;
}

const BATCH_SIZE = 10;

export function TapsView({ code, myPlayerId }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const event = useToastyStore((s) => s.event);

  const padRef = useRef<HTMLDivElement | null>(null);
  const bufferRef = useRef(0);
  const [localTaps, setLocalTaps] = useState(0);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!myTeamId || !padRef.current) return;
    const sensor = new TapCounter();
    let unsub: Unsubscribe | null = null;
    let cancelled = false;
    const target = padRef.current;

    (async () => {
      const ok = await sensor.requestPermission();
      if (!ok) return;
      if (cancelled) return;
      unsub = await sensor.start(target, () => {
        bufferRef.current += 1;
        setLocalTaps((n) => n + 1);
        setFlash((f) => !f);
        if (bufferRef.current >= BATCH_SIZE) {
          const flush = bufferRef.current;
          bufferRef.current = 0;
          publisher({
            kind: "progress",
            playerId: myPlayerId,
            teamId: myTeamId,
            challenge: "taps",
            delta: flush,
            ts: Date.now(),
          }).catch(() => {});
        }
      });
    })();

    return () => {
      cancelled = true;
      if (bufferRef.current > 0 && myTeamId) {
        const remainder = bufferRef.current;
        bufferRef.current = 0;
        publisher({
          kind: "progress",
          playerId: myPlayerId,
          teamId: myTeamId,
          challenge: "taps",
          delta: remainder,
          ts: Date.now(),
        }).catch(() => {});
      }
      unsub?.();
    };
  }, [myPlayerId, myTeamId, publisher]);

  const def = CHALLENGES.taps;
  const threshold = event?.challenges.taps.threshold ?? def.defaultThreshold;
  const teamValue = Math.floor(myProgress?.taps.value ?? 0);

  return (
    <div
      ref={padRef}
      className={`flex flex-col items-center justify-center flex-1 select-none no-select touch-none cursor-pointer transition-colors ${
        flash ? "bg-bg-card" : "bg-bg"
      }`}
      style={{ touchAction: "none" }}
    >
      <div className="text-xs uppercase tracking-widest opacity-60 mb-2">
        Tap anywhere on this screen
      </div>
      <div className="font-display text-[7rem] leading-none font-extrabold tabular-nums text-accent-orange drop-shadow">
        {teamValue.toLocaleString()}
      </div>
      <div className="text-sm uppercase tracking-widest opacity-70 mt-2">
        of {threshold.toLocaleString()}
      </div>
      <div className="text-xs opacity-50 mt-2">
        you: {localTaps.toLocaleString()} taps
      </div>
      <div className="text-5xl mt-8">👆</div>
      <div className="text-xs opacity-60 mt-6 max-w-xs text-center">
        KEEP TAPPING. Both thumbs. Get violent with it.
      </div>
    </div>
  );
}
