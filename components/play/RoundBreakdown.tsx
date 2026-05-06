"use client";

import { CHALLENGES } from "@/lib/challenges";
import type { ChallengeId, Team } from "@/lib/types";
import { formatPoints, rankRound, type RankInput } from "@/lib/scoring";

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

function rankBadge(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function toRankInput(entry: BreakdownEntry): RankInput {
  return {
    team: entry.team,
    value: entry.value,
    completedAt: entry.completedAt,
    guesses: entry.guesses ?? [],
  };
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
  if (challenge === "trivia") {
    if (entry.completedAt === null) return "no submit";
    return `${entry.value} correct`;
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
  if (entries.length === 0) {
    return (
      <div className="text-xs opacity-60 italic py-1">
        no data captured for this round
      </div>
    );
  }
  const ranked = rankRound(challenge, entries.map(toRankInput), winnerTeamId);
  const entryById = new Map(entries.map((e) => [e.team.id, e] as const));
  return (
    <div className="space-y-1.5">
      {ranked.map((row) => {
        const entry = entryById.get(row.team.id);
        if (!entry) return null;
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
              {rankBadge(row.rank)}
            </span>
            <span className="text-base">{entry.team.emoji}</span>
            <span className={`flex-1 truncate ${isMine ? "font-extrabold" : ""}`}>
              {entry.team.name}
              {isMine ? " (us)" : ""}
            </span>
            <span className="font-display font-extrabold tabular-nums text-sm">
              {score(entry, challenge, threshold, roundStartedAt)}
            </span>
            <span className="text-[10px] uppercase tracking-widest font-extrabold tabular-nums opacity-80 min-w-[2.5rem] text-right">
              +{formatPoints(row.points)}pt
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
