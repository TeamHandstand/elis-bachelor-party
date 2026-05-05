// HTTP API contract — shared between server (Agent D) and clients (Agent B / Agent C).
// Agent D's route handlers must match these response shapes exactly.

import type {
  ChallengeId,
  EventConfig,
  EventStatus,
  Player,
  Team,
} from "@/lib/types";

// ---------- POST /api/host/login ----------
export interface HostLoginRequest {
  password: string;
}
export interface HostLoginResponse {
  ok: boolean;
}

// ---------- GET /api/host/me ----------
// Boolean: does the calling browser have a valid host cookie?
export interface HostMeResponse {
  isHost: boolean;
}

// ---------- GET /api/host/events ----------
// Lists events for the host dashboard. Requires host cookie.
export interface ListEventsResponse {
  events: Array<{
    id: string;
    code: string;
    title: string;
    status: EventStatus;
    createdAt: string;
  }>;
}

// ---------- POST /api/events ----------
// Creates a new event. Requires host cookie. Server picks a unique code.
export interface CreateEventRequest {
  title?: string;
  groomName?: string;
}
export interface CreateEventResponse {
  event: EventConfig;
  teams: Team[]; // 3 default teams
}

// ---------- GET /api/events/:code ----------
// Public read of event config + teams + players (no progress data — that's PubNub).
export interface GetEventResponse {
  event: EventConfig;
  teams: Team[];
  players: Player[];
}

// ---------- PATCH /api/events/:code ----------
// Host updates config (title, groom, challenges, team names/emoji). Requires host cookie.
export interface UpdateEventRequest {
  title?: string;
  groomName?: string;
  challenges?: EventConfig["challenges"];
  teams?: Array<{ id: string; name?: string; emoji?: string; color?: string }>;
}
export interface UpdateEventResponse {
  event: EventConfig;
  teams: Team[];
}

// ---------- POST /api/events/:code/players ----------
// Player joins the event. Returns the player's id (and reuses existing player if device_id matches).
export interface JoinEventRequest {
  name: string;
  deviceId: string;
}
export interface JoinEventResponse {
  player: Player;
}

// ---------- PATCH /api/events/:code/players/:playerId ----------
// Host moves a player to a team (or back to pool with teamId=null).
export interface AssignPlayerRequest {
  teamId: string | null;
}
export interface AssignPlayerResponse {
  player: Player;
}

// ---------- POST /api/events/:code/start ----------
export interface StartEventResponse {
  event: EventConfig;
}

// ---------- POST /api/events/:code/teams ----------
// Host-cookie. Optional name/emoji/color; server picks sensible defaults.
export interface CreateTeamRequest {
  name?: string;
  emoji?: string;
  color?: string;
}
export interface CreateTeamResponse {
  team: Team;
}

// ---------- DELETE /api/events/:code/teams/:teamId ----------
// Host-cookie. Players on the team are unassigned; final_progress cascades.

// ---------- POST /api/events/:code/end ----------
// Force-end the heptathlon. Optional winnerTeamId crowns a champion;
// otherwise the event ends with no winner.
// Auth: host-cookie OR matching host-player.
export interface EndEventRequest {
  playerId?: string;
  winnerTeamId?: string;
}
export interface EndEventResponse {
  event: EventConfig;
}

// ---------- POST /api/events/:code/reset ----------
// mode='progress' — clear progress, keep teams. mode='lobby' — clear teams too.
export interface ResetEventRequest {
  mode: "progress" | "lobby";
}
export interface ResetEventResponse {
  event: EventConfig;
  teams: Team[];
  players: Player[];
}

// ---------- POST /api/events/:code/progress ----------
// Client flushes its team's current progress snapshot. Server upserts with
// MAX semantics so the most-advanced sample wins (multiple players on the
// same team can flush concurrently).
export interface ProgressSnapshotRequest {
  teamId: string;
  challenges: Array<{
    challenge: ChallengeId;
    value: number;
    completed: boolean;
    completedAt: number | null;
  }>;
}
export interface ProgressSnapshotResponse {
  ok: true;
}

// ---------- GET /api/events/:code/progress ----------
// Returns persisted progress for all teams in this event. Used by clients
// on first bootstrap to recover state across page refreshes.
export interface GetProgressResponse {
  progress: Array<{
    teamId: string;
    challenge: ChallengeId;
    value: number;
    completed: boolean;
    completedAt: number | null;
  }>;
}

// ---------- GET /api/events/:code/results ----------
// Final standings after event finishes.
export interface ResultsResponse {
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
}

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
  playerId?: string; // for host-player auth path
  redo?: boolean;
  roundIndex?: number; // required if redo is true
}
export interface StartRoundResponse {
  event: EventConfig;
  challenge: ChallengeId;
  startsAt: number;
}

// ---------- POST /api/events/:code/round/end ----------
// Auth modes:
//  - mode='auto': any client; server validates the team has completed
//    the current challenge in final_progress.
//  - mode='host': requires host-cookie OR matching playerId.
export interface EndRoundRequest {
  mode: "auto" | "host";
  playerId?: string; // for host-player auth path
  teamId?: string; // required when mode='auto'; optional when 'host'
}
export interface EndRoundResponse {
  event: EventConfig;
  winnerTeamId: string;
  decidedAt: number;
  eventFinished: boolean;
  alreadyDecided: boolean;
}
