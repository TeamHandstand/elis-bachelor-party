"use client";

// Reusable "how to play" card shown before a game starts: emoji, blurb, and
// numbered steps, plus the START button. When `onPractice` is provided it also
// renders a secondary "practice first" button so a player can rehearse the game
// as many times as they like before their single real attempt.

export default function GameIntro({
  emoji,
  title,
  blurb,
  steps,
  onStart,
  startLabel = "START",
  footer,
  onPractice,
  practiceLabel = "PRACTICE FIRST",
}: {
  emoji: string;
  title: string;
  blurb?: string;
  steps: string[];
  onStart: () => void;
  startLabel?: string;
  footer?: string;
  onPractice?: () => void;
  practiceLabel?: string;
}) {
  return (
    <div className="rounded-2xl bg-bg-card p-6 flex flex-col gap-5">
      <div className="text-center flex flex-col gap-2">
        <div className="text-5xl">{emoji}</div>
        <div className="font-display text-2xl font-extrabold tracking-wide">{title}</div>
        {blurb ? <div className="text-sm opacity-80">{blurb}</div> : null}
      </div>

      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 items-start">
            <span className="shrink-0 w-7 h-7 rounded-full bg-gradient-party font-display font-extrabold text-sm flex items-center justify-center">
              {i + 1}
            </span>
            <span className="text-sm opacity-90 pt-1 leading-snug">{s}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onStart}
          className="w-full py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest"
        >
          {startLabel} ▶
        </button>
        {onPractice ? (
          <>
            <button
              type="button"
              onClick={onPractice}
              className="w-full py-3 rounded-2xl bg-bg-deep border-2 border-dashed border-accent-orange/70 font-display text-base font-extrabold tracking-widest text-accent-orange"
            >
              🧪 {practiceLabel}
            </button>
            <div className="text-[11px] opacity-60 text-center leading-snug">
              Practice is a test run — it doesn&apos;t count and you can replay it as
              many times as you want. {startLabel} is your one real attempt.
            </div>
          </>
        ) : null}
      </div>
      {footer ? <div className="text-[11px] opacity-50 text-center">{footer}</div> : null}
    </div>
  );
}
