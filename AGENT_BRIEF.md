# Toasty Pizza — Agent Integration Contract

If you are a sub-agent, read this entire file before writing code. The interfaces below are STABLE — implement against them, do not redefine them.

## What we're building

Mobile-web team-race game for a bachelor party. 3 teams of 3, first team to finish all 7 challenges wins. Stack: Next.js 14 (app router) + Drizzle + Postgres + PubNub. Visual: dark eggplant `#1a0d20` background, pink-to-orange gradient accents, big emoji, layout B (tile grid + teammate orbit) for the player dashboard. See `/Users/sammyg/.claude/plans/i-d-like-to-design-toasty-pizza.md` for full design.

## Stable interfaces — DO NOT REDEFINE

- `lib/types/index.ts` — All shared types (`ChallengeId`, `ProgressMsg`, `EventConfig`, `Team`, `Player`, `TeamProgress`). Import these; do not duplicate.
- `lib/challenges/index.ts` — Challenge metadata (`CHALLENGES` map, `CHALLENGE_ORDER`, `defaultChallengeConfig()`).
- `lib/db/schema.ts` — Drizzle tables (`events`, `teams`, `players`, `finalProgress`).
- `lib/db/client.ts` — `db` (Drizzle client). Server-side only.
- `lib/pubnub/client.ts` — `getPubNubClient(uuid)`, `subscribeToEvent(client, code, onMessage, onPresence?)`, `publishToEvent(client, code, msg)`, `fetchHistory(client, code, count?)`. Client-side.
- `lib/pubnub/server.ts` — `publishFromServer(code, msg)`. Server-side only.
- `lib/store/index.ts` — `useToastyStore` (Zustand). Player UI consumes this. Selectors: `getMyTeam`, `getTeammates`, `getStandings`, `isTeamFinished`, `getMyTeamProgress`.
- `lib/sensors/types.ts` — `CountingSensor`, `LevelSensor`, `InstantSensor<T>` interfaces. All sensor modules must implement one of these.
- `lib/utils/code.ts` — `generateEventCode()`, `normalizeEventCode(input)`.
- `lib/utils/device.ts` — `getOrCreateDeviceId()` (client only).
- `lib/auth/host.ts` — `isHostAuthorized()`, `setHostCookie(pw)`, `clearHostCookie()` (server only). API routes for host actions must check `isHostAuthorized()`.
- `lib/api/contract.ts` — All HTTP request/response types. Server route handlers and client fetchers must match these shapes exactly.
- `lib/store/bootstrap.ts` — `useEventBootstrap(code, myPlayerId)` hook. Player and host-monitor pages should call this to wire the store + PubNub. Also exports `usePublisher(code)` for sensors to publish their progress messages.

## Conventions

- Path alias `@/*` maps to repo root. Use `@/lib/...` etc.
- Tailwind theme tokens: `bg-bg`, `bg-bg-card`, `bg-gradient-party`, `bg-gradient-done`, `text-accent-orange`, etc. (See `tailwind.config.ts`.)
- All client components: `"use client"` directive at top.
- All files importing from `lib/db/*` or `lib/pubnub/server.ts` must be server-only (route handlers, server components, server actions).
- Touch-friendly: 44px+ tap targets, no hover-only affordances.
- iOS gotchas:
  - `DeviceMotionEvent.requestPermission()` and `DeviceOrientationEvent.requestPermission()` exist on iOS 13+. Wrap in `if (typeof X.requestPermission === 'function')`.
  - HTTPS required for sensor APIs in production. Local dev with `npm run dev -H 0.0.0.0` works for LAN testing because mobile Safari accepts http on LAN.
  - Mic via `getUserMedia({ audio: true })`. AudioContext must be resumed in a user gesture.

## Visual companion mockup file

`.superpowers/brainstorm/86871-1777929355/content/dashboard.html` shows Layout B in detail with the chosen palette. Reference, do not copy structurally.

## Progress message flow

Source-of-truth split:
- **DB**: event config, team rosters, final results.
- **PubNub channel `event-<code>`**: live progress messages. Each device publishes its own deltas/levels. Each device subscribes and aggregates into the Zustand store.

For continuous sensors (distance, steps, taps, spin): publish `{ kind: 'progress', playerId, teamId, challenge, delta, ts }`.
For scream/shake: publish `{ kind: 'live', level, ts, ... }` ~every 250ms. The first device to detect "all 3 teammates above threshold continuously for N seconds" publishes `{ kind: 'complete', teamId, challenge, ts }` (deduped on receipt).
For Due North: publish `{ kind: 'guess', playerId, teamId, challenge: 'north', errorDeg, ts }` when player submits.
The Zustand store (`receive(msg)`) handles all of these uniformly — sensors don't need to touch the store directly.
