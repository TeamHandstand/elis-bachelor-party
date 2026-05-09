"use client";

import Link from "next/link";
import { CHALLENGES } from "@/lib/challenges";
import type { ChallengeId, Player, Team } from "@/lib/types";
import { formatPoints, rankRound, type RankInput } from "@/lib/scoring";

export interface ResultEntry {
  team: Team;
  value: number;
  completedAt: number | null;
  perPlayer?: Record<string, number>;
  guesses?: Array<{ playerId: string; errorDeg: number }>;
  // Trivia: the team's submitted answer block (questionId -> choiceIndex).
  triviaAnswers?: Record<string, number>;
  triviaSubmittedBy?: string;
}

interface Props {
  challenge: ChallengeId;
  threshold: number;
  // ms epoch when countdown ended and round timing began. Null only if the
  // store hasn't seen a round-start (shouldn't happen in practice).
  roundStartedAt: number | null;
  myTeamId: string | null;
  entries: ResultEntry[];
  players: Record<string, Player>;
  mode: "my-team" | "all-teams";
  // For all-teams mode, the host-decided / first-finished winner gets a
  // gradient highlight.
  winnerTeamId?: string | null;
  // Event code so we can render a "back to rounds" button on each result view.
  code?: string;
  // Trivia: the round's question list — needed to label answer choices in
  // the per-team breakdown and confirm correctness.
  triviaQuestions?: import("@/lib/types").TriviaQuestion[];
}

function formatTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const total = Math.floor(ms / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function timeTaken(entry: ResultEntry, roundStartedAt: number | null): number | null {
  if (entry.completedAt === null || roundStartedAt === null) return null;
  return entry.completedAt - roundStartedAt;
}

function northTotalError(entry: ResultEntry): number {
  return (entry.guesses ?? []).reduce((s, g) => s + g.errorDeg, 0);
}

function northAvgError(entry: ResultEntry): number {
  const g = entry.guesses ?? [];
  if (g.length === 0) return 0;
  return northTotalError(entry) / g.length;
}

function toRankInput(entry: ResultEntry): RankInput {
  return {
    team: entry.team,
    value: entry.value,
    completedAt: entry.completedAt,
    guesses: entry.guesses ?? [],
  };
}

function rankBadge(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
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

export function RoundResults({
  challenge,
  threshold,
  roundStartedAt,
  myTeamId,
  entries,
  players,
  mode,
  winnerTeamId,
  code,
  triviaQuestions,
}: Props) {
  const def = CHALLENGES[challenge];

  if (mode === "my-team") {
    const mine = entries.find((e) => e.team.id === myTeamId);
    if (!mine) return null;
    return (
      <MyTeamCard
        challenge={challenge}
        threshold={threshold}
        roundStartedAt={roundStartedAt}
        entry={mine}
        players={players}
        code={code}
        triviaQuestions={triviaQuestions}
      />
    );
  }

  const ranked = rankRound(
    challenge,
    entries.map(toRankInput),
    winnerTeamId ?? null,
  );
  const entryById = new Map(entries.map((e) => [e.team.id, e] as const));
  const winnerEntry =
    winnerTeamId !== undefined && winnerTeamId !== null
      ? entryById.get(winnerTeamId) ?? null
      : null;
  const iWon = !!myTeamId && myTeamId === winnerTeamId;
  const haveMyTeam = !!myTeamId && entries.some((e) => e.team.id === myTeamId);

  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto">
      <div className="text-center mb-2">
        <div className="text-6xl mb-2">{def.emoji}</div>
        <div className="font-display text-3xl font-extrabold tracking-widest">
          ROUND COMPLETE
        </div>
        <div className="text-xs uppercase tracking-widest opacity-70 mt-1">
          {def.label}
        </div>
        {haveMyTeam && winnerEntry ? (
          <div
            className={`mt-3 font-display text-2xl font-extrabold tracking-widest ${
              iWon ? "text-accent-green" : "text-accent-pink"
            }`}
          >
            {iWon ? "🎉 YOU WON" : "💀 YOU LOST"}
          </div>
        ) : null}
      </div>
      {ranked.map((row) => {
        const entry = entryById.get(row.team.id);
        if (!entry) return null;
        return (
          <TeamResultRow
            key={entry.team.id}
            challenge={challenge}
            threshold={threshold}
            roundStartedAt={roundStartedAt}
            entry={entry}
            rank={row.rank}
            points={row.points}
            isMine={entry.team.id === myTeamId}
            isWinner={entry.team.id === winnerTeamId}
            players={players}
            triviaQuestions={triviaQuestions}
          />
        );
      })}
      {code ? (
        <Link
          href={`/e/${code}/play`}
          className="mt-3 w-full text-center py-4 rounded-2xl bg-gradient-party font-display text-base font-extrabold tracking-widest"
        >
          ← BACK TO ROUNDS
        </Link>
      ) : null}
    </div>
  );
}

// ---------- My team focal card (round still live) ----------

function MyTeamCard({
  challenge,
  threshold,
  roundStartedAt,
  entry,
  players,
  code,
  triviaQuestions,
}: {
  challenge: ChallengeId;
  threshold: number;
  roundStartedAt: number | null;
  entry: ResultEntry;
  players: Record<string, Player>;
  code?: string;
  triviaQuestions?: import("@/lib/types").TriviaQuestion[];
}) {
  const def = CHALLENGES[challenge];

  if (challenge === "trivia") {
    const total = triviaQuestions?.length ?? 0;
    const correct = entry.value;
    const submitterName = entry.triviaSubmittedBy
      ? players[entry.triviaSubmittedBy]?.name ?? "your team"
      : "your team";
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 bg-gradient-done text-white text-center">
        <div className="text-xs uppercase tracking-[0.3em] opacity-90 mb-2">
          ✅ submitted by {submitterName}
        </div>
        <div className="text-6xl mb-2">❓</div>
        <div className="font-display text-7xl font-extrabold tabular-nums leading-none">
          {correct}
          <span className="text-3xl opacity-80"> / {total}</span>
        </div>
        <div className="text-xs uppercase tracking-widest opacity-90 mt-2">
          correct
        </div>
        <div className="mt-6 text-[11px] opacity-90 max-w-xs">
          wait for host to end the round and crown the winner.
        </div>
        {code ? (
          <Link
            href={`/e/${code}/play`}
            className="mt-6 px-6 py-3 rounded-2xl bg-black/30 text-white font-bold tracking-widest text-xs uppercase border border-white/30"
          >
            ← back to rounds
          </Link>
        ) : null}
      </div>
    );
  }

  if (challenge === "time-guess") {
    const guesses = entry.guesses ?? [];
    const avgMs = northAvgError(entry); // ms deviation
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 bg-gradient-done text-white text-center">
        <div className="text-xs uppercase tracking-[0.3em] opacity-90 mb-2">
          your team finished
        </div>
        <div className="text-6xl mb-2">⏱</div>
        <div className="font-display text-7xl font-extrabold tabular-nums leading-none">
          ±{(avgMs / 1000).toFixed(2)}s
        </div>
        <div className="text-xs uppercase tracking-widest opacity-90 mt-2">
          avg deviation
        </div>
        <div className="mt-6 w-full max-w-xs space-y-1">
          {guesses.map((g) => (
            <div
              key={g.playerId}
              className="flex justify-between text-sm tabular-nums bg-black/20 rounded-lg px-3 py-1.5"
            >
              <span>{players[g.playerId]?.name ?? "?"}</span>
              <span className="font-bold">
                ±{(g.errorDeg / 1000).toFixed(2)}s
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6 text-[11px] opacity-90 max-w-xs">
          wait for host to end the round and crown the winner.
        </div>
        {code ? (
          <Link
            href={`/e/${code}/play`}
            className="mt-6 px-6 py-3 rounded-2xl bg-black/30 text-white font-bold tracking-widest text-xs uppercase border border-white/30"
          >
            ← back to rounds
          </Link>
        ) : null}
      </div>
    );
  }

  if (challenge === "north") {
    const guesses = entry.guesses ?? [];
    const allGuessed = guesses.length > 0 && (entry.perPlayer
      ? Object.keys(entry.perPlayer).length === guesses.length
      : true);
    const total = northTotalError(entry);
    const avg = northAvgError(entry);
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 bg-gradient-done text-white text-center">
        <div className="text-xs uppercase tracking-[0.3em] opacity-90 mb-2">
          your team finished
        </div>
        <div className="text-6xl mb-2">🧭</div>
        <div className="font-display text-7xl font-extrabold tabular-nums leading-none">
          {avg.toFixed(0)}°
        </div>
        <div className="text-xs uppercase tracking-widest opacity-90 mt-2">
          avg error · total {total.toFixed(0)}°
        </div>
        <div className="mt-6 w-full max-w-xs space-y-1">
          {guesses.map((g) => (
            <div
              key={g.playerId}
              className="flex justify-between text-sm tabular-nums bg-black/20 rounded-lg px-3 py-1.5"
            >
              <span>{players[g.playerId]?.name ?? "?"}</span>
              <span className="font-bold">{g.errorDeg.toFixed(0)}°</span>
            </div>
          ))}
        </div>
        <div className="mt-6 text-[11px] opacity-90 max-w-xs">
          {allGuessed
            ? "wait for host to end the round and crown the winner."
            : "all teammates need to guess."}
        </div>
        {code ? (
          <Link
            href={`/e/${code}/play`}
            className="mt-6 px-6 py-3 rounded-2xl bg-black/30 text-white font-bold tracking-widest text-xs uppercase border border-white/30"
          >
            ← back to rounds
          </Link>
        ) : null}
      </div>
    );
  }

  // Accumulator / scream / shake — show completion time prominently.
  const ms = timeTaken(entry, roundStartedAt);
  const valueLabel = def.formatProgress(entry.value, threshold);
  const showPerPlayer =
    challengeHasPerPlayerBreakdown(challenge) &&
    entry.perPlayer &&
    Object.keys(entry.perPlayer).length > 0;
  return (
    <div className="flex flex-col items-center justify-center flex-1 p-6 bg-gradient-done text-white text-center">
      <div className="text-xs uppercase tracking-[0.3em] opacity-90 mb-2">
        ✅ your team finished
      </div>
      <div className="font-display text-[7rem] font-extrabold tabular-nums leading-none drop-shadow">
        {formatTime(ms)}
      </div>
      <div className="text-xs uppercase tracking-widest opacity-90 mt-2">
        completion time
      </div>
      <div className="mt-4 px-4 py-2 rounded-2xl bg-black/20 text-sm font-bold tabular-nums">
        {def.emoji} {valueLabel}
      </div>
      {showPerPlayer && (
        <div className="mt-4 w-full max-w-xs space-y-1">
          <div className="text-[10px] uppercase tracking-widest opacity-80 mb-1">
            who did what
          </div>
          {Object.entries(entry.perPlayer ?? {})
            .sort((a, b) => b[1] - a[1])
            .map(([pid, v]) => (
              <div
                key={pid}
                className="flex justify-between text-sm tabular-nums bg-black/20 rounded-lg px-3 py-1.5"
              >
                <span className="truncate">{players[pid]?.name ?? "?"}</span>
                <span className="font-bold">
                  {formatPerPlayer(challenge, v)}
                </span>
              </div>
            ))}
        </div>
      )}
      <div className="mt-6 text-[11px] opacity-90 max-w-xs">
        nice work. host will end the round once they’re ready.
      </div>
      {code ? (
        <Link
          href={`/e/${code}/play`}
          className="mt-6 px-6 py-3 rounded-2xl bg-black/30 text-white font-bold tracking-widest text-xs uppercase border border-white/30"
        >
          ← back to rounds
        </Link>
      ) : null}
    </div>
  );
}

// ---------- All-teams row (round decided) ----------

function TeamResultRow({
  challenge,
  threshold,
  roundStartedAt,
  entry,
  rank,
  points,
  isMine,
  isWinner,
  players,
  triviaQuestions,
}: {
  challenge: ChallengeId;
  threshold: number;
  roundStartedAt: number | null;
  entry: ResultEntry;
  rank: number;
  points: number;
  isMine: boolean;
  isWinner: boolean;
  players: Record<string, Player>;
  triviaQuestions?: import("@/lib/types").TriviaQuestion[];
}) {
  const def = CHALLENGES[challenge];
  const ms = timeTaken(entry, roundStartedAt);

  let primary: string;
  let secondary: string;
  if (challenge === "trivia") {
    const total = triviaQuestions?.length ?? 0;
    if (entry.completedAt === null) {
      primary = "no submit";
      secondary = "—";
    } else {
      primary = `${entry.value} / ${total}`;
      const submitterName = entry.triviaSubmittedBy
        ? players[entry.triviaSubmittedBy]?.name ?? "?"
        : "team";
      secondary = `submitted ${formatTime(ms)} · by ${submitterName}`;
    }
  } else if (challenge === "north") {
    const guesses = entry.guesses ?? [];
    if (guesses.length === 0) {
      primary = "no guesses";
      secondary = "—";
    } else {
      primary = `${northAvgError(entry).toFixed(0)}° avg`;
      secondary = `${guesses.length} ${
        guesses.length === 1 ? "guess" : "guesses"
      } in`;
    }
  } else if (challenge === "time-guess") {
    const guesses = entry.guesses ?? [];
    if (guesses.length === 0) {
      primary = "no guesses";
      secondary = "—";
    } else {
      const avgMs = northAvgError(entry);
      primary = `±${(avgMs / 1000).toFixed(2)}s avg`;
      secondary = `${guesses.length} ${
        guesses.length === 1 ? "guess" : "guesses"
      } in`;
    }
  } else if (entry.completedAt !== null) {
    primary = formatTime(ms);
    secondary = def.formatProgress(entry.value, threshold);
  } else {
    primary = "did not finish";
    secondary = def.formatProgress(entry.value, threshold);
  }

  // Per design: only highlight MY team faintly. Don't tint the winning team
  // — the trophy badge is enough.
  const rowClass = isMine
    ? "bg-accent-orange/10 border border-accent-orange/40"
    : "bg-bg-card border border-white/10";

  return (
    <div className={`rounded-2xl p-3 ${rowClass}`}>
      <div className="flex items-center gap-3">
        <div className="font-display font-extrabold text-lg w-10 text-center opacity-80">
          {rankBadge(rank)}
        </div>
        <div className="text-2xl">{entry.team.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold truncate">
            {entry.team.name}
            {isMine ? " (us)" : ""}
          </div>
          <div className="text-[11px] opacity-80 truncate tabular-nums">
            {secondary}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-xl font-extrabold tabular-nums">
            {primary}
          </div>
          <div className="text-[10px] uppercase tracking-widest font-extrabold tabular-nums opacity-80">
            +{formatPoints(points)} {points === 1 ? "pt" : "pts"}
          </div>
          {isWinner && (
            <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-90">
              🏆 winner
            </div>
          )}
        </div>
      </div>
      {challenge === "north" && (entry.guesses ?? []).length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-1">
          {(entry.guesses ?? []).map((g) => (
            <div
              key={g.playerId}
              className="text-[10px] tabular-nums bg-black/20 rounded px-2 py-1 truncate"
            >
              {players[g.playerId]?.name ?? "?"} {g.errorDeg.toFixed(0)}°
            </div>
          ))}
        </div>
      )}
      {challengeHasPerPlayerBreakdown(challenge) &&
        entry.perPlayer &&
        Object.keys(entry.perPlayer).length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-1">
            {Object.entries(entry.perPlayer)
              .sort((a, b) => b[1] - a[1])
              .map(([pid, v]) => (
                <div
                  key={pid}
                  className="text-[10px] tabular-nums bg-black/20 rounded px-2 py-1 flex justify-between gap-2"
                >
                  <span className="truncate">
                    {players[pid]?.name ?? "?"}
                  </span>
                  <span className="font-bold whitespace-nowrap">
                    {formatPerPlayer(challenge, v)}
                  </span>
                </div>
              ))}
          </div>
        )}
      {challenge === "trivia" &&
        triviaQuestions &&
        triviaQuestions.length > 0 &&
        entry.triviaAnswers && (
          <div className="mt-2 flex flex-wrap gap-1">
            {triviaQuestions.map((q, i) => {
              const picked = entry.triviaAnswers?.[q.id];
              const correct = picked === q.correctIndex;
              const unanswered = picked === undefined;
              return (
                <span
                  key={q.id}
                  title={q.prompt}
                  className={`text-[10px] tabular-nums px-2 py-1 rounded font-bold ${
                    unanswered
                      ? "bg-black/30 opacity-60"
                      : correct
                        ? "bg-accent-green/30 text-white"
                        : "bg-accent-pink/20"
                  }`}
                >
                  Q{i + 1}{" "}
                  {unanswered ? "—" : correct ? "✓" : "✗"}
                </span>
              );
            })}
          </div>
        )}
    </div>
  );
}
