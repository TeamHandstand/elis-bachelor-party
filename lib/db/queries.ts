import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./client";
import {
  events,
  teams,
  players,
  finalProgress,
  triviaPresets,
  type EventRow,
  type TeamRow,
  type PlayerRow,
  type FinalProgressRow,
  type TriviaPresetRow,
} from "./schema";
import {
  CHALLENGES,
  DEFAULT_INTERLEAVE_SEGMENTS,
  DEFAULT_PUNISHMENT_MESSAGE,
  coerceRounds,
  coerceTriviaQuestions,
  defaultRounds,
  interleaveTotal,
} from "@/lib/challenges";
import type {
  ChallengeId,
  EventConfig,
  EventStatus,
  Player,
  RoundConfig,
  RoundStatus,
  RoundWinnerEntry,
  Team,
  TriviaPreset,
  TriviaQuestion,
} from "@/lib/types";
import { generateEventCode } from "@/lib/utils/code";

// ----- Default team templates -----

const DEFAULT_TEAMS: Array<{ name: string; emoji: string; color: string }> = [
  { name: "Pepperoni", emoji: "🍕", color: "from-accent-pink to-accent-orange" },
  { name: "Margherita", emoji: "🌿", color: "from-accent-purple to-accent-blue" },
  { name: "Hawaiian", emoji: "🍍", color: "from-accent-green to-accent-green2" },
];

// Pool of presets used to suggest defaults when the host creates a new team
// beyond the initial 3. Includes the originals + extras.
const TEAM_PRESET_POOL: Array<{ name: string; emoji: string; color: string }> =
  [
    ...DEFAULT_TEAMS,
    { name: "Sausage", emoji: "🌭", color: "from-accent-orange to-accent-pink" },
    { name: "Mushroom", emoji: "🍄", color: "from-accent-blue to-accent-purple" },
    { name: "BBQ Chicken", emoji: "🍗", color: "from-accent-green2 to-accent-blue" },
    { name: "Anchovies", emoji: "🐟", color: "from-accent-purple to-accent-pink" },
    { name: "Buffalo", emoji: "🌶️", color: "from-accent-orange to-accent-green2" },
  ];

// ----- Row → DTO mappers -----

export function eventRowToConfig(row: EventRow): EventConfig {
  // The `challenges` jsonb column may hold either the new RoundConfig[] shape
  // or the legacy ChallengeId-keyed record. coerceRounds normalizes both.
  const rounds = coerceRounds(row.challenges);

  return {
    id: row.id,
    code: row.code,
    title: row.title,
    groomName: row.groomName,
    status: row.status as EventStatus,
    rounds,
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
  Array<{
    id: string;
    code: string;
    title: string;
    status: EventStatus;
    createdAt: string;
    currentRoundIndex: number | null;
    currentRoundStatus: RoundStatus | null;
    currentRoundStartsAt: number | null;
  }>
> {
  const rows = await db
    .select({
      id: events.id,
      code: events.code,
      title: events.title,
      status: events.status,
      createdAt: events.createdAt,
      currentRoundIndex: events.currentRoundIndex,
      currentRoundStatus: events.currentRoundStatus,
      currentRoundStartsAt: events.currentRoundStartsAt,
    })
    .from(events)
    .orderBy(sql`${events.createdAt} DESC`);
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    status: r.status as EventStatus,
    createdAt: r.createdAt.toISOString(),
    currentRoundIndex: r.currentRoundIndex,
    currentRoundStatus: (r.currentRoundStatus as RoundStatus | null) ?? null,
    currentRoundStartsAt: r.currentRoundStartsAt
      ? r.currentRoundStartsAt.getTime()
      : null,
  }));
}

