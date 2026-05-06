"use client";

import Link from "next/link";
import { useState } from "react";
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
  threshold: number;
  // 0-based round index (used for navigation, since multiple rounds may share
  // the same challenge type).
  roundIndex: number;
  state: RoundCardState;
  code: string;
  isMyTeamWinner: boolean;
  // Medal reflecting MY team's place in this round (🥇/🥈/🥉/💩). Only set
  // for past + current-decided cards.
  myMedal?: string | null;
  children?: React.ReactNode; // host controls slot
  // Optional content shown when the card is expanded (only for past /
  // current-decided states). When provided, the card becomes tappable and
  // toggles a per-team score breakdown.
  expandable?: React.ReactNode;
}

const ORDINAL_GLYPH = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

function thresholdLabel(challenge: ChallengeId, threshold: number): string {
  switch (challenge) {
    case "distance":
      return `${(threshold / 1609).toFixed(2)} mi`;
    case "steps":
      return `${threshold.toLocaleString()} steps`;
    case "taps":
      return `${threshold.toLocaleString()} taps`;
    case "scream":
      return `${threshold}s sustained`;
    case "shake":
      return `${threshold}s sustained`;
    case "spin":
      return `${threshold.toLocaleString()} spins`;
    case "north":
      return "one guess each";
    case "time-guess":
      return `target ${(threshold / 1000).toFixed(0)}s`;
  }
}

export function RoundCard({
  ordinal,
  challenge,
  threshold,
  roundIndex,
  state,
  code,
  isMyTeamWinner,
  myMedal,
  children,
  expandable,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const def = CHALLENGES[challenge];
  const glyph = ORDINAL_GLYPH[ordinal - 1] ?? `#${ordinal}`;

  const baseClasses = "rounded-2xl p-4 transition-all";
  let toneClasses = "";
  let trailing: React.ReactNode = null;

  switch (state.kind) {
    case "past":
      toneClasses = "bg-bg-card text-white border border-white/10";
      trailing = state.winner ? (
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-label="your team's medal">
            {myMedal ?? "🥇"}
          </span>
          <span className="text-2xl">{state.winner.emoji}</span>
        </div>
      ) : null;
      break;
    case "current-decided":
      toneClasses = "bg-bg-card text-white border-2 border-accent-orange/40";
      trailing = state.winner ? (
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-label="your team's medal">
            {myMedal ?? "🥇"}
          </span>
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
      toneClasses = "bg-bg-deep text-white/80 border border-white/10";
      trailing = <div className="text-xl">🔒</div>;
      break;
  }

  // Use the team-winner check to silence unused-prop warnings without
  // touching the interface — caller still passes it for future tweaks.
  void isMyTeamWinner;

  const isLocked = state.kind === "future";
  const subtitle = isLocked
    ? `Round ${ordinal} · ???`
    : `${def.label} · ${thresholdLabel(challenge, threshold)}`;

  const inner = (
    <div className="flex items-center gap-3">
      <div className="font-display font-extrabold text-2xl opacity-70 w-7 text-center tabular-nums">
        {glyph}
      </div>
      <div className="text-3xl">{isLocked ? "❓" : def.emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-extrabold tracking-wider uppercase text-sm truncate">
          {subtitle}
        </div>
        {!isLocked && (
          <div className="text-[11px] opacity-60 truncate">{def.description}</div>
        )}
      </div>
      {trailing}
    </div>
  );

  if (state.kind === "current-live") {
    return (
      <Link
        href={`/e/${code}/play/${roundIndex}`}
        className={`${baseClasses} ${toneClasses} block`}
      >
        {inner}
        {children}
      </Link>
    );
  }

  const canExpand = !!expandable && (state.kind === "past" || state.kind === "current-decided");

  return (
    <div className={`${baseClasses} ${toneClasses}`}>
      {canExpand ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left no-select"
          aria-expanded={expanded}
          aria-label={`Toggle round ${ordinal} score breakdown`}
        >
          <div className="flex items-center gap-3">
            <div className="font-display font-extrabold text-2xl opacity-70 w-7 text-center tabular-nums">
              {glyph}
            </div>
            <div className="text-3xl">{def.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-extrabold tracking-wider uppercase text-sm truncate">
                {def.label}
              </div>
              <div className="text-[11px] opacity-60 truncate">
                {expanded ? "tap to hide scores" : "tap to see all team scores"}
              </div>
            </div>
            {trailing}
            <div className="text-sm opacity-60 ml-1">
              {expanded ? "▴" : "▾"}
            </div>
          </div>
        </button>
      ) : (
        inner
      )}
      {canExpand && expanded ? (
        <div className="mt-3 pt-3 border-t border-white/10">{expandable}</div>
      ) : null}
      {children}
    </div>
  );
}
