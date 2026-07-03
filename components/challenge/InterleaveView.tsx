"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { usePublisher } from "@/lib/store/bootstrap";
import {
  CHALLENGES,
  DEFAULT_INTERLEAVE_SEGMENTS,
  interleaveTotal,
  locateInterleaveSegment,
} from "@/lib/challenges";
import { RotationCounter } from "@/lib/sensors/rotation-counter";
import { StepCounter } from "@/lib/sensors/step-counter";
import type { Unsubscribe } from "@/lib/sensors/types";
import { PermissionGate } from "@/components/permissions/PermissionGate";

interface Props {
  code: string;
  myPlayerId: string;
  roundIndex: number;
}

const FULL_ROTATION = 360;
const PUBLISH_INTERVAL_MS = 250;
const PUBLISH_DEGREES = 15;

async function requestMotionPerm(): Promise<boolean> {
  // Both spin (DeviceOrientation) and steps (DeviceMotion) live behind the
  // same iOS Motion & Orientation Access prompt. Asking either one resolves
  // both, but ask both anyway so the gate works even if Apple ever splits
  // them.
  const a = await new RotationCounter().requestPermission();
  const b = await new StepCounter().requestPermission();
  return a && b;
}

export function InterleaveView(props: Props) {
  return (
    <PermissionGate
      icon="🌀👟"
      label="MOTION"
      blurb="We need your phone's motion + orientation sensors. Hit ENABLE and say YES."
      request={requestMotionPerm}
      iosSetting="Motion & Orientation Access"
    >
      <InterleaveChallenge {...props} />
    </PermissionGate>
  );
}

