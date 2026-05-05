"use client";

import { useState } from "react";
import type { Team } from "@/lib/types";

interface Props {
  teams: Team[];
  onEnd: (winnerTeamId: string | null) => Promise<void> | void; // null = no winner
}

/**
 * Host-only "end the heptathlon and crown a champion" affordance. Bottom of
 * the journey view. Opens a picker; tapping a team finishes the event with
 * that team as winnerTeamId. "No winner" ends with `winnerTeamId=null`.
 */
export function EndHeptathlonControls({ teams, onEnd }: Props) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  async function pick(winnerTeamId: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      await onEnd(winnerTeamId);
    } finally {
      setBusy(false);
      setPicking(false);
    }
  }

  if (!picking) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setPicking(true)}
        className="w-full mt-4 py-3 rounded-2xl bg-bg-card border border-accent-pink/40 text-accent-pink text-sm font-bold disabled:opacity-50"
      >
        🏁 END HEPTATHLON NOW…
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-2xl bg-bg-card border border-accent-pink/40 p-4">
      <div className="text-[10px] uppercase tracking-widest opacity-70 mb-2 font-bold text-accent-pink">
        crown a champion
      </div>
      <div className="text-xs opacity-70 mb-3">
        This ends the heptathlon immediately. Remaining rounds will be skipped.
      </div>
      <div className="flex flex-col gap-2">
        {teams.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={busy}
            onClick={() => pick(t.id)}
            className="w-full text-left px-3 py-3 rounded-xl bg-gradient-done font-extrabold disabled:opacity-50"
          >
            🏆 {t.emoji} {t.name}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => pick(null)}
          className="w-full px-3 py-2 rounded-xl bg-bg-deep border border-white/10 text-sm font-bold opacity-80 disabled:opacity-50"
        >
          end with no winner
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setPicking(false)}
          className="text-[11px] opacity-50 underline"
        >
          cancel
        </button>
      </div>
    </div>
  );
}
