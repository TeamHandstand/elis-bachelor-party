# Linear Heptathlon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Toasty Pizza from a parallel "first-to-7" race into a sequential heptathlon with host-driven round starts, synchronized 5s countdowns, per-round winners, and most-round-wins overall.

**Architecture:** Event-row-state approach (no new tables). Five new columns on `events` capture round state and `round_winners`. Three new PubNub message kinds (`round-start`, `round-end`, `host-changed`). New API endpoints for host-player assignment, round start, round end. Player journey UI replaces the parallel tile-grid. Single host-player flag enables an inline Start/End/Redo button bar on the host's phone.

**Tech Stack:** Next.js 14 (app router) + Drizzle + Postgres + PubNub + Zustand + Tailwind. No test framework; verification = `npm run typecheck` + manual browser smoke test.

**Spec:** `docs/superpowers/specs/2026-05-04-linear-heptathlon-design.md`

---

## File map

### Created
- `drizzle/0001_<auto>.sql` — generated migration adding 5 columns on `events`
- `app/api/events/[code]/host-player/route.ts` — PATCH endpoint to set/clear host player
- `app/api/events/[code]/round/start/route.ts` — POST endpoint to start/redo a round
- `app/api/events/[code]/round/end/route.ts` — POST endpoint to end a round (auto or host)
- `components/play/JourneyView.tsx` — vertical round journey
- `components/play/RoundCard.tsx` — single round card (past/current/future/locked)
- `components/play/CountdownOverlay.tsx` — full-screen 5s countdown
- `components/play/HostRoundControls.tsx` — host-only Start/End/Redo button bar
- `components/host/HostPlayerPicker.tsx` — crown affordance + indicator

### Modified
- `lib/db/schema.ts` — add 5 columns to `events`
- `lib/types/index.ts` — extend `EventConfig`, `ProgressMsg`
- `lib/api/contract.ts` — types for new endpoints
- `lib/db/queries.ts` — new queries + extend `eventRowToConfig`
- `lib/store/index.ts` — handle new messages, expose round helpers
- `lib/store/selectors.ts` — round-wins-based standings selector
- `lib/challenges/index.ts` — `spin` flips to `team-total`, threshold `100`
- `app/api/events/[code]/start/route.ts` — wraps `round/start` with `roundIndex=0`
- `app/api/events/[code]/finish/route.ts` — delete (obsolete under new model)
- `app/api/events/[code]/reset/route.ts` — clear new round columns on reset
- `app/e/[code]/play/page.tsx` — render `JourneyView` instead of tile grid
- `app/e/[code]/play/[challenge]/page.tsx` — gate by current round, auto-redirect on round-end
- `app/e/[code]/done/page.tsx` — round-wins format
- `app/host/[code]/results/page.tsx` — round-wins format
- `components/host/HostDashboard.tsx` — wire HostPlayerPicker + indicator
- `components/host/HostMonitor.tsx` — show round wins
- `components/host/_fetch.ts` — add `setHostPlayer`, `startRound`, `endRound`
- `components/dashboard/StandingsCard.tsx` — round-wins format

---

## Phase 1 — Foundation: types, challenges, schema

### Task 1: Update `spin` challenge to team-total

**Files:**
- Modify: `lib/challenges/index.ts:54-63`

- [ ] **Step 1: Edit `CHALLENGES.spin`**

Replace the `spin` entry in `CHALLENGES` with:

```ts
spin: {
  id: "spin",
  label: "Spin Cycle",
  emoji: "🌀",
  defaultThreshold: 100,
  unit: "rotations",
  aggregation: "team-total",
  description: "Spin in place until your team racks up 100 rotations. Must hold both on-screen buttons.",
  formatProgress: (v, t) => `${Math.floor(v).toLocaleString()} / ${t.toLocaleString()} spins`,
},
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/challenges/index.ts
git commit -m "spin: convert to team-total aggregation (100 rotations shared)"
```

---

### Task 2: Extend `EventConfig` and add new `ProgressMsg` variants

**Files:**
- Modify: `lib/types/index.ts`

- [ ] **Step 1: Add round-related fields to `EventConfig`**

Replace the existing `EventConfig` interface (around lines 106-117) with:

```ts
export interface RoundWinnerEntry {
  challenge: ChallengeId;
  teamId: string;
  decidedAt: number;
}

export type RoundStatus = "live" | "decided";

export interface EventConfig {
  id: string;
  code: string;
  title: string;
  groomName: string;
  status: EventStatus;
  challenges: Record<ChallengeId, { enabled: boolean; threshold: number }>;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  winnerTeamId: string | null;
  // Heptathlon round state. All null in lobby.
  hostPlayerId: string | null;
  currentRoundIndex: number | null;
  currentRoundStatus: RoundStatus | null;
  currentRoundStartsAt: number | null; // ms epoch
  roundWinners: RoundWinnerEntry[];
}
```

- [ ] **Step 2: Add new `ProgressMsg` variants**

Add these interfaces above the `ProgressMsg` union (around line 94):

```ts
export interface RoundStartMsg {
  kind: "round-start";
  roundIndex: number;
  challenge: ChallengeId;
  startsAt: number; // ms epoch — when countdown ends
  ts: number;
}

export interface RoundEndMsg {
  kind: "round-end";
  roundIndex: number;
  challenge: ChallengeId;
  winnerTeamId: string;
  decidedAt: number;
  ts: number;
}

export interface HostChangedMsg {
  kind: "host-changed";
  hostPlayerId: string | null;
  ts: number;
}
```

Then extend the `ProgressMsg` union (around line 94):

```ts
export type ProgressMsg =
  | ProgressDeltaMsg
  | LiveLevelMsg
  | NorthGuessMsg
  | CompleteMsg
  | EventStateMsg
  | PlayerJoinedMsg
  | TeamAssignmentMsg
  | ProgressResetMsg
  | RoundStartMsg
  | RoundEndMsg
  | HostChangedMsg;
```

