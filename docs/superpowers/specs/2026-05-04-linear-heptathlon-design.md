# Linear Heptathlon — Design

**Date:** 2026-05-04
**Status:** Approved by Sam, ready for implementation plan
**Supersedes:** the existing parallel-race model ("first team to complete all 7 wins")

## Goal

Convert Toasty Pizza from a parallel free-for-all (all 7 challenges open simultaneously, first team to clear all 7 wins) into a **linear heptathlon**:

- All teams compete in the **same** event at the same time, in a **fixed order** through `CHALLENGE_ORDER`.
- Each round produces **one winning team**.
- The team with the **most round wins** wins the heptathlon.
- Events are visually **locked** until reached, but UI clearly conveys they're linked steps in a journey.
- A designated **host player** starts each round from their phone. When they do, every connected device runs a synchronized **5-second countdown** before the round's challenge view appears.

## Architecture summary

Approach: **state on the event row.** No new tables. New columns on `events`, plus three new PubNub message kinds. Existing per-team progress tables (`final_progress`) keep doing what they do — they're just scoped to the current round's challenge.

## State machine

`events.status` keeps `lobby | active | finished`. Inside `active`, the round state is driven by new columns:

| Field | Type | Meaning |
|---|---|---|
| `host_player_id` | `uuid?` → `players.id` (`ON DELETE SET NULL`) | The single designated host player. Null = no host assigned. |
| `current_round_index` | `int?` | 0…N-1 over the enabled subset of `CHALLENGE_ORDER`. Null in lobby. |
| `current_round_status` | `text?` | `'live'` or `'decided'`. Countdown is implicit (rendered by clients while `now < currentRoundStartsAt`). |
| `current_round_starts_at` | `timestamptz?` | Moment the 5s countdown ends and gameplay begins. |
| `round_winners` | `jsonb` (default `[]`) | Append-only array `[{challenge: ChallengeId, teamId: string, decidedAt: number}, …]`, in order of decision. |

### Round lifecycle

1. **Host starts a round.** Server transitions:
   - `events.status` → `active` (if not already)
   - `current_round_index` → next undecided round, or specified round on redo
   - `current_round_status` → `'live'`
   - `current_round_starts_at` → `now() + 5 seconds`
   - Broadcasts `round-start` over PubNub.
2. **Countdown** (T-5 → T-0). Clients render an overlay driven by `currentRoundStartsAt - Date.now()`. At T=0 they auto-navigate to `/e/[code]/play/[challenge]` for the current round.
3. **Round runs.** Existing per-challenge sensor flow continues (PubNub `progress` / `live` / `guess` / `complete` messages, periodic `/progress` snapshot upserts).
4. **Round ends** one of two ways:
   - **Auto:** any client whose team's progress flips to "completed" client-side POSTs `/round/end` with their `teamId`. Server transactionally flips `currentRoundStatus` from `'live'` to `'decided'` (first-write-wins, mirrors the existing `/finish` arbitration pattern).
   - **Host:** host taps "End round" on their phone, optionally choosing a winner. Server picks per the rules below if no winner is supplied.
5. **Server:** appends `{challenge, teamId, decidedAt}` to `round_winners`, sets `current_round_status='decided'`, broadcasts `round-end`.
6. **Clients:** auto-redirect challenge view back to the journey view, where the just-completed card animates in its medal.
7. **After the last enabled round:** server sets `events.status='finished'`, computes overall `winner_team_id`, broadcasts `event-state`.

### Per-challenge winning rule

Used by both the auto-complete path and the host-fallback path:

| Challenge | Auto-win condition | Host fallback (no completion yet) |
|---|---|---|
| `distance` / `steps` / `taps` / `spin` | first team to threshold (team-total) | highest team-total |
| `scream` / `shake` | first team to sustain N seconds (existing `complete` msg) | host eyeballs and picks; option for "no winner" if needed |
| `north` | n/a — no completion threshold | smallest team-aggregate `errorDeg` after all enabled players guess (or host ends) |

**Note on `spin`:** the existing data model has `aggregation: 'per-player'` (each teammate hits a per-player threshold). For the heptathlon model `spin` becomes `aggregation: 'team-total'` — a shared team goal (~100 rotations across the team). The two-button-hold UI mechanic stays so players can't throw the phone, but the win condition is now "first team to N rotations summed across teammates", same shape as `taps`.

### Tiebreak for overall champion

