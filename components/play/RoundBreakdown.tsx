"use client";

import { CHALLENGES } from "@/lib/challenges";
import type { ChallengeId, Player, Team } from "@/lib/types";
import { formatPoints, rankRound, type RankInput } from "@/lib/scoring";

export interface BreakdownEntry {
  team: Team;
  value: number;
  completedAt: number | null;
  guesses?: Array<{ playerId: string; errorDeg: number }>;
  perPlayer?: Record<string, number>;
}

interface Props {
  challenge: ChallengeId;
  threshold: number;
  // ms epoch when the round started (for time-taken calc)
  roundStartedAt: number | null;
  myTeamId: string | null;
  winnerTeamId: string | null;
  entries: BreakdownEntry[];
  players?: Record<string, Player>;
}

function formatPerPlayer(challenge: ChallengeId, value: number): string {
  switch (challenge) {
    case "distance":
      return `${(value / 1609).toFixed(2)} mi`;
    case "flappy":
      return `${Math.floor(value)} m`;
    case "air-time":
      return `${value.toFixed(1)}s`;
    case "spin":
      return `${Math.floor(value).toLocaleString()} spin${
        Math.floor(value) === 1 ? "" : "s"
      }`;
    case "steps":
      return `${Math.floor(value).toLocaleString()} steps`;
    case "taps":
      return `${Math.floor(value).toLocaleString()} taps`;
    case "tilt-maze":
      return `${Math.floor(value)} lvls`;
    case "selfie-sync":
      return `${Math.floor(value)} faces`;
    case "interleave":
      return `${Math.floor(value).toLocaleString()}`;
    default:
      return Math.floor(value).toLocaleString();
  }
}

function challengeHasPerPlayerBreakdown(challenge: ChallengeId): boolean {
  switch (challenge) {
    case "distance":
    case "steps":
    case "taps":
    case "spin":
    case "interleave":
    case "flappy":
    case "air-time":
    case "tilt-maze":
    case "selfie-sync":
      return true;
    default:
      return false;
  }
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
  players,
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
  const showPerPlayer = challengeHasPerPlayerBreakdown(challenge);
  return (
    <div className="space-y-1.5">
      {ranked.map((row) => {
        const entry = entryById.get(row.team.id);
        if (!entry) return null;
        const isMine = entry.team.id === myTeamId;
        const isWinner = entry.team.id === winnerTeamId;
        const perPlayerEntries =
          showPerPlayer && entry.perPlayer
            ? Object.entries(entry.perPlayer).sort((a, b) => b[1] - a[1])
            : [];
        return (
          <div
            key={entry.team.id}
            className={`px-3 py-2 rounded-xl text-sm ${
              isMine
                ? "bg-accent-orange/10 border border-accent-orange/40"
                : "bg-bg-deep/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-display font-extrabold text-sm w-7 text-center opacity-80">
                {rankBadge(row.rank)}
              </span>
              <span className="text-base">{entry.team.emoji}</span>
              <span
                className={`flex-1 truncate ${isMine ? "font-extrabold" : ""}`}
              >
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
            {perPlayerEntries.length > 0 && (
              <div className="mt-1.5 grid grid-cols-2 gap-1">
                {perPlayerEntries.map(([pid, v]) => (
                  <div
                    key={pid}
                    className="text-[10px] tabular-nums bg-black/20 rounded px-2 py-1 flex justify-between gap-2"
                  >
                    <span className="truncate">
                      {players?.[pid]?.name ?? "?"}
                    </span>
                    <span className="font-bold whitespace-nowrap">
                      {formatPerPlayer(challenge, v)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
