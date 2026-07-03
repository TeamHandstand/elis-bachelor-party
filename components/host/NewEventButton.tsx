"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "./_fetch";
import type { EventMode } from "@/lib/types";

export default function NewEventButton() {
  const router = useRouter();
  const [busy, setBusy] = useState<EventMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(mode: EventMode) {
    if (busy) return;
    setBusy(mode);
    setError(null);
    try {
      const { event } = await createEvent({ mode });
      router.push(`/host/${event.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <div className="flex gap-2">
        <button
          onClick={() => create("heptathlon")}
          disabled={!!busy}
          className="rounded-xl px-4 py-3 bg-gradient-party font-bold disabled:opacity-50 shadow-lg"
        >
          {busy === "heptathlon" ? "Spinning up…" : "🏆 New heptathlon"}
        </button>
        <button
          onClick={() => create("open")}
          disabled={!!busy}
          className="rounded-xl px-4 py-3 bg-bg-card border border-white/15 font-bold disabled:opacity-50 hover:border-accent-orange/60"
        >
          {busy === "open" ? "Spinning up…" : "🎮 New open play"}
        </button>
      </div>
      {error ? <p className="text-sm text-accent-pink">{error}</p> : null}
    </div>
  );
}
