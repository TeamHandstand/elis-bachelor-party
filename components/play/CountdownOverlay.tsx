"use client";

import { useEffect, useState } from "react";
import { CHALLENGES } from "@/lib/challenges";
import type { ChallengeId } from "@/lib/types";

interface Props {
  startsAt: number; // ms epoch — when the round begins
  challenge: ChallengeId;
  onDone: () => void;
}

/**
 * Full-screen 5-4-3-2-1-GO overlay that auto-dismisses at startsAt.
 * Driven by requestAnimationFrame so it stays in sync across devices
 * regardless of when each phone mounted the component.
 */
export function CountdownOverlay({ startsAt, challenge, onDone }: Props) {
  const def = CHALLENGES[challenge];
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, startsAt - Date.now()),
  );

  useEffect(() => {
    let raf = 0;
    let done = false;
    function tick() {
      const left = Math.max(0, startsAt - Date.now());
      setRemainingMs(left);
      if (left <= 0 && !done) {
        done = true;
        onDone();
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startsAt, onDone]);

  const seconds = Math.ceil(remainingMs / 1000);
  const display = remainingMs <= 0 ? "GO!" : String(seconds);

  return (
    <div className="fixed inset-0 z-50 bg-bg/95 backdrop-blur-md flex flex-col items-center justify-center safe-top safe-bottom">
      <div className="text-xs uppercase tracking-[0.4em] opacity-60 mb-3">
        Next up
      </div>
      <div className="text-5xl mb-1">{def.emoji}</div>
      <div className="font-display text-2xl font-extrabold tracking-widest mb-8">
        {def.label.toUpperCase()}
      </div>
      <div
        key={display}
        className="font-display font-extrabold tracking-tighter bg-gradient-party bg-clip-text text-transparent text-[12rem] leading-none animate-[pulse_0.4s_ease-in-out]"
      >
        {display}
      </div>
    </div>
  );
}
