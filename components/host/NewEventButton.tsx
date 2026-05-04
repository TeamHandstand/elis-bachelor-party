"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "./_fetch";

export default function NewEventButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { event } = await createEvent({});
      router.push(`/host/${event.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <button
        onClick={onClick}
        disabled={busy}
        className="rounded-xl px-5 py-3 bg-gradient-party font-bold text-lg disabled:opacity-50 shadow-lg"
      >
        {busy ? "Spinning up…" : "🎉 New event"}
      </button>
      {error ? <p className="text-sm text-accent-pink">{error}</p> : null}
    </div>
  );
}
