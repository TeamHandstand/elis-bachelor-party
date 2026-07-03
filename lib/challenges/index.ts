import type {
  ChallengeDef,
  ChallengeId,
  EventConfig,
  InterleaveSegment,
  RoundConfig,
  TriviaQuestion,
} from "@/lib/types";

export const CHALLENGES: Record<ChallengeId, ChallengeDef> = {
  distance: {
    id: "distance",
    label: "Distance",
    emoji: "🚶",
    defaultThreshold: 1609, // 1 mile in meters
    unit: "m",
    aggregation: "team-total",
    description: "Walk a set distance as a team. GPS-tracked.",
    formatProgress: (v, t) => `${(v / 1609).toFixed(2)} / ${(t / 1609).toFixed(1)} mi`,
  },
  steps: {
    id: "steps",
    label: "Steps",
    emoji: "👟",
    defaultThreshold: 5000,
    unit: "steps",
    aggregation: "team-total",
    description: "Take a target number of steps total as a team.",
    formatProgress: (v, t) => `${Math.floor(v).toLocaleString()} / ${t.toLocaleString()}`,
  },
  taps: {
    id: "taps",
    label: "Taps",
    emoji: "👆",
    defaultThreshold: 3000,
    unit: "taps",
    aggregation: "team-total",
    description: "Tap a target number of times total as a team.",
    formatProgress: (v, t) => `${Math.floor(v).toLocaleString()} / ${t.toLocaleString()}`,
  },
  scream: {
    id: "scream",
    label: "Group Scream",
    emoji: "📣",
    defaultThreshold: 30, // seconds sustained
    unit: "seconds @ 80dB",
    aggregation: "all-simultaneous",
    description: "All teammates scream above 80 dB for the target sustained seconds.",
    formatProgress: (v, t) => `${v.toFixed(0)}s / ${t}s`,
  },
  shake: {
    id: "shake",
    label: "Sync Shake",
    emoji: "🤝",
    defaultThreshold: 5, // seconds sustained
    unit: "seconds shaking",
    aggregation: "all-simultaneous",
    description: "All teammates shake their phones simultaneously for the target seconds.",
    formatProgress: (v, t) => `${v.toFixed(1)}s / ${t}s`,
  },
  spin: {
    id: "spin",
    label: "Spin Cycle",
    emoji: "🌀",
    defaultThreshold: 100,
    unit: "rotations",
    aggregation: "team-total",
    description: "Spin in place until your team racks up the target rotations. Hold both on-screen buttons.",
    formatProgress: (v, t) => `${Math.floor(v).toLocaleString()} / ${t.toLocaleString()} spins`,
  },
  north: {
    id: "north",
    label: "True North",
    emoji: "🧭",
    // Threshold is unused for north — every teammate gets exactly one guess
    // and the team's score is the average angular error. Stored as 0 by
    // default so the host UI doesn't need to ask for it.
    defaultThreshold: 0,
    unit: "guesses",
    aggregation: "per-player-once",
    description:
      "Every teammate gets one shot at guessing true north. Smallest avg angular error wins.",
    formatProgress: (v) => `${Math.floor(v)} guesses in`,
  },
  "time-guess": {
    id: "time-guess",
    label: "Guess The Time",
    emoji: "⏱",
    // Threshold is the TARGET ELAPSED TIME in milliseconds (e.g., 30s).
    defaultThreshold: 30000,
    unit: "ms target",
    aggregation: "per-player-once",
    description:
      "Each teammate hits GO and then STOP when they think the target time has passed. Smallest avg deviation wins.",
    formatProgress: (v, t) =>
      `${Math.floor(v)} guesses in · target ${(t / 1000).toFixed(1)}s`,
  },
  trivia: {
    id: "trivia",
    label: "Trivia",
    emoji: "❓",
    // Threshold is unused — score is correct count vs. the round's question
    // list. Stored as 0 so the host UI doesn't ask for one.
    defaultThreshold: 0,
    unit: "correct",
    aggregation: "team-block",
    description:
      "Whole team picks answers together (live synced) and submits one block. Most correct wins; tie → earliest submit.",
    formatProgress: (v) => `${Math.floor(v)} correct`,
  },
  interleave: {
    id: "interleave",
    label: "Spin & Stomp",
    emoji: "🌀👟",
    // Threshold is auto-derived as the sum of all segment counts. Stored as
    // 0 here so the host UI doesn't ask for it; the segment editor controls
    // the real total.
    defaultThreshold: 0,
    unit: "segments",
    aggregation: "team-total",
    description:
      "Alternating spin/step segments. Clear them in order — earliest finisher wins.",
    formatProgress: (v, t) =>
      `${Math.min(Math.floor(v), t).toLocaleString()} / ${t.toLocaleString()}`,
  },
  flappy: {
    id: "flappy",
    label: "Scream Bird",
    emoji: "🐦",
    // 200m = roughly 30s of decent flying for a moderately good player.
    defaultThreshold: 200,
    unit: "meters",
    aggregation: "team-total",
    description:
      "Flappy Bird, but yelling makes the bird fly. Total team meters wins.",
    formatProgress: (v, t) => `${Math.floor(v)} / ${t} m`,
  },
  "air-time": {
    id: "air-time",
    label: "Air Time",
    emoji: "✈️",
    // 30 seconds is roughly ~60-90 throws of a phone with a half-second hang
    // each. Tunable by host.
    defaultThreshold: 30,
    unit: "airborne sec",
    aggregation: "team-total",
    description:
      "Toss your phone (carefully). Total team seconds airborne wins.",
    formatProgress: (v, t) =>
      `${v.toFixed(1)} / ${t.toFixed(1)}s airborne`,
  },
  "tilt-maze": {
    id: "tilt-maze",
    label: "Tilt Maze",
    emoji: "🌐",
    defaultThreshold: 10,
    unit: "levels",
    aggregation: "team-total",
    description:
      "Tilt to roll a marble through a maze. Pass the phone — first team to clear N levels wins.",
    formatProgress: (v, t) =>
      `${Math.floor(v).toLocaleString()} / ${t} levels`,
  },
  "selfie-sync": {
    id: "selfie-sync",
    label: "Selfie Sync",
    emoji: "😱",
    // Number of target faces the team must hit in sequence. Each face advances
    // when all teammates' expression match crosses threshold simultaneously
    // for ~1s. Round = race; fastest to clear all N faces wins.
    defaultThreshold: 7,
    unit: "faces",
    aggregation: "team-total",
    description:
      "Race! Make 7 target faces in a row as a team — all teammates sync each face. Fastest team wins.",
    formatProgress: (v, t) => `${Math.min(Math.floor(v), t)} / ${t} faces`,
  },
  punishment: {
    id: "punishment",
    label: "Punishment",
    emoji: "💀",
    defaultThreshold: 0,
    unit: "",
    // Aggregation is meaningless here — punishment rounds don't track team
    // progress. Pick a value to keep the type happy.
    aggregation: "team-block",
    description:
      "Losing team gets called out on a fullscreen takeover. Host marks complete.",
    formatProgress: () => "",
  },
};

