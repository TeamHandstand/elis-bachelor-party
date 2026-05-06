"use client";

import { useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";
import { StepCounter } from "@/lib/sensors/step-counter";
import type { Unsubscribe } from "@/lib/sensors/types";
import { PermissionGate } from "@/components/permissions/PermissionGate";

interface Props {
  code: string;
  myPlayerId: string;
  roundIndex: number;
}

const BATCH_SIZE = 2;

async function requestStepsPerm(): Promise<boolean> {
  return new StepCounter().requestPermission();
}

export function StepsView(props: Props) {
  return (
    <PermissionGate
      icon="📳"
      label="MOTION"
      blurb="We need your phone's motion sensor to count steps. Hit ENABLE and say YES."
      request={requestStepsPerm}
      iosSetting="Motion & Orientation Access"
    >
      <StepsChallenge {...props} />
    </PermissionGate>
  );
}

function StepsChallenge({ code, myPlayerId, roundIndex }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const event = useToastyStore((s) => s.event);
  const [stomp, setStomp] = useState(0);

  const bufferRef = useRef(0);
  const sensorRef = useRef<StepCounter | null>(null);
  const unsubRef = useRef<Unsubscribe | null>(null);
  const [pendingMine, setPendingMine] = useState(0);

  const myCreditedSteps = Math.floor(
    (myProgress?.[roundIndex]?.perPlayer?.[myPlayerId] ?? 0) as number,
  );
  const lastCreditedRef = useRef(0);
  useEffect(() => {
    const prev = lastCreditedRef.current;
    if (myCreditedSteps > prev) {
      const delta = myCreditedSteps - prev;
      setPendingMine((p) => Math.max(0, p - delta));
      lastCreditedRef.current = myCreditedSteps;
    } else if (myCreditedSteps < prev) {
      setPendingMine(0);
      lastCreditedRef.current = myCreditedSteps;
    }
  }, [myCreditedSteps]);

  useEffect(() => {
    if (!myTeamId) return;
    if (!sensorRef.current) sensorRef.current = new StepCounter();
    const sensor = sensorRef.current;

    (async () => {
      // PermissionGate already secured permission before mounting this view.
      unsubRef.current = await sensor.start(() => {
        bufferRef.current += 1;
        setStomp((s) => s + 1);
        setPendingMine((p) => p + 1);
        const store = useToastyStore.getState();
        const ev = store.event;
        const teamSoFar = Math.floor(
          store.progress[myTeamId]?.[roundIndex]?.value ?? 0,
        );
        const liveThreshold =
          ev?.rounds[roundIndex]?.threshold ?? CHALLENGES.steps.defaultThreshold;
        const projected = teamSoFar + bufferRef.current;
        const reachedThreshold = projected >= liveThreshold;
        if (bufferRef.current >= BATCH_SIZE || reachedThreshold) {
          const flush = bufferRef.current;
          bufferRef.current = 0;
          publisher({
            kind: "progress",
            playerId: myPlayerId,
            teamId: myTeamId,
            roundIndex,
            challenge: "steps",
            delta: flush,
            ts: Date.now(),
          }).catch(() => {});
        }
      });
    })();

    return () => {
      if (bufferRef.current > 0 && myTeamId) {
        const remainder = bufferRef.current;
        bufferRef.current = 0;
        publisher({
          kind: "progress",
          playerId: myPlayerId,
          teamId: myTeamId,
          roundIndex,
          challenge: "steps",
          delta: remainder,
          ts: Date.now(),
        }).catch(() => {});
      }
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [myPlayerId, myTeamId, publisher, roundIndex]);

  const def = CHALLENGES.steps;
  const threshold =
    event?.rounds[roundIndex]?.threshold ?? def.defaultThreshold;
  const teamValue = Math.floor(myProgress?.[roundIndex]?.value ?? 0);
  const displayedTeam = Math.min(teamValue + pendingMine, threshold);

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
        {displayedTeam.toLocaleString()}
      </div>
      <div className="text-sm uppercase tracking-widest opacity-70 mt-1">
        of {threshold.toLocaleString()} steps
      </div>
      <div className="text-xs opacity-60 mt-6 max-w-xs">
        STOMP. Phone in your pocket or your hand. Every footfall counts. Don’t
        cheat by shaking it, you idiot.
      </div>
    </div>
  );
}
