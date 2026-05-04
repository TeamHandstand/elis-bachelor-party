import type { ChallengeDef, ChallengeId, EventConfig } from "@/lib/types";

export const CHALLENGES: Record<ChallengeId, ChallengeDef> = {
  distance: {
    id: "distance",
    label: "Distance",
    emoji: "🚶",
    defaultThreshold: 1609, // 1 mile in meters
    unit: "m",
    aggregation: "team-total",
    description: "Walk 1 mile total as a team. GPS-tracked.",
    formatProgress: (v, t) => `${(v / 1609).toFixed(2)} / ${(t / 1609).toFixed(1)} mi`,
  },
  steps: {
    id: "steps",
    label: "Steps",
    emoji: "👟",
    defaultThreshold: 5000,
    unit: "steps",
    aggregation: "team-total",
    description: "Take 5,000 steps total as a team.",
    formatProgress: (v, t) => `${Math.floor(v).toLocaleString()} / ${t.toLocaleString()}`,
  },
  taps: {
    id: "taps",
    label: "Taps",
    emoji: "👆",
    defaultThreshold: 3000,
    unit: "taps",
    aggregation: "team-total",
    description: "Tap 3,000 times total as a team.",
    formatProgress: (v, t) => `${Math.floor(v).toLocaleString()} / ${t.toLocaleString()}`,
  },
  scream: {
    id: "scream",
    label: "Group Scream",
    emoji: "📣",
    defaultThreshold: 30, // seconds sustained
    unit: "seconds @ 80dB",
    aggregation: "all-simultaneous",
    description: "All 3 teammates scream above 80 dB for 30 sustained seconds.",
    formatProgress: (v, t) => `${v.toFixed(0)}s / ${t}s`,
  },
  shake: {
    id: "shake",
    label: "Sync Shake",
    emoji: "🤝",
    defaultThreshold: 5, // seconds sustained
    unit: "seconds shaking",
    aggregation: "all-simultaneous",
    description: "All 3 teammates shake their phones simultaneously for 5 seconds.",
    formatProgress: (v, t) => `${v.toFixed(1)}s / ${t}s`,
  },
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
  north: {
    id: "north",
    label: "Due North",
    emoji: "🧭",
    defaultThreshold: 3, // number of guesses
    unit: "guesses",
    aggregation: "per-player-once",
    description: "Each teammate guesses true north. Smaller angular error = better. Used as tiebreaker.",
    formatProgress: (v, t) => `${Math.floor(v)} / ${t} guesses`,
  },
};

export const CHALLENGE_ORDER: ChallengeId[] = [
  "distance",
  "steps",
  "taps",
  "scream",
  "shake",
  "spin",
  "north",
];

export function defaultChallengeConfig(): EventConfig["challenges"] {
  const out: Record<string, { enabled: boolean; threshold: number }> = {};
  for (const id of CHALLENGE_ORDER) {
    out[id] = { enabled: true, threshold: CHALLENGES[id].defaultThreshold };
  }
  return out as EventConfig["challenges"];
}

/**
 * Filter CHALLENGE_ORDER down to only the challenges enabled in this event.
 * Used to drive the heptathlon: round N maps to enabledChallengeOrder(event)[N].
 */
export function enabledChallengeOrder(
  challenges: EventConfig["challenges"],
): ChallengeId[] {
  return CHALLENGE_ORDER.filter((id) => challenges[id]?.enabled);
}