export const DEFAULT_PUNISHMENT_MESSAGE =
  "LOSING TEAM MUST TAKE A SHOT OF FIREBALL, NOW!";

/**
 * Big imperative command shown at the top of each round-play page so players
 * always know the goal at a glance. Threshold is per-round, so we format it
 * here rather than hard-coding numbers in the description.
 */
export function challengeCommand(id: ChallengeId, threshold: number): string {
  switch (id) {
    case "distance": {
      const miles = threshold / 1609;
      const milesLabel =
        Math.abs(miles - Math.round(miles)) < 0.05
          ? `${Math.round(miles)}`
          : miles.toFixed(2);
      const unit = Math.abs(miles - 1) < 0.001 ? "mile" : "miles";
      return `Travel ${milesLabel} collective ${unit} as a team!`;
    }
    case "steps":
      return `Take ${threshold.toLocaleString()} steps together as a team!`;
    case "taps":
      return `Tap the screen ${threshold.toLocaleString()} times as a team!`;
    case "scream":
      return `All teammates scream above 80 dB for ${threshold} sustained seconds!`;
    case "shake":
      return `All teammates shake your phones simultaneously for ${threshold} seconds!`;
    case "spin":
      return `Spin in place — rack up ${threshold.toLocaleString()} rotations as a team!`;
    case "north":
      return `Each teammate gets ONE guess at true north — closest team avg wins!`;
    case "time-guess": {
      const seconds = (threshold / 1000).toFixed(0);
      return `Each teammate: tap GO, then STOP after ${seconds} seconds — closest avg wins!`;
    }
    case "trivia":
      return `Pick answers together — most correct wins! (Tie → earliest submit.)`;
    case "interleave":
      return `Clear every spin & step segment in order — first team done wins!`;
    case "flappy":
      return `Yell to flap, dodge pipes — fly ${threshold}m as a team!`;
    case "air-time":
      return `Toss the phone — total team airtime: ${threshold} seconds!`;
    case "tilt-maze":
      return `Tilt your way through ${threshold} mazes — pass the phone, race the others!`;
    case "selfie-sync":
      return `Race! Sync ${threshold} target faces as a team — fastest wins!`;
    case "punishment":
      return `Losing team — your time has come.`;
  }
}