- [ ] **Step 3: Verify typecheck (will fail — that's expected)**

```bash
npm run typecheck
```

Expected: errors in `lib/db/queries.ts` (`eventRowToConfig` missing new fields) and `lib/store/index.ts` (`receive` doesn't handle new kinds). We'll fix these in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add lib/types/index.ts
git commit -m "types: add round state fields + RoundStart/End/HostChanged messages"
```

---

### Task 3: Add new columns to Drizzle schema

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Extend the `events` table**

Replace the existing `events` table definition (lines 12-23) with:

```ts
import type { RoundWinnerEntry } from "@/lib/types";

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull().default("Bachelor Party"),
  groomName: text("groom_name").notNull().default(""),
  status: text("status").notNull().default("lobby"), // 'lobby' | 'active' | 'finished'
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
```

Note: `host_player_id` is added as a plain `uuid` column without a Drizzle `references()` clause (and the FK is added in the migration SQL manually), to avoid a circular reference between `events` ↔ `players` in the schema file.

- [ ] **Step 2: Add `integer` to the imports**

At the top of `lib/db/schema.ts`, replace:

```ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  numeric,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
```

with:

```ts
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
```

- [ ] **Step 3: Generate migration**

```bash
npm run db:generate
```

Expected output: a new file under `drizzle/0001_*.sql` with `ALTER TABLE "events" ADD COLUMN ...` statements.

- [ ] **Step 4: Inspect & augment the generated migration**

Open the new `drizzle/0001_*.sql` file. The auto-generated SQL will not include the FK from `host_player_id` → `players(id)` (because Drizzle doesn't know about it). Append this to the generated file:

```sql
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_host_player_id_players_id_fk" FOREIGN KEY ("host_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
```

- [ ] **Step 5: Apply migration**

```bash
npm run migrate
```

Expected: `[migrate] done`.

- [ ] **Step 6: Verify typecheck**

```bash
npm run typecheck
```

Expected: same errors as before (`eventRowToConfig` etc.) — schema is consistent.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts drizzle/0001_*.sql drizzle/meta/
git commit -m "schema: add round state columns to events (host_player_id, current_round_*, round_winners)"
```

---

### Task 4: Update `eventRowToConfig` mapper

**Files:**
- Modify: `lib/db/queries.ts:36-49`

- [ ] **Step 1: Map new columns in `eventRowToConfig`**

Replace the existing `eventRowToConfig` function with:

```ts
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
```

- [ ] **Step 2: Add the new type imports at the top of `lib/db/queries.ts`**

Replace the existing types import block (lines 17-23) with:

```ts
import type {
  ChallengeId,
  EventConfig,
  EventStatus,
  Player,
  RoundStatus,
  RoundWinnerEntry,
  Team,
} from "@/lib/types";
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: only store-side errors remaining (handled in Task 11). Server side and DB layer should now type-clean for this file.

- [ ] **Step 4: Commit**

```bash
git add lib/db/queries.ts
git commit -m "queries: map new round columns in eventRowToConfig"
```

---

## Phase 2 — Database queries

### Task 5: Add `setHostPlayer` query

**Files:**
- Modify: `lib/db/queries.ts` (append at end)

- [ ] **Step 1: Add the query function**

Append to `lib/db/queries.ts`:

```ts
/**
 * Set or clear the host player for an event. Returns the updated event config,
 * or null if the event isn't found, or `{ error: 'invalid-player' }` if a
 * playerId was supplied but doesn't belong to this event.
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
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: same store-side errors only.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries.ts
git commit -m "queries: add setHostPlayer (validates player belongs to event)"
```

---

### Task 6: Add `enabledChallengeOrder` helper

**Files:**
- Modify: `lib/challenges/index.ts` (append at end)

- [ ] **Step 1: Add helper to compute enabled subset**

Append to `lib/challenges/index.ts`:

```ts
/**
 * Filter CHALLENGE_ORDER down to only the challenges enabled in this event.
 * Used to drive the heptathlon: round N maps to enabledChallengeOrder(event)[N].
 */
export function enabledChallengeOrder(
  challenges: EventConfig["challenges"],
): ChallengeId[] {
  return CHALLENGE_ORDER.filter((id) => challenges[id]?.enabled);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/challenges/index.ts
git commit -m "challenges: add enabledChallengeOrder helper"
```

---

### Task 7: Add `startRound` query (advance + redo)

**Files:**
- Modify: `lib/db/queries.ts` (append at end)

- [ ] **Step 1: Add the import**

In `lib/db/queries.ts`, find the existing import line:

```ts
import {
  defaultChallengeConfig,
} from "@/lib/challenges";
```

Replace with:

```ts
import {
  defaultChallengeConfig,
  enabledChallengeOrder,
} from "@/lib/challenges";
```

- [ ] **Step 2: Add the query**

Append to `lib/db/queries.ts`:

```ts
const COUNTDOWN_MS = 5000;

/**
 * Start the next undecided round, or redo a specific round.
 *
 * Advance path (no redo): if no round is currently live, picks the next round
 * that doesn't yet have a winner in `round_winners`. If all rounds are
 * decided, returns `{ error: 'all-decided' }`.
 *
 * Redo path (`redo: true, roundIndex`): wipes final_progress for that round's
 * challenge, splices `round_winners` from index `roundIndex` onward, then
 * starts that round.
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

    // Splice round_winners from this index onward.
    const trimmedWinners = winners.slice(0, targetIndex);

    // Wipe final_progress for the challenges from this index forward
    // (since redoing round N invalidates rounds N..end).
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
    // Advance path: must not have a live round currently.
    if (eventRow.currentRoundStatus === "live") {
      return { error: "round-live" };
    }
    targetIndex = winners.length; // next undecided
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
      // Don't clear winnerTeamId here — only set when finished.
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
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: same store-side errors only.

- [ ] **Step 4: Commit**

```bash
git add lib/db/queries.ts
git commit -m "queries: add startRound (advance or redo with progress wipe)"
```

---

### Task 8: Add `endRound` query (atomic flip)

**Files:**
- Modify: `lib/db/queries.ts` (append at end)

- [ ] **Step 1: Add the query**

Append to `lib/db/queries.ts`:

```ts
/**
 * Atomically end the currently-live round and append a winner.
 *
 * `requestedTeamId` semantics:
 *  - If `mode === 'auto'`, the caller is claiming the team has just completed
 *    the threshold. Server validates by reading `final_progress` for the
 *    current challenge — only honored if that team's row is `completed=true`.
 *    If the team's progress isn't actually completed, returns
 *    `{ error: 'not-completed' }`.
 *  - If `mode === 'host'`, no validation — host picks the winner. If
 *    `requestedTeamId` is omitted, the server picks per the rules in the
 *    spec (highest team-total for accumulator challenges; smallest aggregate
 *    error for north; first-completed otherwise).
 *
 * First-write-wins: only flips status from 'live' to 'decided'. Concurrent
 * callers race; the loser gets `{ alreadyDecided: true, ... }`.
 *
 * If this was the last enabled round, also sets event status to 'finished'
 * and computes overall winnerTeamId (most round wins; tiebreak below).
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

  // Decide winner.
  let winnerTeamId: string | null = null;

  // Pull current persisted progress for this event.
  const fpRows = await db
    .select()
    .from(finalProgress)
    .where(eq(finalProgress.eventId, eventRow.id));

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
    // mode === 'host'
    if (input.requestedTeamId) {
      winnerTeamId = input.requestedTeamId;
    } else {
      // Server picks. Need team list.
      const teamRows = await db
        .select()
        .from(teams)
        .where(eq(teams.eventId, eventRow.id));
      if (teamRows.length === 0) return { error: "no-teams" };

      if (challenge === "north") {
        // Smallest aggregate error wins. We don't have per-guess data on the
        // server (it's PubNub-only); fall back to picking the first team
        // with a completed final_progress row, else the first team.
        // (For accuracy, the host UI should pass requestedTeamId for north.)
        const completed = fpRows.filter(
          (r) => r.challenge === challenge && r.completed,
        );
        winnerTeamId = completed[0]?.teamId ?? teamRows[0].id;
      } else if (
        challenge === "scream" ||
        challenge === "shake"
      ) {
        // First completed wins; fallback to first team if none completed.
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
        // Accumulator challenges (distance/steps/taps/spin): highest value wins.
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
  const existingWinners =
    (eventRow.roundWinners as RoundWinnerEntry[]) ?? [];
  // Only append if this round's slot isn't already filled (defensive).
  const trimmed = existingWinners.slice(0, idx);
  const nextWinners = [...trimmed, newWinnerEntry];

  // Compute whether this completes the event.
  const isLastRound = idx + 1 >= order.length;

  // Compute overall winner if event finishing.
  let overallWinnerTeamId: string | null = null;
  if (isLastRound) {
    const counts = new Map<string, number>();
    for (const w of nextWinners) {
      counts.set(w.teamId, (counts.get(w.teamId) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length === 1 || (sorted.length > 1 && sorted[0][1] > sorted[1][1])) {
      overallWinnerTeamId = sorted[0][0];
    } else {
      // Tied. Prefer the team that won the `north` round.
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

  // Atomic flip: only update if status is still 'live' and index unchanged.
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
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: same store-side errors only.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries.ts
git commit -m "queries: add endRound (auto/host modes, first-write-wins, computes champion)"
```

---

### Task 9: Update `resetEventProgress` and `resetEventToLobby` to clear round columns

**Files:**
- Modify: `lib/db/queries.ts:304-382`

- [ ] **Step 1: Update `resetEventProgress`**

Replace the body of `resetEventProgress` (lines 304-339) with:

```ts
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
```

- [ ] **Step 2: Update `resetEventToLobby`**

Replace the `.set({...})` block in `resetEventToLobby` (around lines 360-368) with:

```ts
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
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: store-side errors only.

- [ ] **Step 4: Commit**

```bash
git add lib/db/queries.ts
git commit -m "queries: reset paths clear round state columns"
```

---

## Phase 3 — API contract & store

### Task 10: Add API contract types for new endpoints

**Files:**
- Modify: `lib/api/contract.ts`

- [ ] **Step 1: Append new contract types**

Append to `lib/api/contract.ts`:

```ts
// ---------- PATCH /api/events/:code/host-player ----------
// Host-cookie protected. Sets or clears the designated host player.
export interface SetHostPlayerRequest {
  playerId: string | null;
}
export interface SetHostPlayerResponse {
  event: EventConfig;
}

// ---------- POST /api/events/:code/round/start ----------
// Auth: host-cookie OR { playerId } in body matching events.host_player_id.
// Advances to next undecided round, or redoes a specific round.
export interface StartRoundRequest {
  playerId?: string;        // for host-player auth path
  redo?: boolean;
  roundIndex?: number;      // required if redo is true
}
export interface StartRoundResponse {
  event: EventConfig;
  challenge: import("@/lib/types").ChallengeId;
  startsAt: number;
}

// ---------- POST /api/events/:code/round/end ----------
// Auth modes:
//  - mode='auto': any client; server validates the team has completed
//    the current challenge in final_progress.
//  - mode='host': requires host-cookie OR matching playerId.
export interface EndRoundRequest {
  mode: "auto" | "host";
  playerId?: string;            // for host-player auth path
  teamId?: string;              // required when mode='auto'; optional when 'host'
}
export interface EndRoundResponse {
  event: EventConfig;
  winnerTeamId: string;
  decidedAt: number;
  eventFinished: boolean;
  alreadyDecided: boolean;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: store-side errors only.

- [ ] **Step 3: Commit**

```bash
git add lib/api/contract.ts
git commit -m "contract: types for host-player and round/start, round/end endpoints"
```

---

### Task 11: Extend store `receive` for new message kinds

**Files:**
- Modify: `lib/store/index.ts:137-220`

- [ ] **Step 1: Add new cases to the `receive` switch**

In `lib/store/index.ts`, find the `receive` function's `switch (msg.kind)` statement and add these cases just before `case "progress-reset":`:

```ts
      case "round-start": {
        const ev = state.event;
        if (!ev) return;
        // Wipe in-memory progress for this challenge across all teams so the
        // round starts clean. Past round winners stay in event.roundWinners.
        const newProgress: Record<string, TeamProgress> = {};
        for (const tid of Object.keys(state.progress)) {
          const tp = state.progress[tid];
          newProgress[tid] = {
            ...tp,
            [msg.challenge]: {
              value: 0,
              completed: false,
              completedAt: null,
              perPlayer: {},
              guesses: [],
            },
          };
        }
        set({
          progress: newProgress,
          liveLevels: {},
          event: {
            ...ev,
            currentRoundIndex: msg.roundIndex,
            currentRoundStatus: "live",
            currentRoundStartsAt: msg.startsAt,
          },
        });
        break;
      }

      case "round-end": {
        const ev = state.event;
        if (!ev) return;
        const trimmed = ev.roundWinners.slice(0, msg.roundIndex);
        const nextWinners = [
          ...trimmed,
          {
            challenge: msg.challenge,
            teamId: msg.winnerTeamId,
            decidedAt: msg.decidedAt,
          },
        ];
        set({
          event: {
            ...ev,
            currentRoundStatus: "decided",
            roundWinners: nextWinners,
          },
        });
        break;
      }

      case "host-changed": {
        const ev = state.event;
        if (!ev) return;
        set({
          event: {
            ...ev,
            hostPlayerId: msg.hostPlayerId,
          },
        });
        break;
      }
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean. The store now handles all `ProgressMsg` variants.

- [ ] **Step 3: Commit**

```bash
git add lib/store/index.ts
git commit -m "store: handle round-start, round-end, host-changed messages"
```

---

### Task 12: Add round-wins selectors

**Files:**
- Modify: `lib/store/selectors.ts`

- [ ] **Step 1: Add a `useRoundStandings` selector**

Append to `lib/store/selectors.ts`:

```ts
export interface RoundStanding {
  team: Team;
  wins: number;
  // Round indices where this team won (for tooltip / breakdown UIs).
  wonRounds: number[];
}

/**
 * Standings ordered by round wins (descending). Teams with zero wins still
 * appear, sorted alphabetically as a stable secondary key. Use for the
 * heptathlon scoreboard.
 */
export function useRoundStandings(): RoundStanding[] {
  const teams = useToastyStore((s) => s.teams);
  const event = useToastyStore((s) => s.event);

  return useMemo(() => {
    const winnerEntries = event?.roundWinners ?? [];
    const winsByTeam = new Map<string, number[]>();
    winnerEntries.forEach((w, idx) => {
      const arr = winsByTeam.get(w.teamId) ?? [];
      arr.push(idx);
      winsByTeam.set(w.teamId, arr);
    });
    return Object.values(teams)
      .map((team) => ({
        team,
        wins: (winsByTeam.get(team.id) ?? []).length,
        wonRounds: winsByTeam.get(team.id) ?? [],
      }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.team.name.localeCompare(b.team.name);
      });
  }, [teams, event]);
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
```

The new selectors don't introduce new type imports — `Team` is already imported at the top of the file from earlier.

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/store/selectors.ts
git commit -m "selectors: useRoundStandings + useRoundWinnerByIndex"
```

---

## Phase 4 — Server route handlers

### Task 13: Add `PATCH /api/events/[code]/host-player` route

**Files:**
- Create: `app/api/events/[code]/host-player/route.ts`

- [ ] **Step 1: Create the route file**

Create `app/api/events/[code]/host-player/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized } from "@/lib/auth/host";
import { setHostPlayer } from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { SetHostPlayerResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    playerId: z.string().uuid().nullable(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<SetHostPlayerResponse | { error: string }>> {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid event code" }, { status: 400 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await setHostPlayer({
    code,
    playerId: parsed.data.playerId,
  });
  if ("error" in result) {
    if (result.error === "not-found") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (result.error === "invalid-player") {
      return NextResponse.json(
        { error: "Player not in this event" },
        { status: 400 },
      );
    }
  } else {
    try {
      await publishFromServer(code, {
        kind: "host-changed",
        hostPlayerId: result.event.hostPlayerId,
        ts: Date.now(),
      });
    } catch (err) {
      console.error("[host-player] PubNub publish failed", err);
    }
    return NextResponse.json({ event: result.event });
  }

  // Should be unreachable.
  return NextResponse.json({ error: "Unknown error" }, { status: 500 });
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/events/[code]/host-player/route.ts
git commit -m "api: PATCH /events/:code/host-player"
```

---

### Task 14: Add helper for host-player auth check

**Files:**
- Modify: `lib/auth/host.ts`

- [ ] **Step 1: Read current file**

```bash
cat lib/auth/host.ts
```

- [ ] **Step 2: Append a helper to verify a player is the event's host**

Append to `lib/auth/host.ts`:

```ts
import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Verify that `playerId` is the designated host of the event identified by
 * `code`. Returns true if so, false otherwise (including event-not-found).
 */
export async function isHostPlayer(
  code: string,
  playerId: string | undefined,
): Promise<boolean> {
  if (!playerId) return false;
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.code, code), eq(events.hostPlayerId, playerId)))
    .limit(1);
  return rows.length > 0;
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/auth/host.ts
git commit -m "auth: add isHostPlayer helper for host-player route auth"
```

---

### Task 15: Add `POST /api/events/[code]/round/start` route

**Files:**
- Create: `app/api/events/[code]/round/start/route.ts`

- [ ] **Step 1: Create the route file**

Create `app/api/events/[code]/round/start/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized, isHostPlayer } from "@/lib/auth/host";
import { startRound } from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { StartRoundResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    playerId: z.string().uuid().optional(),
    redo: z.boolean().optional(),
    roundIndex: z.number().int().nonnegative().optional(),
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<StartRoundResponse | { error: string }>> {
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid event code" }, { status: 400 });
  }

  let json: unknown = {};
  try {
    const text = await req.text();
    json = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Auth: host cookie OR matching host-player.
  const cookieAuthed = await isHostAuthorized();
  const playerAuthed =
    !cookieAuthed && (await isHostPlayer(code, parsed.data.playerId));
  if (!cookieAuthed && !playerAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await startRound({
    code,
    redo: parsed.data.redo,
    roundIndex: parsed.data.roundIndex,
  });
  if ("error" in result) {
    if (result.error === "not-found") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (result.error === "all-decided") {
      return NextResponse.json(
        { error: "All rounds are decided" },
        { status: 409 },
      );
    }
    if (result.error === "round-live") {
      return NextResponse.json(
        { error: "A round is already live" },
        { status: 409 },
      );
    }
    if (result.error === "invalid-index") {
      return NextResponse.json(
        { error: "Invalid round index" },
        { status: 400 },
      );
    }
  } else {
    try {
      if (result.progressReset) {
        await publishFromServer(code, {
          kind: "progress-reset",
          ts: Date.now(),
        });
      }
      await publishFromServer(code, {
        kind: "round-start",
        roundIndex: result.event.currentRoundIndex ?? 0,
        challenge: result.challenge,
        startsAt: result.startsAt,
        ts: Date.now(),
      });
    } catch (err) {
      console.error("[round/start] PubNub publish failed", err);
    }
    return NextResponse.json({
      event: result.event,
      challenge: result.challenge,
      startsAt: result.startsAt,
    });
  }

  return NextResponse.json({ error: "Unknown error" }, { status: 500 });
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/events/[code]/round/start/route.ts
git commit -m "api: POST /events/:code/round/start (host-cookie or host-player auth)"
```

---

### Task 16: Add `POST /api/events/[code]/round/end` route

**Files:**
- Create: `app/api/events/[code]/round/end/route.ts`

- [ ] **Step 1: Create the route file**

Create `app/api/events/[code]/round/end/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { isHostAuthorized, isHostPlayer } from "@/lib/auth/host";
import { endRound } from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { EndRoundResponse } from "@/lib/api/contract";

const BodySchema = z
  .object({
    mode: z.enum(["auto", "host"]),
    playerId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<EndRoundResponse | { error: string }>> {
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid event code" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Auth differs by mode:
  //  - mode='auto': open. Server validates the claim by reading final_progress.
  //  - mode='host': host-cookie OR matching host-player.
  if (parsed.data.mode === "host") {
    const cookieAuthed = await isHostAuthorized();
    const playerAuthed =
      !cookieAuthed && (await isHostPlayer(code, parsed.data.playerId));
    if (!cookieAuthed && !playerAuthed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (parsed.data.mode === "auto" && !parsed.data.teamId) {
    return NextResponse.json(
      { error: "teamId required for auto mode" },
      { status: 400 },
    );
  }

  const result = await endRound({
    code,
    mode: parsed.data.mode,
    requestedTeamId: parsed.data.teamId,
  });
  if ("error" in result) {
    if (result.error === "not-found") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (result.error === "no-live-round") {
      return NextResponse.json(
        { error: "No live round to end" },
        { status: 409 },
      );
    }
    if (result.error === "not-completed") {
      return NextResponse.json(
        { error: "Team has not completed this challenge" },
        { status: 409 },
      );
    }
    if (result.error === "no-teams") {
      return NextResponse.json(
        { error: "No teams to award" },
        { status: 409 },
      );
    }
  } else {
    if (!result.alreadyDecided) {
      try {
        await publishFromServer(code, {
          kind: "round-end",
          roundIndex: result.event.currentRoundIndex ?? 0,
          challenge: result.challenge,
          winnerTeamId: result.winnerTeamId,
          decidedAt: result.decidedAt,
          ts: Date.now(),
        });
        if (result.eventFinished) {
          await publishFromServer(code, {
            kind: "event-state",
            status: "finished",
            winnerTeamId: result.event.winnerTeamId ?? undefined,
            ts: Date.now(),
          });
        }
      } catch (err) {
        console.error("[round/end] PubNub publish failed", err);
      }
    }
    return NextResponse.json({
      event: result.event,
      winnerTeamId: result.winnerTeamId,
      decidedAt: result.decidedAt,
      eventFinished: result.eventFinished,
      alreadyDecided: result.alreadyDecided,
    });
  }

  return NextResponse.json({ error: "Unknown error" }, { status: 500 });
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/events/[code]/round/end/route.ts
git commit -m "api: POST /events/:code/round/end (auto/host modes, first-write-wins)"
```

---

### Task 17: Make `/start` route a thin wrapper over round/start

**Files:**
- Modify: `app/api/events/[code]/start/route.ts`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `app/api/events/[code]/start/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { isHostAuthorized } from "@/lib/auth/host";
import { startRound } from "@/lib/db/queries";
import { publishFromServer } from "@/lib/pubnub/server";
import { normalizeEventCode } from "@/lib/utils/code";
import type { StartEventResponse } from "@/lib/api/contract";

/**
 * Legacy "start event" entry point used by the laptop dashboard's StartButton.
 * Now a thin wrapper over the round/start flow: starts round 0 (or the next
 * undecided round if one exists). Host-cookie protected.
 */
export async function POST(
  _req: Request,
  { params }: { params: { code: string } },
): Promise<NextResponse<StartEventResponse | { error: string }>> {
  if (!(await isHostAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const code = normalizeEventCode(params.code);
  if (!code) {
    return NextResponse.json({ error: "Invalid event code" }, { status: 400 });
  }

  const result = await startRound({ code });
  if ("error" in result) {
    if (result.error === "not-found") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    if (result.error === "all-decided") {
      return NextResponse.json(
        { error: "All rounds are already decided" },
        { status: 409 },
      );
    }
    if (result.error === "round-live") {
      return NextResponse.json(
        { error: "A round is already live" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }

  try {
    await publishFromServer(code, {
      kind: "round-start",
      roundIndex: result.event.currentRoundIndex ?? 0,
      challenge: result.challenge,
      startsAt: result.startsAt,
      ts: Date.now(),
    });
    await publishFromServer(code, {
      kind: "event-state",
      status: "active",
      ts: Date.now(),
    });
  } catch (err) {
    console.error("[start] PubNub publish failed", err);
  }

  return NextResponse.json({ event: result.event });
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/events/[code]/start/route.ts
git commit -m "api: /start now wraps round/start (kicks off round 0)"
```

---

### Task 18: Remove obsolete `/finish` route

**Files:**
- Delete: `app/api/events/[code]/finish/route.ts`

- [ ] **Step 1: Delete the file**

```bash
rm "app/api/events/[code]/finish/route.ts"
```

(The path includes `[code]` square brackets; quote it so zsh doesn't try to glob.)

- [ ] **Step 2: Remove from contract**

In `lib/api/contract.ts`, delete the `FinishEventRequest` and `FinishEventResponse` interfaces (lines 129-147 of the original file).

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: errors in `app/e/[code]/play/page.tsx` (still imports `FinishEventRequest` and POSTs to `/finish`). We'll fix that in Task 27 when rebuilding the play page.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "api: remove obsolete /finish route (heptathlon model uses /round/end)"
```

---

## Phase 5 — Player UI: journey + countdown

### Task 19: Create `CountdownOverlay` component

**Files:**
- Create: `components/play/CountdownOverlay.tsx`

- [ ] **Step 1: Create the file**

Create `components/play/CountdownOverlay.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { CHALLENGES } from "@/lib/challenges";
import type { ChallengeId } from "@/lib/types";

interface Props {
  startsAt: number; // ms epoch — when the round begins
  challenge: ChallengeId;
  onDone: () => void;
}

/**
 * Full-screen 5-4-3-2-1-GO overlay that auto-dismisses at startsAt.
 * Driven by requestAnimationFrame so it stays in sync across devices
 * regardless of when each phone mounted the component.
 */
export function CountdownOverlay({ startsAt, challenge, onDone }: Props) {
  const def = CHALLENGES[challenge];
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, startsAt - Date.now()),
  );

  useEffect(() => {
    let raf = 0;
    let done = false;
    function tick() {
      const left = Math.max(0, startsAt - Date.now());
      setRemainingMs(left);
      if (left <= 0 && !done) {
        done = true;
        onDone();
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startsAt, onDone]);

  const seconds = Math.ceil(remainingMs / 1000);
  const display = remainingMs <= 0 ? "GO!" : String(seconds);

  return (
    <div className="fixed inset-0 z-50 bg-bg/95 backdrop-blur-md flex flex-col items-center justify-center safe-top safe-bottom">
      <div className="text-xs uppercase tracking-[0.4em] opacity-60 mb-3">
        Next up
      </div>
      <div className="text-5xl mb-1">{def.emoji}</div>
      <div className="font-display text-2xl font-extrabold tracking-widest mb-8">
        {def.label.toUpperCase()}
      </div>
      <div
        key={display}
        className="font-display font-extrabold tracking-tighter bg-gradient-party bg-clip-text text-transparent text-[12rem] leading-none animate-[pulse_0.4s_ease-in-out]"
      >
        {display}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/play/CountdownOverlay.tsx
git commit -m "play: add CountdownOverlay component (5s rAF-driven sync)"
```

---

### Task 20: Create `RoundCard` component

**Files:**
- Create: `components/play/RoundCard.tsx`

- [ ] **Step 1: Create the file**

Create `components/play/RoundCard.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { CHALLENGES } from "@/lib/challenges";
import type { ChallengeId, Team } from "@/lib/types";

export type RoundCardState =
  | { kind: "past"; winner: Team | null }
  | { kind: "current-live" }
  | { kind: "current-decided"; winner: Team | null }
  | { kind: "future" };

interface Props {
  ordinal: number; // 1-based round number
  challenge: ChallengeId;
  state: RoundCardState;
  code: string;
  isMyTeamWinner: boolean;
  children?: React.ReactNode; // host controls slot
}

const ORDINAL_GLYPH = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

export function RoundCard({
  ordinal,
  challenge,
  state,
  code,
  isMyTeamWinner,
  children,
}: Props) {
  const def = CHALLENGES[challenge];
  const glyph = ORDINAL_GLYPH[ordinal - 1] ?? `#${ordinal}`;

  const baseClasses = "rounded-2xl p-4 transition-all";
  let toneClasses = "";
  let trailing: React.ReactNode = null;
  let inner: React.ReactNode = null;

  switch (state.kind) {
    case "past":
      toneClasses = isMyTeamWinner
        ? "bg-gradient-done text-white"
        : "bg-bg-card text-white opacity-70";
      trailing = state.winner ? (
        <div className="flex items-center gap-2">
          <span className="text-xl">🥇</span>
          <span className="text-2xl">{state.winner.emoji}</span>
        </div>
      ) : null;
      break;
    case "current-decided":
      toneClasses = isMyTeamWinner
        ? "bg-gradient-done text-white ring-2 ring-white/40"
        : "bg-bg-card text-white border-2 border-accent-orange/40";
      trailing = state.winner ? (
        <div className="flex items-center gap-2">
          <span className="text-xl">🥇</span>
          <span className="text-2xl">{state.winner.emoji}</span>
        </div>
      ) : null;
      break;
    case "current-live":
      toneClasses =
        "bg-bg-card text-white border-2 border-accent-orange shadow-[0_0_24px_rgba(255,140,66,0.45)]";
      trailing = (
        <div className="text-[10px] font-extrabold tracking-widest uppercase text-accent-orange flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-accent-orange animate-pulse" />
          LIVE
        </div>
      );
      break;
    case "future":
      toneClasses = "bg-bg-card/40 text-white opacity-40";
      trailing = <div className="text-xl opacity-60">🔒</div>;
      break;
  }

  inner = (
    <div className="flex items-center gap-3">
      <div className="font-display font-extrabold text-2xl opacity-70 w-7 text-center tabular-nums">
        {glyph}
      </div>
      <div className="text-3xl">{def.emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-extrabold tracking-wider uppercase text-sm truncate">
          {def.label}
        </div>
        <div className="text-[11px] opacity-60 truncate">{def.description}</div>
      </div>
      {trailing}
    </div>
  );

  if (state.kind === "current-live") {
    return (
      <Link href={`/e/${code}/play/${challenge}`} className={`${baseClasses} ${toneClasses} block`}>
        {inner}
        {children}
      </Link>
    );
  }

  return (
    <div className={`${baseClasses} ${toneClasses}`}>
      {inner}
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/play/RoundCard.tsx
git commit -m "play: add RoundCard component (past/current-live/decided/future states)"
```

---

### Task 21: Create `HostRoundControls` component

**Files:**
- Create: `components/play/HostRoundControls.tsx`

- [ ] **Step 1: Create the file**

Create `components/play/HostRoundControls.tsx` with:

```tsx
"use client";

import { useState } from "react";
import type { Team } from "@/lib/types";

type Variant =
  | { kind: "start"; label: string }
  | { kind: "end"; teams: Team[] }
  | { kind: "redo" };

interface Props {
  variant: Variant;
  onStart?: () => Promise<void> | void;
  onEnd?: (winnerTeamId: string | null) => Promise<void> | void; // null = server picks
  onRedo?: () => Promise<void> | void;
}

export function HostRoundControls({ variant, onStart, onEnd, onRedo }: Props) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  async function run(fn?: () => Promise<void> | void) {
    if (!fn || busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  if (variant.kind === "start") {
    return (
      <div className="mt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(onStart)}
          className="w-full py-4 rounded-2xl bg-gradient-party font-display text-lg font-extrabold tracking-widest disabled:opacity-50"
        >
          {busy ? "STARTING…" : `▶ ${variant.label}`}
        </button>
      </div>
    );
  }

  if (variant.kind === "end") {
    if (!picking) {
      return (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setPicking(true)}
            className="flex-1 py-3 rounded-xl bg-bg-deep border border-accent-pink/40 text-accent-pink font-bold disabled:opacity-50"
          >
            ⏹ END ROUND
          </button>
        </div>
      );
    }
    return (
      <div className="mt-3 rounded-xl bg-bg-deep p-3">
        <div className="text-[10px] uppercase tracking-widest opacity-70 mb-2 font-bold">
          pick winner
        </div>
        <div className="flex flex-col gap-2">
          {variant.teams.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={async () => {
                await run(() => onEnd?.(t.id));
                setPicking(false);
              }}
              className="w-full text-left px-3 py-2 rounded-xl bg-bg-card font-bold disabled:opacity-50"
            >
              {t.emoji} {t.name}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              await run(() => onEnd?.(null));
              setPicking(false);
            }}
            className="w-full px-3 py-2 rounded-xl bg-bg-deep border border-white/10 text-sm font-bold opacity-80 disabled:opacity-50"
          >
            🤖 auto (server picks)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPicking(false)}
            className="text-[11px] opacity-50 underline"
          >
            cancel
          </button>
        </div>
      </div>
    );
  }

  // variant.kind === 'redo'
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => run(onRedo)}
        className="text-xs underline opacity-70 hover:opacity-100 disabled:opacity-30"
      >
        ↻ redo this round
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/play/HostRoundControls.tsx
git commit -m "play: add HostRoundControls (start/end/redo button bar)"
```

---

### Task 22: Add fetch helpers for round endpoints

**Files:**
- Modify: `components/host/_fetch.ts`

- [ ] **Step 1: Add new fetchers**

Append to `components/host/_fetch.ts`:

```ts
import type {
  EndRoundRequest,
  EndRoundResponse,
  SetHostPlayerRequest,
  SetHostPlayerResponse,
  StartRoundRequest,
  StartRoundResponse,
} from "@/lib/api/contract";

export async function setHostPlayer(
  code: string,
  body: SetHostPlayerRequest,
): Promise<SetHostPlayerResponse> {
  return http<SetHostPlayerResponse>(`/api/events/${code}/host-player`, {
    method: "PATCH",
    body,
  });
}

export async function startRound(
  code: string,
  body: StartRoundRequest = {},
): Promise<StartRoundResponse> {
  return http<StartRoundResponse>(`/api/events/${code}/round/start`, {
    method: "POST",
    body,
  });
}

export async function endRound(
  code: string,
  body: EndRoundRequest,
): Promise<EndRoundResponse> {
  return http<EndRoundResponse>(`/api/events/${code}/round/end`, {
    method: "POST",
    body,
  });
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/host/_fetch.ts
git commit -m "fetchers: add setHostPlayer, startRound, endRound"
```

---

### Task 23: Create `JourneyView` component

**Files:**
- Create: `components/play/JourneyView.tsx`

- [ ] **Step 1: Create the file**

Create `components/play/JourneyView.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToastyStore } from "@/lib/store";
import {
  useRoundStandings,
  useRoundWinnerByIndex,
} from "@/lib/store/selectors";
import { CHALLENGES, enabledChallengeOrder } from "@/lib/challenges";
import { TeamHeader } from "@/components/dashboard/TeamHeader";
import { TeammateOrbit } from "@/components/dashboard/TeammateOrbit";
import { RoundCard, type RoundCardState } from "./RoundCard";
import { HostRoundControls } from "./HostRoundControls";
import { CountdownOverlay } from "./CountdownOverlay";
import { startRound, endRound } from "@/components/host/_fetch";

interface Props {
  code: string;
  myPlayerId: string | null;
}

export function JourneyView({ code, myPlayerId }: Props) {
  const router = useRouter();
  const event = useToastyStore((s) => s.event);
  const teams = useToastyStore((s) => s.teams);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const standings = useRoundStandings();
  const winnerByRound = useRoundWinnerByIndex();

  const isHost = !!myPlayerId && event?.hostPlayerId === myPlayerId;
  const teamList = useMemo(() => Object.values(teams), [teams]);

  const order = useMemo(() => {
    if (!event) return [];
    return enabledChallengeOrder(event.challenges);
  }, [event]);

  // Countdown management: show overlay when there's a live round whose
  // startsAt is in the future. When countdown expires, navigate to the
  // challenge view.
  const [showCountdown, setShowCountdown] = useState(false);
  const lastSeenStartsAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!event) return;
    const startsAt = event.currentRoundStartsAt;
    const isLive = event.currentRoundStatus === "live";
    if (!isLive || startsAt === null) {
      setShowCountdown(false);
      return;
    }
    // Always render countdown if startsAt is in the future. If it already
    // passed, skip directly to challenge view (caller of this component
    // navigates) — handled below.
    if (Date.now() < startsAt) {
      setShowCountdown(true);
      lastSeenStartsAtRef.current = startsAt;
    } else {
      setShowCountdown(false);
    }
  }, [event?.currentRoundStartsAt, event?.currentRoundStatus, event]);

  // Auto-navigate to challenge view when countdown expires (or when
  // round becomes live with startsAt already past — e.g. refresh).
  useEffect(() => {
    if (!event) return;
    if (event.currentRoundStatus !== "live") return;
    if (event.currentRoundIndex === null) return;
    const startsAt = event.currentRoundStartsAt;
    if (startsAt === null) return;
    if (showCountdown) return; // CountdownOverlay handles nav onDone
    if (Date.now() < startsAt) return;
    const challenge = order[event.currentRoundIndex];
    if (challenge) {
      router.replace(`/e/${code}/play/${challenge}`);
    }
  }, [
    event?.currentRoundStatus,
    event?.currentRoundIndex,
    event?.currentRoundStartsAt,
    showCountdown,
    order,
    router,
    code,
    event,
  ]);

  if (!event) return null;

  const currentIdx = event.currentRoundIndex;
  const currentStatus = event.currentRoundStatus;
  const totalRounds = order.length;

  const cards: Array<{
    ordinal: number;
    challenge: (typeof order)[number];
    state: RoundCardState;
  }> = order.map((challenge, idx) => {
    if (idx < (event.roundWinners?.length ?? 0)) {
      const winnerTeamId = winnerByRound[idx] ?? null;
      const winner = winnerTeamId ? teams[winnerTeamId] ?? null : null;
      return {
        ordinal: idx + 1,
        challenge,
        state: { kind: "past", winner },
      };
    }
    if (idx === currentIdx) {
      if (currentStatus === "decided") {
        const winnerTeamId = winnerByRound[idx] ?? null;
        const winner = winnerTeamId ? teams[winnerTeamId] ?? null : null;
        return {
          ordinal: idx + 1,
          challenge,
          state: { kind: "current-decided", winner },
        };
      }
      return { ordinal: idx + 1, challenge, state: { kind: "current-live" } };
    }
    // future: either null currentIdx and idx > 0, or idx > currentIdx,
    // or "between rounds" where idx is just past the last decided.
    return { ordinal: idx + 1, challenge, state: { kind: "future" } };
  });

  // Determine the "next start" target for the host's start button:
  //  - lobby (currentIdx null, no winners): "START HEPTATHLON" -> round 0
  //  - between rounds (status decided): "START ROUND N+1" -> currentIdx + 1
  //  - all decided: nothing
  let startTarget: { ordinal: number; label: string } | null = null;
  if (event.status === "lobby" || (currentStatus === null && event.roundWinners.length === 0)) {
    startTarget = { ordinal: 1, label: "START HEPTATHLON" };
  } else if (currentStatus === "decided" && (currentIdx ?? -1) + 1 < totalRounds) {
    startTarget = {
      ordinal: (currentIdx ?? 0) + 2,
      label: `START ROUND ${(currentIdx ?? 0) + 2}`,
    };
  }

  // Find the index where the host's "start" button should sit. For lobby:
  // before the first card. For between-rounds: on the next future card.
  const startCardIdx =
    startTarget && startTarget.ordinal - 1 < cards.length
      ? startTarget.ordinal - 1
      : null;

  async function handleStart() {
    if (!myPlayerId) return;
    try {
      await startRound(code, { playerId: myPlayerId });
    } catch (err) {
      console.error("[journey] startRound failed", err);
    }
  }

  async function handleEnd(winnerTeamId: string | null) {
    if (!myPlayerId) return;
    try {
      await endRound(code, {
        mode: "host",
        playerId: myPlayerId,
        ...(winnerTeamId ? { teamId: winnerTeamId } : {}),
      });
    } catch (err) {
      console.error("[journey] endRound failed", err);
    }
  }

  async function handleRedo(roundIndex: number) {
    if (!myPlayerId) return;
    try {
      await startRound(code, {
        playerId: myPlayerId,
        redo: true,
        roundIndex,
      });
    } catch (err) {
      console.error("[journey] redoRound failed", err);
    }
  }

  return (
    <>
      {showCountdown &&
        currentIdx !== null &&
        event.currentRoundStartsAt !== null && (
          <CountdownOverlay
            startsAt={event.currentRoundStartsAt}
            challenge={order[currentIdx]}
            onDone={() => {
              setShowCountdown(false);
              router.replace(`/e/${code}/play/${order[currentIdx]}`);
            }}
          />
        )}
      <main className="min-h-screen flex flex-col p-3 safe-top safe-bottom">
        <TeamHeader />
        <TeammateOrbit />

        {/* Round-wins standings */}
        <div className="rounded-2xl bg-bg-card p-3 mt-2">
          <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1 font-bold">
            Standings · {event.roundWinners.length}/{totalRounds} rounds
          </div>
          {standings.map((row, i) => {
            const medals = ["🥇", "🥈", "🥉"];
            const isMe = row.team.id === myTeamId;
            return (
              <div
                key={row.team.id}
                className={`flex justify-between items-center py-1 text-sm ${
                  isMe ? "text-accent-orange font-extrabold" : ""
                }`}
              >
                <span className="truncate">
                  {medals[i] ?? "·"} {row.team.emoji} {row.team.name}
                  {isMe ? " (us)" : ""}
                </span>
                <span className="font-bold tabular-nums">
                  {row.wins} {row.wins === 1 ? "win" : "wins"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Journey */}
        <div className="flex flex-col gap-2 mt-3">
          {cards.map((card) => {
            const isMyTeamWinner =
              card.state.kind === "past" || card.state.kind === "current-decided"
                ? card.state.winner?.id === myTeamId
                : false;

            // Inline host controls per-card
            let hostControls: React.ReactNode = null;
            if (isHost) {
              if (card.state.kind === "current-live") {
                hostControls = (
                  <HostRoundControls
                    variant={{ kind: "end", teams: teamList }}
                    onEnd={handleEnd}
                  />
                );
              } else if (card.state.kind === "current-decided") {
                hostControls = (
                  <HostRoundControls
                    variant={{ kind: "redo" }}
                    onRedo={() => handleRedo(card.ordinal - 1)}
                  />
                );
              } else if (
                card.state.kind === "future" &&
                startCardIdx === card.ordinal - 1
              ) {
                hostControls = (
                  <HostRoundControls
                    variant={{
                      kind: "start",
                      label: startTarget?.label ?? "START",
                    }}
                    onStart={handleStart}
                  />
                );
              } else if (card.state.kind === "past") {
                // Allow redo for past rounds.
                hostControls = (
                  <HostRoundControls
                    variant={{ kind: "redo" }}
                    onRedo={() => handleRedo(card.ordinal - 1)}
                  />
                );
              }
            }

            return (
              <RoundCard
                key={card.challenge}
                ordinal={card.ordinal}
                challenge={card.challenge}
                state={card.state}
                code={code}
                isMyTeamWinner={isMyTeamWinner}
              >
                {hostControls}
              </RoundCard>
            );
          })}
        </div>

        {/* Lobby start button (when no rounds have run yet and host) */}
        {isHost &&
          event.roundWinners.length === 0 &&
          currentStatus === null && (
            <div className="mt-4">
              <HostRoundControls
                variant={{ kind: "start", label: "START HEPTATHLON" }}
                onStart={handleStart}
              />
            </div>
          )}
      </main>
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/play/JourneyView.tsx
git commit -m "play: add JourneyView (round cards + standings + host controls)"
```

---

### Task 24: Replace `/play` page with JourneyView

**Files:**
- Modify: `app/e/[code]/play/page.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `app/e/[code]/play/page.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEventBootstrap } from "@/lib/store/bootstrap";
import { useProgressFlush } from "@/lib/store/flush";
import { useToastyStore } from "@/lib/store";
import { normalizeEventCode } from "@/lib/utils/code";
import { JourneyView } from "@/components/play/JourneyView";
import { PermissionWizard } from "@/components/permissions/PermissionWizard";

export default function PlayPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = normalizeEventCode(params?.code ?? "");

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [showPerms, setShowPerms] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !code) return;
    const id = localStorage.getItem(`toasty-player-id-${code}`);
    if (!id) {
      router.replace(`/e/${code}`);
      return;
    }
    setMyPlayerId(id);
    const permsDone = localStorage.getItem(`toasty-permissions-${code}`) === "1";
    setShowPerms(!permsDone);
    setHydrated(true);
  }, [code, router]);

  useEventBootstrap(code, myPlayerId);
  useProgressFlush(code);

  // Wake-lock the dashboard so the screen stays on.
  useEffect(() => {
    if (!hydrated) return;
    let lock: any;
    (async () => {
      try {
        lock = await (navigator as any).wakeLock?.request?.("screen");
      } catch {
        /* ignore */
      }
    })();
    return () => {
      try {
        lock?.release?.();
      } catch {
        /* ignore */
      }
    };
  }, [hydrated]);

  const event = useToastyStore((s) => s.event);

  // Lobby/finished routing.
  useEffect(() => {
    if (event?.status === "lobby") {
      router.replace(`/e/${code}/lobby`);
    } else if (event?.status === "finished") {
      router.replace(`/e/${code}/done`);
    }
  }, [event?.status, code, router]);

  if (!hydrated || !event) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-3 animate-spin">🍕</div>
          <div className="text-xs uppercase tracking-widest opacity-60">
            warming up...
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      {showPerms && (
        <PermissionWizard
          onComplete={() => {
            try {
              localStorage.setItem(`toasty-permissions-${code}`, "1");
            } catch {
              /* ignore */
            }
            setShowPerms(false);
          }}
        />
      )}
      <JourneyView code={code} myPlayerId={myPlayerId} />
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean. The page no longer imports `FinishEventRequest` or any obsolete types.

- [ ] **Step 3: Commit**

```bash
git add app/e/[code]/play/page.tsx
git commit -m "play: render JourneyView (replaces parallel tile grid + finish detection)"
```

---

### Task 25: Gate `/play/[challenge]` to current round + auto-redirect on round-end

**Files:**
- Modify: `app/e/[code]/play/[challenge]/page.tsx`

- [ ] **Step 1: Update the file**

Replace the entire contents of `app/e/[code]/play/[challenge]/page.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEventBootstrap } from "@/lib/store/bootstrap";
import { useProgressFlush } from "@/lib/store/flush";
import { useToastyStore } from "@/lib/store";
import { normalizeEventCode } from "@/lib/utils/code";
import { CHALLENGES, enabledChallengeOrder } from "@/lib/challenges";
import { useStandings } from "@/lib/store/selectors";
import { endRound } from "@/components/host/_fetch";
import type { ChallengeId } from "@/lib/types";
import { CountdownOverlay } from "@/components/play/CountdownOverlay";
import { DistanceView } from "@/components/challenge/DistanceView";
import { StepsView } from "@/components/challenge/StepsView";
import { TapsView } from "@/components/challenge/TapsView";
import { ScreamView } from "@/components/challenge/ScreamView";
import { ShakeView } from "@/components/challenge/ShakeView";
import { SpinView } from "@/components/challenge/SpinView";
import { NorthView } from "@/components/challenge/NorthView";

const VALID_IDS: ChallengeId[] = [
  "distance",
  "steps",
  "taps",
  "scream",
  "shake",
  "spin",
  "north",
];

export default function ChallengePage() {
  const router = useRouter();
  const params = useParams<{ code: string; challenge: string }>();
  const code = normalizeEventCode(params?.code ?? "");
  const challenge = params?.challenge as ChallengeId;

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const autoEndedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !code) return;
    const id = localStorage.getItem(`toasty-player-id-${code}`);
    if (!id) {
      router.replace(`/e/${code}`);
      return;
    }
    setMyPlayerId(id);
    setHydrated(true);
  }, [code, router]);

  useEventBootstrap(code, myPlayerId);
  useProgressFlush(code);

  useEffect(() => {
    if (!hydrated) return;
    let lock: any;
    (async () => {
      try {
        lock = await (navigator as any).wakeLock?.request?.("screen");
      } catch {
        /* ignore */
      }
    })();
    return () => {
      try {
        lock?.release?.();
      } catch {
        /* ignore */
      }
    };
  }, [hydrated]);

  const event = useToastyStore((s) => s.event);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const isFinished = useToastyStore((s) => s.isTeamFinished);
  const standings = useStandings();
  const teams = useToastyStore((s) => s.teams);

  const isValid = useMemo(() => VALID_IDS.includes(challenge), [challenge]);
  const def = isValid ? CHALLENGES[challenge] : null;

  // Lobby/finished bounce.
  useEffect(() => {
    if (event?.status === "lobby") router.replace(`/e/${code}/lobby`);
    if (event?.status === "finished") router.replace(`/e/${code}/done`);
  }, [event?.status, code, router]);

  // If this challenge isn't the current round, bounce back to journey.
  useEffect(() => {
    if (!event) return;
    if (event.currentRoundIndex === null) {
      router.replace(`/e/${code}/play`);
      return;
    }
    const order = enabledChallengeOrder(event.challenges);
    const currentChallenge = order[event.currentRoundIndex];
    if (currentChallenge !== challenge) {
      router.replace(`/e/${code}/play`);
    }
  }, [
    event?.currentRoundIndex,
    event?.currentRoundStatus,
    event,
    challenge,
    router,
    code,
  ]);

  // Auto-redirect to journey when the round is decided.
  useEffect(() => {
    if (!event) return;
    if (event.currentRoundStatus === "decided") {
      router.replace(`/e/${code}/play`);
    }
  }, [event?.currentRoundStatus, router, code, event]);

  // Auto-end detection: if my team has just completed the threshold for
  // this challenge, POST /round/end (mode=auto). Server validates and
  // first-write-wins.
  useEffect(() => {
    if (!event || !myTeamId || autoEndedRef.current) return;
    if (event.currentRoundStatus !== "live") return;
    const cur = myProgress?.[challenge];
    if (!cur?.completed) return;
    autoEndedRef.current = true;
    (async () => {
      try {
        await endRound(code, { mode: "auto", teamId: myTeamId });
      } catch (err) {
        console.error("[challenge] auto endRound failed", err);
      }
    })();
  }, [
    event?.currentRoundStatus,
    myProgress,
    challenge,
    myTeamId,
    code,
    event,
  ]);

  if (!hydrated || !myPlayerId) {
    return (
      <main className="min-h-screen flex items-center justify-center text-center">
        <div className="text-5xl animate-spin">🍕</div>
      </main>
    );
  }

  if (!isValid || !def) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-3">🤔</div>
        <div className="font-bold mb-3">unknown challenge</div>
        <Link
          href={`/e/${code}/play`}
          className="px-4 py-2 rounded-2xl bg-gradient-party font-bold"
        >
          ← back
        </Link>
      </main>
    );
  }

  const myCur = myProgress?.[challenge];
  const threshold =
    event?.challenges[challenge]?.threshold ?? def.defaultThreshold;
  const totalRounds = event ? enabledChallengeOrder(event.challenges).length : 0;
  const ordinal = (event?.currentRoundIndex ?? 0) + 1;

  // Render countdown overlay if the round hasn't begun yet.
  const showCountdown =
    !!event &&
    event.currentRoundStatus === "live" &&
    event.currentRoundStartsAt !== null &&
    Date.now() < event.currentRoundStartsAt;

  let view: React.ReactNode = null;
  switch (challenge) {
    case "distance":
      view = <DistanceView code={code} myPlayerId={myPlayerId} />;
      break;
    case "steps":
      view = <StepsView code={code} myPlayerId={myPlayerId} />;
      break;
    case "taps":
      view = <TapsView code={code} myPlayerId={myPlayerId} />;
      break;
    case "scream":
      view = <ScreamView code={code} myPlayerId={myPlayerId} />;
      break;
    case "shake":
      view = <ShakeView code={code} myPlayerId={myPlayerId} />;
      break;
    case "spin":
      view = <SpinView code={code} myPlayerId={myPlayerId} />;
      break;
    case "north":
      view = <NorthView code={code} myPlayerId={myPlayerId} />;
      break;
  }

  const progressLabel = myCur
    ? def.formatProgress(myCur.value, threshold)
    : def.formatProgress(0, threshold);

  return (
    <>
      {showCountdown && event.currentRoundStartsAt !== null && (
        <CountdownOverlay
          startsAt={event.currentRoundStartsAt}
          challenge={challenge}
          onDone={() => {
            /* fall through to challenge view */
          }}
        />
      )}
      <main className="min-h-screen flex flex-col">
        <header className="flex items-center gap-3 p-3 bg-bg-deep">
          <Link
            href={`/e/${code}/play`}
            className="px-3 py-2 rounded-xl bg-bg-card font-bold text-sm no-select"
          >
            ←
          </Link>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest opacity-60 truncate">
              Round {ordinal} / {totalRounds} · {def.label}
            </div>
            <div className="font-extrabold tabular-nums truncate">
              {progressLabel}
            </div>
          </div>
          <div className="text-3xl">{def.emoji}</div>
        </header>
        {/* Live mini-leaderboard */}
        <div className="px-3 py-2 flex flex-wrap gap-2 bg-bg-deep/60 border-b border-white/5">
          {standings.map((row) => {
            const isMine = row.team.id === myTeamId;
            const tp = useToastyStore.getState().progress[row.team.id];
            const cur = tp?.[challenge];
            const valueStr = cur
              ? def.formatProgress(cur.value, threshold)
              : def.formatProgress(0, threshold);
            return (
              <div
                key={row.team.id}
                className={`px-2 py-1 rounded-lg text-[11px] tabular-nums ${
                  isMine
                    ? "bg-accent-orange/20 text-accent-orange font-extrabold"
                    : "bg-bg-card opacity-80"
                }`}
              >
                {row.team.emoji} {valueStr}
              </div>
            );
          })}
        </div>
        {view}
      </main>
    </>
  );
}
```

Note: the live mini-leaderboard reads from the store via `useToastyStore.getState()` inside the map. That's intentional to avoid creating per-row hooks; the parent re-renders whenever `standings` changes (which is whenever `progress` does), keeping the snapshot fresh.

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/e/[code]/play/[challenge]/page.tsx
git commit -m "play/challenge: gate by current round, auto-end on team complete, mini-leaderboard"
```

---

### Task 26: Update `done` page to round-wins format

**Files:**
- Modify: `app/e/[code]/done/page.tsx`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `app/e/[code]/done/page.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useEventBootstrap } from "@/lib/store/bootstrap";
import { useToastyStore } from "@/lib/store";
import { useRoundStandings } from "@/lib/store/selectors";
import { CHALLENGES, enabledChallengeOrder } from "@/lib/challenges";
import { normalizeEventCode } from "@/lib/utils/code";

export default function DonePage() {
  const params = useParams<{ code: string }>();
  const code = normalizeEventCode(params?.code ?? "");

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !code) return;
    const id = localStorage.getItem(`toasty-player-id-${code}`);
    setMyPlayerId(id);
  }, [code]);

  useEventBootstrap(code, myPlayerId);

  const event = useToastyStore((s) => s.event);
  const standings = useRoundStandings();
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const teams = useToastyStore((s) => s.teams);

  const winnerTeamId = event?.winnerTeamId ?? standings[0]?.team.id ?? null;
  const won = !!myTeamId && myTeamId === winnerTeamId;
  const winnerTeam = winnerTeamId ? teams[winnerTeamId] : null;

  const order = event ? enabledChallengeOrder(event.challenges) : [];
  const winners = event?.roundWinners ?? [];

  return (
    <main className="min-h-screen flex flex-col p-5 safe-top safe-bottom">
      <div className="text-center my-6">
        <div className="text-7xl mb-3">{won ? "🏆" : "🍕"}</div>
        <div className="font-display text-4xl font-extrabold tracking-wider">
          {won ? "YOU WIN" : "YOU LOST"}
        </div>
        <div className="text-xs uppercase tracking-widest opacity-70 mt-2">
          {won
            ? "drinks are on someone else"
            : winnerTeam
              ? `${winnerTeam.emoji} ${winnerTeam.name.toUpperCase()} took it`
              : "a winner has been crowned"}
        </div>
      </div>

      <div className="rounded-2xl bg-bg-card p-4 mb-4">
        <div className="text-[10px] uppercase tracking-widest opacity-60 mb-2 font-bold">
          final standings
        </div>
        {standings.map((row, i) => {
          const medals = ["🥇", "🥈", "🥉"];
          const isMine = row.team.id === myTeamId;
          return (
            <div
              key={row.team.id}
              className={`flex justify-between items-center py-2 border-b border-bg-deep/40 last:border-0 ${
                isMine ? "text-accent-orange font-extrabold" : ""
              }`}
            >
              <span className="truncate">
                {medals[i] ?? "·"} {row.team.emoji} {row.team.name}
                {isMine ? " (us)" : ""}
              </span>
              <span className="tabular-nums font-bold">
                {row.wins} {row.wins === 1 ? "win" : "wins"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl bg-bg-card p-4 mb-4">
        <div className="text-[10px] uppercase tracking-widest opacity-60 mb-2 font-bold">
          round-by-round
        </div>
        {order.map((id, idx) => {
          const def = CHALLENGES[id];
          const w = winners[idx];
          const winnerTeam = w ? teams[w.teamId] : null;
          return (
            <div
              key={id}
              className="flex items-center gap-3 py-2 border-b border-bg-deep/40 last:border-0"
            >
              <div className="font-display font-extrabold text-sm opacity-60 w-6 text-center tabular-nums">
                {idx + 1}
              </div>
              <div className="text-2xl">{def.emoji}</div>
              <div className="flex-1 truncate font-bold">{def.label}</div>
              <div className="text-sm">
                {winnerTeam ? (
                  <>
                    🥇 {winnerTeam.emoji} {winnerTeam.name}
                  </>
                ) : (
                  <span className="opacity-40">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col items-center gap-3 pb-4">
        <Link
          href={`/e/${code}/play`}
          className="text-xs opacity-60 underline"
        >
          back to journey
        </Link>
        <Link
          href="/"
          className="px-6 py-3 rounded-2xl bg-gradient-party font-extrabold text-sm tracking-widest"
        >
          HOME
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/e/[code]/done/page.tsx
git commit -m "done: round-wins champion + per-round breakdown"
```

---

### Task 27: Update `StandingsCard` to round-wins format

**Files:**
- Modify: `components/dashboard/StandingsCard.tsx`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `components/dashboard/StandingsCard.tsx` with:

```tsx
"use client";

import { useToastyStore } from "@/lib/store";
import { useRoundStandings } from "@/lib/store/selectors";
import { enabledChallengeOrder } from "@/lib/challenges";

const MEDALS = ["🥇", "🥈", "🥉"];

export function StandingsCard() {
  const standings = useRoundStandings();
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const event = useToastyStore((s) => s.event);

  if (!event || standings.length === 0) return null;

  const totalRounds = enabledChallengeOrder(event.challenges).length;
  const decidedCount = event.roundWinners.length;

  return (
    <div className="rounded-2xl bg-bg-card p-3 mt-3">
      <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1 font-bold">
        Standings · {decidedCount}/{totalRounds} rounds
      </div>
      {standings.map((row, i) => {
        const isMe = row.team.id === myTeamId;
        return (
          <div
            key={row.team.id}
            className={`flex justify-between items-center py-1 text-sm ${
              isMe ? "text-accent-orange font-extrabold" : ""
            }`}
          >
            <span className="truncate">
              {MEDALS[i] ?? "·"} {row.team.emoji} {row.team.name}
              {isMe ? " (us)" : ""}
            </span>
            <span className="font-bold tabular-nums">
              {row.wins} {row.wins === 1 ? "win" : "wins"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/StandingsCard.tsx
git commit -m "StandingsCard: round-wins format"
```

---

## Phase 6 — Host dashboard: HostPlayerPicker + monitor updates

### Task 28: Create `HostPlayerPicker` component

**Files:**
- Create: `components/host/HostPlayerPicker.tsx`

- [ ] **Step 1: Create the file**

Create `components/host/HostPlayerPicker.tsx` with:

```tsx
"use client";

import { useState } from "react";
import type { EventConfig, Player } from "@/lib/types";
import { setHostPlayer } from "./_fetch";

interface Props {
  event: EventConfig;
  players: Player[];
  onChange: (event: EventConfig) => void;
}

/**
 * UI to designate exactly one player as host. Renders a chip per player with
 * a crown toggle. Tapping a different player demotes the previous one.
 */
export default function HostPlayerPicker({ event, players, onChange }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setHost(playerId: string | null) {
    if (busyId) return;
    setBusyId(playerId ?? "__clear__");
    setError(null);
    try {
      const res = await setHostPlayer(event.code, { playerId });
      onChange(res.event);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't set host");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="bg-bg-card rounded-xl2 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-base font-bold">👑 Host player</h3>
        <p className="text-xs opacity-60">
          Tap a crown to give that player the on-phone Start/End buttons.
        </p>
      </div>
      {players.length === 0 ? (
        <div className="text-sm opacity-50 italic py-2">
          Players will appear here when they join.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {players.map((p) => {
            const isHost = p.id === event.hostPlayerId;
            const isBusy = busyId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={!!busyId}
                onClick={() => setHost(isHost ? null : p.id)}
                className={`px-3 py-2 rounded-xl text-sm font-bold border transition-colors ${
                  isHost
                    ? "bg-gradient-party border-transparent text-white"
                    : "bg-bg-deep border-white/10 hover:border-accent-orange/40"
                } disabled:opacity-50`}
              >
                {isHost ? "👑 " : ""}
                {p.name}
                {isBusy ? " …" : ""}
              </button>
            );
          })}
        </div>
      )}
      {event.hostPlayerId && (
        <button
          type="button"
          onClick={() => setHost(null)}
          disabled={!!busyId}
          className="text-[11px] underline opacity-60 hover:opacity-100 disabled:opacity-30"
        >
          clear host
        </button>
      )}
      {error ? <div className="text-xs text-accent-pink">{error}</div> : null}
    </section>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/host/HostPlayerPicker.tsx
git commit -m "host: add HostPlayerPicker (crown toggle, single-host invariant)"
```

---

### Task 29: Wire HostPlayerPicker into HostDashboard + show indicator

**Files:**
- Modify: `components/host/HostDashboard.tsx`

- [ ] **Step 1: Add HostPlayerPicker to the Team Builder tab**

In `components/host/HostDashboard.tsx`, find the `tab === "teams"` block (lines 66-73) and replace with:

```tsx
          {tab === "teams" ? (
            <div className="space-y-4">
              <HostPlayerPicker
                event={event}
                players={players}
                onChange={(e) => setEvent(e)}
              />
              <TeamBuilder
                event={event}
                teams={teams}
                players={players}
                onChange={applyChange}
              />
            </div>
          ) : null}
```

- [ ] **Step 2: Add the import**

At the top of `components/host/HostDashboard.tsx`, add:

```tsx
import HostPlayerPicker from "./HostPlayerPicker";
```

- [ ] **Step 3: Add a host indicator to the sticky header**

Find the StickyHeader's status block (around line 117-131 in the original) and add a host indicator. Replace the line containing `<span>{teams.length} teams</span>` and the surrounding span with:

```tsx
            <span>·</span>
            <span>{teams.length} teams</span>
            <span>·</span>
            <span>
              {event.hostPlayerId ? (
                <>
                  host:{" "}
                  <span className="text-accent-orange font-bold">
                    👑 {players.find((p) => p.id === event.hostPlayerId)?.name ?? "?"}
                  </span>
                </>
              ) : (
                <span className="opacity-50">no host set</span>
              )}
            </span>
            <span>·</span>
            <span>
              status:{" "}
```

(That keeps the original `status:` line intact after; the structure becomes: players · teams · host · status.)

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/host/HostDashboard.tsx
git commit -m "host dashboard: wire HostPlayerPicker + sticky header indicator"
```

---

### Task 30: Update HostMonitor to show round wins

**Files:**
- Modify: `components/host/HostMonitor.tsx`

- [ ] **Step 1: Switch to round standings**

In `components/host/HostMonitor.tsx`:

Replace the import:
```ts
import { useStandings } from "@/lib/store/selectors";
```
with:
```ts
import { useRoundStandings } from "@/lib/store/selectors";
```

Replace the line:
```ts
  const standings = useStandings();
```
with:
```ts
  const standings = useRoundStandings();
```

Find the inner map over `standings` (around line 56) and replace:
```tsx
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
              enabled={enabled}
              thresholds={event.challenges}
              completedCount={row.completedCount}
              place={place}
            />
          );
        })}
```

with:

```tsx
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
              enabled={enabled}
              thresholds={event.challenges}
              wins={row.wins}
              totalRounds={enabled.length}
              place={place}
            />
          );
        })}
