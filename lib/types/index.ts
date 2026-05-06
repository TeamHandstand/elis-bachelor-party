// Shared types for Toasty Pizza. ALL agents should import from here.

export type ChallengeId =
  | "distance"
  | "steps"
  | "taps"
  | "scream"
  | "shake"
  | "spin"
  | "north"
  | "time-guess"
  | "trivia";

export type EventStatus = "lobby" | "active" | "finished";

export type AggregationMode =
  | "team-total" // sum across teammates (distance, steps, taps)
  | "all-simultaneous" // all 3 mics/phones must satisfy the condition concurrently (scream, shake)
  | "per-player" // each teammate must individually hit the threshold (spin)
  | "per-player-once" // each teammate gets one shot (north)
  | "team-block"; // ONE submission per team — entire answer block at once (trivia)

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
//
// All progress / live / guess / complete messages now carry `roundIndex`
// so the store can route updates to the correct round even when the same
// challenge type appears in more than one round of the same event.

export interface ProgressDeltaMsg {
  kind: "progress";
  playerId: string;
  teamId: string;
  roundIndex: number;
  challenge: Exclude<ChallengeId, "scream" | "shake" | "north">;
  delta: number;
  ts: number;
}

export interface LiveLevelMsg {
  kind: "live";
  playerId: string;
  teamId: string;
  roundIndex: number;
  challenge: "scream" | "shake";
  level: number; // dB or accel magnitude
  ts: number;
}

export interface NorthGuessMsg {
  kind: "guess";
  playerId: string;
  teamId: string;
  roundIndex: number;
  // Reused for both north (degrees off) and time-guess (ms deviation).
  challenge: "north" | "time-guess";
  errorDeg: number;
  ts: number;
}

export interface CompleteMsg {
  kind: "complete";
  teamId: string;
  roundIndex: number;
  challenge: ChallengeId;
  ts: number;
}

// Live-synced draft answer pick for trivia. Any teammate can change the
// team's draft answer for any question; everyone on the team sees the same
// draft until one person submits.
export interface TriviaPickMsg {
  kind: "trivia-pick";
  teamId: string;
  playerId: string;
  roundIndex: number;
  questionId: string;
  choiceIndex: number; // -1 to clear
  ts: number;
}

// Final team submission for a trivia round. The team's final answers, frozen.
// `correctCount` is computed by the publisher (host of the device that hit
// SUBMIT) against the round's question set; receivers trust it since the same
// question set is in events.rounds[roundIndex].questions.
export interface TriviaSubmitMsg {
  kind: "trivia-submit";
  teamId: string;
  playerId: string; // who hit submit, for "submitted by"
  roundIndex: number;
  answers: Record<string, number>; // questionId -> choiceIndex
  correctCount: number;
  ts: number; // submission timestamp — used as tiebreaker
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

export interface RoundResetMsg {
  kind: "round-reset";
  fromIndex: number;
  ts: number;
}

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

export interface PlayerRenamedMsg {
  kind: "player-renamed";
  playerId: string;
  name: string;
  ts: number;
}

export interface TeamRenamedMsg {
  kind: "team-renamed";
  teamId: string;
  name: string;
  emoji: string;
  ts: number;
}

export type ProgressMsg =
  | ProgressDeltaMsg
  | LiveLevelMsg
  | NorthGuessMsg
  | CompleteMsg
  | TriviaPickMsg
  | TriviaSubmitMsg
  | EventStateMsg
  | PlayerJoinedMsg
  | TeamAssignmentMsg
  | ProgressResetMsg
  | RoundResetMsg
  | RoundStartMsg
  | RoundEndMsg
  | HostChangedMsg
  | PlayerRenamedMsg
  | TeamRenamedMsg;

// ----- Domain entities (mirror DB rows; serializable for client use) -----

export interface RoundWinnerEntry {
  challenge: ChallengeId;
  teamId: string;
  decidedAt: number;
  // ms epoch — when the round started. Optional for back-compat with rows
  // written before this field existed.
  startedAt?: number | null;
}

export type RoundStatus = "live" | "decided";

// A single trivia question. `correctIndex` indexes into `choices`.
export interface TriviaQuestion {
  id: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
}

// One slot in the event's round list. The host can drag-drop these around
// and add multiple of the same challenge type with different thresholds.
export interface RoundConfig {
  challenge: ChallengeId;
  threshold: number;
  // Only populated for `challenge === "trivia"`. Inlined into the round so
  // duplicate trivia rounds in one event can each have their own questions.
  questions?: TriviaQuestion[];
}

// A reusable trivia question set the host can save and apply to any trivia
// round. Lives in its own DB table — independent of any single event.
export interface TriviaPreset {
  id: string;
  name: string;
  questions: TriviaQuestion[];
  createdAt: string;
  updatedAt: string;
}

export interface EventConfig {
  id: string;
  code: string;
  title: string;
  groomName: string;
  status: EventStatus;
  // Ordered list of rounds. Index in this array IS the round index used
  // throughout PubNub messages, progress storage, and host UI.
  rounds: RoundConfig[];
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
  // For 'north' / 'time-guess', list of guesses
  guesses?: Array<{ playerId: string; errorDeg: number }>;
  // Trivia: live-synced draft picks before submit (any teammate may edit).
  triviaDraft?: Record<string, number>; // questionId -> choiceIndex
  // Trivia: frozen submitted answer block. Set on TriviaSubmitMsg receive.
  triviaAnswers?: Record<string, number>;
  // Trivia: which teammate hit SUBMIT.
  triviaSubmittedBy?: string;
}

// Keyed by round index (number). Rounds that haven't been touched yet
// simply don't have an entry; the store / UI default to a blank cell.
export type TeamProgress = Record<number, ChallengeProgress>;
