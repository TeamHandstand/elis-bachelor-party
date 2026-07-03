"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getOrCreateDeviceId } from "@/lib/utils/device";
import { normalizeEventCode } from "@/lib/utils/code";
import type {
  GetEventResponse,
  JoinEventRequest,
  JoinEventResponse,
} from "@/lib/api/contract";
import type { Player, Team } from "@/lib/types";

export default function JoinPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = normalizeEventCode(params?.code ?? "");

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedPlayerId, setSavedPlayerId] = useState<string | null>(null);
  const [eventData, setEventData] = useState<GetEventResponse | null>(null);
  const [showRoster, setShowRoster] = useState(false);

  // Hydrate localStorage state.
  useEffect(() => {
    if (typeof window === "undefined" || !code) return;
    setSavedPlayerId(localStorage.getItem(`toasty-player-id-${code}`));
  }, [code]);

  // Fetch event roster (so we can offer "log in as someone already here").
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/events/${code}`);
        if (!res.ok) return;
        const data = (await res.json()) as GetEventResponse;
        if (!cancelled) setEventData(data);
      } catch {
        /* network blip — show name form anyway */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const savedPlayer = useMemo<Player | null>(() => {
    if (!savedPlayerId || !eventData) return null;
    return eventData.players.find((p) => p.id === savedPlayerId) ?? null;
  }, [savedPlayerId, eventData]);

  // Players grouped by their team (or pool).
  const grouped = useMemo<Array<{ team: Team | null; roster: Player[] }>>(() => {
    if (!eventData) return [];
    const teamGroups = eventData.teams.map((t) => ({
      team: t,
      roster: eventData.players.filter((p) => p.teamId === t.id),
    }));
    const pool = eventData.players.filter((p) => !p.teamId);
    return pool.length > 0 ? [...teamGroups, { team: null, roster: pool }] : teamGroups;
  }, [eventData]);

  // Where a player lands after identifying themselves. Open-play events skip
  // the lobby entirely and go to the self-paced games hub. For heptathlon,
  // once the event has left the lobby send returning players (and people
  // logging in as someone already on the roster) straight to the journey —
  // /lobby has no useful UI for active or finished events and would just
  // bounce again, sometimes getting stuck on finished events the user wants
  // to review.
  function destinationForStatus(): string {
    if (eventData?.event.mode === "open") {
      return `/e/${code}/games`;
    }
    const status = eventData?.event.status;
    if (status === "active" || status === "finished") {
      return `/e/${code}/play`;
    }
    return `/e/${code}/lobby`;
  }

  function handleContinue() {
    if (!savedPlayer) return;
    router.replace(destinationForStatus());
  }

  function pickExisting(player: Player) {
    if (typeof window === "undefined") return;
    localStorage.setItem(`toasty-player-id-${code}`, player.id);
    setSavedPlayerId(player.id);
    router.replace(destinationForStatus());
  }

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
      router.replace(destinationForStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t join");
      setBusy(false);
    }
  }

  const hasRoster = !!eventData && eventData.players.length > 0;

  return (
    <main className="min-h-screen flex flex-col items-center p-6">
      <div className="w-full max-w-sm flex flex-col gap-5 mt-6">
        <div className="text-center">
          <div className="text-6xl mb-3">🍕</div>
          <div className="font-display text-3xl font-extrabold tracking-wider">
            TOASTY PIZZA
          </div>
          <div className="text-xs uppercase tracking-widest opacity-70 mt-2">
            event · {code || "????"}
          </div>
        </div>

        {/* If localStorage already knows you, offer continue + a swap link. */}
        {savedPlayer && !showRoster && (
          <div className="rounded-2xl bg-bg-card p-4 flex flex-col gap-3">
            <div className="text-center">
              <div className="text-xs uppercase tracking-widest opacity-60">
                hey
              </div>
              <div className="font-display text-2xl font-extrabold">
                {savedPlayer.name}
              </div>
            </div>
            <button
              type="button"
              onClick={handleContinue}
              className="w-full py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest"
            >
              CONTINUE 🔥
            </button>
            <button
              type="button"
              onClick={() => setShowRoster(true)}
              className="w-full py-2 text-xs underline opacity-70"
            >
              not me / switch player
            </button>
          </div>
        )}

        {/* Roster picker — log in as someone already here. */}
        {hasRoster && (savedPlayer === null || showRoster) && (
          <div className="rounded-2xl bg-bg-card p-4">
            <div className="text-xs uppercase tracking-widest opacity-70 mb-3 font-bold">
              already on the list?
            </div>
            <div className="flex flex-col gap-3">
              {grouped.map(({ team, roster }) => (
                <div key={team?.id ?? "pool"}>
                  <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1.5 font-bold">
                    {team ? `${team.emoji} ${team.name}` : "🥡 unassigned"}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {roster.map((p) => {
                      const isMe = p.id === savedPlayerId;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => pickExisting(p)}
                          className={`px-3 py-2 rounded-xl text-sm font-bold border transition-colors ${
                            isMe
                              ? "bg-gradient-party border-transparent"
                              : "bg-bg-deep/60 border-white/10 hover:border-accent-orange/50 active:scale-95"
                          }`}
                        >
                          {p.name}
                          {isMe ? " (you)" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {showRoster && (
              <button
                type="button"
                onClick={() => setShowRoster(false)}
                className="mt-3 w-full py-1.5 text-xs underline opacity-50"
              >
                ← back
              </button>
            )}
          </div>
        )}

        {/* New player form. */}
        {(!savedPlayer || showRoster) && (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="text-xs uppercase tracking-widest opacity-70 font-bold">
              {hasRoster ? "or join as someone new:" : "join the party:"}
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
            <button
              type="submit"
              disabled={busy || name.trim().length === 0}
              className="w-full py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest disabled:opacity-40"
            >
              {busy ? "JOINING..." : "I’M IN 🔥"}
            </button>
            {error && (
              <div className="text-accent-pink text-sm text-center">{error}</div>
            )}
          </form>
        )}

        <div className="mt-2 text-center text-[11px] opacity-50">
          By joining, you accept that you will probably embarrass yourself.
        </div>
      </div>
    </main>
  );
}
