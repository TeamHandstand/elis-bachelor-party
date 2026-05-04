"use client";

import Link from "next/link";
import { CHALLENGES } from "@/lib/challenges";
import type { ChallengeId, Team } from "@/lib/types";

export type RoundCardState =
  | { kind: "past"; winner: Team | null }
  | { kind: "current-live" }
  | { kind: "current-decided"; winner: Team | null }
  | { kind: "future" };

interface Props {
  ordinal: number; // 1-based round number
  challenge: ChallengeId;
  state: RoundCardState;
  code: string;
  isMyTeamWinner: boolean;
  children?: React.ReactNode; // host controls slot
}

const ORDINAL_GLYPH = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

export function RoundCard({
  ordinal,
  challenge,
  state,
  code,
  isMyTeamWinner,
  children,
}: Props) {
  const def = CHALLENGES[challenge];
  const glyph = ORDINAL_GLYPH[ordinal - 1] ?? `#${ordinal}`;

  const baseClasses = "rounded-2xl p-4 transition-all";
  let toneClasses = "";
  let trailing: React.ReactNode = null;

  switch (state.kind) {
    case "past":
      toneClasses = isMyTeamWinner
        ? "bg-gradient-done text-white"
        : "bg-bg-card text-white opacity-70";
      trailing = state.winner ? (
        <div className="flex items-center gap-2">
          <span className="text-xl">🥇</span>
          <span className="text-2xl">{state.winner.emoji}</span>
        </div>
      ) : null;
      break;
    case "current-decided":
      toneClasses = isMyTeamWinner
        ? "bg-gradient-done text-white ring-2 ring-white/40"
        : "bg-bg-card text-white border-2 border-accent-orange/40";
      trailing = state.winner ? (
        <div className="flex items-center gap-2">
          <span className="text-xl">🥇</span>
          <span className="text-2xl">{state.winner.emoji}</span>
        </div>
      ) : null;
      break;
    case "current-live":
      toneClasses =
        "bg-bg-card text-white border-2 border-accent-orange shadow-[0_0_24px_rgba(255,140,66,0.45)]";
      trailing = (
        <div className="text-[10px] font-extrabold tracking-widest uppercase text-accent-orange flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-accent-orange animate-pulse" />
          LIVE
        </div>
      );
      break;
    case "future":
      toneClasses = "bg-bg-card/40 text-white opacity-40";
      trailing = <div className="text-xl opacity-60">🔒</div>;
      break;
  }

  const inner = (
    <div className="flex items-center gap-3">
      <div className="font-display font-extrabold text-2xl opacity-70 w-7 text-center tabular-nums">
        {glyph}
      </div>
      <div className="text-3xl">{def.emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-extrabold tracking-wider uppercase text-sm truncate">
          {def.label}
        </div>
        <div className="text-[11px] opacity-60 truncate">{def.description}</div>
      </div>
      {trailing}
    </div>
  );

  if (state.kind === "current-live") {
    return (
      <Link
        href={`/e/${code}/play/${challenge}`}
        className={`${baseClasses} ${toneClasses} block`}
      >
        {inner}
        {children}
      </Link>
    );
  }

  return (
    <div className={`${baseClasses} ${toneClasses}`}>
      {inner}
      {children}
    </div>
  );
}
