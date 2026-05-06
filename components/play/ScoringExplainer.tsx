"use client";

import { useState } from "react";

interface Props {
  // Number of teams in the event — drives the example numbers in the modal.
  teamCount: number;
}

/**
 * Tiny "?" button that opens a modal explaining how round points work. Drop
 * this next to any "Standings" header so anyone can pop it open.
 */
export function ScoringExplainer({ teamCount }: Props) {
  const [open, setOpen] = useState(false);
  const N = Math.max(2, teamCount);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How scoring works"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/10 text-[11px] font-extrabold opacity-70 hover:opacity-100 active:scale-95 transition"
      >
        ?
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-bg-card border-2 border-accent-orange/60 p-5 shadow-2xl text-sm"
          >
            <div className="text-center mb-3">
              <div className="text-4xl mb-1">🏅</div>
              <div className="font-display text-xl font-extrabold tracking-wider">
                HOW SCORING WORKS
              </div>
            </div>
            <p className="opacity-90 mb-3">
              Every round, every team earns points based on where they
              finished. With <b>{N}</b> {N === 1 ? "team" : "teams"} playing:
            </p>
            <ul className="space-y-1 mb-3 tabular-nums">
              <li className="flex justify-between bg-bg-deep/60 rounded-lg px-3 py-1.5">
                <span>🥇 1st place (round winner)</span>
                <span className="font-extrabold">{N} pts</span>
              </li>
              {N >= 2 && (
                <li className="flex justify-between bg-bg-deep/60 rounded-lg px-3 py-1.5">
                  <span>🥈 2nd place</span>
                  <span className="font-extrabold">{N - 1} pts</span>
                </li>
              )}
              {N >= 3 && (
                <li className="flex justify-between bg-bg-deep/60 rounded-lg px-3 py-1.5">
                  <span>🥉 3rd place</span>
                  <span className="font-extrabold">{N - 2} pts</span>
                </li>
              )}
              {N >= 4 && (
                <li className="flex justify-between bg-bg-deep/60 rounded-lg px-3 py-1.5">
                  <span>… last place</span>
                  <span className="font-extrabold">1 pt</span>
                </li>
              )}
            </ul>
            <p className="opacity-80 mb-3 text-xs">
              The host crowns the round winner — they get the full {N} pts
              regardless of how the metric ties out. Everyone else is ranked
              by the round&rsquo;s rule (fastest time, smallest avg error,
              most correct, etc.). Tied teams split the points for their
              positions evenly.
            </p>
            <p className="opacity-80 mb-4 text-xs">
              The team with the most total points after every round wins the
              event. Round wins are still a tiebreaker.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full py-3 rounded-2xl bg-gradient-party text-white font-display text-sm font-extrabold tracking-widest"
            >
              GOT IT
            </button>
          </div>
        </div>
      )}
    </>
  );
}
