"use client";

import { useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";
import { DistanceTracker } from "@/lib/sensors/distance";
import type { Unsubscribe } from "@/lib/sensors/types";

interface Props {
  code: string;
  myPlayerId: string;
}

const PUBLISH_THRESHOLD_M = 5;

export function DistanceView({ code, myPlayerId }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const event = useToastyStore((s) => s.event);
  const [permError, setPermError] = useState(false);
  const [pulse, setPulse] = useState(0);

  const bufferRef = useRef(0);

  useEffect(() => {
    if (!myTeamId) return;
    const sensor = new DistanceTracker();
    let unsub: Unsubscribe | null = null;
    let cancelled = false;

    (async () => {
      const ok = await sensor.requestPermission();
      if (!ok) {
        setPermError(true);
        return;
      }
      if (cancelled) return;
      unsub = await sensor.start((delta) => {
        bufferRef.current += delta;
        setPulse((p) => p + 1);
        if (bufferRef.current >= PUBLISH_THRESHOLD_M) {
          const flushDelta = bufferRef.current;
          bufferRef.current = 0;
          publisher({
            kind: "progress",
            playerId: myPlayerId,
            teamId: myTeamId,
            challenge: "distance",
            delta: flushDelta,
            ts: Date.now(),
          }).catch(() => {});
        }
      });
    })();

    return () => {
      cancelled = true;
      // flush any remainder
      if (bufferRef.current > 0 && myTeamId) {
        const remainder = bufferRef.current;
        bufferRef.current = 0;
        publisher({
          kind: "progress",
          playerId: myPlayerId,
          teamId: myTeamId,
          challenge: "distance",
          delta: remainder,
          ts: Date.now(),
        }).catch(() => {});
      }
      unsub?.();
    };
  }, [myPlayerId, myTeamId, publisher]);

  const def = CHALLENGES.distance;
  const threshold = event?.challenges.distance.threshold ?? def.defaultThreshold;
  const value = myProgress?.distance.value ?? 0;
  const miles = (value / 1609).toFixed(2);
  const target = (threshold / 1609).toFixed(1);

  return (
    <div className="flex flex-col items-center justify-center flex-1 p-6 text-center">
      <div className="relative w-48 h-48 flex items-center justify-center mb-6">
        <div
          className={`absolute inset-0 rounded-full bg-gradient-party opacity-30 transition-transform duration-500 ${
            pulse % 2 === 0 ? "scale-100" : "scale-110"
          }`}
        />
        <div className="absolute inset-4 rounded-full bg-gradient-party opacity-50" />
        <div className="relative text-6xl">🚶</div>
      </div>
      <div className="font-display text-6xl font-extrabold tabular-nums">
        {miles}
      </div>
      <div className="text-sm uppercase tracking-widest opacity-70 mt-1">
        of {target} mi
      </div>
      <div className="text-xs opacity-60 mt-6 max-w-xs">
        WALK. Just keep walking. GPS pings every few meters. The whole team
        contributes — even if you’re slow as hell.
      </div>
      {permError && (
        <div className="mt-4 text-accent-pink text-xs">
          Location denied. Refresh and allow it, or your distance won’t count.
        </div>
      )}
    </div>
  );
}
