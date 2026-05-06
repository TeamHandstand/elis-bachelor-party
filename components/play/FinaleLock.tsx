"use client";

import { useEffect, useMemo, useState } from "react";

interface Props {
  groomName?: string;
}

const SPARKLES = ["✨", "💫", "⭐", "🌟", "🪩", "🎉"];

/**
 * Sparkly full-screen overlay shown to non-host players once every round is
 * decided but the host hasn't released the final scoreboard yet. Animates a
 * loose constellation of emoji and pulses a "waiting" line.
 */
export function FinaleLock({ groomName }: Props) {
  // Generate a stable random arrangement of sparkles on first mount.
  const sparkleField = useMemo(() => {
    return Array.from({ length: 28 }).map((_, i) => ({
      id: i,
      glyph: SPARKLES[Math.floor(Math.random() * SPARKLES.length)],
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      delay: Math.random() * 2,
      duration: 1.5 + Math.random() * 2,
      size: 0.7 + Math.random() * 1.5,
    }));
  }, []);

  const [dotCount, setDotCount] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDotCount((c) => (c + 1) % 4), 500);
    return () => clearInterval(id);
  }, []);

  const groomLabel = groomName?.trim() ? groomName.trim() : "the host";

  return (
    <div className="fixed inset-0 z-40 bg-bg overflow-hidden">
      {/* Animated radial glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent-purple/30 via-accent-pink/20 to-accent-orange/20 animate-pulse" />

      {/* Floating sparkles */}
      {sparkleField.map((s) => (
        <span
          key={s.id}
          className="absolute select-none"
          style={{
            top: s.top,
            left: s.left,
            fontSize: `${s.size}rem`,
            animation: `finale-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite alternate`,
          }}
        >
          {s.glyph}
        </span>
      ))}

      <div className="relative z-10 flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="text-7xl mb-3 animate-bounce">🪩</div>
        <div className="font-display text-3xl sm:text-4xl font-extrabold tracking-widest leading-tight">
          ALL ROUNDS COMPLETE
        </div>
        <div className="text-sm uppercase tracking-[0.3em] opacity-80 mt-3 max-w-xs">
          waiting on {groomLabel} to finalize the scoreboard
          {".".repeat(dotCount)}
        </div>
        <div className="mt-10 text-xs opacity-60 max-w-xs italic">
          Sit tight. Stretch. Hydrate. The reveal is coming.
        </div>
      </div>

      <style>{`
        @keyframes finale-twinkle {
          0% {
            opacity: 0.15;
            transform: scale(0.8) rotate(0deg);
          }
          100% {
            opacity: 1;
            transform: scale(1.3) rotate(20deg);
          }
        }
      `}</style>
    </div>
  );
}
