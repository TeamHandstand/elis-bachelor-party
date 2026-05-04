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
