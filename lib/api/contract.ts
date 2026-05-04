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

// ---------- POST /api/events/:code/finish ----------
// Called by clients when they detect their team has completed all challenges.
// Server is the source of truth for "first to complete" — DB row update is atomic.
// Returns { winnerTeamId } so clients can display correct UI.
export interface FinishEventRequest {
  teamId: string;
  // include current snapshot so server can persist final_progress
  finalProgress: Array<{
    teamId: string;
    challenge: ChallengeId;
    value: number;
    completed: boolean;
    completedAt: number | null;
  }>;
}
export interface FinishEventResponse {
  winnerTeamId: string;
  alreadyFinished: boolean;
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
