"use client";

import { useToastyStore } from "@/lib/store";
import { CHALLENGE_ORDER } from "@/lib/challenges";

const PLACE_LABELS = ["1st", "2nd", "3rd", "4th", "5th"];

export function TeamHeader() {
  const team = useToastyStore((s) => s.getMyTeam());
  const event = useToastyStore((s) => s.event);
  const standings = useToastyStore((s) => s.getStandings());
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());

  if (!team || !event) {
    return (
      <div className="rounded-2xl bg-gradient-party p-4 text-center">
        <div className="font-display text-xl font-extrabold tracking-wider">
          NO TEAM YET
        </div>
        <div className="text-xs opacity-90 mt-1">Host hasn’t put you on a squad</div>
      </div>
    );
  }

  const placeIdx = standings.findIndex((s) => s.team.id === team.id);
  const place = placeIdx >= 0 ? PLACE_LABELS[placeIdx] ?? `${placeIdx + 1}th` : "—";
  const enabled = CHALLENGE_ORDER.filter((id) => event.challenges[id]?.enabled);
  const doneCount = myProgress
    ? enabled.filter((id) => myProgress[id]?.completed).length
    : 0;

  return (
    <div className="rounded-2xl bg-gradient-party p-4 text-center shadow-lg">
      <div className="font-display text-2xl font-extrabold tracking-wider drop-shadow">
        {team.emoji} {team.name.toUpperCase()}
      </div>
      <div className="text-xs uppercase tracking-widest opacity-95 mt-1 font-bold">
        {place} place · {doneCount} of {enabled.length} done
      </div>
    </div>
  );
}
