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
  roundIndex: number;
}

// Smaller batch = teammates' contributions show up faster, at the cost of
// more PubNub messages. 3 is a good middle ground for a one-off party event.
const BATCH_SIZE = 3;

export function TapsView({ code, myPlayerId, roundIndex }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const event = useToastyStore((s) => s.event);

  const padRef = useRef<HTMLDivElement | null>(null);
  const bufferRef = useRef(0);
  const [pendingMine, setPendingMine] = useState(0);
  const [flash, setFlash] = useState(false);

  const def = CHALLENGES.taps;
  const threshold =
    event?.rounds[roundIndex]?.threshold ?? def.defaultThreshold;
  const teamValue = Math.floor(myProgress?.[roundIndex]?.value ?? 0);
  const myCredited = Math.floor(
    (myProgress?.[roundIndex]?.perPlayer?.[myPlayerId] ?? 0) as number,
  );

  // Decrement pendingMine as the server credits our taps. If teamValue resets
  // (round restart / progress-reset), wipe pending too.
  const lastCreditedRef = useRef(0);
  useEffect(() => {
    const prev = lastCreditedRef.current;
    if (myCredited > prev) {
      const delta = myCredited - prev;
      setPendingMine((p) => Math.max(0, p - delta));
      lastCreditedRef.current = myCredited;
    } else if (myCredited < prev) {
      setPendingMine(0);
      lastCreditedRef.current = myCredited;
    }
  }, [myCredited]);

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
        setPendingMine((p) => p + 1);
        setFlash((f) => !f);
        const store = useToastyStore.getState();
        const teamSoFar = Math.floor(
          store.progress[myTeamId]?.[roundIndex]?.value ?? 0,
        );
        const projected = teamSoFar + bufferRef.current;
        const reachedThreshold =
          typeof threshold === "number" && projected >= threshold;
        if (bufferRef.current >= BATCH_SIZE || reachedThreshold) {
          const flush = bufferRef.current;
          bufferRef.current = 0;
          publisher({
            kind: "progress",
            playerId: myPlayerId,
            teamId: myTeamId,
            roundIndex,
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
          roundIndex,
          challenge: "taps",
          delta: remainder,
          ts: Date.now(),
        }).catch(() => {});
      }
      unsub?.();
    };
  }, [myPlayerId, myTeamId, publisher, roundIndex, threshold]);

  const displayedTeam = teamValue + pendingMine;

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
        {displayedTeam.toLocaleString()}
      </div>
      <div className="text-sm uppercase tracking-widest opacity-70 mt-2">
        of {threshold.toLocaleString()}
      </div>
      <div className="text-xs opacity-50 mt-2">
        you: {(myCredited + pendingMine).toLocaleString()} taps
      </div>
      <div className="text-5xl mt-8">👆</div>
      <div className="text-xs opacity-60 mt-6 max-w-xs text-center">
        KEEP TAPPING. Both thumbs. Get violent with it.
      </div>
    </div>
  );
}
