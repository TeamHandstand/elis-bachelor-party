"use client";
import { useEventBootstrap } from "@/lib/store/bootstrap";
import { useToastyStore } from "@/lib/store";
import { useRoundStandings } from "@/lib/store/selectors";
import { CHALLENGES, CHALLENGE_ORDER } from "@/lib/challenges";
import type { ChallengeId, Player, Team, TeamProgress } from "@/lib/types";

interface Props {
  code: string;
}

export default function HostMonitor({ code }: Props) {
  // Spectator subscribe.
  useEventBootstrap(code, null);

  const event = useToastyStore((s) => s.event);
  const teams = useToastyStore((s) => s.teams);
  const players = useToastyStore((s) => s.players);
  const progress = useToastyStore((s) => s.progress);
  const standings = useRoundStandings();

  if (!event) {
    return (
      <div className="bg-bg-card rounded-xl2 p-8 text-center opacity-70">
        Connecting to event channel…
      </div>
    );
  }

  const enabled = CHALLENGE_ORDER.filter((id) => event.challenges[id]?.enabled);

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="font-display text-xl font-bold">📡 Live monitor</h2>
        <div className="text-xs opacity-60">
          Status:{" "}
          <span
            className={
              event.status === "active"
                ? "text-accent-green font-bold"
                : event.status === "finished"
                  ? "text-accent-orange font-bold"
                  : "opacity-80"
            }
          >
            {event.status}
          </span>
          {event.winnerTeamId
            ? ` — winner: ${teams[event.winnerTeamId]?.name ?? "?"}`
            : ""}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {standings.map((row, idx) => {
          const teamPlayers = Object.values(players).filter(
            (p) => p.teamId === row.team.id
          );
          const tp = progress[row.team.id];
          const place = idx + 1;
          return (
            <TeamMonitorCard
              key={row.team.id}
              team={row.team}
              players={teamPlayers}
              progress={tp}
              enabled={enabled}
              thresholds={event.challenges}
              wins={row.wins}
              totalRounds={enabled.length}
              place={place}
            />
          );
        })}
      </div>
    </section>
  );
}

function TeamMonitorCard({
  team,
  players,
  progress,
  enabled,
  thresholds,
  wins,
  totalRounds,
  place,
}: {
  team: Team;
  players: Player[];
  progress: TeamProgress | undefined;
  enabled: ChallengeId[];
  thresholds: Record<ChallengeId, { enabled: boolean; threshold: number }>;
  wins: number;
  totalRounds: number;
  place: number;
}) {
  return (
    <div className="bg-bg-card rounded-xl2 p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="text-3xl">{team.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-extrabold truncate">
            {team.name}
          </div>
          <div className="text-xs opacity-60 truncate">
            {players.map((p) => p.name).join(" · ") || "no players"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs opacity-50 uppercase tracking-wide">
            {place === 1 ? "🥇 1st" : place === 2 ? "🥈 2nd" : "🥉 3rd"}
          </div>
          <div className="font-display text-2xl font-extrabold">
            {wins} <span className="text-xs opacity-60">/ {totalRounds}</span>
          </div>
          <div className="text-[10px] opacity-50 uppercase tracking-wide">
            round wins
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {CHALLENGE_ORDER.map((id) => {
          const def = CHALLENGES[id];
          const isEnabled = enabled.includes(id);
          const cur = progress?.[id];
          const completed = cur?.completed ?? false;
          const threshold = thresholds[id]?.threshold ?? def.defaultThreshold;
          const valueStr = cur ? def.formatProgress(cur.value, threshold) : "—";
          return (
            <div
              key={id}
              className={`rounded-xl p-2 border text-xs ${
                !isEnabled
                  ? "border-white/5 bg-black/20 opacity-40"
                  : completed
                    ? "border-transparent bg-gradient-done text-white"
                    : "border-white/10 bg-bg-deep"
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="text-base">{def.emoji}</span>
                <span className="font-bold truncate">{def.label}</span>
              </div>
              <div className="opacity-90 mt-1 tabular-nums">
                {!isEnabled ? "disabled" : completed ? "✅ DONE" : valueStr}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
