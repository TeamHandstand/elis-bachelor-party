"use client";

import { useEffect, useMemo, useState } from "react";

const SHAPES = ["🎉", "🎊", "✨", "🍕", "🌟", "💖", "🥳", "🪩"];

interface Props {
  /** When this becomes true, the confetti shower fires. Setting it false
      again hides the overlay. */
  fire: boolean;
  durationMs?: number;
}

/**
 * Cheap full-screen confetti shower built with falling emoji. No physics
 * library needed — pure CSS keyframes via inline style.
 */
export function Confetti({ fire, durationMs = 5000 }: Props) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!fire) {
      setActive(false);
      return;
    }
    setActive(true);
    const id = setTimeout(() => setActive(false), durationMs);
    return () => clearTimeout(id);
  }, [fire, durationMs]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 60 }).map((_, i) => ({
        id: i,
        glyph: SHAPES[Math.floor(Math.random() * SHAPES.length)],
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.5 + Math.random() * 2.5,
        size: 0.9 + Math.random() * 1.6,
        drift: -30 + Math.random() * 60,
      })),
    [],
  );

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute select-none"
          style={{
            top: "-10%",
            left: `${p.left}%`,
            fontSize: `${p.size}rem`,
            animation: `confetti-fall ${p.duration}s linear ${p.delay}s forwards`,
            // CSS variables consumed in the keyframe via translate-x
            ["--drift" as any]: `${p.drift}px`,
          }}
        >
          {p.glyph}
        </span>
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translate3d(0, 0, 0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translate3d(var(--drift, 0px), 110vh, 0) rotate(540deg);
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}
