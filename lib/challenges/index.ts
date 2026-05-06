import type {
  ChallengeDef,
  ChallengeId,
  EventConfig,
  RoundConfig,
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
    label: "Due North",
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
};

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
];

/**
 * Default round list for a freshly-created event: one round per challenge
 * type, in the canonical order, each at its default threshold.
 */
export function defaultRounds(): RoundConfig[] {
  return CHALLENGE_ORDER.map((id) => ({
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
 * Whether the challenge is one whose threshold is host-tunable. North is
 * the only exception today — its score is the team's average angular error
 * and every player gets exactly one guess.
 */
export function challengeHasThreshold(id: ChallengeId): boolean {
  return id !== "north";
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
      if (!CHALLENGE_ORDER.includes(ch as ChallengeId)) continue;
      const challenge = ch as ChallengeId;
      const threshold =
        typeof th === "number" && Number.isFinite(th)
          ? th
          : CHALLENGES[challenge].defaultThreshold;
      out.push({ challenge, threshold });
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
