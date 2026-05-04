"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getOrCreateDeviceId } from "@/lib/utils/device";
import { normalizeEventCode } from "@/lib/utils/code";
import type { JoinEventRequest, JoinEventResponse } from "@/lib/api/contract";

export default function JoinPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = normalizeEventCode(params?.code ?? "");

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already joined? Skip.
  useEffect(() => {
    if (typeof window === "undefined" || !code) return;
    const existing = localStorage.getItem(`toasty-player-id-${code}`);
    if (existing) {
      router.replace(`/e/${code}/lobby`);
    }
  }, [code, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      setError("Name?");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const deviceId = getOrCreateDeviceId();
      const body: JoinEventRequest = { name: trimmed, deviceId };
      const res = await fetch(`/api/events/${code}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as JoinEventResponse;
      localStorage.setItem(`toasty-player-id-${code}`, data.player.id);
      router.replace(`/e/${code}/lobby`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t join");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🍕</div>
          <div className="font-display text-3xl font-extrabold tracking-wider">
            TOASTY PIZZA
          </div>
          <div className="text-xs uppercase tracking-widest opacity-70 mt-2">
            event · {code || "????"}
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="block">
            <div className="text-xs uppercase tracking-widest opacity-70 mb-2 font-bold">
              your name
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
              autoCapitalize="words"
              maxLength={24}
              placeholder="who tf are you"
              className="w-full px-4 py-4 rounded-2xl bg-bg-card border-2 border-accent-orange/30 focus:border-accent-orange outline-none font-display text-2xl font-extrabold tracking-wide"
            />
          </label>

          <button
            type="submit"
            disabled={busy || name.trim().length === 0}
            className="w-full py-5 rounded-2xl bg-gradient-party font-display text-2xl font-extrabold tracking-widest disabled:opacity-40"
          >
            {busy ? "JOINING..." : "I’M IN 🔥"}
          </button>

          {error && (
            <div className="text-accent-pink text-sm text-center">{error}</div>
          )}
        </form>

        <div className="mt-8 text-center text-xs opacity-50">
          By joining, you accept that you will probably embarrass yourself.
        </div>
      </div>
    </main>
  );
}
