"use client";

// Host config for an OPEN event: pick which single-attempt games are included.
// Reuses the same PATCH /api/events/:code save path (patchEvent) and the
// event.rounds list — for open events each round is just a game played once.

import { useMemo, useState } from "react";
import { patchEvent } from "./_fetch";
import { CHALLENGES, OPEN_GAMES, type OpenGameSpec } from "@/lib/challenges";
import type { ChallengeId, EventConfig } from "@/lib/types";

export default function OpenGamesPanel({
  event,
  onSaved,
}: {
  event: EventConfig;
  onSaved: (e: EventConfig) => void;
}) {
  const allGames = useMemo(
    () => Object.values(OPEN_GAMES) as OpenGameSpec[],
    [],
  );
  // Preserve any host-tuned attempt duration already stored per round.
  const durationById = useMemo(
    () => new Map(event.rounds.map((r) => [r.challenge, r.threshold] as const)),
    [event.rounds],
  );

  const [enabled, setEnabled] = useState<Set<ChallengeId>>(
    () =>
      new Set(
        event.rounds
          .map((r) => r.challenge)
          .filter((id) => id in OPEN_GAMES) as ChallengeId[],
      ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggle(id: ChallengeId) {
    setSaved(false);
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (busy || enabled.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const rounds = allGames
        .filter((g) => enabled.has(g.gameId))
        .map((g) => ({
          challenge: g.gameId,
          threshold: durationById.get(g.gameId) ?? g.durationMs,
        }));
      const { event: updated } = await patchEvent(event.code, { rounds });
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save games.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-bg-card rounded-xl2 p-4">
      <div className="font-display text-lg font-extrabold mb-1">Games</div>
      <p className="text-xs opacity-60 mb-4">
        Choose which games are in this open-play event. Everyone plays each one
        once; each has its own leaderboard, and placements add up to the overall
        board.
      </p>

      <div className="space-y-2">
        {allGames.map((g) => {
          const meta = CHALLENGES[g.gameId];
          const on = enabled.has(g.gameId);
          const secs = Math.round(
            (durationById.get(g.gameId) ?? g.durationMs) / 1000,
          );
          return (
            <button
              key={g.gameId}
              type="button"
              onClick={() => toggle(g.gameId)}
              className={`w-full flex items-center gap-3 rounded-xl p-3 border transition-colors text-left ${
                on
                  ? "bg-gradient-party border-transparent"
                  : "bg-bg-deep/40 border-white/10 hover:border-accent-orange/50"
              }`}
            >
              <div className="text-2xl">{meta.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold">{meta.label}</div>
                <div className="text-xs opacity-70 truncate">
                  {g.instruction} · {secs}s
                </div>
              </div>
              <div className="font-display font-extrabold text-lg">
                {on ? "✓" : "+"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={busy || enabled.size === 0}
          className="rounded-xl px-5 py-2.5 bg-gradient-party font-bold disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save games"}
        </button>
        {enabled.size === 0 ? (
          <span className="text-xs text-accent-pink">Pick at least one game.</span>
        ) : null}
        {saved ? <span className="text-xs text-accent-green">Saved ✓</span> : null}
      </div>
      {error ? <p className="text-sm text-accent-pink mt-2">{error}</p> : null}
    </div>
  );
}