export async function createEvent(input: {
  title?: string;
  groomName?: string;
}): Promise<{ event: EventConfig; teams: Team[] }> {
  const title = input.title?.trim() || "Bachelor Party";
  const groomName = input.groomName?.trim() || "";
  const rounds = defaultRounds();

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
          challenges: rounds,
        })
        .returning();
      const eventRow = inserted[0];
      if (!eventRow) throw new Error("Insert returned no row");

      // No default teams — host creates them on demand from the team builder.
      return {
        event: eventRowToConfig(eventRow),
        teams: [],
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
    rounds?: RoundConfig[];
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
  if (patch.rounds) {
    // Sanitize per-round trivia questions defensively before persisting so
    // bad client-side state can't poison the jsonb column.
    updates.challenges = patch.rounds.map((r) => {
      if (r.challenge === "trivia") {
        return {
          challenge: r.challenge,
          threshold: r.threshold,
          questions: coerceTriviaQuestions(r.questions ?? []),
        };
      }
      if (r.challenge === "punishment") {
        return {
          challenge: r.challenge,
          threshold: 0,
          message:
            typeof r.message === "string" && r.message.trim()
              ? r.message
              : DEFAULT_PUNISHMENT_MESSAGE,
        };
      }
      if (r.challenge === "interleave") {
        // Filter out malformed segments and snap threshold to the canonical
        // sum-of-counts. Without this branch the default `{challenge, threshold}`
        // shape below would silently drop the segment list every save.
        const segs = (r.segments ?? DEFAULT_INTERLEAVE_SEGMENTS)
          .filter(
            (s): s is { kind: "spin" | "steps"; count: number } =>
              !!s &&
              (s.kind === "spin" || s.kind === "steps") &&
              typeof s.count === "number" &&
              Number.isFinite(s.count) &&
              s.count > 0,
          )
          .map((s) => ({ kind: s.kind, count: Math.floor(s.count) }));
        const safeSegs = segs.length > 0 ? segs : DEFAULT_INTERLEAVE_SEGMENTS;
        return {
          challenge: r.challenge,
          threshold: interleaveTotal(safeSegs),
          segments: safeSegs,
        };
      }
      return { challenge: r.challenge, threshold: r.threshold };
    });
  }

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

/**
 * Duplicate an existing event into a fresh lobby. Always copies title,
 * groomName, and rounds. Optionally copies teams and players (with team
 * assignments preserved via an old→new team-id map). Progress, winners,
 * round state, and host-player assignment are intentionally NOT copied —
 * the new event starts in 'lobby' status.
 */
export async function duplicateEvent(input: {
  sourceCode: string;
  copyTeamsAndPlayers: boolean;
}): Promise<{ event: EventConfig; teams: Team[]; players: Player[] } | null> {
  const sourceRows = await db
    .select()
    .from(events)
    .where(eq(events.code, input.sourceCode))
    .limit(1);
  const source = sourceRows[0];
  if (!source) return null;

  const newTitle = source.title.endsWith(" (copy)")
    ? source.title
    : `${source.title} (copy)`;

  let newEventRow: EventRow | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateEventCode();
    try {
      const inserted = await db
        .insert(events)
        .values({
          code,
          title: newTitle,
          groomName: source.groomName,
          challenges: source.challenges,
          status: "lobby",
        })
        .returning();
      if (inserted[0]) {
        newEventRow = inserted[0];
        break;
      }
    } catch (err) {
      lastErr = err;
      const pgCode = (err as { code?: string } | null)?.code;
      if (pgCode !== "23505") throw err;
    }
  }
  if (!newEventRow) throw lastErr ?? new Error("Failed to allocate unique event code");

  let copiedTeams: Team[] = [];
  let copiedPlayers: Player[] = [];

  if (input.copyTeamsAndPlayers) {
    const sourceTeams = await db
      .select()
      .from(teams)
      .where(eq(teams.eventId, source.id));

    if (sourceTeams.length > 0) {
      const insertedTeams = await db
        .insert(teams)
        .values(
          sourceTeams.map((t) => ({
            eventId: newEventRow!.id,
            name: t.name,
            emoji: t.emoji,
            color: t.color,
          })),
        )
        .returning();

      // Map old team id → new team id by index (insert order matches values order).
      const teamIdMap = new Map<string, string>();
      sourceTeams.forEach((t, i) => {
        const newRow = insertedTeams[i];
        if (newRow) teamIdMap.set(t.id, newRow.id);
      });
      copiedTeams = insertedTeams.map(teamRowToTeam);

      const sourcePlayers = await db
        .select()
        .from(players)
        .where(eq(players.eventId, source.id));

      if (sourcePlayers.length > 0) {
        const insertedPlayers = await db
          .insert(players)
          .values(
            sourcePlayers.map((p) => ({
              eventId: newEventRow!.id,
              teamId: p.teamId ? teamIdMap.get(p.teamId) ?? null : null,
              name: p.name,
              deviceId: p.deviceId,
            })),
          )
          .returning();
        copiedPlayers = insertedPlayers.map(playerRowToPlayer);
      }
    }
  }

  return {
    event: eventRowToConfig(newEventRow),
    teams: copiedTeams,
    players: copiedPlayers,
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

export async function renamePlayer(input: {
  code: string;
  playerId: string;
  name: string;
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
    .set({ name: input.name })
    .where(
      and(eq(players.id, input.playerId), eq(players.eventId, eventRow.id)),
    )
    .returning();
  if (!updated[0]) return null;
  return playerRowToPlayer(updated[0]);
}

export async function getPlayerByIdAndEvent(input: {
  code: string;
  playerId: string;
}): Promise<Player | null> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, input.code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return null;
  const rows = await db
    .select()
    .from(players)
    .where(
      and(eq(players.id, input.playerId), eq(players.eventId, eventRow.id)),
    )
    .limit(1);
  return rows[0] ? playerRowToPlayer(rows[0]) : null;
}

/**
 * Permanently delete a player from an event. The events.host_player_id FK
 * uses ON DELETE SET NULL so the host slot clears automatically if the
 * deleted player was hosting. final_progress is keyed by team, not player,
 * so team-level scores survive the removal.
 */
export async function deletePlayer(input: {
  code: string;
  playerId: string;
}): Promise<{ ok: true } | { error: "not-found" | "player-not-in-event" }> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, input.code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return { error: "not-found" };

  const result = await db
    .delete(players)
    .where(
      and(eq(players.id, input.playerId), eq(players.eventId, eventRow.id)),
    )
    .returning({ id: players.id });
  if (result.length === 0) return { error: "player-not-in-event" };
  return { ok: true };
}

export async function renameTeam(input: {
  code: string;
  teamId: string;
  name?: string;
  emoji?: string;
}): Promise<Team | null> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, input.code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return null;

  const patch: Partial<typeof teams.$inferInsert> = {};
  if (typeof input.name === "string") patch.name = input.name;
  if (typeof input.emoji === "string") patch.emoji = input.emoji;
  if (Object.keys(patch).length === 0) {
    const existing = await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, input.teamId), eq(teams.eventId, eventRow.id)))
      .limit(1);
    return existing[0] ? teamRowToTeam(existing[0]) : null;
  }

  const updated = await db
    .update(teams)
    .set(patch)
    .where(and(eq(teams.id, input.teamId), eq(teams.eventId, eventRow.id)))
    .returning();
  if (!updated[0]) return null;
  return teamRowToTeam(updated[0]);
}

