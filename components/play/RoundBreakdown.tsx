"use client";

import { CHALLENGES } from "@/lib/challenges";
import type { ChallengeId, Team } from "@/lib/types";

export interface BreakdownEntry {
  team: Team;
  value: number;
  completedAt: number | null;
  guesses?: Array<{ playerId: string; errorDeg: number }>;
}

interface Props {
  challenge: ChallengeId;
  threshold: number;
  // ms epoch when the round started (for time-taken calc)
  roundStartedAt: number | null;
  myTeamId: string | null;
  winnerTeamId: string | null;
  entries: BreakdownEntry[];
}

function formatTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function avgError(entry: BreakdownEntry): number {
  const g = entry.guesses ?? [];
  if (g.length === 0) return 0;
  return g.reduce((s, x) => s + x.errorDeg, 0) / g.length;
}

function rankBadge(idx: number): string {
  if (idx === 0) return "🥇";
  if (idx === 1) return "🥈";
  if (idx === 2) return "🥉";
  return `#${idx + 1}`;
}

function sortEntries(entries: BreakdownEntry[], challenge: ChallengeId): BreakdownEntry[] {
  if (challenge === "north" || challenge === "time-guess") {
    return [...entries].sort((a, b) => {
      const ag = a.guesses?.length ?? 0;
      const bg = b.guesses?.length ?? 0;
      if ((ag > 0) !== (bg > 0)) return ag > 0 ? -1 : 1;
      if (ag === 0 && bg === 0) return 0;
      return avgError(a) - avgError(b);
    });
  }
  return [...entries].sort((a, b) => {
    const aDone = a.completedAt !== null;
    const bDone = b.completedAt !== null;
    if (aDone !== bDone) return aDone ? -1 : 1;
    if (aDone && bDone) {
      return (a.completedAt ?? Infinity) - (b.completedAt ?? Infinity);
    }
    return b.value - a.value;
  });
}

function score(
  entry: BreakdownEntry,
  challenge: ChallengeId,
  threshold: number,
  roundStartedAt: number | null,
): string {
  const def = CHALLENGES[challenge];
  if (challenge === "north") {
    const guesses = entry.guesses ?? [];
    if (guesses.length === 0) return "no guesses";
    return `${avgError(entry).toFixed(0)}° avg`;
  }
  if (challenge === "time-guess") {
    const guesses = entry.guesses ?? [];
    if (guesses.length === 0) return "no guesses";
    return `±${(avgError(entry) / 1000).toFixed(2)}s avg`;
  }
  if (entry.completedAt !== null) {
    if (roundStartedAt === null) return def.formatProgress(entry.value, threshold);
    return formatTime(entry.completedAt - roundStartedAt);
  }
  return def.formatProgress(entry.value, threshold);
}

export function RoundBreakdown({
  challenge,
  threshold,
  roundStartedAt,
  myTeamId,
  winnerTeamId,
  entries,
}: Props) {
  const sorted = sortEntries(entries, challenge);
  if (sorted.length === 0) {
    return (
      <div className="text-xs opacity-60 italic py-1">
        no data captured for this round
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {sorted.map((entry, idx) => {
        const isMine = entry.team.id === myTeamId;
        const isWinner = entry.team.id === winnerTeamId;
        return (
          <div
            key={entry.team.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
              isMine
                ? "bg-accent-orange/10 border border-accent-orange/40"
                : "bg-bg-deep/50"
            }`}
          >
            <span className="font-display font-extrabold text-sm w-7 text-center opacity-80">
              {rankBadge(idx)}
            </span>
            <span className="text-base">{entry.team.emoji}</span>
            <span className={`flex-1 truncate ${isMine ? "font-extrabold" : ""}`}>
              {entry.team.name}
              {isMine ? " (us)" : ""}
            </span>
            <span className="font-display font-extrabold tabular-nums text-sm">
              {score(entry, challenge, threshold, roundStartedAt)}
            </span>
            {isWinner && (
              <span className="text-[10px] uppercase tracking-widest font-extrabold opacity-80">
                🏆
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
