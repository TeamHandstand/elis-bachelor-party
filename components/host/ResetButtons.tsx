"use client";
import { useState } from "react";
import { resetEvent } from "./_fetch";
import type { EventConfig, Player, Team } from "@/lib/types";

interface Props {
  event: EventConfig;
  onReset: (next: { event: EventConfig; teams: Team[]; players: Player[] }) => void;
}

export default function ResetButtons({ event, onReset }: Props) {
  const [busy, setBusy] = useState<"progress" | "lobby" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(mode: "progress" | "lobby") {
    if (busy) return;
    const confirmMsg =
      mode === "progress"
        ? "Wipe all progress (keep teams)?"
        : "Drop everyone back to the name pool? (Clears teams + progress)";
    if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;
    setBusy(mode);
    setError(null);
    try {
      const res = await resetEvent(event.code, { mode });
      onReset(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          onClick={() => run("progress")}
          disabled={!!busy}
          className="rounded-xl px-3 py-2 bg-bg-deep border border-white/15 text-sm font-bold disabled:opacity-50"
          title="Clear progress, keep teams"
        >
          {busy === "progress" ? "…" : "♻️ Reset progress"}
        </button>
        <button
          onClick={() => run("lobby")}
          disabled={!!busy}
          className="rounded-xl px-3 py-2 bg-bg-deep border border-white/15 text-sm font-bold disabled:opacity-50"
          title="Clear teams + progress"
        >
          {busy === "lobby" ? "…" : "🧹 Reset to lobby"}
        </button>
      </div>
      {error ? <span className="text-xs text-accent-pink">{error}</span> : null}
    </div>
  );
}
