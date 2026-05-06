import { headers } from "next/headers";
import Link from "next/link";
import type { ResultsResponse } from "@/lib/api/contract";
import { CHALLENGES } from "@/lib/challenges";
import {
  computeEventStandings,
  formatPoints,
} from "@/lib/scoring";
import type { TeamProgress } from "@/lib/types";

async function fetchResults(code: string): Promise<ResultsResponse | null> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const cookie = h.get("cookie") ?? "";
  try {
    const res = await fetch(`${proto}://${host}/api/events/${code}/results`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ResultsResponse;
  } catch {
    return null;
  }
}

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function ResultsPage({ params }: PageProps) {
  const { code } = await params;
  const data = await fetchResults(code);
  if (!data) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-3">🤔</div>
        <h1 className="font-display text-2xl font-bold mb-2">
          No results yet
        </h1>
        <p className="opacity-60 mb-4">
          Either the event hasn’t finished or code{" "}
          <span className="font-mono">{code}</span> wasn’t found.
        </p>
        <Link href={`/host/${code}`} className="underline opacity-80">
          Back to event dashboard
        </Link>
      </main>
    );
  }

  const { event, teams, players, finalProgress } = data;
  const rounds = event.rounds;

  // Build [teamId][roundIndex] -> cell
  type Cell = (typeof finalProgress)[number];
  const matrix: Record<string, Record<number, Cell>> = {};
  for (const row of finalProgress) {
    matrix[row.teamId] ??= {};
    matrix[row.teamId][row.roundIndex] = row;
  }

  // Olympic-style point ranking — points awarded each round by finish
  // position. Build a per-team progress map from finalProgress so the
  // shared scoring utility can run server-side.
  const winnersByRound = event.roundWinners ?? [];
  const progressByTeam: Record<string, TeamProgress> = {};
  for (const row of finalProgress) {
    progressByTeam[row.teamId] ??= {};
    progressByTeam[row.teamId][row.roundIndex] = {
      value: row.value,
      completed: row.completed,
      completedAt: row.completedAt
        ? new Date(row.completedAt).getTime()
        : null,
    };
  }
  const standings = computeEventStandings(
    teams,
    rounds,
    winnersByRound,
    progressByTeam,
  );

  const winner =
    teams.find((t) => t.id === event.winnerTeamId) ??
    standings[0]?.team ??
    null;

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center">
          <Link
            href={`/host/${code}`}
            className="text-xs opacity-60 hover:opacity-100"
          >
            ← Back to dashboard
          </Link>
          <div className="mt-4 mb-3 text-7xl">🏆</div>
          {winner ? (
            <div>
              <div className="text-sm uppercase tracking-[0.3em] opacity-60">
                Champion
              </div>
              <h1 className="font-display text-5xl sm:text-7xl font-extrabold mt-2 bg-gradient-party bg-clip-text text-transparent">
                {winner.emoji} {winner.name.toUpperCase()} WINS
              </h1>
              <p className="mt-3 opacity-70">
                {event.title || "Toasty Pizza"} · code {event.code}
              </p>
            </div>
          ) : (
            <h1 className="font-display text-3xl font-bold">
              Race ended without a winner
            </h1>
          )}
        </div>

        <section className="bg-bg-card rounded-xl2 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-xl font-bold">
              🏁 Final standings
            </h2>
            <details className="text-xs opacity-70 cursor-pointer">
              <summary>How scoring works</summary>
              <div className="mt-2 max-w-sm bg-bg-deep/60 rounded-lg p-3">
                Each round, every team earns points based on finish position:{" "}
                <b>{teams.length}</b> pts for 1st, {teams.length - 1} for 2nd,
                … 1 pt for last. Tied teams share their tied positions evenly.
                Most total points wins; round wins is the tiebreaker.
              </div>
            </details>
          </div>
          <ol className="space-y-2">
            {standings.map((r, idx) => {
              const teamPlayers = players.filter((p) => p.teamId === r.team.id);
              return (
                <li
                  key={r.team.id}
                  className={`rounded-xl p-3 flex items-center gap-3 ${
                    idx === 0
                      ? "bg-gradient-done"
                      : "bg-bg-deep border border-white/10"
                  }`}
                >
                  <div className="text-2xl w-8 text-center">
                    {idx === 0
                      ? "🥇"
                      : idx === 1
                        ? "🥈"
                        : idx === 2
                          ? "🥉"
                          : `#${idx + 1}`}
                  </div>
                  <div className="text-3xl">{r.team.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-extrabold truncate">
                      {r.team.name}
                    </div>
                    <div className="text-xs opacity-80 truncate">
                      {teamPlayers.map((p) => p.name).join(" · ") ||
                        "no players"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs opacity-70">points</div>
                    <div className="font-display text-2xl font-extrabold tabular-nums">
                      {formatPoints(r.points)}
                    </div>
                    <div className="text-[10px] opacity-60 tabular-nums">
                      {r.wins} {r.wins === 1 ? "win" : "wins"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="bg-bg-card rounded-xl2 p-4">
          <h2 className="font-display text-xl font-bold mb-3">
            🏁 Round-by-round
          </h2>
          <ol className="space-y-2">
            {rounds.map((r, idx) => {
              const def = CHALLENGES[r.challenge];
              const w = winnersByRound[idx];
              const winningTeam = w ? teams.find((t) => t.id === w.teamId) : null;
              return (
                <li
                  key={`${idx}-${r.challenge}`}
                  className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0"
                >
                  <div className="font-display font-extrabold opacity-60 w-6 text-center tabular-nums">
                    {idx + 1}
                  </div>
                  <div className="text-2xl">{def.emoji}</div>
                  <div className="flex-1 truncate font-bold">{def.label}</div>
                  <div>
                    {winningTeam ? (
                      <span>
                        🥇 {winningTeam.emoji} {winningTeam.name}
                      </span>
                    ) : (
                      <span className="opacity-40">—</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="bg-bg-card rounded-xl2 p-4 overflow-x-auto">
          <h2 className="font-display text-xl font-bold mb-3">
            📊 Per-round breakdown
          </h2>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left opacity-60">
                <th className="px-2 py-2">Round</th>
                {teams.map((t) => (
                  <th key={t.id} className="px-2 py-2 whitespace-nowrap">
                    {t.emoji} {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rounds.map((r, idx) => {
                const def = CHALLENGES[r.challenge];
                const threshold = r.threshold ?? def.defaultThreshold;
                return (
                  <tr key={`${idx}-${r.challenge}`} className="border-t border-white/5">
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className="text-xs opacity-60 mr-1 tabular-nums">
                        {idx + 1}.
                      </span>
                      <span className="text-lg mr-1">{def.emoji}</span>
                      <span className="font-bold">{def.label}</span>
                    </td>
                    {teams.map((t) => {
                      const cell = matrix[t.id]?.[idx];
                      const value = cell?.value ?? 0;
                      const completed = cell?.completed ?? false;
                      return (
                        <td
                          key={t.id}
                          className={`px-2 py-2 whitespace-nowrap ${
                            completed
                              ? "text-accent-green font-bold"
                              : "opacity-80"
                          }`}
                        >
                          {completed ? "✅ " : ""}
                          {def.formatProgress(value, threshold)}
                          {cell?.completedAt ? (
                            <div className="text-[10px] opacity-50">
                              {new Date(cell.completedAt).toLocaleTimeString()}
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
