"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useEventBootstrap } from "@/lib/store/bootstrap";
import { useToastyStore } from "@/lib/store";
import { normalizeEventCode } from "@/lib/utils/code";

export default function DonePage() {
  const params = useParams<{ code: string }>();
  const code = normalizeEventCode(params?.code ?? "");

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !code) return;
    const id = localStorage.getItem(`toasty-player-id-${code}`);
    setMyPlayerId(id);
  }, [code]);

  useEventBootstrap(code, myPlayerId);

  const event = useToastyStore((s) => s.event);
  const standings = useToastyStore((s) => s.getStandings());
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const teams = useToastyStore((s) => s.teams);
  const progressMap = useToastyStore((s) => s.progress);
  const players = useToastyStore((s) => s.players);

  const winnerTeamId = event?.winnerTeamId ?? standings[0]?.team.id ?? null;
  const won = !!myTeamId && myTeamId === winnerTeamId;

  const winnerTeam = winnerTeamId ? teams[winnerTeamId] : null;

  const northBreakdown = useMemo(() => {
    const out: Array<{
      team: string;
      emoji: string;
      guesses: Array<{ name: string; err: number }>;
      total: number;
    }> = [];
    for (const team of Object.values(teams)) {
      const guesses = progressMap[team.id]?.north?.guesses ?? [];
      const annotated = guesses.map((g) => ({
        name: players[g.playerId]?.name ?? "?",
        err: g.errorDeg,
      }));
      const total = guesses.reduce((s, g) => s + g.errorDeg, 0);
      out.push({ team: team.name, emoji: team.emoji, guesses: annotated, total });
    }
    return out.sort((a, b) => a.total - b.total);
  }, [teams, progressMap, players]);

  return (
    <main className="min-h-screen flex flex-col p-5 safe-top safe-bottom">
      <div className="text-center my-6">
        <div className="text-7xl mb-3">{won ? "🏆" : "🍕"}</div>
        <div className="font-display text-4xl font-extrabold tracking-wider">
          {won ? "YOU WIN" : "YOU LOST"}
        </div>
        <div className="text-xs uppercase tracking-widest opacity-70 mt-2">
          {won
            ? "drinks are on someone else"
            : winnerTeam
              ? `${winnerTeam.emoji} ${winnerTeam.name.toUpperCase()} took it`
              : "a winner has been crowned"}
        </div>
      </div>

      <div className="rounded-2xl bg-bg-card p-4 mb-4">
        <div className="text-[10px] uppercase tracking-widest opacity-60 mb-2 font-bold">
          final standings
        </div>
        {standings.map((row, i) => {
          const medals = ["🥇", "🥈", "🥉"];
          const isMine = row.team.id === myTeamId;
          return (
            <div
              key={row.team.id}
              className={`flex justify-between items-center py-2 border-b border-bg-deep/40 last:border-0 ${
                isMine ? "text-accent-orange font-extrabold" : ""
              }`}
            >
              <span className="truncate">
                {medals[i] ?? "·"} {row.team.emoji} {row.team.name}
                {isMine ? " (us)" : ""}
              </span>
              <span className="tabular-nums font-bold">
                {row.completedCount} done
              </span>
            </div>
          );
        })}
      </div>

      {northBreakdown.some((t) => t.guesses.length > 0) && (
        <div className="rounded-2xl bg-bg-card p-4 mb-4">
          <div className="text-[10px] uppercase tracking-widest opacity-60 mb-2 font-bold">
            🧭 due north tiebreaker
          </div>
          {northBreakdown.map((t) => (
            <div key={t.team} className="py-2 border-b border-bg-deep/40 last:border-0">
              <div className="flex justify-between items-center">
                <span className="font-bold">
                  {t.emoji} {t.team}
                </span>
                <span className="tabular-nums text-accent-orange font-extrabold">
                  {t.total.toFixed(0)}° total err
                </span>
              </div>
              {t.guesses.length > 0 && (
                <div className="text-xs opacity-70 mt-1 flex gap-2 flex-wrap">
                  {t.guesses.map((g, i) => (
                    <span key={i}>
                      {g.name}: {g.err.toFixed(0)}°
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-col items-center gap-3 pb-4">
        <Link
          href={`/e/${code}/play`}
          className="text-xs opacity-60 underline"
        >
          back to dashboard
        </Link>
        <Link
          href="/"
          className="px-6 py-3 rounded-2xl bg-gradient-party font-extrabold text-sm tracking-widest"
        >
          HOME
        </Link>
      </div>
    </main>
  );
}
