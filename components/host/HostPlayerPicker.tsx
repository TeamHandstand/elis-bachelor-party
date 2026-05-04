"use client";

import { useState } from "react";
import type { EventConfig, Player } from "@/lib/types";
import { setHostPlayer } from "./_fetch";

interface Props {
  event: EventConfig;
  players: Player[];
  onChange: (event: EventConfig) => void;
}

/**
 * UI to designate exactly one player as host. Renders a chip per player with
 * a crown toggle. Tapping a different player demotes the previous one.
 */
export default function HostPlayerPicker({ event, players, onChange }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setHost(playerId: string | null) {
    if (busyId) return;
    setBusyId(playerId ?? "__clear__");
    setError(null);
    try {
      const res = await setHostPlayer(event.code, { playerId });
      onChange(res.event);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't set host");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="bg-bg-card rounded-xl2 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-base font-bold">👑 Host player</h3>
        <p className="text-xs opacity-60">
          Tap a crown to give that player the on-phone Start/End buttons.
        </p>
      </div>
      {players.length === 0 ? (
        <div className="text-sm opacity-50 italic py-2">
          Players will appear here when they join.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {players.map((p) => {
            const isHost = p.id === event.hostPlayerId;
            const isBusy = busyId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={!!busyId}
                onClick={() => setHost(isHost ? null : p.id)}
                className={`px-3 py-2 rounded-xl text-sm font-bold border transition-colors ${
                  isHost
                    ? "bg-gradient-party border-transparent text-white"
                    : "bg-bg-deep border-white/10 hover:border-accent-orange/40"
                } disabled:opacity-50`}
              >
                {isHost ? "👑 " : ""}
                {p.name}
                {isBusy ? " …" : ""}
              </button>
            );
          })}
        </div>
      )}
      {event.hostPlayerId && (
        <button
          type="button"
          onClick={() => setHost(null)}
          disabled={!!busyId}
          className="text-[11px] underline opacity-60 hover:opacity-100 disabled:opacity-30"
        >
          clear host
        </button>
      )}
      {error ? <div className="text-xs text-accent-pink">{error}</div> : null}
    </section>
  );
}
