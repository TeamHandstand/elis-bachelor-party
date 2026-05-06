"use client";

import { useMemo, useState } from "react";
import type { Team } from "@/lib/types";
import { formatPoints } from "@/lib/scoring";

interface Props {
  teams: Team[];
  // Map of team id -> total points so far. Used to pre-recommend the leader
  // when the host opens the picker.
  pointsByTeamId: Record<string, number>;
  onEnd: (winnerTeamId: string | null) => Promise<void> | void; // null = no winner
  // When true, all rounds are decided and the host is just releasing the
  // already-computed scoreboard. Switches the button copy from
  // "END EVENT NOW" to a celebratory "RELEASE FINAL SCORES".
  releaseMode?: boolean;
}

/**
 * Big, red, host-only "end the heptathlon now" affordance pinned near the
 * top of the journey view. Tapping opens a picker that pre-highlights the
 * team currently leading by total points; the host can confirm or override.
 */
export function EndHeptathlonControls({
  teams,
  pointsByTeamId,
  onEnd,
  releaseMode = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      const ap = pointsByTeamId[a.id] ?? 0;
      const bp = pointsByTeamId[b.id] ?? 0;
      if (ap !== bp) return bp - ap;
      return a.name.localeCompare(b.name);
    });
  }, [teams, pointsByTeamId]);

  const leader = sortedTeams[0];
  const leaderPoints = leader ? (pointsByTeamId[leader.id] ?? 0) : 0;
  const hasLeader = leader && leaderPoints > 0;

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
        className={`w-full py-4 rounded-2xl text-white font-display text-lg font-extrabold tracking-widest shadow-lg disabled:opacity-50 active:scale-[0.99] transition-transform ${
          releaseMode
            ? "bg-gradient-party shadow-accent-orange/40 animate-pulse"
            : "bg-accent-pink shadow-accent-pink/30"
        }`}
      >
        {releaseMode ? "🎉 RELEASE FINAL SCORES" : "🛑 END EVENT NOW"}
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-bg-card border-2 border-accent-pink p-4">
      <div className="text-[10px] uppercase tracking-widest font-extrabold text-accent-pink mb-2">
        crown the champion
      </div>
      <div className="text-xs opacity-70 mb-3">
        Ends the heptathlon immediately. Remaining rounds will be skipped.
      </div>
      <div className="flex flex-col gap-2">
        {sortedTeams.map((t, idx) => {
          const points = pointsByTeamId[t.id] ?? 0;
          const isRecommended = idx === 0 && hasLeader;
          return (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={() => pick(t.id)}
              className={`w-full text-left px-3 py-3 rounded-xl font-extrabold disabled:opacity-50 transition-colors ${
                isRecommended
                  ? "bg-gradient-done ring-2 ring-accent-green"
                  : "bg-bg-deep border border-white/10"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{t.emoji}</span>
                <span className="flex-1 truncate">{t.name}</span>
                <span className="text-sm tabular-nums opacity-90">
                  {formatPoints(points)} {points === 1 ? "pt" : "pts"}
                </span>
                {isRecommended && (
                  <span className="text-[10px] uppercase tracking-widest text-accent-green font-extrabold">
                    🏆 leader
                  </span>
                )}
              </div>
            </button>
          );
        })}
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