export const CHALLENGE_ORDER: ChallengeId[] = [
  "distance",
  "steps",
  "taps",
  "scream",
  "shake",
  "spin",
  "north",
  "time-guess",
  "trivia",
  "interleave",
  "flappy",
  "air-time",
  "tilt-maze",
  "selfie-sync",
];

/**
 * Default round list for a freshly-created event: one round per challenge
 * type that ships with sensible defaults. Trivia is excluded — it needs
 * questions, which the host must author before adding the round.
 */
export function defaultRounds(): RoundConfig[] {
  return CHALLENGE_ORDER.filter((id) => id !== "trivia").map((id) => ({
    challenge: id,
    threshold: CHALLENGES[id].defaultThreshold,
  }));
}

/**
 * @deprecated Old shape returned a Record<ChallengeId, …>. Kept only so any
 * leftover references compile during the rounds-array migration.
 */
export function defaultChallengeConfig(): RoundConfig[] {
  return defaultRounds();
}

// ---------------------------------------------------------------------------
// Open Play — per-game single-attempt specs
// ---------------------------------------------------------------------------
//
// Open Play turns a subset of challenges into one-shot, best-score games each
// player plays once. Ranking direction, attempt duration, input mode, and the
// sensor to wire up live here. Display label/emoji are reused from CHALLENGES.
// The RoundConfig.threshold of an open game is reinterpreted as the attempt
// duration in ms (so the host can tune it via the same config path).

export interface OpenGameSpec {
  gameId: ChallengeId;
  // Ranking direction on the per-game leaderboard.
  direction: "higher" | "lower";
  // Default single-attempt duration in ms (stored per-round in threshold).
  durationMs: number;
  // How the attempt screen collects input.
  //  - "tap-surface": a full-screen tap target (taps).
  //  - "motion": a motion/orientation sensor running for the duration.
  input: "tap-surface" | "motion";
  // Which sensor class the play screen instantiates (client maps this).
  sensor: "taps" | "steps" | "spin" | "air-time";
  // Short imperative shown on the attempt screen.
  instruction: string;
  // Format the accumulated raw score for display.
  formatScore: (score: number) => string;
}

export const OPEN_GAMES: Partial<Record<ChallengeId, OpenGameSpec>> = {
  taps: {
    gameId: "taps",
    direction: "higher",
    durationMs: 15000,
    input: "tap-surface",
    sensor: "taps",
    instruction: "Tap the screen as fast as you can!",
    formatScore: (s) => `${Math.floor(s).toLocaleString()} taps`,
  },
  steps: {
    gameId: "steps",
    direction: "higher",
    durationMs: 30000,
    input: "motion",
    sensor: "steps",
    instruction: "Run in place / walk — rack up as many steps as you can!",
    formatScore: (s) => `${Math.floor(s).toLocaleString()} steps`,
  },
  spin: {
    gameId: "spin",
    direction: "higher",
    durationMs: 20000,
    input: "motion",
    sensor: "spin",
    instruction: "Spin in place — the more rotations the better!",
    formatScore: (s) => `${(s / 360).toFixed(1)} spins`,
  },
  "air-time": {
    gameId: "air-time",
    direction: "higher",
    durationMs: 30000,
    input: "motion",
    sensor: "air-time",
    instruction: "Toss the phone (carefully!) — total seconds airborne wins.",
    formatScore: (s) => `${s.toFixed(1)}s airborne`,
  },
};

/** Whether a challenge is playable as an Open Play single-attempt game. */
export function isOpenGame(id: ChallengeId): boolean {
  return id in OPEN_GAMES;
}

/**
 * Default game list for a freshly-created OPEN event: one of each supported
 * open-play game, threshold seeded with its attempt duration (ms).
 */
export function defaultOpenGames(): RoundConfig[] {
  return (Object.values(OPEN_GAMES) as OpenGameSpec[]).map((spec) => ({
    challenge: spec.gameId,
    threshold: spec.durationMs,
  }));
}

/**
 * Convenience: just the ChallengeId of each round in order. Equivalent to
 * `event.rounds.map(r => r.challenge)` but handy when callers are forwarding
 * the array around.
 */
export function roundChallengeIds(rounds: RoundConfig[]): ChallengeId[] {
  return rounds.map((r) => r.challenge);
}