export async function isDeviceOnTeam(input: {
  code: string;
  teamId: string;
  deviceId: string;
}): Promise<boolean> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, input.code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return false;
  const rows = await db
    .select({ id: players.id })
    .from(players)
    .where(
      and(
        eq(players.eventId, eventRow.id),
        eq(players.teamId, input.teamId),
        eq(players.deviceId, input.deviceId),
      ),
    )
    .limit(1);
  return rows.length > 0;
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
  rounds: Array<{
    roundIndex: number;
    challenge: ChallengeId;
    value: number;
    completed: boolean;
    completedAt: number | null;
  }>;
}): Promise<void> {
  if (input.rounds.length === 0) return;
  for (const c of input.rounds) {
    // completed_at is set by the SERVER (NOW()) on the first transition to
    // completed=true so cross-device clock skew can't flip the winner-pick.
    // Once set, COALESCE keeps it stable for subsequent flushes from the
    // same team. Clients still send completedAt for debugging but we ignore
    // it for ordering.
    await db.execute(sql`
      INSERT INTO final_progress (event_id, team_id, round_index, challenge, value, completed, completed_at)
      VALUES (
        ${input.eventId},
        ${input.teamId},
        ${c.roundIndex},
        ${c.challenge},
        ${String(c.value)},
        ${c.completed},
        CASE WHEN ${c.completed} THEN NOW() ELSE NULL END
      )
      ON CONFLICT (event_id, team_id, round_index) DO UPDATE SET
        challenge = EXCLUDED.challenge,
        value = GREATEST(final_progress.value, EXCLUDED.value),
        completed = final_progress.completed OR EXCLUDED.completed,
        completed_at = COALESCE(
          final_progress.completed_at,
          CASE WHEN EXCLUDED.completed THEN NOW() ELSE NULL END
        )
    `);
  }
}

