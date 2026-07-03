"use client";

// SoloAttempt — Open Play single-attempt game runner. Reuses the sensor libs
// (lib/sensors/*) but NOT the team-coupled *View components: no PubNub, no team
// totals, no host countdown. Idle → running (fixed timer) → done → submit.

import { useEffect, useRef, useState } from "react";
import type { ChallengeId } from "@/lib/types";
import { OPEN_GAMES } from "@/lib/challenges";
import type { CountingSensor, Unsubscribe } from "@/lib/sensors/types";
import { TapCounter } from "@/lib/sensors/tap-counter";
import { StepCounter } from "@/lib/sensors/step-counter";
import { RotationCounter } from "@/lib/sensors/rotation-counter";
import { AirTimeDetector } from "@/lib/sensors/air-time";

type Phase = "idle" | "running" | "done";

function buildMotionSensor(kind: "steps" | "spin" | "air-time"): CountingSensor {
  switch (kind) {
    case "spin":
      return new RotationCounter();
    case "air-time":
      return new AirTimeDetector();
    case "steps":
    default:
      return new StepCounter();
  }
}

export default function SoloAttempt({
  gameId,
  durationMs,
  onSubmit,
}: {
  gameId: ChallengeId;
  durationMs: number;
  onSubmit: (score: number) => Promise<void> | void;
}) {
  const spec = OPEN_GAMES[gameId];

  const [phase, setPhase] = useState<Phase>("idle");
  const [display, setDisplay] = useState(0);
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const scoreRef = useRef(0);
  const finalScoreRef = useRef(0);
  const unsubRef = useRef<Unsubscribe | null>(null);
  const tapTargetRef = useRef<HTMLDivElement | null>(null);

  // Tear down any live sensor on unmount.
  useEffect(() => {
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, []);

  // Drive the attempt while running: wire the sensor, tick the display, and
  // freeze the score when the timer expires.
  useEffect(() => {
    if (phase !== "running" || !spec) return;
    let cancelled = false;
    const onDelta = (d: number) => {
      scoreRef.current += d;
    };

    (async () => {
      try {
        if (spec.input === "tap-surface") {
          const target = tapTargetRef.current;
          if (!target) return;
          unsubRef.current = await new TapCounter().start(target, onDelta);
        } else {
          unsubRef.current = await buildMotionSensor(spec.sensor as
            | "steps"
            | "spin"
            | "air-time").start(onDelta);
        }
      } catch {
        if (!cancelled) setError("Couldn’t start the sensor.");
      }
    })();

    const startTs = performance.now();
    const tick = setInterval(() => {
      setDisplay(scoreRef.current);
      setRemainingMs(Math.max(0, durationMs - (performance.now() - startTs)));
    }, 120);
    const end = setTimeout(() => {
      finalScoreRef.current = scoreRef.current;
      setDisplay(scoreRef.current);
      setRemainingMs(0);
      unsubRef.current?.();
      unsubRef.current = null;
      setPhase("done");
    }, durationMs);

    return () => {
      cancelled = true;
      clearInterval(tick);
      clearTimeout(end);
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [phase, durationMs, spec]);

  if (!spec) {
    return (
      <div className="text-center opacity-70 py-10">
        This game isn’t available in open play.
      </div>
    );
  }

  async function handleStart() {
    setError(null);
    scoreRef.current = 0;
    finalScoreRef.current = 0;
    setDisplay(0);
    setRemainingMs(durationMs);

    // iOS motion/orientation permission must be requested inside the tap.
    if (spec!.input === "motion") {
      const probe = buildMotionSensor(spec!.sensor as "steps" | "spin" | "air-time");
      if (probe.requestPermission) {
        const ok = await probe.requestPermission().catch(() => false);
        if (!ok) {
          setError("Motion access denied — enable it in settings and retry.");
          return;
        }
      }
    }
    setPhase("running");
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(finalScoreRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t submit your score.");
      setSubmitting(false);
    }
  }

  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div className="flex flex-col gap-4">
      {phase === "idle" && (
        <div className="rounded-2xl bg-bg-card p-6 flex flex-col gap-5 text-center">
          <div className="text-sm opacity-80">{spec.instruction}</div>
          <div className="text-xs uppercase tracking-widest opacity-60">
            one attempt · {Math.round(durationMs / 1000)}s
          </div>
          <button
            type="button"
            onClick={handleStart}
            className="w-full py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest"
          >
            START ▶
          </button>
        </div>
      )}

      {phase === "running" && spec.input === "tap-surface" && (
        <div
          ref={tapTargetRef}
          className="rounded-2xl bg-gradient-party p-6 min-h-[50vh] flex flex-col items-center justify-center gap-3 select-none"
          style={{ touchAction: "manipulation", WebkitUserSelect: "none" }}
        >
          <div className="text-xs uppercase tracking-widest opacity-90">
            {seconds}s left
          </div>
          <div className="font-display text-5xl font-extrabold">
            {spec.formatScore(display)}
          </div>
          <div className="font-display text-2xl font-extrabold tracking-widest opacity-90">
            TAP! TAP! TAP!
          </div>
        </div>
      )}

      {phase === "running" && spec.input === "motion" && (
        <div className="rounded-2xl bg-gradient-party p-6 min-h-[40vh] flex flex-col items-center justify-center gap-3 text-center">
          <div className="text-xs uppercase tracking-widest opacity-90">
            {seconds}s left
          </div>
          <div className="font-display text-5xl font-extrabold">
            {spec.formatScore(display)}
          </div>
          <div className="text-sm font-bold opacity-90">{spec.instruction}</div>
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-2xl bg-bg-card p-6 flex flex-col gap-5 text-center">
          <div className="text-xs uppercase tracking-widest opacity-60">
            time! your score
          </div>
          <div className="font-display text-4xl font-extrabold">
            {spec.formatScore(finalScoreRef.current)}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest disabled:opacity-50"
          >
            {submitting ? "SAVING…" : "SUBMIT 🔒"}
          </button>
          <div className="text-[11px] opacity-50">
            You only get one shot — this locks in your score.
          </div>
        </div>
      )}

      {error && (
        <div className="text-accent-pink text-sm text-center">{error}</div>
      )}
    </div>
  );
}
