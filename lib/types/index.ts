// Shared types for Toasty Pizza. ALL agents should import from here.

export type ChallengeId =
  | "distance"
  | "steps"
  | "taps"
  | "scream"
  | "shake"
  | "spin"
  | "north";

export type EventStatus = "lobby" | "active" | "finished";

export type AggregationMode =
  | "team-total" // sum across teammates (distance, steps, taps)
  | "all-simultaneous" // all 3 mics/phones must satisfy the condition concurrently (scream, shake)
  | "per-player" // each teammate must individually hit the threshold (spin)
  | "per-player-once"; // each teammate gets one shot (north)

export interface ChallengeDef {
  id: ChallengeId;
  label: string;
  emoji: string;
  defaultThreshold: number;
  unit: string;
  aggregation: AggregationMode;
  description: string;
  // Format the team's current value for display, e.g. "1.0 / 1.0 mi"
  formatProgress: (currentValue: number, threshold: number) => string;
}

// ----- Real-time message types (PubNub channel `event-<code>`) -----

export interface ProgressDeltaMsg {
  kind: "progress";
  playerId: string;
  teamId: string;
  challenge: Exclude<ChallengeId, "scream" | "shake" | "north">;
  delta: number;
  ts: number;
}

export interface LiveLevelMsg {
  kind: "live";
  playerId: string;
  teamId: string;
  challenge: "scream" | "shake";
  level: number; // dB or accel magnitude
  ts: number;
}

export interface NorthGuessMsg {
  kind: "guess";
  playerId: string;
  teamId: string;
  challenge: "north";
  errorDeg: number;
  ts: number;
}

export interface CompleteMsg {
  kind: "complete";
  teamId: string;
  challenge: ChallengeId;
  ts: number;
}

export interface EventStateMsg {
  kind: "event-state";
  status: EventStatus;
  ts: number;
  winnerTeamId?: string;
}

export interface PlayerJoinedMsg {
  kind: "player-joined";
  playerId: string;
  name: string;
  ts: number;
}

export interface TeamAssignmentMsg {
  kind: "team-assigned";
  playerId: string;
  teamId: string | null; // null = removed back to pool
  ts: number;
}

export interface ProgressResetMsg {
  kind: "progress-reset";
  ts: number;
}

export type ProgressMsg =
  | ProgressDeltaMsg
  | LiveLevelMsg
  | NorthGuessMsg
  | CompleteMsg
  | EventStateMsg
  | PlayerJoinedMsg
  | TeamAssignmentMsg
  | ProgressResetMsg;

// ----- Domain entities (mirror DB rows; serializable for client use) -----

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
}

export interface Team {
  id: string;
  eventId: string;
  name: string;
  emoji: string;
  color: string; // tailwind class fragment, e.g. "from-accent-pink to-accent-orange"
}

export interface Player {
  id: string;
  eventId: string;
  teamId: string | null;
  name: string;
  deviceId: string;
  joinedAt: string;
}

export interface ChallengeProgress {
  value: number;
  completed: boolean;
  completedAt: number | null;
  // For per-player aggregation, contributions per player
  perPlayer?: Record<string, number>;
  // For 'north', list of guesses
  guesses?: Array<{ playerId: string; errorDeg: number }>;
}

export type TeamProgress = Record<ChallengeId, ChallengeProgress>;