/**
 * Fetch persisted progress for all teams in an event. Used by clients on
 * first bootstrap to recover state across page refreshes.
 */
export async function getEventProgress(code: string): Promise<Array<{
  teamId: string;
  roundIndex: number;
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
    roundIndex: r.roundIndex,
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
    roundIndex: number;
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
          INSERT INTO final_progress (event_id, team_id, round_index, challenge, value, completed, completed_at)
          VALUES (
            ${eventRow.id},
            ${p.teamId},
            ${p.roundIndex},
            ${p.challenge},
            ${String(p.value)},
            ${p.completed},
            CASE WHEN ${p.completed} THEN NOW() ELSE NULL END
          )
          ON CONFLICT (event_id, team_id, round_index) DO UPDATE SET
            challenge = EXCLUDED.challenge,
            value = GREATEST(final_progress.value, EXCLUDED.value),
            completed = final_progress.completed OR EXCLUDED.completed,
            completed_at = COALESCE(
              final_progress.completed_at,
              CASE WHEN EXCLUDED.completed THEN NOW() ELSE NULL END
            )
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
    roundIndex: number;
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
      roundIndex: r.roundIndex,
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
 * Wipe a specific round (and everything after it) without starting it.
 * Trims roundWinners, deletes final_progress for round_index >= input
 * (so any duplicate-challenge rounds later in the list are also cleared),
 * clears any live round state. Caller (host) then taps "START ROUND N"
 * to actually begin the round again.
 */
export async function resetRound(input: {
  code: string;
  roundIndex: number;
}): Promise<
  | { event: EventConfig }
  | { error: "not-found" | "invalid-index" }
> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, input.code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return { error: "not-found" };

  const rounds = coerceRounds(eventRow.challenges);
  if (
    input.roundIndex < 0 ||
    input.roundIndex >= rounds.length
  ) {
    return { error: "invalid-index" };
  }

  const winners = (eventRow.roundWinners as RoundWinnerEntry[]) ?? [];
  const trimmedWinners = winners.slice(0, input.roundIndex);

  await db.execute(sql`
    DELETE FROM final_progress
    WHERE event_id = ${eventRow.id}
    AND round_index >= ${input.roundIndex}
  `);

  const updated = await db
    .update(events)
    .set({
      roundWinners: trimmedWinners,
      currentRoundIndex: null,
      currentRoundStatus: null,
      currentRoundStartsAt: null,
      // If the event had previously been finished (last round + released),
      // un-finish it so the host can restart from the redone round.
      status: "active",
      finishedAt: null,
      winnerTeamId: null,
    })
    .where(eq(events.id, eventRow.id))
    .returning();
  const newRow = updated[0] ?? eventRow;
  return { event: eventRowToConfig(newRow) };
}