```

Then update the `TeamMonitorCard` props signature (around line 80-95). Replace:
```tsx
function TeamMonitorCard({
  team,
  players,
  progress,
  enabled,
  thresholds,
  completedCount,
  place,
}: {
  team: Team;
  players: Player[];
  progress: TeamProgress | undefined;
  enabled: ChallengeId[];
  thresholds: Record<ChallengeId, { enabled: boolean; threshold: number }>;
  completedCount: number;
  place: number;
}) {
```

with:

```tsx
function TeamMonitorCard({
  team,
  players,
  progress,
  enabled,
  thresholds,
  wins,
  totalRounds,
  place,
}: {
  team: Team;
  players: Player[];
  progress: TeamProgress | undefined;
  enabled: ChallengeId[];
  thresholds: Record<ChallengeId, { enabled: boolean; threshold: number }>;
  wins: number;
  totalRounds: number;
  place: number;
}) {
```

And inside the card body, find:
```tsx
          <div className="font-display text-2xl font-extrabold">
            {completedCount}/{enabled.length}
          </div>
```

Replace with:
```tsx
          <div className="font-display text-2xl font-extrabold">
            {wins} <span className="text-xs opacity-60">/ {totalRounds}</span>
          </div>
          <div className="text-[10px] opacity-50 uppercase tracking-wide">
            round wins
          </div>
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/host/HostMonitor.tsx
git commit -m "monitor: show round wins instead of completion count"
```

---

### Task 31: Update host results page to round-wins format

**Files:**
- Modify: `app/host/[code]/results/page.tsx`

- [ ] **Step 1: Update the ranking + per-challenge breakdown**

Replace the ranking calculation block (around lines 60-77 in the original) with:

```tsx
  // Round-wins-based ranking (heptathlon model).
  const winnersByRound = event.roundWinners ?? [];
  const winsByTeam = new Map<string, number[]>();
  winnersByRound.forEach((w, idx) => {
    const arr = winsByTeam.get(w.teamId) ?? [];
    arr.push(idx);
    winsByTeam.set(w.teamId, arr);
  });

  const ranked = teams
    .map((team) => ({
      team,
      wins: winsByTeam.get(team.id) ?? [],
      tm: matrix[team.id] ?? {},
    }))
    .sort((a, b) => {
      if (b.wins.length !== a.wins.length) return b.wins.length - a.wins.length;
      return a.team.name.localeCompare(b.team.name);
    });

  const winner =
    teams.find((t) => t.id === event.winnerTeamId) ?? ranked[0]?.team ?? null;
```

- [ ] **Step 2: Replace the standings rendering**

Find the `<ol className="space-y-2">` block (around lines 113-148) and replace with:

```tsx
          <ol className="space-y-2">
            {ranked.map((r, idx) => {
              const teamPlayers = players.filter((p) => p.teamId === r.team.id);
              return (
                <li
                  key={r.team.id}
                  className={`rounded-xl p-3 flex items-center gap-3 ${
                    idx === 0
                      ? "bg-gradient-done"
                      : "bg-bg-deep border border-white/10"
                  }`}
                >
                  <div className="text-2xl w-8 text-center">
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}
                  </div>
                  <div className="text-3xl">{r.team.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-extrabold truncate">
                      {r.team.name}
                    </div>
                    <div className="text-xs opacity-80 truncate">
                      {teamPlayers.map((p) => p.name).join(" · ") ||
                        "no players"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs opacity-70">round wins</div>
                    <div className="font-display text-2xl font-extrabold">
                      {r.wins.length}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
```

- [ ] **Step 3: Add a per-round winners section**

Insert this section between the standings block and the per-challenge breakdown (after the closing `</section>` for "Final standings", before the per-challenge `<section>`):

```tsx
        <section className="bg-bg-card rounded-xl2 p-4">
          <h2 className="font-display text-xl font-bold mb-3">
            🏁 Round-by-round
          </h2>
          <ol className="space-y-2">
            {enabled.map((id, idx) => {
              const def = CHALLENGES[id];
              const w = winnersByRound[idx];
              const winningTeam = w ? teams.find((t) => t.id === w.teamId) : null;
              return (
                <li
                  key={id}
                  className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0"
                >
                  <div className="font-display font-extrabold opacity-60 w-6 text-center tabular-nums">
                    {idx + 1}
                  </div>
                  <div className="text-2xl">{def.emoji}</div>
                  <div className="flex-1 truncate font-bold">{def.label}</div>
                  <div>
                    {winningTeam ? (
                      <span>
                        🥇 {winningTeam.emoji} {winningTeam.name}
                      </span>
                    ) : (
                      <span className="opacity-40">—</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
```

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/host/[code]/results/page.tsx
git commit -m "results: round-wins ranking + per-round winners"
```

---

## Phase 7 — Final cleanup + smoke test

### Task 32: Run full lint + typecheck + build

**Files:** none modified

- [ ] **Step 1: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: no errors. If lint complains about unused imports or any-style issues introduced during the refactor, fix them inline with `Edit` and re-run.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: build succeeds. This catches any server/client boundary issues or implicit-any errors that pure typecheck might miss.

- [ ] **Step 4: Commit any lint fixes (only if needed)**

```bash
git status
```

If any files changed:

```bash
git add -A
git commit -m "lint: clean up post-refactor warnings"
```

---

### Task 33: Manual browser smoke test

**Files:** none modified — this is a verification gate.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Open http://localhost:3000 and watch terminal logs.

- [ ] **Step 2: Smoke checklist — happy path**

In a desktop browser plus 3+ mobile-emulator tabs (or real phones on the LAN — `npm run dev` binds to 0.0.0.0):

1. Go to `/host`, log in, create a new event.
2. Open the event in the host dashboard. Note the code.
3. On 3 mobile tabs, scan/enter the code → join with 3 different names.
4. Back on the dashboard, drag each player into a different team.
5. In the Team builder tab, tap a crown next to one of the players. Verify the sticky header now shows `host: 👑 <name>`.
6. On that player's phone, navigate to `/play` (lobby should redirect them after start; for now manually).
7. As the host on their phone, tap the `▶ START HEPTATHLON` button. Expected: every phone immediately shows the 5-4-3-2-1 countdown overlay, then auto-navigates to the distance challenge view.
8. Have one team simulate hitting 1 mile (use the in-app distance UI). Expected: that team's challenge view auto-redirects to the journey, the distance card is stamped with their medal, and standings updates `1 win`.
9. Host taps `▶ START ROUND 2` on their phone. Expected: countdown again across all phones, then steps view.
10. Repeat for rounds 3–7. For round 4 (scream) or 5 (shake), if no team naturally completes, host taps `⏹ END ROUND` on the live card → modal → pick a winning team. Verify the round closes and standings update.
11. After round 7, the event flips to `finished`. Players auto-navigate to `/done` showing the champion + per-round breakdown.

- [ ] **Step 3: Smoke checklist — edge cases**

- **Refresh during countdown:** On a player phone, refresh while the countdown is showing. Expected: the page reloads and immediately shows the remaining countdown (or jumps straight to the challenge view if the countdown has already ended).
- **Refresh during decided state:** After a round ends, before the host advances, refresh a player phone. Expected: lands on the journey with the just-finished round stamped.
- **Redo a past round:** As the host, tap `↻ redo this round` on a past round card. Expected: countdown across all phones, that round restarts; standings recompute (the prior winner of that round is no longer credited; subsequent rounds show as not-yet-played).
- **Reassign host mid-event:** Open the laptop dashboard and tap the crown next to a different player. Expected: sticky header indicator updates; the previous host's phone no longer shows host buttons; the new host's phone does.
- **Empty teams:** Try starting the heptathlon with one team having zero players. Expected: server allows it (matches existing "uneven teams for testing" behavior); the empty team simply can't win any rounds.
- **Laptop fallback:** Without setting a host player, click the laptop dashboard's `▶ Start race` button. Expected: it now hits `/start` which wraps `/round/start` → countdown happens on phones.

- [ ] **Step 4: If any failure, file a fix as a follow-up commit**

If a check fails, identify the file responsible (the React DevTools + Network tab make this easy with the existing logging), patch, commit. Re-run the affected smoke step.

- [ ] **Step 5: Commit final notes (if any)**

If smoke testing revealed any small UI tweaks or clarifications worth keeping (e.g., adjusting countdown size, fixing a label), commit them as small follow-ups before declaring the feature done.

---

## Self-review checklist (run before handoff)

After all tasks complete, verify:

1. **Spec coverage:**
   - [ ] State machine columns added (Tasks 3, 4)
   - [ ] PubNub messages defined + handled (Tasks 2, 11)
   - [ ] `setHostPlayer`, `startRound`, `endRound` queries (Tasks 5, 7, 8)
   - [ ] All 3 new API routes (Tasks 13, 15, 16)
   - [ ] `/start` is a wrapper (Task 17)
   - [ ] `/finish` removed (Task 18)
   - [ ] Reset paths clear new columns (Task 9)
   - [ ] Spin → team-total (Task 1)
   - [ ] Journey view + countdown + round card (Tasks 19, 20, 23)
   - [ ] Host controls inline on cards (Task 21)
   - [ ] Challenge view gating + auto-end (Task 25)
   - [ ] Done + results pages updated (Tasks 26, 31)
   - [ ] Standings card updated (Task 27)
   - [ ] HostPlayerPicker + indicator (Tasks 28, 29)
   - [ ] HostMonitor shows wins (Task 30)
   - [ ] Round-wins selectors (Task 12)

2. **No placeholders:** every step has either complete code or an exact command.

3. **Type consistency:** `EventConfig.currentRoundIndex`, `RoundWinnerEntry.teamId`, `RoundStartMsg.startsAt` are referenced consistently across types, queries, store, and UI.

4. **Auth model:** `/round/start` and `/round/end` (mode='host') accept either host-cookie OR host-player playerId. `/round/end` (mode='auto') is open but server-validated against `final_progress`.

5. **First-write-wins:** `endRound`'s atomic update predicate (`status='live'`, `index=idx`) ensures concurrent calls collapse to one winner.
