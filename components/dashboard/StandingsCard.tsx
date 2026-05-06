"use client";

import { useToastyStore } from "@/lib/store";
import { useRoundStandings } from "@/lib/store/selectors";
import { formatPoints } from "@/lib/scoring";
import { ScoringExplainer } from "@/components/play/ScoringExplainer";

const MEDALS = ["🥇", "🥈", "🥉"];

export function StandingsCard() {
  const standings = useRoundStandings();
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const event = useToastyStore((s) => s.event);

  if (!event || standings.length === 0) return null;

  const totalRounds = event.rounds.length;
  const decidedCount = event.roundWinners.length;

  return (
    <div className="rounded-2xl bg-bg-card p-3 mt-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[10px] uppercase tracking-widest opacity-60 font-bold">
          Standings · {decidedCount}/{totalRounds} rounds
        </div>
        <ScoringExplainer teamCount={standings.length} />
      </div>
      {standings.map((row, i) => {
        const isMe = row.team.id === myTeamId;
        return (
          <div
            key={row.team.id}
            className={`flex justify-between items-center py-1 text-sm ${
              isMe ? "text-accent-orange font-extrabold" : ""
            }`}
          >
            <span className="truncate">
              {MEDALS[i] ?? "·"} {row.team.emoji} {row.team.name}
              {isMe ? " (us)" : ""}
            </span>
            <span className="font-bold tabular-nums">
              {formatPoints(row.points)}{" "}
              {row.points === 1 ? "pt" : "pts"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
