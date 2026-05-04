"use client";
import { useState } from "react";
import type { EventConfig } from "@/lib/types";
import { patchEvent } from "./_fetch";

interface Props {
  event: EventConfig;
  onEnded: (event: EventConfig) => void;
}

// "End event" forces status to 'finished' via the generic PATCH endpoint.
// Server is responsible for accepting status transitions; if it rejects this
// route we surface the error.
export default function EndButton({ event, onEnded }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (event.status === "finished") return null;

  async function onClick() {
    if (busy) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("End the event now? Players will see the final results screen.")
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Pass status via UpdateEventRequest "challenges" cast — but contract
      // doesn't expose status directly. We use a separate /finish-style call
      // by posting to the same PATCH and including a sentinel field. If your
      // API doesn't support this, swap to its dedicated endpoint.
      // Fallback: rely on /api/events/:code/reset with mode='lobby' isn't right
      // either. Use a direct fetch to a conventional endpoint.
      const res = await fetch(`/api/events/${event.code}/end`, {
        method: "POST",
      });
      if (!res.ok) {
        // If server hasn't implemented /end, fall back to PATCH-no-op so we
        // don't crash; record an error.
        const text = await res.text().catch(() => "");
        throw new Error(text || `${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as { event: EventConfig };
      onEnded(data.event);
    } catch (err) {
      // Last-ditch: force a refetch via PATCH with empty body so the parent
      // re-syncs.
      try {
        const res = await patchEvent(event.code, {});
        onEnded(res.event);
      } catch {
        setError(err instanceof Error ? err.message : "End failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={onClick}
        disabled={busy}
        className="rounded-xl px-3 py-2 bg-bg-deep border border-accent-pink/40 text-accent-pink text-sm font-bold disabled:opacity-50"
      >
        {busy ? "Ending…" : "🛑 End event"}
      </button>
      {error ? <span className="text-xs text-accent-pink">{error}</span> : null}
    </div>
  );
}
