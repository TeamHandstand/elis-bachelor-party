"use client";

import { useEffect, useState } from "react";
import { CHALLENGES, challengeCommand } from "@/lib/challenges";
import type { ChallengeId } from "@/lib/types";

interface Props {
  startsAt: number; // ms epoch — when the round begins
  challenge: ChallengeId;
  // Round-specific threshold so the instructions line shows the actual
  // target ("Take 200 steps…") instead of the challenge default.
  threshold: number;
  onDone: () => void;
}

/**
 * Full-screen 5-4-3-2-1-GO overlay that auto-dismisses at startsAt.
 * Driven by requestAnimationFrame so it stays in sync across devices
 * regardless of when each phone mounted the component.
 */
export function CountdownOverlay({
  startsAt,
  challenge,
  threshold,
  onDone,
}: Props) {
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

  // While the overlay is mounted, lock body scroll so finger drags on the
  // overlay don't bleed through to the journey/round content underneath
  // (iOS Safari treats `position:fixed` panels as transparent to touch
  // scroll otherwise).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    const html = document.documentElement;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;
    const prevTouchAction = body.style.touchAction;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    body.style.touchAction = "none";
    return () => {
      body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
      body.style.touchAction = prevTouchAction;
    };
  }, []);

  const seconds = Math.ceil(remainingMs / 1000);
  const display = remainingMs <= 0 ? "GO!" : String(seconds);
  const instructions = challengeCommand(challenge, threshold);

  return (
    <div
      className="fixed inset-0 z-50 bg-bg/95 backdrop-blur-md flex flex-col items-center justify-center safe-top safe-bottom px-6 overflow-hidden overscroll-contain"
      style={{ touchAction: "none" }}
      onTouchMove={(e) => e.preventDefault()}
      onWheel={(e) => e.preventDefault()}
    >
      <div className="text-xs uppercase tracking-[0.4em] opacity-60 mb-3">
        Next up
      </div>
      <div className="text-5xl mb-1">{def.emoji}</div>
      <div className="font-display text-2xl font-extrabold tracking-widest mb-6">
        {def.label.toUpperCase()}
      </div>
      <div
        key={display}
        className="font-display font-extrabold tracking-tighter bg-gradient-party bg-clip-text text-transparent text-[12rem] leading-none animate-[pulse_0.4s_ease-in-out]"
      >
        {display}
      </div>
      <div className="mt-6 max-w-md text-center">
        <div className="text-[10px] uppercase tracking-[0.3em] opacity-50 mb-2">
          your mission
        </div>
        <div className="font-display text-lg sm:text-xl font-extrabold leading-tight text-accent-orange tracking-wide">
          {instructions}
        </div>
      </div>
    </div>
  );
}
