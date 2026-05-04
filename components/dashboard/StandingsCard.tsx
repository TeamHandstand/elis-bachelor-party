"use client";

import { useToastyStore } from "@/lib/store";

const MEDALS = ["🥇", "🥈", "🥉"];

export function StandingsCard() {
  const standings = useToastyStore((s) => s.getStandings());
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const event = useToastyStore((s) => s.event);

  if (!event || standings.length === 0) return null;

  const totalEnabled = Object.values(event.challenges).filter((c) => c.enabled).length;

  return (
    <div className="rounded-2xl bg-bg-card p-3 mt-3">
      <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1 font-bold">
        Standings
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
              {row.completedCount}/{totalEnabled}
            </span>
          </div>
        );
      })}
    </div>
  );
}
