import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./client";
import {
  events,
  teams,
  players,
  finalProgress,
  type EventRow,
  type TeamRow,
  type PlayerRow,
  type FinalProgressRow,
} from "./schema";
import {
  defaultChallengeConfig,
  enabledChallengeOrder,
} from "@/lib/challenges";
import type {
  ChallengeId,
  EventConfig,
  EventStatus,
  Player,
  RoundStatus,
  RoundWinnerEntry,
  Team,
} from "@/lib/types";
import { generateEventCode } from "@/lib/utils/code";

// ----- Default team templates -----

const DEFAULT_TEAMS: Array<{ name: string; emoji: string; color: string }> = [
  { name: "Pepperoni", emoji: "🍕", color: "from-accent-pink to-accent-orange" },
  { name: "Margherita", emoji: "🌿", color: "from-accent-purple to-accent-blue" },
  { name: "Hawaiian", emoji: "🍍", color: "from-accent-green to-accent-green2" },
];

// ----- Row → DTO mappers -----

export function eventRowToConfig(row: EventRow): EventConfig {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    groomName: row.groomName,
    status: row.status as EventStatus,
    challenges: row.challenges as EventConfig["challenges"],
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    winnerTeamId: row.winnerTeamId,
    hostPlayerId: row.hostPlayerId,
    currentRoundIndex: row.currentRoundIndex,
    currentRoundStatus: (row.currentRoundStatus as RoundStatus | null) ?? null,
    currentRoundStartsAt: row.currentRoundStartsAt
      ? row.currentRoundStartsAt.getTime()
      : null,
    roundWinners: (row.roundWinners as RoundWinnerEntry[]) ?? [],
  };
}

export function teamRowToTeam(row: TeamRow): Team {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
  };
}

export function playerRowToPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    eventId: row.eventId,
    teamId: row.teamId,
    name: row.name,
    deviceId: row.deviceId,
    joinedAt: row.joinedAt.toISOString(),
  };
}

// ----- Queries -----

export async function listEvents(): Promise<
  Array<{ id: string; code: string; title: string; status: EventStatus; createdAt: string }>
> {
  const rows = await db
    .select({
      id: events.id,
      code: events.code,
      title: events.title,
      status: events.status,
      createdAt: events.createdAt,
    })
    .from(events)
    .orderBy(sql`${events.createdAt} DESC`);
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    status: r.status as EventStatus,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function createEvent(input: {
  title?: string;
  groomName?: string;
}): Promise<{ event: EventConfig; teams: Team[] }> {
  const title = input.title?.trim() || "Bachelor Party";
  const groomName = input.groomName?.trim() || "";
  const challenges = defaultChallengeConfig();

  // Try up to 5 times to avoid rare code collisions.
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateEventCode();
    try {
      const inserted = await db
        .insert(events)
        .values({
          code,
          title,
          groomName,
          challenges,
        })
        .returning();
      const eventRow = inserted[0];
      if (!eventRow) throw new Error("Insert returned no row");

      const teamValues = DEFAULT_TEAMS.map((t) => ({
        eventId: eventRow.id,
        name: t.name,
        emoji: t.emoji,
        color: t.color,
      }));
      const teamRows = await db.insert(teams).values(teamValues).returning();

      return {
        event: eventRowToConfig(eventRow),
        teams: teamRows.map(teamRowToTeam),
      };
    } catch (err) {
      lastErr = err;
      // Postgres unique violation = 23505. Retry on collision; otherwise bail.
      const code = (err as { code?: string } | null)?.code;
      if (code !== "23505") throw err;
    }
  }
  throw lastErr ?? new Error("Failed to allocate unique event code");
}

export async function getEventByCode(
  code: string,
): Promise<{ event: EventConfig; teams: Team[]; players: Player[] } | null> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return null;

  const [teamRows, playerRows] = await Promise.all([
    db.select().from(teams).where(eq(teams.eventId, eventRow.id)),
    db.select().from(players).where(eq(players.eventId, eventRow.id)),
  ]);

  return {
    event: eventRowToConfig(eventRow),
    teams: teamRows.map(teamRowToTeam),
    players: playerRows.map(playerRowToPlayer),
  };
}

