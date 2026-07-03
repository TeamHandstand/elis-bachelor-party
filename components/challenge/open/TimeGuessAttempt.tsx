"use client";

// Open Play "Guess The Time": tap GO, wait what feels like the target time, tap
// STOP. Score = |elapsed − target| in ms (lower is better). No sensors.

import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "running" | "done";

export default function TimeGuessAttempt({
  targetMs,
  onSubmit,
}: {
  targetMs: number;
  onSubmit: (score: number, meta?: Record<string, unknown>) => Promise<void> | void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [deviation, setDeviation] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wobble, setWobble] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  // Animated dots while running — deliberately no elapsed readout.
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

  const seconds = (targetMs / 1000).toFixed(0);

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="text-xs uppercase tracking-widest opacity-70 mt-2">target</div>
      <div className="font-display text-5xl font-extrabold tabular-nums">{seconds}s</div>
      <div className="text-[11px] uppercase tracking-widest opacity-50">
        no clocks, no counting out loud — just feel it
      </div>

      {phase === "idle" && (
        <button
          type="button"
          onClick={go}
          className="mt-8 w-44 h-44 rounded-full bg-gradient-party font-display text-3xl font-extrabold tracking-widest shadow-[0_0_40px_rgba(255,140,66,0.35)] active:scale-95 transition-transform"
        >
          GO
        </button>
      )}

      {phase === "running" && (
        <>
          <button
            type="button"
            onClick={stop}
            className="mt-8 w-44 h-44 rounded-full bg-accent-pink text-white font-display text-3xl font-extrabold tracking-widest shadow-[0_0_40px_rgba(232,79,131,0.5)] active:scale-95 transition-transform"
          >
            STOP
          </button>
          <div className="mt-6 flex gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className="w-2 h-2 rounded-full bg-white/60"
                style={{
                  opacity: 0.2 + ((wobble + i * 6) % 30) / 30,
                  transform: `translateY(${Math.sin((wobble + i * 5) / 4) * 4}px)`,
                }}
              />
            ))}
          </div>
        </>
      )}

      {phase === "done" && (
        <div className="mt-6 rounded-2xl bg-bg-card p-6 flex flex-col gap-5 w-full">
          <div className="text-xs uppercase tracking-widest opacity-60">
            you were off by
          </div>
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
