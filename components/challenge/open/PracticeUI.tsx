"use client";

// Shared bits for Open Play "practice mode": a loud test-mode banner shown while
// practicing, and the replay/exit controls shown after a practice round. Practice
// runs never submit a score — they let a player rehearse a game as many times as
// they want before their single real attempt.

export function PracticeBanner() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-accent-orange bg-accent-orange/10 px-4 py-3 text-center">
      <div className="font-display font-extrabold tracking-widest text-accent-orange text-sm">
        🧪 PRACTICE MODE — NOT THE REAL THING
      </div>
      <div className="text-[11px] opacity-80 mt-0.5 leading-snug">
        This is just a test run. Your score won&apos;t count and nothing is saved —
        play as many times as you like.
      </div>
    </div>
  );
}

export function PracticeControls({
  onPlayAgain,
  onExit,
  playAgainLabel = "PRACTICE AGAIN 🔁",
}: {
  onPlayAgain: () => void;
  onExit: () => void;
  playAgainLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onPlayAgain}
        className="w-full py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest"
      >
        {playAgainLabel}
      </button>
      <button
        type="button"
        onClick={onExit}
        className="w-full py-3 rounded-2xl bg-bg-card border border-white/15 font-display text-base font-extrabold tracking-widest opacity-90"
      >
        DONE PRACTICING → PLAY FOR REAL ▶
      </button>
      <div className="text-[11px] opacity-50 text-center leading-snug">
        Practice runs don&apos;t count. When you&apos;re done, you&apos;ll head back to
        the tutorial for your one real attempt.
      </div>
    </div>
  );
}
