"use client";

import { useEffect, useState } from "react";

interface Props {
  eventLabel: string;
  busy: boolean;
  error: string | null;
  onClose(): void;
  onConfirm(opts: { copyTeamsAndPlayers: boolean }): void;
}

export function DuplicateEventModal({
  eventLabel,
  busy,
  error,
  onClose,
  onConfirm,
}: Props) {
  const [copyTeamsAndPlayers, setCopyTeamsAndPlayers] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-bg-card border border-white/10 p-5 shadow-2xl"
      >
        <div className="font-display text-xl font-extrabold tracking-wider mb-1">
          DUPLICATE EVENT
        </div>
        <div className="text-sm opacity-70 mb-4">
          Copy “{eventLabel}” into a fresh lobby with a new code.
        </div>

        <label className="flex items-start gap-3 p-3 rounded-xl bg-bg-deep border border-white/10 cursor-pointer hover:border-accent-orange/60">
          <input
            type="checkbox"
            checked={copyTeamsAndPlayers}
            onChange={(e) => setCopyTeamsAndPlayers(e.target.checked)}
            disabled={busy}
            className="mt-1 h-4 w-4 accent-accent-pink"
          />
          <span className="flex-1">
            <span className="block font-bold">Copy teams &amp; players</span>
            <span className="block text-xs opacity-70 mt-0.5">
              Brings the same teams and player rosters across. Off = empty
              lobby with the same rounds.
            </span>
          </span>
        </label>

        <div className="mt-3 text-[11px] opacity-60">
          Round configuration is always copied. Progress, winners, and round
          state are not.
        </div>

        {error ? (
          <div className="mt-3 text-xs text-accent-pink">{error}</div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm({ copyTeamsAndPlayers })}
            className="w-full py-4 rounded-2xl bg-gradient-party font-display text-base font-extrabold tracking-widest disabled:opacity-50"
          >
            {busy ? "DUPLICATING…" : "DUPLICATE"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!busy) onClose();
            }}
            disabled={busy}
            className="w-full py-3 rounded-2xl bg-bg-deep border border-white/20 font-display text-sm font-extrabold tracking-widest disabled:opacity-50"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