export async function updateEvent(
  code: string,
  patch: {
    title?: string;
    groomName?: string;
    challenges?: EventConfig["challenges"];
    teams?: Array<{ id: string; name?: string; emoji?: string; color?: string }>;
  },
): Promise<{ event: EventConfig; teams: Team[] } | null> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, code))
    .limit(1);
  const existing = eventRows[0];
  if (!existing) return null;

  const updates: Partial<typeof events.$inferInsert> = {};
  if (typeof patch.title === "string") updates.title = patch.title;
  if (typeof patch.groomName === "string") updates.groomName = patch.groomName;
  if (patch.challenges) updates.challenges = patch.challenges;

  let updatedEventRow: EventRow = existing;
  if (Object.keys(updates).length > 0) {
    const updated = await db
      .update(events)
      .set(updates)
      .where(eq(events.id, existing.id))
      .returning();
    if (updated[0]) updatedEventRow = updated[0];
  }

  if (patch.teams && patch.teams.length > 0) {
    for (const t of patch.teams) {
      const teamPatch: Partial<typeof teams.$inferInsert> = {};
      if (typeof t.name === "string") teamPatch.name = t.name;
      if (typeof t.emoji === "string") teamPatch.emoji = t.emoji;
      if (typeof t.color === "string") teamPatch.color = t.color;
      if (Object.keys(teamPatch).length === 0) continue;
      await db
        .update(teams)
        .set(teamPatch)
        .where(and(eq(teams.id, t.id), eq(teams.eventId, existing.id)));
    }
  }

  const teamRows = await db
    .select()
    .from(teams)
    .where(eq(teams.eventId, existing.id));

  return {
    event: eventRowToConfig(updatedEventRow),
    teams: teamRows.map(teamRowToTeam),
  };
}

export async function deleteEvent(code: string): Promise<boolean> {
  const result = await db.delete(events).where(eq(events.code, code)).returning({
    id: events.id,
  });
  return result.length > 0;
}

export async function startEvent(code: string): Promise<EventConfig | null> {
  const updated = await db
    .update(events)
    .set({ status: "active", startedAt: new Date() })
    .where(eq(events.code, code))
    .returning();
  if (!updated[0]) return null;
  return eventRowToConfig(updated[0]);
}

export async function upsertPlayer(input: {
  code: string;
  name: string;
  deviceId: string;
}): Promise<{ player: Player; created: boolean } | null> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, input.code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return null;

  const existing = await db
    .select()
    .from(players)
    .where(
      and(
        eq(players.eventId, eventRow.id),
        eq(players.deviceId, input.deviceId),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return { player: playerRowToPlayer(existing[0]), created: false };
  }

  const inserted = await db
    .insert(players)
    .values({
      eventId: eventRow.id,
      name: input.name,
      deviceId: input.deviceId,
      teamId: null,
    })
    .returning();
  if (!inserted[0]) return null;
  return { player: playerRowToPlayer(inserted[0]), created: true };
}

export async function assignPlayerToTeam(input: {
  code: string;
  playerId: string;
  teamId: string | null;
}): Promise<Player | null> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, input.code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return null;

  const updated = await db
    .update(players)
    .set({ teamId: input.teamId })
    .where(
      and(eq(players.id, input.playerId), eq(players.eventId, eventRow.id)),
    )
    .returning();
  if (!updated[0]) return null;
  return playerRowToPlayer(updated[0]);
}

export async function resetEventProgress(code: string): Promise<{
  event: EventConfig;
  teams: Team[];
  players: Player[];
} | null> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return null;

  await db.delete(finalProgress).where(eq(finalProgress.eventId, eventRow.id));
  const updated = await db
    .update(events)
    .set({
      status: "active",
      winnerTeamId: null,
      finishedAt: null,
      currentRoundIndex: null,
      currentRoundStatus: null,
      currentRoundStartsAt: null,
      roundWinners: [],
    })
    .where(eq(events.id, eventRow.id))
    .returning();
  const newEventRow = updated[0] ?? eventRow;

  const [teamRows, playerRows] = await Promise.all([
    db.select().from(teams).where(eq(teams.eventId, eventRow.id)),
    db.select().from(players).where(eq(players.eventId, eventRow.id)),
  ]);

  return {
    event: eventRowToConfig(newEventRow),
    teams: teamRows.map(teamRowToTeam),
    players: playerRows.map(playerRowToPlayer),
  };
}

