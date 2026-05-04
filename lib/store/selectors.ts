"use client";
import { useMemo } from "react";
import { useToastyStore } from "./index";
import { CHALLENGE_ORDER } from "@/lib/challenges";
import type { Player, Team } from "@/lib/types";

/**
 * Memoized standings: ordered list of teams by completion + tiebreaker (north error sum).
 * Recomputes only when teams / progress / event change.
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
    const enabled = CHALLENGE_ORDER.filter((id) => event.challenges[id]?.enabled);
    return Object.values(teams)
      .map((team) => {
        const tp = progress[team.id];
        const completedCount = tp ? enabled.filter((id) => tp[id]?.completed).length : 0;
        const northErrSum = tp?.north?.guesses?.reduce((sum, g) => sum + g.errorDeg, 0) ?? 0;
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
