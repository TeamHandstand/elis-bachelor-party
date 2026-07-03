import { NextResponse } from "next/server";
import { getEventByCode, getOpenScores } from "@/lib/db/queries";
import { CHALLENGES, OPEN_GAMES, isOpenGame } from "@/lib/challenges";
import {
  computeOpenStandings,
  rankOpenGame,
  type OpenScoreEntry,
} from "@/lib/scoring-open";
import { normalizeEventCode } from "@/lib/utils/code";
import type { ChallengeId } from "@/lib/types";
import type {
  OpenGameLeaderboardRow,
  OpenLeaderboardResponse,
} from "@/lib/api/contract";

export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<OpenLeaderboardResponse | { error: string }>> {
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid event code" }, { status: 400 });
  }

  const [eventData, scores] = await Promise.all([
    getEventByCode(code),
    getOpenScores(code),
  ]);
  if (!eventData || !scores) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const { event, players } = eventData;
  const nameById = new Map(players.map((p) => [p.id, p.name]));

  // The configured, deduped list of open games for this event (in round order).
  const gameIds: ChallengeId[] = [];
  for (const r of event.rounds) {
    if (isOpenGame(r.challenge) && !gameIds.includes(r.challenge)) {
      gameIds.push(r.challenge);
    }
  }

  // Group scores by game, restricted to configured games.
  const scoresByGame: Record<string, OpenScoreEntry[]> = {};
  const directions: Record<string, "higher" | "lower"> = {};
  for (const gameId of gameIds) {
    scoresByGame[gameId] = [];
    directions[gameId] = OPEN_GAMES[gameId]?.direction ?? "higher";
  }
  for (const s of scores) {
    if (scoresByGame[s.gameId]) {
      scoresByGame[s.gameId].push({ playerId: s.playerId, score: s.score });
    }
  }

  const totalPlayers = players.length;

  const perGame: Record<string, OpenGameLeaderboardRow[]> = {};
  for (const gameId of gameIds) {
    const spec = OPEN_GAMES[gameId];
    const ranked = rankOpenGame(
      scoresByGame[gameId],
      directions[gameId],
      totalPlayers,
    );
    // rankOpenGame returns players in leaderboard order already.
    perGame[gameId] = ranked.map((r) => ({
      playerId: r.playerId,
      name: nameById.get(r.playerId) ?? "—",
      score: r.score,
      scoreLabel: spec ? spec.formatScore(r.score) : String(r.score),
      rank: r.rank,
      points: r.points,
    }));
  }

  const standings = computeOpenStandings(players, scoresByGame, directions);
  const global = standings.map((s) => ({
    playerId: s.player.id,
    name: s.player.name,
    points: s.points,
    gamesPlayed: s.gamesPlayed,
  }));

  const games = gameIds.map((gameId) => ({
    gameId,
    label: CHALLENGES[gameId].label,
    emoji: CHALLENGES[gameId].emoji,
  }));

  return NextResponse.json({ totalPlayers, games, global, perGame });
}
