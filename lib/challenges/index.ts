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
    defaultThreshold: 3, // expected guesses (one per teammate, default 3)
    unit: "guesses",
    aggregation: "per-player-once",
    description:
      "Every teammate gets one shot at guessing true north. The team's score is the average angular error — smallest avg wins.",
    formatProgress: (v, t) => `${Math.floor(v)} / ${t} guesses in`,
  },
};

/**
 * Big imperative command shown at the top of each round-play page so players
 * always know the goal at a glance. Threshold is event-configurable, so we
 * format it in here rather than hard-coding numbers in the description.
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
      return `Each teammate gets one guess at true north — smallest team avg-error wins!`;
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
];

export function defaultChallengeConfig(): EventConfig["challenges"] {
  const out: Record<
    string,
    { enabled: boolean; threshold: number; order: number }
  > = {};
  CHALLENGE_ORDER.forEach((id, idx) => {
    out[id] = {
      enabled: true,
      threshold: CHALLENGES[id].defaultThreshold,
      order: idx,
    };
  });
  return out as EventConfig["challenges"];
}

/**
 * Sort all challenges (enabled or not) by the per-event `order` field, with
 * a stable fallback to CHALLENGE_ORDER for events created before reorder
 * support landed. Used by the host config UI.
 */
export function fullChallengeOrder(
  challenges: EventConfig["challenges"],
): ChallengeId[] {
  const ids = [...CHALLENGE_ORDER];
  return ids.sort((a, b) => {
    const oa = challenges[a]?.order ?? CHALLENGE_ORDER.indexOf(a);
    const ob = challenges[b]?.order ?? CHALLENGE_ORDER.indexOf(b);
    return oa - ob;
  });
}

/**
 * Filter to only the enabled challenges, sorted by per-event `order`.
 * Drives the heptathlon: round N maps to enabledChallengeOrder(event)[N].
 */
export function enabledChallengeOrder(
  challenges: EventConfig["challenges"],
): ChallengeId[] {
  return fullChallengeOrder(challenges).filter((id) => challenges[id]?.enabled);
}