/**
 * Start the next undecided round, or redo a specific round.
 *
 * Advance path (no redo): if no round is currently live, picks the next round
 * that doesn't yet have a winner in `round_winners`. If all rounds are
 * decided, returns `{ error: 'all-decided' }`.
 *
 * Redo path (`redo: true, roundIndex`): wipes final_progress for that round
 * and all later ones, splices `round_winners` from index `roundIndex` onward,
 * then starts that round.
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

  const rounds = coerceRounds(eventRow.challenges);
  const winners = (eventRow.roundWinners as RoundWinnerEntry[]) ?? [];

  let targetIndex: number;
  let progressReset = false;

  if (input.redo) {
    if (
      typeof input.roundIndex !== "number" ||
      input.roundIndex < 0 ||
      input.roundIndex >= rounds.length
    ) {
      return { error: "invalid-index" };
    }
    targetIndex = input.roundIndex;

    const trimmedWinners = winners.slice(0, targetIndex);
    await db.execute(sql`
      DELETE FROM final_progress
      WHERE event_id = ${eventRow.id}
      AND round_index >= ${targetIndex}
    `);

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
    if (targetIndex >= rounds.length) return { error: "all-decided" };
  }

  const challenge = rounds[targetIndex].challenge;
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
 * `mode === 'auto'`: caller claims a team has just completed the round.
 * Server validates by reading `final_progress` for the current round_index —
 * only honored if that team's row is `completed=true`.
 *
 * `mode === 'host'`: no auto-validation. If `requestedTeamId` is omitted,
 * server picks per the rules in the spec.
 *
 * First-write-wins via predicate update: only flips status from 'live' to
 * 'decided' when index is unchanged.
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

  const rounds = coerceRounds(eventRow.challenges);
  const idx = eventRow.currentRoundIndex;
  if (idx < 0 || idx >= rounds.length) return { error: "no-live-round" };
  const challenge = rounds[idx].challenge;

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
        r.roundIndex === idx &&
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

      // Universal rule: if any team has finished this round, the earliest
      // finisher wins. Auto-end is no longer triggered by clients, so
      // multiple teams may have finished by the time the host clicks End
      // Round — pick the one who got there first. Trivia is the exception:
      // most-correct wins, with submission time as tiebreak.
      const completedRows = fpRows.filter(
        (r) => r.roundIndex === idx && r.completed,
      );
      if (challenge === "trivia") {
        completedRows.sort((a, b) => {
          const av = Number(a.value);
          const bv = Number(b.value);
          if (av !== bv) return bv - av;
          const at = a.completedAt?.getTime() ?? Infinity;
          const bt = b.completedAt?.getTime() ?? Infinity;
          return at - bt;
        });
      } else {
        completedRows.sort((a, b) => {
          const at = a.completedAt?.getTime() ?? Infinity;
          const bt = b.completedAt?.getTime() ?? Infinity;
          return at - bt;
        });
      }

      if (completedRows.length > 0) {
        winnerTeamId = completedRows[0].teamId;
      } else if (
        challenge === "distance" ||
        challenge === "steps" ||
        challenge === "taps" ||
        challenge === "spin"
      ) {
        // Accumulators: no team finished — highest progress wins.
        const roundRows = fpRows.filter((r) => r.roundIndex === idx);
        let best: { teamId: string; value: number } | null = null;
        for (const r of roundRows) {
          const v = Number(r.value);
          if (!best || v > best.value) best = { teamId: r.teamId, value: v };
        }
        winnerTeamId = best?.teamId ?? teamRows[0].id;
      } else {
        // scream/shake/north with no completed team — host should normally
        // pick manually; fall back to first team to avoid a 500.
        winnerTeamId = teamRows[0].id;
      }
    }
  }

  if (!winnerTeamId) return { error: "no-teams" };

  const decidedAt = Date.now();
  const newWinnerEntry: RoundWinnerEntry = {
    challenge,
    teamId: winnerTeamId,
    decidedAt,
    startedAt: eventRow.currentRoundStartsAt
      ? eventRow.currentRoundStartsAt.getTime()
      : null,
  };
  const existingWinners = (eventRow.roundWinners as RoundWinnerEntry[]) ?? [];
  const trimmed = existingWinners.slice(0, idx);
  const nextWinners = [...trimmed, newWinnerEntry];

  // Note: the last round previously auto-finished the event. We now stay in
  // 'active' status with all rounds decided, and rely on a host RELEASE
  // (POST /api/events/:code/end) to flip status='finished'. Keeps players
  // locked into the "waiting on host" screen until then.
  const claimed = await db
    .update(events)
    .set({
      currentRoundStatus: "decided",
      roundWinners: nextWinners,
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
    // The event is no longer auto-finished here. Whether all rounds are
    // decided is a separate concern — the host explicitly releases.
    eventFinished: false,
    alreadyDecided: false,
  };
}

/**
 * Create a new team within an event. If name/emoji/color aren't supplied,
 * picks the first preset whose name isn't already taken; falls back to
 * "Team N" with a generic emoji once the preset pool is exhausted.
 */