/**
 * Resolve the threshold for a given round index, falling back to the
 * challenge's default threshold if the index is out of range.
 */
export function thresholdForRound(
  rounds: RoundConfig[],
  roundIndex: number,
): number {
  const r = rounds[roundIndex];
  if (!r) return 0;
  return r.threshold ?? CHALLENGES[r.challenge].defaultThreshold;
}

/**
 * Resolve the challenge id for a given round index, or null if out of range.
 */
export function challengeForRound(
  rounds: RoundConfig[],
  roundIndex: number,
): ChallengeId | null {
  return rounds[roundIndex]?.challenge ?? null;
}

/**
 * Whether the challenge is one whose threshold is host-tunable. Trivia and
 * north are the exceptions: trivia is scored by correct count vs. its own
 * embedded question list, north by avg angular error with one guess each.
 * Punishment has no threshold either — it's a non-scoring round. Interleave
 * derives its threshold from the sum of segment counts.
 */
export function challengeHasThreshold(id: ChallengeId): boolean {
  return (
    id !== "north" &&
    id !== "trivia" &&
    id !== "punishment" &&
    id !== "interleave"
  );
}

/**
 * True for the special "punishment" round type. These don't contribute to
 * scoring and have a different live UX (fullscreen takeover, host-marked
 * complete instead of a winner picker).
 */
export function isPunishmentRound(id: ChallengeId): boolean {
  return id === "punishment";
}

// ---------------------------------------------------------------------------
// Interleave helpers
// ---------------------------------------------------------------------------

export const DEFAULT_INTERLEAVE_SEGMENTS: InterleaveSegment[] = [
  { kind: "spin", count: 50 },
  { kind: "steps", count: 200 },
  { kind: "spin", count: 30 },
  { kind: "steps", count: 300 },
];

/** Sum of every segment's count. Used as the round's effective threshold. */
export function interleaveTotal(segments: InterleaveSegment[]): number {
  return segments.reduce((s, seg) => s + Math.max(0, seg.count), 0);
}

/**
 * Find which segment a team is currently working on given accumulated value.
 * Returns the active segment, its 0-based index, and progress within it.
 * If the team has finished every segment, returns null.
 */
export function locateInterleaveSegment(
  segments: InterleaveSegment[],
  accumulated: number,
): {
  index: number;
  segment: InterleaveSegment;
  segmentValue: number; // value within current segment
} | null {
  let consumed = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const next = consumed + seg.count;
    if (accumulated < next) {
      return {
        index: i,
        segment: seg,
        segmentValue: Math.max(0, accumulated - consumed),
      };
    }
    consumed = next;
  }
  return null;
}

function coerceInterleaveSegments(raw: unknown): InterleaveSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: InterleaveSegment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as { kind?: unknown; count?: unknown };
    if (o.kind !== "spin" && o.kind !== "steps") continue;
    const count =
      typeof o.count === "number" && Number.isFinite(o.count) && o.count > 0
        ? Math.floor(o.count)
        : 0;
    if (count === 0) continue;
    out.push({ kind: o.kind, count });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Trivia helpers
// ---------------------------------------------------------------------------