export async function resetEventToLobby(code: string): Promise<{
  event: EventConfig;
  teams: Team[];
  players: Player[];
} | null> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return null;

  await db.delete(finalProgress).where(eq(finalProgress.eventId, eventRow.id));
  await db
    .update(players)
    .set({ teamId: null })
    .where(eq(players.eventId, eventRow.id));

  const updated = await db
    .update(events)
    .set({
      status: "lobby",
      winnerTeamId: null,
      startedAt: null,
      finishedAt: null,
      hostPlayerId: null,
      currentRoundIndex: null,
      currentRoundStatus: null,
      currentRoundStartsAt: null,
      roundWinners: [],
    })
    .where(eq(events.id, eventRow.id))
    .returning();
  const newEventRow = updated[0] ?? eventRow;

  const [teamRows, playerRows] = await Promise.all([
    db.select().from(teams).where(eq(teams.eventId, eventRow.id)),
    db.select().from(players).where(eq(players.eventId, eventRow.id)),
  ]);

  return {
    event: eventRowToConfig(newEventRow),
    teams: teamRows.map(teamRowToTeam),
    players: playerRows.map(playerRowToPlayer),
  };
}

/**
 * Upsert a team's progress snapshot with MAX semantics. Multiple players
 * on the same team may flush concurrently; the most-advanced value wins.
 * Once `completed` is true, it stays true; the earliest completedAt is kept.
 */
export async function upsertProgressSnapshot(input: {
  eventId: string;
  teamId: string;
  challenges: Array<{
    challenge: ChallengeId;
    value: number;
    completed: boolean;
    completedAt: number | null;
  }>;
}): Promise<void> {
  if (input.challenges.length === 0) return;
  for (const c of input.challenges) {
    await db.execute(sql`
      INSERT INTO final_progress (event_id, team_id, challenge, value, completed, completed_at)
      VALUES (
        ${input.eventId},
        ${input.teamId},
        ${c.challenge},
        ${String(c.value)},
        ${c.completed},
        ${c.completedAt ? new Date(c.completedAt).toISOString() : null}
      )
      ON CONFLICT (event_id, team_id, challenge) DO UPDATE SET
        value = GREATEST(final_progress.value, EXCLUDED.value),
        completed = final_progress.completed OR EXCLUDED.completed,
        completed_at = COALESCE(final_progress.completed_at, EXCLUDED.completed_at)
    `);
  }
}

/**
 * Fetch persisted progress for all teams in an event. Used by clients on
 * first bootstrap to recover state across page refreshes.
 */
export async function getEventProgress(code: string): Promise<Array<{
  teamId: string;
  challenge: ChallengeId;
  value: number;
  completed: boolean;
  completedAt: number | null;
}> | null> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return null;

  const rows = await db
    .select()
    .from(finalProgress)
    .where(eq(finalProgress.eventId, eventRow.id));

  return rows.map((r) => ({
    teamId: r.teamId,
    challenge: r.challenge as ChallengeId,
    value: Number(r.value),
    completed: r.completed,
    completedAt: r.completedAt ? r.completedAt.getTime() : null,
  }));
}

