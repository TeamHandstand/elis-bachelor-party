import type {
  ChallengeId,
  ChallengeProgress,
  RoundConfig,
  Team,
  TeamProgress,
} from "@/lib/types";

// Per-team payload needed to rank a single round. Mirrors the bits of
// ChallengeProgress that any of the per-challenge tiebreakers care about.
export interface RankInput {
  team: Team;
  value: number;
  completedAt: number | null;
  guesses: Array<{ playerId: string; errorDeg: number }>;
}

export interface RoundRanking {
  team: Team;
  // 1-indexed position (winner = 1). Tied teams get the same rank — the
  // next group's rank skips ahead, like Olympic ties.
  rank: number;
  // Points earned this round. Tied teams share the average of their tied
  // positions; non-ties just get N - position + 1.
  points: number;
  // True iff this entry is the host-decided round winner pinned to rank 1.
  isWinner: boolean;
}

/**
 * Compare two ranking inputs for a single challenge. Returns negative if `a`
 * is "better" (should come first). Identical to the sort logic that lives in
 * RoundResults / RoundBreakdown — kept here as the single source of truth.
 */
export function compareForChallenge(
  challenge: ChallengeId,
  a: RankInput,
  b: RankInput,
): number {
  if (challenge === "north" || challenge === "time-guess") {
    const ag = a.guesses.length;
    const bg = b.guesses.length;
    if ((ag > 0) !== (bg > 0)) return ag > 0 ? -1 : 1;
    if (ag === 0 && bg === 0) return 0;
    const aAvg = a.guesses.reduce((s, g) => s + g.errorDeg, 0) / ag;
    const bAvg = b.guesses.reduce((s, g) => s + g.errorDeg, 0) / bg;
    return aAvg - bAvg;
  }
  if (challenge === "trivia") {
    const aDone = a.completedAt !== null;
    const bDone = b.completedAt !== null;
    if (aDone !== bDone) return aDone ? -1 : 1;
    if (a.value !== b.value) return b.value - a.value;
    return (a.completedAt ?? Infinity) - (b.completedAt ?? Infinity);
  }
  // Default (taps/steps/distance/spin/scream/shake): finished beats DNF;
  // earliest completion wins; among DNFs, higher value wins.
  const aDone = a.completedAt !== null;
  const bDone = b.completedAt !== null;
  if (aDone !== bDone) return aDone ? -1 : 1;
  if (aDone && bDone) {
    return (a.completedAt ?? Infinity) - (b.completedAt ?? Infinity);
  }
  return b.value - a.value;
}

/**
 * Sort entries for display. Identical contract to compareForChallenge but
 * also pins `winnerTeamId` to position 0 (overrides the metric — the host
 * can pick any team as the round winner).
 */
export function sortRankInputs(
  challenge: ChallengeId,
  entries: RankInput[],
  winnerTeamId: string | null = null,
): RankInput[] {
  const sorted = [...entries].sort((a, b) =>
    compareForChallenge(challenge, a, b),
  );
  if (!winnerTeamId) return sorted;
  const idx = sorted.findIndex((e) => e.team.id === winnerTeamId);
  if (idx <= 0) return sorted;
  const [winner] = sorted.splice(idx, 1);
  return [winner, ...sorted];
}

/**
 * Build RankInput entries from a team list + progress map for a given round.
 */
export function buildRankInputs(
  teams: Team[],
  progressByTeam: Record<string, TeamProgress>,
  roundIndex: number,
): RankInput[] {
  return teams.map((team) => {
    const cell: ChallengeProgress | undefined =
      progressByTeam[team.id]?.[roundIndex];
    return {
      team,
      value: cell?.value ?? 0,
      completedAt: cell?.completedAt ?? null,
      guesses: cell?.guesses ?? [],
    };
  });
}

/**
 * Score one round for every team. Awards N points to 1st, N-1 to 2nd, …,
 * 1 to last. Tied teams share the average of their tied positions' points.
 * The host-decided winner (if any) is pinned to rank 1 with full N points;
 * ties are then computed only among the remaining teams.
 */
