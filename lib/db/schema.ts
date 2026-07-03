import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  numeric,
  boolean,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core";
import type { RoundWinnerEntry, TriviaQuestion } from "@/lib/types";

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull().default("Bachelor Party"),
  groomName: text("groom_name").notNull().default(""),
  status: text("status").notNull().default("lobby"), // 'lobby' | 'active' | 'finished'
  // Game mode. 'heptathlon' = the original host-driven, team-based sequential
  // flow. 'open' = self-paced solo open play (own leaderboards, play-each-once).
  // Defaulted so every existing event keeps the heptathlon behavior untouched.
  mode: text("mode").notNull().default("heptathlon"), // 'heptathlon' | 'open'
  challenges: jsonb("challenges").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  winnerTeamId: uuid("winner_team_id"),
  hostPlayerId: uuid("host_player_id"),
  currentRoundIndex: integer("current_round_index"),
  currentRoundStatus: text("current_round_status"), // 'live' | 'decided' | null
  currentRoundStartsAt: timestamp("current_round_starts_at", { withTimezone: true }),
  roundWinners: jsonb("round_winners").$type<RoundWinnerEntry[]>().notNull().default([]),
});

export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🍕"),
  color: text("color").notNull().default("from-accent-pink to-accent-orange"),
});

export const players = pgTable("players", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  deviceId: text("device_id").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

// Progress is keyed by ROUND INDEX (not by challenge id) so the same
// challenge type can appear in multiple rounds with independent state.
// `challenge` is kept as an informational column — the server writes
// the challenge id of the round there for debugging / results display,
// but it doesn't participate in the primary key.
export const finalProgress = pgTable(
  "final_progress",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    roundIndex: integer("round_index").notNull(),
    challenge: text("challenge").notNull().default(""),
    value: numeric("value").notNull().default("0"),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.teamId, table.roundIndex] }),
  }),
);

// Open Play scores — one row per (player, game). Keyed by PLAYER (not team)
// and by game_id (a ChallengeId), so a player can play each game exactly once
// (the primary key enforces play-once). Entirely separate from final_progress;
// heptathlon never reads this table and open play never writes final_progress.
export const openScores = pgTable(
  "open_scores",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    // The player's single-attempt score. Ranking direction (higher/lower is
    // better) is a per-game property held in OPEN_GAMES, not here.
    score: numeric("score").notNull(),
    // Optional per-game extras (e.g. raw units) for display/debugging.
    meta: jsonb("meta").notNull().default({}),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.playerId, table.gameId] }),
  }),
);

// Reusable trivia question bundles. Global (not scoped to an event) — the
// host can apply any preset to any trivia round in any event. Stored as
// jsonb so the question shape can evolve without a migration.
export const triviaPresets = pgTable("trivia_presets", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  questions: jsonb("questions").$type<TriviaQuestion[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EventRow = typeof events.$inferSelect;
export type TeamRow = typeof teams.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type FinalProgressRow = typeof finalProgress.$inferSelect;
export type OpenScoreRow = typeof openScores.$inferSelect;
export type TriviaPresetRow = typeof triviaPresets.$inferSelect;
