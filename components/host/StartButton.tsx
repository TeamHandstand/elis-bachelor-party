"use client";
import { useState } from "react";
import { startEvent } from "./_fetch";
import type { EventConfig, Player } from "@/lib/types";

interface Props {
  event: EventConfig;
  players: Player[];
  onStarted: (event: EventConfig) => void;
}

export default function StartButton({ event, players, onStarted }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playersWithTeams = players.filter((p) => p.teamId);
  const teamsCovered = new Set(playersWithTeams.map((p) => p.teamId)).size;
  const ready = teamsCovered >= 1; // server enforces real rules; allow uneven teams for testing

  if (event.status === "active" || event.status === "finished") return null;

  async function onClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await startEvent(event.code);
      onStarted(res.event);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Start failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={onClick}
        disabled={busy || !ready}
        className="rounded-xl px-4 py-2 bg-gradient-done font-bold disabled:opacity-50"
        title={
          ready
            ? "Start the race"
            : "Assign at least one player to a team first"
        }
      >
        {busy ? "Starting…" : "▶️ Start race"}
      </button>
      {error ? <span className="text-xs text-accent-pink">{error}</span> : null}
    </div>
  );
}
