"use client";

import { useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";
import { RotationCounter } from "@/lib/sensors/rotation-counter";
import type { Unsubscribe } from "@/lib/sensors/types";

interface Props {
  code: string;
  myPlayerId: string;
  roundIndex: number;
}

const PUBLISH_INTERVAL_MS = 250;
const FULL_ROTATION = 360;
// Publish whenever we've accumulated this many degrees, OR every interval if
// any motion has been seen. Smaller threshold = more responsive teamwise.
const PUBLISH_DEGREES = 15;

export function SpinView({ code, myPlayerId, roundIndex }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const event = useToastyStore((s) => s.event);

  const [permError, setPermError] = useState(false);
  const [leftDown, setLeftDown] = useState(false);
  const [rightDown, setRightDown] = useState(false);

  const sensorRef = useRef<RotationCounter | null>(null);
  // Accumulated DEGREES not yet published.
  const bufferDegRef = useRef(0);
  // Mirror in state for instant display feedback.
  const [pendingRot, setPendingRot] = useState(0);
  const lastPublishRef = useRef(0);

  const def = CHALLENGES.spin;
  const threshold =
    event?.rounds[roundIndex]?.threshold ?? def.defaultThreshold;
  // Per heptathlon refactor, value & threshold are in ROTATIONS (team-total).
  // Sensor produces degrees; we convert at publish time.
  const teamRotations = (myProgress?.[roundIndex]?.value ?? 0) as number;
  const myRotations =
    (myProgress?.[roundIndex]?.perPlayer?.[myPlayerId] ?? 0) as number;

  // Decrement pendingRot as the server credits our rotations.
  const lastCreditedRef = useRef(0);
  useEffect(() => {
    const prev = lastCreditedRef.current;
    if (myRotations > prev) {
      const delta = myRotations - prev;
      setPendingRot((p) => Math.max(0, p - delta));
      lastCreditedRef.current = myRotations;
    } else if (myRotations < prev) {
      setPendingRot(0);
      lastCreditedRef.current = myRotations;
    }
  }, [myRotations]);

  useEffect(() => {
    if (!myTeamId) return;
    const sensor = new RotationCounter();
    sensorRef.current = sensor;
    sensor.pause(); // start paused; only resume while both buttons are pressed
    let unsub: Unsubscribe | null = null;
    let cancelled = false;

    (async () => {
      const ok = await sensor.requestPermission();
      if (!ok) {
        setPermError(true);
        return;
      }
      if (cancelled) return;
      unsub = await sensor.start((deltaDeg) => {
        bufferDegRef.current += deltaDeg;
        setPendingRot((p) => p + deltaDeg / FULL_ROTATION);
        const now = Date.now();
        if (
          bufferDegRef.current >= PUBLISH_DEGREES ||
          (bufferDegRef.current > 0 &&
            now - lastPublishRef.current >= PUBLISH_INTERVAL_MS)
        ) {
          const flushDeg = bufferDegRef.current;
          bufferDegRef.current = 0;
          lastPublishRef.current = now;
          publisher({
            kind: "progress",
            playerId: myPlayerId,
            teamId: myTeamId,
            roundIndex,
            challenge: "spin",
            delta: flushDeg / FULL_ROTATION,
            ts: now,
          }).catch(() => {});
        }
      });
    })();

    return () => {
      cancelled = true;
      sensorRef.current = null;
      if (bufferDegRef.current > 0 && myTeamId) {
        const remainder = bufferDegRef.current;
        bufferDegRef.current = 0;
        publisher({
          kind: "progress",
          playerId: myPlayerId,
          teamId: myTeamId,
          roundIndex,
          challenge: "spin",
          delta: remainder / FULL_ROTATION,
          ts: Date.now(),
        }).catch(() => {});
      }
      unsub?.();
    };
  }, [myPlayerId, myTeamId, publisher, roundIndex]);

  // Both buttons pressed → resume; otherwise pause.
  useEffect(() => {
    const sensor = sensorRef.current;
    if (!sensor) return;
    if (leftDown && rightDown) {
      sensor.resume();
    } else {
      sensor.pause();
    }
  }, [leftDown, rightDown]);

  const both = leftDown && rightDown;
  const displayedTeam = teamRotations + pendingRot;
  const displayedTeamFloor = Math.floor(displayedTeam);
  const teamPct = Math.min(
    100,
    threshold > 0 ? (displayedTeam / threshold) * 100 : 0,
  );
  const myDisplayed = Math.floor(myRotations + pendingRot);

  return (
    <div className="flex flex-col flex-1 p-4 relative">
      <div className="text-center mb-2">
        <div className="text-xs uppercase tracking-widest opacity-60">
          HOLD BOTH BUTTONS, THEN SPIN YOUR BODY
        </div>
        <div className="text-sm mt-1 font-bold">
          {both ? "ROTATE LIKE A DUMBASS" : "PRESS BOTH BUTTONS"}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center flex-1">
        <div className="font-display text-[7rem] leading-none font-extrabold tabular-nums text-accent-orange drop-shadow">
          {displayedTeamFloor.toLocaleString()}
        </div>
        <div className="text-sm uppercase tracking-widest opacity-70 mt-2">
          of {threshold.toLocaleString()} rotations
        </div>
        <div className="w-48 h-2 bg-bg-card rounded-full mt-3 overflow-hidden">
          <div
            className="h-full bg-gradient-party transition-all"
            style={{ width: `${teamPct}%` }}
          />
        </div>
        <div className="text-xs opacity-50 mt-2">
          you: {myDisplayed.toLocaleString()} rotations
        </div>
      </div>

      <div className="flex gap-3 pb-2">
        <SpinButton
          label="LEFT"
          down={leftDown}
          onDown={() => setLeftDown(true)}
          onUp={() => setLeftDown(false)}
        />
        <SpinButton
          label="RIGHT"
          down={rightDown}
          onDown={() => setRightDown(true)}
          onUp={() => setRightDown(false)}
        />
      </div>

      {!both && (
        <div className="absolute inset-0 pointer-events-none flex items-start justify-center pt-32">
          <div className="px-4 py-2 rounded-full bg-accent-orange text-bg font-extrabold tracking-widest text-sm">
            PAUSED
          </div>
        </div>
      )}

      {permError && (
        <div className="text-accent-pink text-xs text-center pb-2">
          Compass denied. iOS — refresh & accept.
        </div>
      )}
    </div>
  );
}

function SpinButton({
  label,
  down,
  onDown,
  onUp,
}: {
  label: string;
  down: boolean;
  onDown: () => void;
  onUp: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex-1 h-32 rounded-3xl font-display text-2xl font-extrabold tracking-widest transition-all no-select ${
        down ? "bg-gradient-party scale-95 shadow-inner" : "bg-bg-card opacity-80"
      }`}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={onUp}
    >
      {label}
    </button>
  );
}
