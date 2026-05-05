"use client";
import { useState } from "react";
import type { EventConfig, Team } from "@/lib/types";
import { endEvent } from "./_fetch";

interface Props {
  event: EventConfig;
  teams: Team[];
  onEnded: (event: EventConfig) => void;
}

export default function EndButton({ event, teams, onEnded }: Props) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (event.status === "finished") return null;

  async function endWith(winnerTeamId: string | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await endEvent(event.code, {
        ...(winnerTeamId ? { winnerTeamId } : {}),
      });
      onEnded(res.event);
      setPicking(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "End failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!picking) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={() => setPicking(true)}
          disabled={busy}
          className="rounded-xl px-3 py-2 bg-bg-deep border border-accent-pink/40 text-accent-pink text-sm font-bold disabled:opacity-50"
        >
          🛑 End event…
        </button>
        {error ? <span className="text-xs text-accent-pink">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-bg-card border border-accent-pink/40 p-3 w-full max-w-xs">
      <div className="text-[10px] uppercase tracking-widest opacity-70 mb-2 font-bold text-accent-pink">
        crown a champion
      </div>
      <div className="flex flex-col gap-2">
        {teams.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={busy}
            onClick={() => endWith(t.id)}
            className="w-full text-left px-3 py-2 rounded-lg bg-gradient-done font-bold text-sm disabled:opacity-50"
          >
            🏆 {t.emoji} {t.name}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => endWith(null)}
          className="w-full px-3 py-2 rounded-lg bg-bg-deep border border-white/10 text-xs font-bold opacity-80 disabled:opacity-50"
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
      {error ? <span className="text-xs text-accent-pink">{error}</span> : null}
    </div>
  );
}
