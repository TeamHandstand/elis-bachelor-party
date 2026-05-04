"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useEventBootstrap } from "@/lib/store/bootstrap";
import { useToastyStore } from "@/lib/store";
import { useRoundStandings } from "@/lib/store/selectors";
import { CHALLENGES, enabledChallengeOrder } from "@/lib/challenges";
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
  const standings = useRoundStandings();
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const teams = useToastyStore((s) => s.teams);

  const winnerTeamId = event?.winnerTeamId ?? standings[0]?.team.id ?? null;
  const won = !!myTeamId && myTeamId === winnerTeamId;
  const winnerTeam = winnerTeamId ? teams[winnerTeamId] : null;

  const order = event ? enabledChallengeOrder(event.challenges) : [];
  const winners = event?.roundWinners ?? [];

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
                {row.wins} {row.wins === 1 ? "win" : "wins"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl bg-bg-card p-4 mb-4">
        <div className="text-[10px] uppercase tracking-widest opacity-60 mb-2 font-bold">
          round-by-round
        </div>
        {order.map((id, idx) => {
          const def = CHALLENGES[id];
          const w = winners[idx];
          const winningTeam = w ? teams[w.teamId] : null;
          return (
            <div
              key={id}
              className="flex items-center gap-3 py-2 border-b border-bg-deep/40 last:border-0"
            >
              <div className="font-display font-extrabold text-sm opacity-60 w-6 text-center tabular-nums">
                {idx + 1}
              </div>
              <div className="text-2xl">{def.emoji}</div>
              <div className="flex-1 truncate font-bold">{def.label}</div>
              <div className="text-sm">
                {winningTeam ? (
                  <>
                    🥇 {winningTeam.emoji} {winningTeam.name}
                  </>
                ) : (
                  <span className="opacity-40">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col items-center gap-3 pb-4">
        <Link
          href={`/e/${code}/play`}
          className="text-xs opacity-60 underline"
        >
          back to journey
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
