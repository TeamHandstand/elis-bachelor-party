"use client";
import { useEventBootstrap } from "@/lib/store/bootstrap";
import { useToastyStore } from "@/lib/store";
import { useRoundStandings } from "@/lib/store/selectors";
import { CHALLENGES } from "@/lib/challenges";
import { formatPoints } from "@/lib/scoring";
import { ScoringExplainer } from "@/components/play/ScoringExplainer";
import type {
  Player,
  RoundConfig,
  Team,
  TeamProgress,
} from "@/lib/types";

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

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="font-display text-xl font-bold">📡 Live monitor</h2>
        <div className="flex items-center gap-2 text-xs opacity-60">
          <span>
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
          </span>
          <ScoringExplainer teamCount={standings.length} />
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
              rounds={event.rounds}
              points={row.points}
              wins={row.wins}
              totalRounds={event.rounds.length}
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
  rounds,
  points,
  wins,
  totalRounds,
  place,
}: {
  team: Team;
  players: Player[];
  progress: TeamProgress | undefined;
  rounds: RoundConfig[];
  points: number;
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
            {place === 1
              ? "🥇 1st"
              : place === 2
                ? "🥈 2nd"
                : place === 3
                  ? "🥉 3rd"
                  : `#${place}`}
          </div>
          <div className="font-display text-2xl font-extrabold tabular-nums">
            {formatPoints(points)}
          </div>
          <div className="text-[10px] opacity-50 uppercase tracking-wide">
            pts · {wins} {wins === 1 ? "win" : "wins"} / {totalRounds}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {rounds.length === 0 ? (
          <div className="col-span-2 text-xs opacity-50 italic py-4 text-center">
            no rounds configured
          </div>
        ) : null}
        {rounds.map((r, idx) => {
          const def = CHALLENGES[r.challenge];
          const cur = progress?.[idx];
          const completed = cur?.completed ?? false;
          const threshold = r.threshold ?? def.defaultThreshold;
          // For Due North, surface guesses-in / total instead of "0 / 0".
          const valueStr = cur
            ? r.challenge === "north"
              ? `${(cur.guesses ?? []).length} guesses in`
              : def.formatProgress(cur.value, threshold)
            : "—";
          return (
            <div
              key={`${idx}-${r.challenge}`}
              className={`rounded-xl p-2 border text-xs ${
                completed
                  ? "border-transparent bg-gradient-done text-white"
                  : "border-white/10 bg-bg-deep"
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="text-[10px] opacity-60 font-bold tabular-nums">
                  {idx + 1}.
                </span>
                <span className="text-base">{def.emoji}</span>
                <span className="font-bold truncate">{def.label}</span>
              </div>
              <div className="opacity-90 mt-1 tabular-nums">
                {completed ? "✅ DONE" : valueStr}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
