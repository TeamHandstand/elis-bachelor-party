"use client";

// A big, prominent circular countdown. The ring depletes as time runs out and
// turns pink + pulses in the final seconds.

export default function CountdownRing({
  remainingMs,
  totalMs,
  size = 168,
}: {
  remainingMs: number;
  totalMs: number;
  size?: number;
}) {
  const secs = Math.ceil(remainingMs / 1000);
  const frac = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - frac);
  const urgent = remainingMs <= 5000;

  return (
    <div
      className={urgent ? "animate-pulse" : ""}
      style={{ width: size, height: size, position: "relative", margin: "0 auto" }}
    >
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={urgent ? "#e84f83" : "#ff8c42"}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.12s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className={`font-display font-extrabold tabular-nums leading-none ${
            urgent ? "text-accent-pink" : ""
          }`}
          style={{ fontSize: size * 0.32 }}
        >
          {secs}
        </div>
        <div className="text-[10px] uppercase tracking-widest opacity-60 mt-1">
          seconds
        </div>
      </div>
    </div>
  );
}