export async function tryFinishEvent(input: {
  code: string;
  teamId: string;
  finalProgress: Array<{
    teamId: string;
    challenge: ChallengeId;
    value: number;
    completed: boolean;
    completedAt: number | null;
  }>;
}): Promise<{
  event: EventConfig;
  winnerTeamId: string;
  alreadyFinished: boolean;
} | null> {
  // Atomic claim: only update if no winner yet.
  const claimed = await db
    .update(events)
    .set({
      winnerTeamId: input.teamId,
      status: "finished",
      finishedAt: new Date(),
    })
    .where(
      and(eq(events.code, input.code), sql`${events.winnerTeamId} IS NULL`),
    )
    .returning();

  if (claimed[0]) {
    const eventRow = claimed[0];

    // Persist final progress rows. Best effort — if insert fails, the event
    // is still finished, but we surface the error to the caller.
    if (input.finalProgress.length > 0) {
      // Upsert with MAX semantics — in-event flushes from the hybrid
      // persistence path may already have rows; preserve the most-advanced
      // value and the earliest completion timestamp.
      for (const p of input.finalProgress) {
        await db.execute(sql`
          INSERT INTO final_progress (event_id, team_id, challenge, value, completed, completed_at)
          VALUES (
            ${eventRow.id},
            ${p.teamId},
            ${p.challenge},
            ${String(p.value)},
            ${p.completed},
            ${p.completedAt ? new Date(p.completedAt).toISOString() : null}
          )
          ON CONFLICT (event_id, team_id, challenge) DO UPDATE SET
            value = GREATEST(final_progress.value, EXCLUDED.value),
            completed = final_progress.completed OR EXCLUDED.completed,
            completed_at = COALESCE(final_progress.completed_at, EXCLUDED.completed_at)
        `);
      }
    }

    return {
      event: eventRowToConfig(eventRow),
      winnerTeamId: eventRow.winnerTeamId ?? input.teamId,
      alreadyFinished: false,
    };
  }

  // Already finished — fetch the existing winner.
  const existing = await db
    .select()
    .from(events)
    .where(eq(events.code, input.code))
    .limit(1);
  const eventRow = existing[0];
  if (!eventRow) return null;
  if (!eventRow.winnerTeamId) {
    // Edge case: event not finished yet but we lost the race somehow.
    // Treat as failure to claim, but no other winner exists.
    return null;
  }
  return {
    event: eventRowToConfig(eventRow),
    winnerTeamId: eventRow.winnerTeamId,
    alreadyFinished: true,
  };
}

export async function getResults(code: string): Promise<{
  event: EventConfig;
  teams: Team[];
  players: Player[];
  finalProgress: Array<{
    teamId: string;
    challenge: ChallengeId;
    value: number;
    completed: boolean;
    completedAt: string | null;
  }>;
} | null> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return null;

  const [teamRows, playerRows, fpRows] = await Promise.all([
    db.select().from(teams).where(eq(teams.eventId, eventRow.id)),
    db.select().from(players).where(eq(players.eventId, eventRow.id)),
    db
      .select()
      .from(finalProgress)
      .where(eq(finalProgress.eventId, eventRow.id)),
  ]);

  return {
    event: eventRowToConfig(eventRow),
    teams: teamRows.map(teamRowToTeam),
    players: playerRows.map(playerRowToPlayer),
    finalProgress: fpRows.map((r: FinalProgressRow) => ({
      teamId: r.teamId,
      challenge: r.challenge as ChallengeId,
      value: Number(r.value),
      completed: r.completed,
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    })),
  };
}

/**
 * Set or clear the host player for an event. Returns the updated event config,
 * or { error: 'not-found' } if the event doesn't exist, or { error: 'invalid-player' }
 * if a playerId was supplied but doesn't belong to this event.
 */
export async function setHostPlayer(input: {
  code: string;
  playerId: string | null;
}): Promise<{ event: EventConfig } | { error: "not-found" | "invalid-player" }> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, input.code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return { error: "not-found" };

  if (input.playerId !== null) {
    const matching = await db
      .select({ id: players.id })
      .from(players)
      .where(
        and(eq(players.id, input.playerId), eq(players.eventId, eventRow.id)),
      )
      .limit(1);
    if (!matching[0]) return { error: "invalid-player" };
  }

  const updated = await db
    .update(events)
    .set({ hostPlayerId: input.playerId })
    .where(eq(events.id, eventRow.id))
    .returning();
  const newRow = updated[0] ?? eventRow;
  return { event: eventRowToConfig(newRow) };
}

const COUNTDOWN_MS = 5000;

/**
 * Start the next undecided round, or redo a specific round.
 *
 * Advance path (no redo): if no round is currently live, picks the next round
 * that doesn't yet have a winner in `round_winners`. If all rounds are
 * decided, returns `{ error: 'all-decided' }`.
 *
 * Redo path (`redo: true, roundIndex`): wipes final_progress for that round's
 * challenge (and all later ones), splices `round_winners` from index
 * `roundIndex` onward, then starts that round.
 *
 * On success: sets currentRoundIndex/Status/StartsAt and ensures status='active'.
 */
export async function startRound(input: {
  code: string;
  redo?: boolean;
  roundIndex?: number;
}): Promise<
  | {
      event: EventConfig;
      challenge: ChallengeId;
      startsAt: number;
      progressReset: boolean;
    }
  | { error: "not-found" | "all-decided" | "round-live" | "invalid-index" }
> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, input.code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return { error: "not-found" };

  const challengesCfg = eventRow.challenges as EventConfig["challenges"];
  const order = enabledChallengeOrder(challengesCfg);
  const winners = (eventRow.roundWinners as RoundWinnerEntry[]) ?? [];

  let targetIndex: number;
  let progressReset = false;

  if (input.redo) {
    if (
      typeof input.roundIndex !== "number" ||
      input.roundIndex < 0 ||
      input.roundIndex >= order.length
    ) {
      return { error: "invalid-index" };
    }
    targetIndex = input.roundIndex;

    const trimmedWinners = winners.slice(0, targetIndex);
    const challengesToWipe = order.slice(targetIndex);
    if (challengesToWipe.length > 0) {
      await db.execute(sql`
        DELETE FROM final_progress
        WHERE event_id = ${eventRow.id}
        AND challenge = ANY(${challengesToWipe})
      `);
    }

    await db
      .update(events)
      .set({ roundWinners: trimmedWinners })
      .where(eq(events.id, eventRow.id));

    progressReset = true;
  } else {
    if (eventRow.currentRoundStatus === "live") {
      return { error: "round-live" };
    }
    targetIndex = winners.length;
    if (targetIndex >= order.length) return { error: "all-decided" };
  }

  const challenge = order[targetIndex];
  const startsAt = new Date(Date.now() + COUNTDOWN_MS);

  const updated = await db
    .update(events)
    .set({
      status: "active",
      startedAt: eventRow.startedAt ?? new Date(),
      currentRoundIndex: targetIndex,
      currentRoundStatus: "live",
      currentRoundStartsAt: startsAt,
    })
    .where(eq(events.id, eventRow.id))
    .returning();
  const newRow = updated[0] ?? eventRow;

  return {
    event: eventRowToConfig(newRow),
    challenge,
    startsAt: startsAt.getTime(),
    progressReset,
  };
}

/**
 * Atomically end the currently-live round and append a winner.
 *
 * `mode === 'auto'`: caller claims a team has just completed the threshold.
 * Server validates by reading `final_progress` for the current challenge —
 * only honored if that team's row is `completed=true`.
 *
 * `mode === 'host'`: no auto-validation. If `requestedTeamId` is omitted,
 * server picks per the rules in the spec.
 *
 * First-write-wins via predicate update: only flips status from 'live' to
 * 'decided' when index is unchanged. If this was the last enabled round,
 * also sets event status to 'finished' and computes overall winnerTeamId.
 */
export async function endRound(input: {
  code: string;
  mode: "auto" | "host";
  requestedTeamId?: string;
}): Promise<
  | {
      event: EventConfig;
      challenge: ChallengeId;
      winnerTeamId: string;
      decidedAt: number;
      eventFinished: boolean;
      alreadyDecided: boolean;
    }
  | { error: "not-found" | "no-live-round" | "not-completed" | "no-teams" }
> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, input.code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return { error: "not-found" };
  if (
    eventRow.currentRoundStatus !== "live" ||
    eventRow.currentRoundIndex === null
  ) {
    return { error: "no-live-round" };
  }

  const challengesCfg = eventRow.challenges as EventConfig["challenges"];
  const order = enabledChallengeOrder(challengesCfg);
  const idx = eventRow.currentRoundIndex;
  if (idx < 0 || idx >= order.length) return { error: "no-live-round" };
  const challenge = order[idx];

  const fpRows = await db
    .select()
    .from(finalProgress)
    .where(eq(finalProgress.eventId, eventRow.id));

  let winnerTeamId: string | null = null;

  if (input.mode === "auto") {
    if (!input.requestedTeamId) return { error: "not-completed" };
    const claim = fpRows.find(
      (r) =>
        r.teamId === input.requestedTeamId &&
        r.challenge === challenge &&
        r.completed,
    );
    if (!claim) return { error: "not-completed" };
    winnerTeamId = input.requestedTeamId;
  } else {
    if (input.requestedTeamId) {
      winnerTeamId = input.requestedTeamId;
    } else {
      const teamRows = await db
        .select()
        .from(teams)
        .where(eq(teams.eventId, eventRow.id));
      if (teamRows.length === 0) return { error: "no-teams" };

      if (challenge === "north") {
        // No per-guess data on server; fall back to first completed row,
        // else first team.
        const completed = fpRows.filter(
          (r) => r.challenge === challenge && r.completed,
        );
        winnerTeamId = completed[0]?.teamId ?? teamRows[0].id;
      } else if (challenge === "scream" || challenge === "shake") {
        // First completed wins; fallback to first team.
        const completed = fpRows.filter(
          (r) => r.challenge === challenge && r.completed,
        );
        completed.sort((a, b) => {
          const at = a.completedAt?.getTime() ?? Infinity;
          const bt = b.completedAt?.getTime() ?? Infinity;
          return at - bt;
        });
        winnerTeamId = completed[0]?.teamId ?? teamRows[0].id;
      } else {
        // Accumulators (distance/steps/taps/spin): highest value wins.
        const challengeRows = fpRows.filter((r) => r.challenge === challenge);
        let best: { teamId: string; value: number } | null = null;
        for (const r of challengeRows) {
          const v = Number(r.value);
          if (!best || v > best.value) best = { teamId: r.teamId, value: v };
        }
        winnerTeamId = best?.teamId ?? teamRows[0].id;
      }
    }
  }

  if (!winnerTeamId) return { error: "no-teams" };

  const decidedAt = Date.now();
  const newWinnerEntry: RoundWinnerEntry = {
    challenge,
    teamId: winnerTeamId,
    decidedAt,
  };
  const existingWinners = (eventRow.roundWinners as RoundWinnerEntry[]) ?? [];
  const trimmed = existingWinners.slice(0, idx);
  const nextWinners = [...trimmed, newWinnerEntry];

  const isLastRound = idx + 1 >= order.length;

  let overallWinnerTeamId: string | null = null;
  if (isLastRound) {
    const counts = new Map<string, number>();
    for (const w of nextWinners) {
      counts.set(w.teamId, (counts.get(w.teamId) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (
      sorted.length === 1 ||
      (sorted.length > 1 && sorted[0][1] > sorted[1][1])
    ) {
      overallWinnerTeamId = sorted[0][0];
    } else {
      // Tied. Prefer team that won north.
      const tiedCount = sorted[0][1];
      const tiedTeamIds = new Set(
        sorted.filter(([, c]) => c === tiedCount).map(([t]) => t),
      );
      const northWinner = nextWinners.find(
        (w) => w.challenge === "north" && tiedTeamIds.has(w.teamId),
      );
      if (northWinner) {
        overallWinnerTeamId = northWinner.teamId;
      } else {
        // Fallback: earliest cumulative decidedAt.
        const teamFirstWin = new Map<string, number>();
        for (const w of nextWinners) {
          if (!tiedTeamIds.has(w.teamId)) continue;
          const cur = teamFirstWin.get(w.teamId);
          if (cur === undefined || w.decidedAt < cur) {
            teamFirstWin.set(w.teamId, w.decidedAt);
          }
        }
        const earliest = [...teamFirstWin.entries()].sort(
          (a, b) => a[1] - b[1],
        );
        overallWinnerTeamId = earliest[0]?.[0] ?? sorted[0][0];
      }
    }
  }

  const claimed = await db
    .update(events)
    .set({
      currentRoundStatus: "decided",
      roundWinners: nextWinners,
      ...(isLastRound
        ? {
            status: "finished",
            finishedAt: new Date(),
            winnerTeamId: overallWinnerTeamId,
          }
        : {}),
    })
    .where(
      and(
        eq(events.id, eventRow.id),
        eq(events.currentRoundStatus, "live"),
        eq(events.currentRoundIndex, idx),
      ),
    )
    .returning();

  if (!claimed[0]) {
    // Lost the race. Re-fetch to report state.
    const refetch = await db
      .select()
      .from(events)
      .where(eq(events.id, eventRow.id))
      .limit(1);
    const finalRow = refetch[0] ?? eventRow;
    const winners = (finalRow.roundWinners as RoundWinnerEntry[]) ?? [];
    const existing = winners[idx];
    return {
      event: eventRowToConfig(finalRow),
      challenge,
      winnerTeamId: existing?.teamId ?? winnerTeamId,
      decidedAt: existing?.decidedAt ?? decidedAt,
      eventFinished: finalRow.status === "finished",
      alreadyDecided: true,
    };
  }

  return {
    event: eventRowToConfig(claimed[0]),
    challenge,
    winnerTeamId,
    decidedAt,
    eventFinished: isLastRound,
    alreadyDecided: false,
  };
}