1. Most round wins.
2. If tied: the team that won the `north` round (preserves north's existing role as the symbolic tiebreaker).
3. If `north` was tied or wasn't run: earliest cumulative `decidedAt` across the tied teams' wins.

### Redo

Host-only affordance, available on the journey view:
- "↻ Redo last round" inline beneath the just-decided card.
- Tiny `↻` icons on past round cards for redoing further-back rounds.

Server, on redo of round `X`:
- Deletes `final_progress` rows for that challenge.
- Splices `round_winners` from index `X` onward.
- Sets `current_round_index = X`, `current_round_status = 'live'`, `current_round_starts_at = now() + 5s`.
- Broadcasts the existing `progress-reset` message (full reset of all in-memory progress — simpler and safer than scoping by challenge; clients will rehydrate persisted progress for prior decided rounds via the existing `GET /api/events/:code/progress` flow on next bootstrap, but in-session the round_winners array on the event row is the source of truth for past medals).
- Broadcasts `round-start`.

## Player UI — the journey

`/e/[code]/play` is rebuilt as a **vertical numbered journey**, replacing the current 2-column tile grid.

```
┌────────────────────────────────┐
│  Team header (existing)        │
│  Teammate orbit (existing)     │
├────────────────────────────────┤
│  STANDINGS                     │
│  🥇 Sausage  3 wins            │
│  🥈 Mushroom 2 wins            │
│  🥉 Pepperoni 1 win            │
├────────────────────────────────┤
│  ① 🚶 DISTANCE        🥇 🍕   │  ← past, Pepperoni won
│  ② 👟 STEPS           🥇 🍄   │  ← past, Mushroom won
│  ③ 👆 TAPS            🥇 🌭   │  ← past, Sausage won
│  ④ 📣 SCREAM     ◉ LIVE  →   │  ← current, glowing, tappable
│  ⑤ 🤝 SHAKE      🔒          │  ← future, locked
│  ⑥ 🌀 SPIN       🔒          │
│  ⑦ 🧭 NORTH      🔒          │
└────────────────────────────────┘
```

**RoundCard states** (single component drives all rows):

- **Decided / past:** medal + winner team's emoji & name; faint styling.
- **Current / live (during countdown or gameplay):** accent-orange border + glow (matches existing "active" tile style), tappable → `/play/[challenge]`.
- **Current / decided (just-ended, before host advances):** medal stamped on, no longer tappable.
- **Future / locked:** grey, lock icon, `pointer-events: none`. Conveys progression by being clearly part of the same numbered path.

### Countdown overlay

A full-screen overlay component listening to PubNub `round-start` (or detected via `event.currentRoundStartsAt > now`). Renders regardless of which page the player is on, so a player who refreshed mid-round still sees the next round's countdown.

- Big numeral `5 4 3 2 1 GO!` driven by `requestAnimationFrame` against `startsAt - now`
- Below: small "next up: 🧭 Due North"
- At T=0: auto-redirects to `/e/[code]/play/[challenge]`

### Challenge view (`/play/[challenge]`)

Existing per-challenge views (`DistanceView`, `ScreamView`, etc.) stay as-is. Three additions:

1. **Top header** gains the round number (`Round 4 / 7`) and a live mini-leaderboard of per-team current value, sorted, my-team highlighted.
2. **Auto-redirect** back to `/play` (journey) when `round-end` arrives, so everyone sees the medal stamp animate onto the just-completed card.
3. **Back arrow** takes you to the journey, but the journey enforces the locked state — you can't navigate to a different round mid-round.

### Done page (`/e/[code]/done`)

Replaces the current "first to 7 wins" finish UI with:

- Champion team trophy (most round wins)
- Round-by-round breakdown: 7 rows, each `① 🚶 Distance — won by 🍕 Pepperoni`
- Tiebreaker callout if it was decided by north or by `decidedAt`

## Host UI

### Marking a player as host (laptop dashboard)

In the existing **Team builder** tab on `/host/[code]`, each player chip gets a small crown affordance. Tapping it enthrones that player as host. Invariant: **exactly one host at a time** — tapping someone else demotes the previous host. The sticky header gains a **"Host: 👑 <playerName>"** indicator next to the event code, with a "Clear host" link.

### Host-player phone (the journey view)

When `myPlayerId === event.hostPlayerId`, the journey view gains contextual host controls:

- **Status `lobby`** (no rounds started): big floating CTA at the bottom of the journey: `▶ START HEPTATHLON`. Kicks off round 0.
- **Status `live`** (round in progress): `⏹ END ROUND` button on the current round's card. Confirmation modal: "Pick winner: [Team A] [Team B] [Team C] · or auto (highest progress)".
- **Status `decided`** (between rounds): `▶ START ROUND N+1` button on the next locked round, which unlocks it. `↻ Redo last round` link beneath the just-decided card. Past round cards each get a tiny `↻` icon for redoing further-back rounds.

### Laptop dashboard fallback

The existing `StartButton` / `ResetButtons` / `EndButton` on the laptop dashboard stay as a fallback admin path — they hit the same APIs (with host-cookie auth instead of host-player auth). Useful if the host player's phone dies. The original `POST /api/events/:code/start` becomes a thin wrapper over `/round/start` with `roundIndex=0`.

## API endpoints

New / changed routes:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `PATCH` | `/api/events/:code/host-player` | host-cookie | Body: `{ playerId: string \| null }`. Sets/clears `events.host_player_id`. Broadcasts `host-changed`. |
| `POST` | `/api/events/:code/round/start` | host-cookie OR host-player (verified by `playerId` in body matching `events.host_player_id`) | Body: `{ playerId?: string, redo?: boolean, roundIndex?: number }`. Advances to next undecided round, or redoes `roundIndex`. Sets columns + broadcasts `progress-reset` (on redo) and `round-start`. |
| `POST` | `/api/events/:code/round/end` | host-cookie OR host-player OR any player in the event (auto-complete path) | Body: `{ playerId?: string, winnerTeamId?: string, autoComplete?: boolean }`. Server transactionally flips `currentRoundStatus` from `'live'` to `'decided'` (first-write-wins). If `autoComplete=true`, server validates the claim by reading the latest `final_progress` for the current challenge — only honored if the team's row is `completed=true`. If `autoComplete=false` or absent, requires host-cookie or matching `host_player_id`. If `winnerTeamId` omitted on a host call, server picks per the rules above. Appends to `round_winners`. Broadcasts `round-end`. If that was the last enabled round, also flips `events.status='finished'` and computes overall `winnerTeamId`. |
| `POST` | `/api/events/:code/start` | host-cookie | Existing endpoint becomes a thin wrapper over `/round/start` with `roundIndex=0`. Kept for laptop dashboard. |

**Removed / no-op:**

- `POST /api/events/:code/finish` — obsolete under the new model. Remove the route and the client call site in `app/e/[code]/play/page.tsx`.

**Auth note for host-player POSTs:** the host player doesn't have the host cookie. `/round/start` and `/round/end` accept `{ playerId }` in the body and the server checks `events.host_player_id === playerId`. Threat model is "your friend can't grief the round from his phone unless he learns the playerId UUID, which only lives on his own device". Adequate for a bachelor party.

## PubNub messages

Add to the `ProgressMsg` union in `lib/types/index.ts`:

```ts
interface RoundStartMsg {
  kind: "round-start";
  roundIndex: number;
  challenge: ChallengeId;
  startsAt: number;       // ms epoch — when countdown ends
  ts: number;
}

interface RoundEndMsg {
  kind: "round-end";
  roundIndex: number;
  challenge: ChallengeId;
  winnerTeamId: string;
  decidedAt: number;
  ts: number;
}

interface HostChangedMsg {
  kind: "host-changed";
  hostPlayerId: string | null;
  ts: number;
}
```

### Store handling (`lib/store/index.ts`)

- **`round-start`:** clear all teams' progress for that challenge (fresh round), set `event.currentRoundIndex/Status/StartsAt`, store the round's challenge id. Surface a "show countdown" signal that the journey/challenge views consume.
- **`round-end`:** append `{challenge, teamId, decidedAt}` to `event.roundWinners`, set `currentRoundStatus='decided'`. UI auto-redirects challenge view back to journey.
- **`host-changed`:** update `event.hostPlayerId` so journey-view host buttons toggle visibility.

## Schema migration

Single Drizzle migration:

```sql
ALTER TABLE events
  ADD COLUMN host_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  ADD COLUMN current_round_index integer,
  ADD COLUMN current_round_status text,
  ADD COLUMN current_round_starts_at timestamptz,
  ADD COLUMN round_winners jsonb NOT NULL DEFAULT '[]'::jsonb;
```

Existing events get null/empty defaults; the new flow only kicks in when a host taps Start under the new code paths.

Also update `lib/challenges/index.ts`:

```ts
spin: {
  ...,
  aggregation: "team-total", // was "per-player"
  defaultThreshold: 100,     // was 30
  formatProgress: (v, t) => `${Math.floor(v).toLocaleString()} / ${t.toLocaleString()} spins`,
}
```

## Edge cases

- **Host player leaves / phone dies:** laptop dashboard fallback. Clear-host link in dashboard reassigns.
- **Two teams complete near-simultaneously:** server-side first-write-wins via transactional flip of `currentRoundStatus`. Same pattern as the existing `/finish` endpoint.
- **Host taps "End round" with no progress at all:** confirmation modal lets them pick a winner manually or cancel. "Auto (highest progress)" still works — picks the team with `value=0` arbitrarily, fine for the threat model.
- **`north` round end semantics:** ends when all enabled players have submitted a guess OR when host ends manually. Winner = team with smallest sum of `errorDeg`.
- **Empty teams (0 in-team players):** UI on journey shows a warning if any team is empty when host tries to start. Server doesn't hard-block (matches existing `StartButton` "allow uneven teams for testing" stance).
- **Refresh during countdown:** client reads `currentRoundStartsAt` from event row → renders remaining countdown; if T-0 already passed, navigates straight to challenge view.
- **Refresh during decided:** client sees `currentRoundStatus='decided'` → shows journey with winner already stamped on the just-completed card; host's "Start next round" button is visible.

## Components

### New

- `components/play/JourneyView.tsx` — replaces the 2-col tile grid in `/e/[code]/play`.
- `components/play/RoundCard.tsx` — one card per heptathlon round, drives all states (past/current/future/locked).
- `components/play/CountdownOverlay.tsx` — 5s sync overlay, listens for round-start.
- `components/play/HostRoundControls.tsx` — Start/End/Redo buttons rendered inline on RoundCards when viewer is the host player.
- `components/host/HostPlayerPicker.tsx` — crown affordance + "Host: <name>" indicator integrated into the existing TeamBuilder.

### Changed

- `app/e/[code]/play/page.tsx` — render `JourneyView` instead of tile grid; keep bootstrap and wake-lock.
- `app/e/[code]/play/[challenge]/page.tsx` — gate by `event.currentRoundIndex` matching the URL challenge; auto-redirect to journey on `round-end` or on mismatched/locked round.
- `app/e/[code]/done/page.tsx` — show champion + per-round breakdown.
- `app/host/[code]/results/page.tsx` — match the new champion-by-round-wins format.
- `lib/store/index.ts` — handle `round-start`, `round-end`, `host-changed`.
- `lib/types/index.ts` — extend `ProgressMsg` union; extend `EventConfig` with new fields.
- `lib/db/schema.ts` — five new columns on `events`.
- `lib/api/contract.ts` — types for `/host-player`, `/round/start`, `/round/end`.
- `lib/challenges/index.ts` — `spin` becomes `team-total` with threshold ~100.
- `components/host/HostDashboard.tsx` — wire in HostPlayerPicker.
- `components/host/StartButton.tsx` / `EndButton.tsx` / `ResetButtons.tsx` — kept as laptop-dashboard fallback; route through new APIs.
- `components/host/HostMonitor.tsx` — show round wins and current round indicator.
- `components/dashboard/StandingsCard.tsx` — round-wins format ("X wins") instead of "X/7 done".

## Out of scope

- Drag-to-reorder the heptathlon (fixed `CHALLENGE_ORDER` is enough; toggling enabled/disabled per-challenge already exists).
- Multi-host support (single host enforced).
- Round timers / auto-end after N seconds (host fallback covers it).
- Live spectator mode for non-players (could be added later by exposing a read-only journey view).

## Testing — manual happy path

1. Create event in `/host`, build 3 teams, drop players into teams.
2. In Team Builder, tap crown next to one player → host indicator appears in header.
3. That player joins on their phone, sees "▶ START HEPTATHLON" button on lobby.
4. Tap Start → all phones countdown 5→0 → distance challenge appears on all phones.
5. Some team hits 1 mile → all phones return to journey, distance card shows 🥇 with that team's emoji.
6. Host taps "Start round 2" → countdown → steps appears. Repeat through round 7.
7. After round 7 → done page with champion + 7-round breakdown.

Edge tests:
- Host taps "End round" mid-round, picks a winner manually.
- Host redoes a past round; verify only that round's data is wiped.
- Refresh a player's phone mid-countdown — should resume the countdown.
- Refresh during a decided state — should land on journey with the medal already shown.
- Reassign host mid-event by tapping a different player's crown.
