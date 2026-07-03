"use client";

// Open Play "Guess The Time": tap GO, wait what feels like the target time, tap
// STOP. Score = |elapsed − target| in ms (lower is better). No visible clock —
// that's the whole game.

import { useEffect, useRef, useState } from "react";
import GameIntro from "@/components/challenge/open/GameIntro";
import { OPEN_GAMES } from "@/lib/challenges";

type Phase = "intro" | "running" | "done";

export default function TimeGuessAttempt({
  targetMs,
  onSubmit,
}: {
  targetMs: number;
  onSubmit: (score: number, meta?: Record<string, unknown>) => Promise<void> | void;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [deviation, setDeviation] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wobble, setWobble] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  const seconds = (targetMs / 1000).toFixed(0);

  useEffect(() => {
    if (phase !== "running") return;
    let raf = 0;
    const tick = () => {
      setWobble((w) => (w + 1) % 30);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  function go() {
    startedAtRef.current = performance.now();
    setPhase("running");
  }

  function stop() {
    if (startedAtRef.current === null) return;
    const elapsed = performance.now() - startedAtRef.current;
    setDeviation(Math.abs(elapsed - targetMs));
    setPhase("done");
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(deviation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t submit.");
      setSubmitting(false);
    }
  }

  if (phase === "intro") {
    return (
      <div className="flex flex-col gap-4">
        <GameIntro
          emoji="⏱"
          title="Guess The Time"
          blurb={`Your target is ${seconds} seconds. Nail it as closely as you can — no clocks allowed.`}
          steps={OPEN_GAMES["time-guess"]!.howTo}
          onStart={go}
          startLabel="GO"
          footer="The timer is hidden the whole time. Trust your gut."
        />
        {error && <div className="text-accent-pink text-sm text-center">{error}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="text-xs uppercase tracking-widest opacity-70 mt-2">target</div>
      <div className="font-display text-5xl font-extrabold tabular-nums">{seconds}s</div>

      {phase === "running" && (
        <>
          <div className="text-[11px] uppercase tracking-widest opacity-50">
            timer hidden — tap STOP when it feels right
          </div>
          <button
            type="button"
            onClick={stop}
            className="mt-6 w-48 h-48 rounded-full bg-accent-pink text-white font-display text-4xl font-extrabold tracking-widest shadow-[0_0_50px_rgba(232,79,131,0.5)] active:scale-95 transition-transform"
          >
            STOP
          </button>
          <div className="mt-6 flex gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-white/60"
                style={{
                  opacity: 0.2 + ((wobble + i * 6) % 30) / 30,
                  transform: `translateY(${Math.sin((wobble + i * 5) / 4) * 5}px)`,
                }}
              />
            ))}
          </div>
        </>
      )}

      {phase === "done" && (
        <div className="mt-4 rounded-2xl bg-bg-card p-6 flex flex-col gap-5 w-full">
          <div className="text-xs uppercase tracking-widest opacity-60">you were off by</div>
          <div className="font-display text-4xl font-extrabold">
            {(deviation / 1000).toFixed(2)}s
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest disabled:opacity-50"
          >
            {submitting ? "SAVING…" : "SUBMIT 🔒"}
          </button>
        </div>
      )}

      {error && <div className="text-accent-pink text-sm">{error}</div>}
    </div>
  );
}
