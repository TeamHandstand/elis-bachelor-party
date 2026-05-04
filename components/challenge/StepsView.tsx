"use client";

import { useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";
import { StepCounter } from "@/lib/sensors/step-counter";
import type { Unsubscribe } from "@/lib/sensors/types";

interface Props {
  code: string;
  myPlayerId: string;
}

const BATCH_SIZE = 5;

export function StepsView({ code, myPlayerId }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const event = useToastyStore((s) => s.event);
  const [permError, setPermError] = useState(false);
  const [stomp, setStomp] = useState(0);

  const bufferRef = useRef(0);

  useEffect(() => {
    if (!myTeamId) return;
    const sensor = new StepCounter();
    let unsub: Unsubscribe | null = null;
    let cancelled = false;

    (async () => {
      const ok = await sensor.requestPermission();
      if (!ok) {
        setPermError(true);
        return;
      }
      if (cancelled) return;
      unsub = await sensor.start(() => {
        bufferRef.current += 1;
        setStomp((s) => s + 1);
        if (bufferRef.current >= BATCH_SIZE) {
          const flush = bufferRef.current;
          bufferRef.current = 0;
          publisher({
            kind: "progress",
            playerId: myPlayerId,
            teamId: myTeamId,
            challenge: "steps",
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
          challenge: "steps",
          delta: remainder,
          ts: Date.now(),
        }).catch(() => {});
      }
      unsub?.();
    };
  }, [myPlayerId, myTeamId, publisher]);

  const def = CHALLENGES.steps;
  const threshold = event?.challenges.steps.threshold ?? def.defaultThreshold;
  const value = Math.floor(myProgress?.steps.value ?? 0);

  return (
    <div className="flex flex-col items-center justify-center flex-1 p-6 text-center">
      <div
        key={stomp}
        className="text-8xl mb-4 select-none animate-[stomp_0.25s_ease-out]"
        style={{
          transform: stomp % 2 === 0 ? "rotate(-6deg)" : "rotate(6deg)",
          transition: "transform 0.15s",
        }}
      >
        👟
      </div>
      <div className="font-display text-7xl font-extrabold tabular-nums">
        {value.toLocaleString()}
      </div>
      <div className="text-sm uppercase tracking-widest opacity-70 mt-1">
        of {threshold.toLocaleString()} steps
      </div>
      <div className="text-xs opacity-60 mt-6 max-w-xs">
        STOMP. Phone in your pocket or your hand. Every footfall counts. Don’t
        cheat by shaking it, you idiot.
      </div>
      {permError && (
        <div className="mt-4 text-accent-pink text-xs">
          Motion access denied. iOS users — refresh and accept the popup.
        </div>
      )}
    </div>
  );
}
