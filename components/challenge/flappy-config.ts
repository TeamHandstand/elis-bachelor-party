// ──────────────────────────────────────────────────────────────────────────
// Scream Bird tuning. Everything you'd want to twiddle to make the game
// easier, harder, faster, floatier, more mic-sensitive, etc. lives here.
// All units are explicit so it's obvious what each number means.
// ──────────────────────────────────────────────────────────────────────────

export const FLAPPY_CONFIG = {
  // ── Physics ──────────────────────────────────────────────────────────────
  // Downward acceleration (px/s²). Lower = floatier bird, easier game.
  gravity: 550,

  // Flap mapping: a flap fires when the player's dB reading rises above
  // `flapThresholdDb` AND the per-flap cooldown has elapsed. The size of the
  // flap (upward velocity boost) is interpolated linearly between
  // `flapVelocityMin` (at threshold) and `flapVelocityMax` (at saturationDb
  // or louder). Velocities are negative because canvas Y points down.
  flapThresholdDb: 65,
  flapSaturationDb: 95,
  flapVelocityMin: -110, // a quiet "uh" — small bump
  flapVelocityMax: -360, // a full scream — the cap, same as before

  // Minimum gap between flaps so a sustained yell turns into rhythmic
  // bounces instead of pinning the bird at the ceiling. (ms)
  flapCooldownMs: 220,

  // ── World / camera ───────────────────────────────────────────────────────
  // Horizontal scroll speed (px/s).
  worldSpeed: 140,

  // How many pixels of scroll equal one meter of credited distance. Bigger
  // number = the meter counter ticks slower.
  pxPerMeter: 100,

  // ── Death / respawn ──────────────────────────────────────────────────────
  // How long the SPLAT overlay holds before the bird respawns (ms).
  cooldownMs: 3000,

  // ── Pipes ────────────────────────────────────────────────────────────────
  pipeWidth: 60, // px
  pipeGap: 170, // vertical opening between top and bottom pipe (px)
  pipeSpacingPx: 280, // horizontal distance between adjacent pipe pairs (px)
  pipeMinGapTop: 40, // minimum top of the gap (px from canvas top)
  pipeBottomMargin: 40, // gap can't start so low the bottom pipe is < this (px)

  // ── Bird ─────────────────────────────────────────────────────────────────
  birdRadius: 16, // px (also used as collision radius)
  birdX: 80, // bird is parked at this x; world scrolls past it (px)

  // ── Publishing cadence ───────────────────────────────────────────────────
  // The view buffers meters locally and publishes to the team in batches so
  // we don't flood PubNub at 60Hz.
  publishIntervalMs: 500,
  publishMinDeltaM: 1,
} as const;

export type FlappyConfig = typeof FLAPPY_CONFIG;
