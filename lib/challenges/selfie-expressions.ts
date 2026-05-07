// Selfie Sync expression catalog. Each entry maps a target expression name
// to (a) what to show the player and (b) a scorer that takes a blendshape
// map (0..1 per shape) and returns a 0..1 match value. The view renders the
// match value as a live feedback bar; when ALL teammates' match values are
// >= MATCH_THRESHOLD simultaneously briefly, the team advances to the next
// face in the round's deterministic sequence. Round completes when all N
// faces in the sequence have been hit. Fastest team wins.
//
// The set is curated to be drunk-friendly: large, easily-asymmetric face
// muscles (smile, mouth open, brow up). Wink is included for the meme.

import type { BlendshapeMap } from "@/lib/sensors/face-landmarker";

export interface Expression {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  /** 0..1 match score from a blendshape map. Higher = closer to target. */
  score: (b: BlendshapeMap) => number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export const EXPRESSIONS: Expression[] = [
  {
    id: "smile",
    label: "BIG SMILE",
    emoji: "😁",
    hint: "Cheese, big and dumb.",
    score: (b) =>
      Math.max(b.mouthSmileLeft ?? 0, b.mouthSmileRight ?? 0),
  },
  {
    id: "scream",
    label: "MOUTH WIDE",
    emoji: "😱",
    hint: "Drop your jaw — like you just saw the bill.",
    score: (b) => clamp01((b.jawOpen ?? 0) * 1.05),
  },
  {
    id: "surprised",
    label: "SURPRISED",
    emoji: "😯",
    hint: "Eyebrows UP, mouth open a bit.",
    score: (b) =>
      clamp01(
        (b.browInnerUp ?? 0) * 0.55 +
          (b.jawOpen ?? 0) * 0.4 +
          (b.eyeWideLeft ?? 0) * 0.05,
      ),
  },
  {
    id: "frown",
    label: "BIG FROWN",
    emoji: "🙁",
    hint: "Pout. The saddest pout you've got.",
    score: (b) =>
      Math.max(b.mouthFrownLeft ?? 0, b.mouthFrownRight ?? 0),
  },
  {
    id: "wink",
    label: "WINK",
    emoji: "😉",
    // Asymmetric blink: one eye closed (~1) and the other open (~0).
    // Penalize symmetric closes so just shutting both eyes doesn't count.
    hint: "Close ONE eye. Keep the other open.",
    score: (b) => {
      const l = b.eyeBlinkLeft ?? 0;
      const r = b.eyeBlinkRight ?? 0;
      const closed = Math.max(l, r);
      const open = Math.min(l, r);
      return clamp01(closed - open * 1.2);
    },
  },
  {
    id: "kiss",
    label: "DUCK FACE",
    emoji: "😗",
    hint: "Pucker up — mouth tight and pushed forward.",
    score: (b) =>
      clamp01((b.mouthPucker ?? 0) * 0.7 + (b.mouthFunnel ?? 0) * 0.3),
  },
];

function djb2(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 33) ^ seed.charCodeAt(i);
  }
  return Math.abs(h) || 1;
}

/**
 * Deterministic sequence of `count` expressions for a given round. Same
 * (eventCode, roundIndex) → same sequence on every device, so all teammates
 * see the same target faces in the same order without coordination.
 *
 * No two adjacent faces are the same — keeps the round from feeling like
 * "hold one face for ages" if RNG would otherwise repeat.
 */
export function expressionsForRound(
  eventCode: string,
  roundIndex: number,
  count: number,
): Expression[] {
  let state = djb2(`${eventCode}::${roundIndex}::seq`);
  const next = (): number => {
    // Numerical Recipes LCG: cheap, deterministic, good enough for picks.
    state = (Math.imul(state, 1103515245) + 12345) | 0;
    return state >>> 0;
  };
  const out: Expression[] = [];
  let lastIdx = -1;
  for (let i = 0; i < count; i++) {
    let idx = next() % EXPRESSIONS.length;
    if (idx === lastIdx) idx = (idx + 1) % EXPRESSIONS.length;
    out.push(EXPRESSIONS[idx]);
    lastIdx = idx;
  }
  return out;
}