export async function createTeam(input: {
  code: string;
  name?: string;
  emoji?: string;
  color?: string;
}): Promise<{ team: Team } | { error: "not-found" }> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, input.code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return { error: "not-found" };

  const existing = await db
    .select()
    .from(teams)
    .where(eq(teams.eventId, eventRow.id));
  const usedNames = new Set(existing.map((t) => t.name));

  const preset =
    TEAM_PRESET_POOL.find((p) => !usedNames.has(p.name)) ?? {
      name: `Team ${existing.length + 1}`,
      emoji: "🍕",
      color: "from-accent-pink to-accent-orange",
    };

  const inserted = await db
    .insert(teams)
    .values({
      eventId: eventRow.id,
      name: input.name?.trim() || preset.name,
      emoji: input.emoji?.trim() || preset.emoji,
      color: input.color?.trim() || preset.color,
    })
    .returning();

  return { team: teamRowToTeam(inserted[0]) };
}

/**
 * Delete a team. Players assigned to it are unassigned (FK ON DELETE SET NULL);
 * any final_progress rows for the team are cascade-deleted (FK ON DELETE
 * CASCADE). If the deleted team appears in `round_winners`, those entries
 * remain pointing at the now-gone team id; UI handles missing teams as
 * "—" / unknown winner. Refusing the delete instead would force the host to
 * also redo every round the team won, which is worse UX.
 */
export async function deleteTeam(input: {
  code: string;
  teamId: string;
}): Promise<{ ok: true } | { error: "not-found" | "team-not-in-event" }> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, input.code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return { error: "not-found" };

  const result = await db
    .delete(teams)
    .where(and(eq(teams.id, input.teamId), eq(teams.eventId, eventRow.id)))
    .returning({ id: teams.id });

  if (result.length === 0) return { error: "team-not-in-event" };
  return { ok: true };
}

/**
 * Flip the event from 'lobby' to 'active' without starting a round. Used by
 * the lobby's START HEPTATHLON button — moves all players to the journey
 * view; the host then starts each individual round from there.
 */
export async function activateEvent(
  code: string,
): Promise<{ event: EventConfig } | { error: "not-found" }> {
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.code, code))
    .limit(1);
  const eventRow = eventRows[0];
  if (!eventRow) return { error: "not-found" };

  const updated = await db
    .update(events)
    .set({
      status: "active",
      startedAt: eventRow.startedAt ?? new Date(),
    })
    .where(eq(events.id, eventRow.id))
    .returning();

  return { event: eventRowToConfig(updated[0] ?? eventRow) };
}

// ---------------------------------------------------------------------------
// Trivia presets — reusable question bundles, global to the deployment.
// ---------------------------------------------------------------------------

function triviaPresetRowToPreset(row: TriviaPresetRow): TriviaPreset {
  return {
    id: row.id,
    name: row.name,
    questions: coerceTriviaQuestions(row.questions),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTriviaPresets(): Promise<TriviaPreset[]> {
  const rows = await db
    .select()
    .from(triviaPresets)
    .orderBy(sql`${triviaPresets.updatedAt} DESC`);
  return rows.map(triviaPresetRowToPreset);
}

export async function createTriviaPreset(input: {
  name: string;
  questions: TriviaQuestion[];
}): Promise<TriviaPreset> {
  const inserted = await db
    .insert(triviaPresets)
    .values({
      name: input.name.trim() || "Untitled trivia",
      questions: coerceTriviaQuestions(input.questions),
    })
    .returning();
  return triviaPresetRowToPreset(inserted[0]);
}

export async function updateTriviaPreset(input: {
  id: string;
  name?: string;
  questions?: TriviaQuestion[];
}): Promise<TriviaPreset | null> {
  const patch: Partial<typeof triviaPresets.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (typeof input.name === "string") patch.name = input.name.trim() || "Untitled trivia";
  if (input.questions) patch.questions = coerceTriviaQuestions(input.questions);
  const updated = await db
    .update(triviaPresets)
    .set(patch)
    .where(eq(triviaPresets.id, input.id))
    .returning();
  if (!updated[0]) return null;
  return triviaPresetRowToPreset(updated[0]);
}

export async function deleteTriviaPreset(id: string): Promise<boolean> {
  const result = await db
    .delete(triviaPresets)
    .where(eq(triviaPresets.id, id))
    .returning({ id: triviaPresets.id });
  return result.length > 0;
}