export function newTriviaQuestionId(): string {
  return `q_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyTriviaQuestion(): TriviaQuestion {
  return {
    id: newTriviaQuestionId(),
    prompt: "",
    choices: ["", ""],
    correctIndex: 0,
  };
}

/**
 * Coerce arbitrary jsonb input into a clean TriviaQuestion[]. Drops any
 * malformed entries; ensures every question has a stable id and a sensible
 * correctIndex within bounds.
 */
export function coerceTriviaQuestions(raw: unknown): TriviaQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: TriviaQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as {
      id?: unknown;
      prompt?: unknown;
      choices?: unknown;
      correctIndex?: unknown;
    };
    const rawChoices = Array.isArray(o.choices)
      ? o.choices.filter((c): c is string => typeof c === "string")
      : [];
    // Strip leading/trailing whitespace and drop fully-blank choices — the
    // host UI seeds new rows with empty placeholders, and we don't want them
    // surviving a save and confusing players at game time.
    const trackedCorrect =
      typeof o.correctIndex === "number" && Number.isInteger(o.correctIndex)
        ? o.correctIndex
        : 0;
    const choices: string[] = [];
    let correctIndex = 0;
    let correctRetained = false;
    for (let i = 0; i < rawChoices.length; i++) {
      const trimmed = rawChoices[i].trim();
      if (!trimmed) continue;
      if (i === trackedCorrect) {
        correctIndex = choices.length;
        correctRetained = true;
      }
      choices.push(trimmed);
    }
    if (choices.length < 2) continue;
    if (!correctRetained) correctIndex = 0;
    const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
    if (!prompt) continue;
    const id = typeof o.id === "string" && o.id ? o.id : newTriviaQuestionId();
    out.push({ id, prompt, choices, correctIndex });
  }
  return out;
}

/**
 * Client-side variant: same cleanup as `coerceTriviaQuestions` but returns
 * a count of dropped rows so callers can confirm with the user before a
 * silent save. Use this just before sending to the API.
 */
export function sanitizeTriviaQuestionsForSave(
  questions: TriviaQuestion[],
): { clean: TriviaQuestion[]; droppedCount: number } {
  const clean = coerceTriviaQuestions(questions);
  return { clean, droppedCount: questions.length - clean.length };
}

/**
 * Score a team's answer block against a question list. `answers` keys are
 * question ids; missing or out-of-range answers count as wrong.
 */
export function scoreTriviaAnswers(
  questions: TriviaQuestion[],
  answers: Record<string, number>,
): number {
  let correct = 0;
  for (const q of questions) {
    if (answers[q.id] === q.correctIndex) correct += 1;
  }
  return correct;
}

// ---------------------------------------------------------------------------
// Legacy parsing — older events stored `events.challenges` as a record keyed
// by ChallengeId. Convert to the new RoundConfig[] shape on read so old data
// keeps working without a destructive migration.
// ---------------------------------------------------------------------------

export type LegacyChallengesRecord = Partial<
  Record<ChallengeId, { enabled: boolean; threshold: number; order?: number }>
>;

export function legacyToRounds(
  legacy: LegacyChallengesRecord,
): RoundConfig[] {
  const ids = CHALLENGE_ORDER.filter((id) => legacy[id]?.enabled);
  ids.sort((a, b) => {
    const oa = legacy[a]?.order ?? CHALLENGE_ORDER.indexOf(a);
    const ob = legacy[b]?.order ?? CHALLENGE_ORDER.indexOf(b);
    return oa - ob;
  });
  return ids.map((id) => ({
    challenge: id,
    threshold: legacy[id]?.threshold ?? CHALLENGES[id].defaultThreshold,
  }));
}

/**
 * Coerce whatever lives in `events.challenges` (jsonb column) into a clean
 * RoundConfig[]. Accepts:
 *   - the new shape: array of {challenge, threshold}
 *   - the legacy shape: record keyed by ChallengeId with {enabled, threshold, order}
 *   - anything else: returns the default round list
 */
export function coerceRounds(raw: unknown): RoundConfig[] {
  if (Array.isArray(raw)) {
    const out: RoundConfig[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const ch = (item as { challenge?: unknown }).challenge;
      const th = (item as { threshold?: unknown }).threshold;
      if (typeof ch !== "string") continue;
      if (
        !CHALLENGE_ORDER.includes(ch as ChallengeId) &&
        ch !== "punishment"
      ) {
        continue;
      }
      const challenge = ch as ChallengeId;
      const threshold =
        typeof th === "number" && Number.isFinite(th)
          ? th
          : CHALLENGES[challenge].defaultThreshold;
      const round: RoundConfig = { challenge, threshold };
      if (challenge === "trivia") {
        round.questions = coerceTriviaQuestions(
          (item as { questions?: unknown }).questions,
        );
      }
      if (challenge === "punishment") {
        const msg = (item as { message?: unknown }).message;
        round.message =
          typeof msg === "string" && msg.trim()
            ? msg
            : DEFAULT_PUNISHMENT_MESSAGE;
      }
      if (challenge === "interleave") {
        const segs = coerceInterleaveSegments(
          (item as { segments?: unknown }).segments,
        );
        round.segments = segs.length > 0 ? segs : DEFAULT_INTERLEAVE_SEGMENTS;
        // Threshold for an interleave round is always the sum of segment
        // counts; the host UI doesn't store a separate value. Recompute it
        // here to keep the persisted shape canonical.
        round.threshold = interleaveTotal(round.segments);
      }
      out.push(round);
    }
    return out;
  }
  if (raw && typeof raw === "object") {
    return legacyToRounds(raw as LegacyChallengesRecord);
  }
  return defaultRounds();
}

/**
 * @deprecated Equivalent to `event.rounds.length`. Existed for the old
 * "enabled challenge order" computation; kept as a thin wrapper so the
 * remaining call sites read cleanly.
 */
export function totalRoundCount(rounds: RoundConfig[]): number {
  return rounds.length;
}
