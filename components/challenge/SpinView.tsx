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
}

const PUBLISH_INTERVAL_MS = 400;
const FULL_ROTATION = 360;

export function SpinView({ code, myPlayerId }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());

  const [permError, setPermError] = useState(false);
  const [leftDown, setLeftDown] = useState(false);
  const [rightDown, setRightDown] = useState(false);
  const [degrees, setDegrees] = useState(0);

  const sensorRef = useRef<RotationCounter | null>(null);
  const bufferRef = useRef(0);
  const lastPublishRef = useRef(0);

  // My contribution (degrees) so far for spin
  const def = CHALLENGES.spin;
  const myValueDeg = (myProgress?.spin.perPlayer?.[myPlayerId] ?? 0) as number;
  const myRotations = Math.floor(myValueDeg / FULL_ROTATION);

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
      unsub = await sensor.start((delta) => {
        bufferRef.current += delta;
        setDegrees((d) => d + delta);
        const now = Date.now();
        // Only publish when delta accumulates to ≥ ~30° or every PUBLISH_INTERVAL_MS
        if (
          bufferRef.current >= 30 ||
          (bufferRef.current > 0 && now - lastPublishRef.current >= PUBLISH_INTERVAL_MS)
        ) {
          const flush = bufferRef.current;
          bufferRef.current = 0;
          lastPublishRef.current = now;
          publisher({
            kind: "progress",
            playerId: myPlayerId,
            teamId: myTeamId,
            challenge: "spin",
            delta: flush,
            ts: now,
          }).catch(() => {});
        }
      });
    })();

    return () => {
      cancelled = true;
      sensorRef.current = null;
      if (bufferRef.current > 0 && myTeamId) {
        const remainder = bufferRef.current;
        bufferRef.current = 0;
        publisher({
          kind: "progress",
          playerId: myPlayerId,
          teamId: myTeamId,
          challenge: "spin",
          delta: remainder,
          ts: Date.now(),
        }).catch(() => {});
      }
      unsub?.();
    };
  }, [myPlayerId, myTeamId, publisher]);

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
  const goalRotations = 10; // per-player goal
  const myRotProgress = Math.min(100, Math.floor((myValueDeg / (goalRotations * FULL_ROTATION)) * 100));

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
        <div className="font-display text-7xl font-extrabold tabular-nums">
          {myRotations}
        </div>
        <div className="text-sm uppercase tracking-widest opacity-70">
          / {goalRotations} rotations
        </div>
        <div className="w-48 h-2 bg-bg-card rounded-full mt-3 overflow-hidden">
          <div
            className="h-full bg-gradient-party transition-all"
            style={{ width: `${myRotProgress}%` }}
          />
        </div>
        <div className="text-[10px] opacity-60 mt-2 tabular-nums">
          {Math.floor(myValueDeg)}° / {goalRotations * FULL_ROTATION}°
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

      <div className="text-[10px] opacity-50 text-center pb-2">
        live: {Math.floor(degrees)}° this session
      </div>
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
