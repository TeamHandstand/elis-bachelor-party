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
  // When true, future rounds reveal their real challenge + threshold instead
  // of the locked "???" placeholder. Host-only sneak peek.
  revealLocked?: boolean;
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
    case "trivia":
      return "most correct wins";
    case "interleave":
      return threshold > 0
        ? `${threshold.toLocaleString()} total reps`
        : "spin & step segments";
    case "flappy":
      return `${threshold}m team total`;
    case "air-time":
      return `${threshold}s airborne`;
    case "tilt-maze":
      return `${threshold} mazes`;
    case "selfie-sync":
      return `${threshold}s sustained`;
    case "punishment":
      return "non-scoring";
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
  revealLocked,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const def = CHALLENGES[challenge];
  const glyph = ORDINAL_GLYPH[ordinal - 1] ?? `#${ordinal}`;
  const isPunishment = challenge === "punishment";

  const baseClasses = "rounded-2xl p-4 transition-all";
  let toneClasses = "";
  let trailing: React.ReactNode = null;

  switch (state.kind) {
    case "past":
      toneClasses = isPunishment
        ? "bg-accent-pink/10 text-white border border-accent-pink/30"
        : "bg-bg-card text-white border border-white/10";
      trailing = isPunishment
        ? state.winner
          ? (
            <div className="flex items-center gap-2">
              <span className="text-xl">💀</span>
              <span className="text-2xl">{state.winner.emoji}</span>
            </div>
          )
          : <span className="text-xl">💀</span>
        : state.winner ? (
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-label="your team's medal">
                {myMedal ?? "🥇"}
              </span>
              <span className="text-2xl">{state.winner.emoji}</span>
            </div>
          ) : null;
      break;
    case "current-decided":
      toneClasses = isPunishment
        ? "bg-accent-pink/10 text-white border-2 border-accent-pink/40"
        : "bg-bg-card text-white border-2 border-accent-orange/40";
      trailing = isPunishment
        ? state.winner
          ? (
            <div className="flex items-center gap-2">
              <span className="text-xl">💀</span>
              <span className="text-2xl">{state.winner.emoji}</span>
            </div>
          )
          : <span className="text-xl">💀</span>
        : state.winner ? (
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-label="your team's medal">
                {myMedal ?? "🥇"}
              </span>
              <span className="text-2xl">{state.winner.emoji}</span>
            </div>
          ) : null;
      break;
    case "current-live":
      toneClasses = isPunishment
        ? "bg-accent-pink/15 text-white border-2 border-accent-pink shadow-[0_0_24px_rgba(255,107,138,0.45)]"
        : "bg-bg-card text-white border-2 border-accent-orange shadow-[0_0_24px_rgba(255,140,66,0.45)]";
      trailing = (
        <div
          className={`text-[10px] font-extrabold tracking-widest uppercase flex items-center gap-1 ${
            isPunishment ? "text-accent-pink" : "text-accent-orange"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full animate-pulse ${
              isPunishment ? "bg-accent-pink" : "bg-accent-orange"
            }`}
          />
          {isPunishment ? "PUNISHMENT" : "LIVE"}
        </div>
      );
      break;
    case "future":
      toneClasses = isPunishment
        ? "bg-bg-deep text-white/80 border border-accent-pink/30"
        : revealLocked
          ? "bg-bg-deep text-white/80 border border-accent-orange/30"
          : "bg-bg-deep text-white/80 border border-white/10";
      trailing = isPunishment ? (
        <div className="text-xl">💀</div>
      ) : revealLocked ? (
        <div className="text-[10px] uppercase tracking-widest font-extrabold text-accent-orange">
          host
        </div>
      ) : (
        <div className="text-xl">🔒</div>
      );
      break;
  }

  // Use the team-winner check to silence unused-prop warnings without
  // touching the interface — caller still passes it for future tweaks.
  void isMyTeamWinner;

  const isLocked = state.kind === "future";
  const showRealDetails = !isLocked || isPunishment || revealLocked;
  const subtitle = !showRealDetails
    ? `Round ${ordinal} · ???`
    : isPunishment
      ? `💀 Punishment · ${thresholdLabel(challenge, threshold)}`
      : `${def.label} · ${thresholdLabel(challenge, threshold)}`;

  const inner = (
    <div className="flex items-center gap-3">
      <div className="font-display font-extrabold text-2xl opacity-70 w-7 text-center tabular-nums">
        {glyph}
      </div>
      <div className="text-3xl">{showRealDetails ? def.emoji : "❓"}</div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-extrabold tracking-wider uppercase text-sm truncate">
          {subtitle}
        </div>
        {showRealDetails && (
          <div className="text-[11px] opacity-60 truncate">{def.description}</div>
        )}
      </div>
      {trailing}
    </div>
  );

  if (state.kind === "current-live") {
    // Punishment rounds have no /play/[idx] view — the takeover overlay is
    // the entire UX. Render as a static card instead of a Link.
    if (isPunishment) {
      return (
        <div className={`${baseClasses} ${toneClasses}`}>
          {inner}
          {children}
        </div>
      );
    }
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