function InterleaveChallenge({ code, myPlayerId, roundIndex }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const event = useToastyStore((s) => s.event);

  const segments = useMemo(
    () => event?.rounds[roundIndex]?.segments ?? DEFAULT_INTERLEAVE_SEGMENTS,
    [event, roundIndex],
  );
  const total = useMemo(() => interleaveTotal(segments), [segments]);

  const teamValue = (myProgress?.[roundIndex]?.value ?? 0) as number;
  const myValue = (myProgress?.[roundIndex]?.perPlayer?.[myPlayerId] ?? 0) as
    | number
    | undefined;

  // Pending = stuff the local sensor saw but the store hasn't credited yet.
  const [pending, setPending] = useState(0);
  const lastCreditedRef = useRef(0);
  useEffect(() => {
    const credited = (myValue ?? 0) as number;
    const prev = lastCreditedRef.current;
    if (credited > prev) {
      setPending((p) => Math.max(0, p - (credited - prev)));
      lastCreditedRef.current = credited;
    } else if (credited < prev) {
      setPending(0);
      lastCreditedRef.current = credited;
    }
  }, [myValue]);

  const displayedTeam = Math.min(teamValue + pending, total);
  const located = locateInterleaveSegment(segments, displayedTeam);
  const teamPct = total > 0 ? (displayedTeam / total) * 100 : 0;

  // Both spin segments need a "press both buttons" arming gate to avoid
  // accidental rotation while walking. Steps run free.
  const [leftDown, setLeftDown] = useState(false);
  const [rightDown, setRightDown] = useState(false);
  const armed = leftDown && rightDown;

  // ---- Sensor wiring. We mount EITHER the rotation sensor OR the step
  //      counter depending on which segment we're currently on. When the
  //      team crosses a segment boundary, this effect tears down and
  //      remounts on the new sensor — so a player who just finished a spin
  //      segment immediately starts contributing steps in the next.
  const segmentKind = located?.segment.kind ?? null;
  const rotSensorRef = useRef<RotationCounter | null>(null);
  const stepSensorRef = useRef<StepCounter | null>(null);
  const bufferRef = useRef(0); // accumulated DEGREES (for spin) or steps
  const lastPublishRef = useRef(0);

  useEffect(() => {
    if (!myTeamId || !segmentKind) return;
    let unsub: Unsubscribe | null = null;
    let cancelled = false;

    function flush(delta: number, ts: number) {
      if (delta <= 0 || !myTeamId) return;
      publisher({
        kind: "progress",
        playerId: myPlayerId,
        teamId: myTeamId,
        roundIndex,
        challenge: "interleave",
        delta,
        ts,
      }).catch(() => {});
    }

    (async () => {
      if (segmentKind === "spin") {
        const sensor = new RotationCounter();
        rotSensorRef.current = sensor;
        sensor.pause(); // start paused; only spin while both buttons held
        unsub = await sensor.start((deltaDeg) => {
          if (cancelled) return;
          bufferRef.current += deltaDeg;
          // Each rotation is 1 unit. Pending tracks fractional rotations
          // for instant feedback.
          setPending((p) => p + deltaDeg / FULL_ROTATION);
          const now = Date.now();
          if (
            bufferRef.current >= PUBLISH_DEGREES ||
            (bufferRef.current > 0 &&
              now - lastPublishRef.current >= PUBLISH_INTERVAL_MS)
          ) {
            const flushDeg = bufferRef.current;
            bufferRef.current = 0;
            lastPublishRef.current = now;
            flush(flushDeg / FULL_ROTATION, now);
          }
        });
      } else if (segmentKind === "steps") {
        const sensor = new StepCounter();
        stepSensorRef.current = sensor;
        unsub = await sensor.start(() => {
          if (cancelled) return;
          bufferRef.current += 1;
          setPending((p) => p + 1);
          const now = Date.now();
          // Steps batch every 2 footfalls or every interval.
          if (
            bufferRef.current >= 2 ||
            now - lastPublishRef.current >= PUBLISH_INTERVAL_MS
          ) {
            const flushSteps = bufferRef.current;
            bufferRef.current = 0;
            lastPublishRef.current = now;
            flush(flushSteps, now);
          }
        });
      }
    })();

    return () => {
      cancelled = true;
      const remainder = bufferRef.current;
      bufferRef.current = 0;
      if (remainder > 0) {
        if (segmentKind === "spin") {
          flush(remainder / FULL_ROTATION, Date.now());
        } else {
          flush(remainder, Date.now());
        }
      }
      unsub?.();
      rotSensorRef.current = null;
      stepSensorRef.current = null;
    };
  }, [segmentKind, myPlayerId, myTeamId, publisher, roundIndex]);

  // Spin: pause/resume the rotation sensor based on the both-buttons gate.
  useEffect(() => {
    const s = rotSensorRef.current;
    if (!s) return;
    if (armed) s.resume();
    else s.pause();
  }, [armed, segmentKind]);

  // Hard reset the spin gate whenever the active segment changes — otherwise
  // a player who finished a spin segment with both buttons held would re-enter
  // the next spin segment "armed" without actually pressing anything (the
  // touch capture from the prior segment never fired pointerUp because the
  // buttons unmounted underneath the pointer). Same hazard going steps→spin.
  useEffect(() => {
    setLeftDown(false);
    setRightDown(false);
  }, [segmentKind, located?.index]);

  if (!located) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 text-center">
        <div className="text-7xl mb-4">🏁</div>
        <div className="font-display text-3xl font-extrabold tracking-widest mb-2">
          ALL SEGMENTS DONE!
        </div>
        <div className="text-sm opacity-70">
          Hold tight while the host wraps up this round.
        </div>
      </div>
    );
  }

  const def = CHALLENGES.interleave;
  const segIndex = located.index;
  const segCount = located.segment.count;
  const segValue = Math.min(located.segmentValue + pending, segCount);
  const segPct = segCount > 0 ? (segValue / segCount) * 100 : 0;
  const segKindLabel = located.segment.kind === "spin" ? "SPIN" : "STEP";
  const segEmoji = located.segment.kind === "spin" ? "🌀" : "👟";

  return (
    <div className="flex flex-col flex-1 p-4 relative">
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-[0.3em] opacity-60">
          {def.label} · segment {segIndex + 1} / {segments.length}
        </div>
        <div className="font-display text-4xl mt-1">{segEmoji}</div>
        <div className="font-display text-xl sm:text-2xl font-extrabold tracking-widest mt-1">
          {located.segment.kind === "spin"
            ? "SPIN AS A TEAM"
            : "STOMP AS A TEAM"}
        </div>
      </div>

      <div className="flex flex-col items-center justify-center flex-1">
        <div className="font-display text-[7rem] leading-none font-extrabold tabular-nums text-accent-orange drop-shadow">
          {Math.floor(segValue).toLocaleString()}
        </div>
        <div className="text-sm uppercase tracking-widest opacity-70 mt-2">
          of {segCount.toLocaleString()} {segKindLabel.toLowerCase()}s
        </div>
        <div className="w-56 h-2 bg-bg-card rounded-full mt-3 overflow-hidden">
          <div
            className="h-full bg-gradient-party transition-all"
            style={{ width: `${segPct}%` }}
          />
        </div>

        <div className="mt-6 w-full max-w-xs">
          <div className="text-[10px] uppercase tracking-[0.3em] opacity-50 mb-1 text-center">
            overall · {Math.floor(displayedTeam).toLocaleString()} /{" "}
            {total.toLocaleString()}
          </div>
          <div className="w-full h-1.5 bg-bg-card rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-orange transition-all"
              style={{ width: `${teamPct}%` }}
            />
          </div>
          <div className="flex gap-1 mt-2">
            {segments.map((seg, i) => {
              const done = i < segIndex;
              const active = i === segIndex;
              return (
                <div
                  key={i}
                  className={`flex-1 text-center py-1 rounded-md text-[10px] font-extrabold tracking-widest ${
                    done
                      ? "bg-accent-green/20 text-accent-green"
                      : active
                        ? "bg-accent-orange/20 text-accent-orange ring-1 ring-accent-orange"
                        : "bg-bg-card opacity-50"
                  }`}
                >
                  {seg.kind === "spin" ? "🌀" : "👟"} {seg.count}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {located.segment.kind === "spin" ? (
        <>
          <div className="text-center text-xs opacity-60 mb-2">
            {armed
              ? "ROTATE LIKE A DUMBASS"
              : "HOLD BOTH BUTTONS, THEN SPIN"}
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
          {!armed && (
            <div className="absolute inset-0 pointer-events-none flex items-start justify-center pt-32">
              <div className="px-4 py-2 rounded-full bg-accent-orange text-bg font-extrabold tracking-widest text-sm">
                PAUSED
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center text-xs opacity-60 pb-3">
          STOMP. Phone in your pocket or your hand. Every footfall counts.
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
