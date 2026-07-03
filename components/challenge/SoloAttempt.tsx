"use client";

// Open Play single-attempt runner for the "counting" games (taps, steps, spin,
// air-time). Shows a step-by-step intro, a prominent countdown ring, and the
// right input surface per game. Spin requires holding BOTH on-screen buttons —
// rotations only count while both are held (mirrors the heptathlon SpinView).

import { useEffect, useRef, useState } from "react";
import type { ChallengeId } from "@/lib/types";
import { OPEN_GAMES } from "@/lib/challenges";
import type { CountingSensor, Unsubscribe } from "@/lib/sensors/types";
import { TapCounter } from "@/lib/sensors/tap-counter";
import { StepCounter } from "@/lib/sensors/step-counter";
import { RotationCounter } from "@/lib/sensors/rotation-counter";
import { AirTimeDetector } from "@/lib/sensors/air-time";
import GameIntro from "@/components/challenge/open/GameIntro";
import CountdownRing from "@/components/challenge/open/CountdownRing";

type Phase = "idle" | "running" | "done";

export default function SoloAttempt({
  gameId,
  durationMs,
  onSubmit,
}: {
  gameId: ChallengeId;
  durationMs: number;
  onSubmit: (score: number, meta?: Record<string, unknown>) => Promise<void> | void;
}) {
  const spec = OPEN_GAMES[gameId];
  const isSpin = spec?.sensor === "spin";
  const isTaps = spec?.input === "tap-surface";

  const [phase, setPhase] = useState<Phase>("idle");
  const [display, setDisplay] = useState(0);
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leftDown, setLeftDown] = useState(false);
  const [rightDown, setRightDown] = useState(false);

  const scoreRef = useRef(0);
  const finalScoreRef = useRef(0);
  const unsubRef = useRef<Unsubscribe | null>(null);
  const tapTargetRef = useRef<HTMLDivElement | null>(null);
  const spinSensorRef = useRef<RotationCounter | null>(null);

  useEffect(() => {
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, []);

  // Drive the attempt while running.
  useEffect(() => {
    if (phase !== "running" || !spec) return;
    let cancelled = false;
    const onDelta = (d: number) => {
      scoreRef.current += d;
    };

    (async () => {
      try {
        if (isTaps) {
          const target = tapTargetRef.current;
          if (!target) return;
          unsubRef.current = await new TapCounter().start(target, onDelta);
        } else if (isSpin) {
          const s = new RotationCounter();
          spinSensorRef.current = s;
          s.pause(); // count only while both buttons are held
          unsubRef.current = await s.start(onDelta);
        } else {
          const s: CountingSensor =
            spec.sensor === "steps" ? new StepCounter() : new AirTimeDetector();
          unsubRef.current = await s.start(onDelta);
        }
      } catch {
        if (!cancelled) setError("Couldn’t start the sensor.");
      }
    })();

    const startTs = performance.now();
    const tick = setInterval(() => {
      setDisplay(scoreRef.current);
      setRemainingMs(Math.max(0, durationMs - (performance.now() - startTs)));
    }, 100);
    const end = setTimeout(() => {
      finalScoreRef.current = scoreRef.current;
      setDisplay(scoreRef.current);
      setRemainingMs(0);
      unsubRef.current?.();
      unsubRef.current = null;
      spinSensorRef.current = null;
      setPhase("done");
    }, durationMs);

    return () => {
      cancelled = true;
      clearInterval(tick);
      clearTimeout(end);
      unsubRef.current?.();
      unsubRef.current = null;
      spinSensorRef.current = null;
    };
  }, [phase, durationMs, spec, isTaps, isSpin]);

  // Spin: resume the sensor only while BOTH buttons are held.
  const bothDown = leftDown && rightDown;
  useEffect(() => {
    if (!isSpin) return;
    const s = spinSensorRef.current;
    if (!s) return;
    if (bothDown) s.resume();
    else s.pause();
  }, [bothDown, isSpin, phase]);

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
    setLeftDown(false);
    setRightDown(false);

    if (spec!.input === "motion") {
      const probe: CountingSensor =
        spec!.sensor === "spin"
          ? new RotationCounter()
          : spec!.sensor === "steps"
            ? new StepCounter()
            : new AirTimeDetector();
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

  if (phase === "idle") {
    return (
      <div className="flex flex-col gap-4">
        <GameIntro
          emoji={emojiFor(gameId)}
          title={titleFor(gameId)}
          blurb={spec.instruction}
          steps={spec.howTo}
          onStart={handleStart}
          footer={`One attempt · ${Math.round(durationMs / 1000)} seconds`}
        />
        {error && <div className="text-accent-pink text-sm text-center">{error}</div>}
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="flex flex-col gap-4">
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
        {error && <div className="text-accent-pink text-sm text-center">{error}</div>}
      </div>
    );
  }

  // phase === "running"
  return (
    <div className="flex flex-col items-center gap-4">
      <CountdownRing remainingMs={remainingMs} totalMs={durationMs} />

      <div className="text-center">
        <div className="font-display text-4xl font-extrabold tabular-nums">
          {spec.formatScore(display)}
        </div>
      </div>

      {isTaps && (
        <div
          ref={tapTargetRef}
          className="rounded-2xl bg-gradient-party w-full min-h-[38vh] flex items-center justify-center select-none"
          style={{ touchAction: "manipulation", WebkitUserSelect: "none" }}
        >
          <div className="font-display text-3xl font-extrabold tracking-widest opacity-90">
            TAP! TAP! TAP!
          </div>
        </div>
      )}

      {isSpin && (
        <div className="w-full flex flex-col items-center gap-3">
          <div className="text-sm font-bold">
            {bothDown ? "SPIN! 🌀" : "HOLD BOTH BUTTONS TO SPIN"}
          </div>
          <div className="flex gap-3 w-full">
            <HoldButton
              label="LEFT"
              down={leftDown}
              onDown={() => setLeftDown(true)}
              onUp={() => setLeftDown(false)}
            />
            <HoldButton
              label="RIGHT"
              down={rightDown}
              onDown={() => setRightDown(true)}
              onUp={() => setRightDown(false)}
            />
          </div>
          {!bothDown && (
            <div className="px-4 py-1.5 rounded-full bg-accent-orange text-bg font-extrabold tracking-widest text-xs">
              PAUSED
            </div>
          )}
        </div>
      )}

      {!isTaps && !isSpin && (
        <div className="rounded-2xl bg-bg-card p-5 w-full text-center text-sm font-bold opacity-90">
          {spec.instruction}
        </div>
      )}

      {error && <div className="text-accent-pink text-sm text-center">{error}</div>}
    </div>
  );
}

function HoldButton({
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
      className={`flex-1 h-28 rounded-3xl font-display text-2xl font-extrabold tracking-widest transition-all select-none ${
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

function emojiFor(id: ChallengeId): string {
  const map: Partial<Record<ChallengeId, string>> = {
    taps: "👆",
    steps: "👟",
    spin: "🌀",
    "air-time": "✈️",
  };
  return map[id] ?? "🎮";
}

function titleFor(id: ChallengeId): string {
  const map: Partial<Record<ChallengeId, string>> = {
    taps: "Taps",
    steps: "Steps",
    spin: "Spin Cycle",
    "air-time": "Air Time",
  };
  return map[id] ?? "Game";
}
