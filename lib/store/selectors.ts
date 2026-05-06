"use client";
import { useMemo } from "react";
import { useToastyStore } from "./index";
import type { Player, Team } from "@/lib/types";
import { computeEventStandings, type EventStanding } from "@/lib/scoring";

/**
 * Memoized standings: ordered list of teams by completed-round count, with
 * a north-error tiebreaker when one of the rounds was Due North. Recomputes
 * only when teams / progress / event change.
 */
export interface Standing {
  team: Team;
  completedCount: number;
  northErrSum: number;
}

export function useStandings(): Standing[] {
  const teams = useToastyStore((s) => s.teams);
  const progress = useToastyStore((s) => s.progress);
  const event = useToastyStore((s) => s.event);

  return useMemo(() => {
    if (!event) return [];
    const rounds = event.rounds;
    return Object.values(teams)
      .map((team) => {
        const tp = progress[team.id];
        let completedCount = 0;
        let northErrSum = 0;
        for (let idx = 0; idx < rounds.length; idx++) {
          if (rounds[idx].challenge === "punishment") continue;
          const cell = tp?.[idx];
          if (cell?.completed) completedCount += 1;
          if (rounds[idx].challenge === "north") {
            northErrSum += (cell?.guesses ?? []).reduce(
              (s, g) => s + g.errorDeg,
              0,
            );
          }
        }
        return { team, completedCount, northErrSum };
      })
      .sort((a, b) => {
        if (b.completedCount !== a.completedCount) return b.completedCount - a.completedCount;
        return a.northErrSum - b.northErrSum;
      });
  }, [teams, progress, event]);
}

/**
 * Memoized teammates: players on my team. Stable across renders unless players or myTeamId change.
 */
export function useTeammates(): Player[] {
  const players = useToastyStore((s) => s.players);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  return useMemo(() => {
    if (!myTeamId) return [];
    return Object.values(players).filter((p) => p.teamId === myTeamId);
  }, [players, myTeamId]);
}

/**
 * Memoized publisher: stable function reference per `code`. Avoids
 * tearing down sensor effects on every render due to changing publisher refs.
 */
import { getPubNubClient, publishToEvent } from "@/lib/pubnub/client";
import { getOrCreateDeviceId } from "@/lib/utils/device";
import type { ProgressMsg } from "@/lib/types";

export function useStablePublisher(code: string): (msg: ProgressMsg) => Promise<void> {
  return useMemo(() => {
    return async (msg: ProgressMsg) => {
      const deviceId = getOrCreateDeviceId();
      const client = getPubNubClient(deviceId);
      await publishToEvent(client, code, msg);
    };
  }, [code]);
}

export type RoundStanding = EventStanding;

/**
 * Olympic-style standings: every team earns points each decided round based
 * on where it finished — N points for 1st, N-1 for 2nd, …, 1 for last.
 * Ties share the average of their tied positions' points; the host-decided
 * round winner is pinned to rank 1. Sorted by total points desc, then wins,
 * then team name as a stable tiebreaker.
 */
export function useRoundStandings(): RoundStanding[] {
  const teams = useToastyStore((s) => s.teams);
  const progress = useToastyStore((s) => s.progress);
  const event = useToastyStore((s) => s.event);

  return useMemo(() => {
    if (!event) return [];
    return computeEventStandings(
      Object.values(teams),
      event.rounds,
      event.roundWinners ?? [],
      progress,
    );
  }, [teams, progress, event]);
}

/**
 * Lookup: roundIndex -> winning team id. Stable identity across renders if
 * roundWinners hasn't changed.
 */
export function useRoundWinnerByIndex(): Record<number, string> {
  const event = useToastyStore((s) => s.event);
  return useMemo(() => {
    const out: Record<number, string> = {};
    (event?.roundWinners ?? []).forEach((w, idx) => {
      out[idx] = w.teamId;
    });
    return out;
  }, [event]);
}
