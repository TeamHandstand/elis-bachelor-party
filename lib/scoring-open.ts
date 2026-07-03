// Open Play scoring — player-keyed placement points. Mirrors the averaged-tie
// algorithm in lib/scoring.ts (rankRound), but ranks PLAYERS per single-attempt
// game instead of teams per round, and awards 0 to anyone who didn't play a
// given game. Kept separate so the battle-tested team scoring stays untouched.

import type { Player } from "@/lib/types";

export { formatPoints } from "@/lib/scoring";

export interface OpenScoreEntry {
  playerId: string;
  score: number;
}

export interface OpenGameRanking {
  playerId: string;
  rank: number; // 1-indexed position on the game's leaderboard
  points: number; // placement points (N..1 among players, averaged ties)
  score: number;
}

/**
 * Rank the players who played one game and award placement points.
 *
 * Only players present in `scores` are ranked. 1st place gets N points, 2nd
 * N-1, …, where **N = totalPlayers** (everyone who joined the event — per the
 * product spec, not just those who played this game). Adjacent ties share the
 * average of their tied positions' points. Players who didn't play aren't
 * returned here; they contribute 0 for this game in the standings.
 */
export function rankOpenGame(
  scores: OpenScoreEntry[],
  direction: "higher" | "lower",
  totalPlayers: number,
): OpenGameRanking[] {
  const N = totalPlayers;
  const sorted = [...scores].sort((a, b) =>
    direction === "higher" ? b.score - a.score : a.score - b.score,
  );

  const out: OpenGameRanking[] = [];
  let pos = 1; // next available 1-indexed position
  let i = 0;
  while (i < sorted.length) {
    // Group adjacent ties (identical score).
    let j = i + 1;
    while (j < sorted.length && sorted[j].score === sorted[i].score) j++;
    const groupSize = j - i;
    // Points for positions pos … pos+groupSize-1 are
    // N-pos+1, N-pos, …, N-(pos+groupSize-1)+1. Tied players share the average.
    let sum = 0;
    for (let k = 0; k < groupSize; k++) sum += N - (pos + k) + 1;
    const avg = sum / groupSize;
    for (let k = 0; k < groupSize; k++) {
      out.push({
        playerId: sorted[i + k].playerId,
        rank: pos,
        points: Math.max(0, avg),
        score: sorted[i + k].score,
      });
    }
    pos += groupSize;
    i = j;
  }
  return out;
}

export interface OpenStanding {
  player: Player;
  points: number;
  gamesPlayed: number;
}

/**
 * Aggregate placement points across every game to build the game-wide
 * leaderboard. `scoresByGame` maps gameId → the entries for that game;
 * `directions` maps gameId → ranking direction. Non-players score 0 in any
 * game they skipped. Sorted by points, then games played, then name.
 */
export function computeOpenStandings(
  players: Player[],
  scoresByGame: Record<string, OpenScoreEntry[]>,
  directions: Record<string, "higher" | "lower">,
): OpenStanding[] {
  const totalPlayers = players.length;
  const pointsByPlayer = new Map<string, number>();
  const gamesByPlayer = new Map<string, number>();
  for (const p of players) {
    pointsByPlayer.set(p.id, 0);
    gamesByPlayer.set(p.id, 0);
  }

  for (const [gameId, scores] of Object.entries(scoresByGame)) {
    const direction = directions[gameId] ?? "higher";
    const ranked = rankOpenGame(scores, direction, totalPlayers);
    for (const r of ranked) {
      // Ignore scores from players no longer on the roster (deleted).
      if (!pointsByPlayer.has(r.playerId)) continue;
      pointsByPlayer.set(r.playerId, (pointsByPlayer.get(r.playerId) ?? 0) + r.points);
      gamesByPlayer.set(r.playerId, (gamesByPlayer.get(r.playerId) ?? 0) + 1);
    }
  }

  return players
    .map((player) => ({
      player,
      points: pointsByPlayer.get(player.id) ?? 0,
      gamesPlayed: gamesByPlayer.get(player.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
      return a.player.name.localeCompare(b.player.name);
    });
}