export function rankRound(
  challenge: ChallengeId,
  entries: RankInput[],
  winnerTeamId: string | null = null,
): RoundRanking[] {
  const N = entries.length;
  if (N === 0) return [];

  const out: RoundRanking[] = [];
  let rest: RankInput[];

  // Step 1: pin the host-picked winner to rank 1, full N points.
  let pinnedWinner: RankInput | null = null;
  if (winnerTeamId) {
    const idx = entries.findIndex((e) => e.team.id === winnerTeamId);
    if (idx >= 0) pinnedWinner = entries[idx];
  }

  if (pinnedWinner) {
    out.push({
      team: pinnedWinner.team,
      rank: 1,
      points: N,
      isWinner: true,
    });
    rest = entries.filter((e) => e.team.id !== pinnedWinner!.team.id);
  } else {
    rest = [...entries];
  }

  // Step 2: rank the remaining teams. Group adjacent ties from the comparator
  // and award each tied group the average of its tied positions' points.
  rest.sort((a, b) => compareForChallenge(challenge, a, b));

  let pos = pinnedWinner ? 2 : 1; // next available rank
  let i = 0;
  while (i < rest.length) {
    let j = i + 1;
    while (
      j < rest.length &&
      compareForChallenge(challenge, rest[i], rest[j]) === 0
    ) {
      j++;
    }
    const groupSize = j - i;
    // Points for positions pos, pos+1, …, pos+groupSize-1 are
    // N - pos + 1, N - pos, …, N - (pos+groupSize-1) + 1.
    let sum = 0;
    for (let k = 0; k < groupSize; k++) sum += N - (pos + k) + 1;
    const avg = sum / groupSize;
    for (let k = 0; k < groupSize; k++) {
      out.push({
        team: rest[i + k].team,
        rank: pos,
        points: avg,
        isWinner: false,
      });
    }
    pos += groupSize;
    i = j;
  }

  return out;
}

export interface EventStanding {
  team: Team;
  // Total points across decided rounds.
  points: number;
  // How many rounds this team won outright (rank 1, host-decided).
  wins: number;
  // Round indices where this team won.
  wonRounds: number[];
}

/**
 * Aggregate points across every decided round of an event. Undecided / future
 * rounds contribute nothing.
 */
export function computeEventStandings(
  teams: Team[],
  rounds: RoundConfig[],
  roundWinners: Array<{ teamId: string }>,
  progressByTeam: Record<string, TeamProgress>,
): EventStanding[] {
  const pointsByTeam = new Map<string, number>();
  const winsByTeam = new Map<string, number[]>();
  for (const t of teams) {
    pointsByTeam.set(t.id, 0);
    winsByTeam.set(t.id, []);
  }

  for (let idx = 0; idx < roundWinners.length; idx++) {
    const round = rounds[idx];
    if (!round) continue;
    // Punishment rounds are non-scoring — they get a winner entry to mark
    // them decided, but contribute zero points and don't affect rank.
    if (round.challenge === "punishment") continue;
    const winnerTeamId = roundWinners[idx]?.teamId ?? null;
    const inputs = buildRankInputs(teams, progressByTeam, idx);
    const ranked = rankRound(round.challenge, inputs, winnerTeamId);
    for (const r of ranked) {
      pointsByTeam.set(
        r.team.id,
        (pointsByTeam.get(r.team.id) ?? 0) + r.points,
      );
      if (r.isWinner) {
        const arr = winsByTeam.get(r.team.id) ?? [];
        arr.push(idx);
        winsByTeam.set(r.team.id, arr);
      }
    }
  }

  return teams
    .map((team) => ({
      team,
      points: pointsByTeam.get(team.id) ?? 0,
      wins: (winsByTeam.get(team.id) ?? []).length,
      wonRounds: winsByTeam.get(team.id) ?? [],
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.team.name.localeCompare(b.team.name);
    });
}

/**
 * Format a points value for compact display. Renders integers without a
 * decimal and tied averages with a single decimal.
 */
export function formatPoints(points: number): string {
  if (Number.isInteger(points)) return points.toString();
  return points.toFixed(1);
}
