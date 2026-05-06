"use client";

import type { Team } from "@/lib/types";
import { formatPoints } from "@/lib/scoring";

interface Props {
  winner: Team | null;
  myTeamId: string | null;
  totalRounds: number;
  pointsByTeamId: Record<string, number>;
}

/**
 * Front-and-center post-release reveal. Crowns the winning team huge with a
 * trophy and a clear YOU WON / YOU LOST callout for the viewing player.
 */
export function ChampionBanner({
  winner,
  myTeamId,
  totalRounds,
  pointsByTeamId,
}: Props) {
  const winnerPoints = winner ? pointsByTeamId[winner.id] ?? 0 : 0;
  const iWon = !!winner && !!myTeamId && winner.id === myTeamId;

  if (!winner) {
    return (
      <div className="rounded-3xl bg-bg-card border-2 border-white/10 p-6 text-center">
        <div className="text-6xl mb-2">🪙</div>
        <div className="font-display text-2xl font-extrabold tracking-widest">
          NO CHAMPION CROWNED
        </div>
        <div className="text-xs uppercase tracking-widest opacity-70 mt-2">
          host ended the event without a winner
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-3xl p-6 text-center text-white shadow-2xl ${
        iWon
          ? "bg-gradient-party shadow-accent-orange/40"
          : "bg-bg-card border-2 border-accent-orange/40"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.4em] opacity-90 mb-2 font-extrabold">
        🏆 the champions
      </div>
      <div
        className="text-7xl mb-1 leading-none drop-shadow-lg"
        aria-hidden
      >
        {winner.emoji}
      </div>
      <div className="font-display text-4xl sm:text-5xl font-extrabold tracking-wider leading-tight drop-shadow break-words">
        {winner.name.toUpperCase()}
      </div>
      <div className="text-sm uppercase tracking-widest opacity-90 mt-3 font-bold tabular-nums">
        {formatPoints(winnerPoints)} pts · {totalRounds}{" "}
        {totalRounds === 1 ? "round" : "rounds"}
      </div>

      <div className="mt-5">
        {iWon ? (
          <div className="inline-block px-4 py-2 rounded-full bg-black/30 text-white">
            <span className="font-display text-base font-extrabold tracking-widest">
              🎉 YOU WON 🎉
            </span>
          </div>
        ) : (
          <div className="inline-block px-4 py-2 rounded-full bg-accent-pink/20 border border-accent-pink/50 text-accent-pink">
            <span className="font-display text-base font-extrabold tracking-widest">
              💀 YOU LOST
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
