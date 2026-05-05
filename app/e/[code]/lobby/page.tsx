"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEventBootstrap } from "@/lib/store/bootstrap";
import { useToastyStore } from "@/lib/store";
import { normalizeEventCode } from "@/lib/utils/code";
import { activateEvent } from "@/components/host/_fetch";

export default function LobbyPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = normalizeEventCode(params?.code ?? "");

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !code) return;
    const id = localStorage.getItem(`toasty-player-id-${code}`);
    if (!id) {
      router.replace(`/e/${code}`);
      return;
    }
    setMyPlayerId(id);
    setHydrated(true);
  }, [code, router]);

  useEventBootstrap(code, myPlayerId);

  const event = useToastyStore((s) => s.event);
  const players = useToastyStore((s) => s.players);
  const teams = useToastyStore((s) => s.teams);
  const myTeam = useToastyStore((s) => s.getMyTeam());

  const me = myPlayerId ? players[myPlayerId] : null;

  // Host detection: either designated host-player OR has the host cookie.
  const isHostPlayer =
    !!myPlayerId && event?.hostPlayerId === myPlayerId;
  const [isCookieHost, setIsCookieHost] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/host/me", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { isHost: boolean };
        if (!cancelled) setIsCookieHost(!!data.isHost);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const isHost = isHostPlayer || isCookieHost;

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function handleStart() {
    if (starting) return;
    setStarting(true);
    setStartError(null);
    try {
      await activateEvent(code, {
        ...(myPlayerId ? { playerId: myPlayerId } : {}),
      });
      // Server flips event.status='active' → bootstrap effect redirects to /play
      // (the journey view). Host then taps Start on round 1 from there.
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Couldn't start");
      setStarting(false);
    }
  }

  // Periodic refetch of roster while in lobby (PubNub `player-joined` is just a nudge)
  useEffect(() => {
    if (!hydrated || !code) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/events/${code}`);
        if (!res.ok) return;
        const data = await res.json();
        // Re-bootstrap to update player roster
        const store = useToastyStore.getState();
        if (myPlayerId) {
          store.bootstrap({
            event: data.event,
            teams: data.teams,
            players: data.players,
            myPlayerId,
            myDeviceId: store.myDeviceId ?? "",
          });
        }
      } catch {
        // ignore
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [hydrated, code, myPlayerId]);

  // Redirect to play when active.
  useEffect(() => {
    if (event?.status === "active") {
      router.replace(`/e/${code}/play`);
    } else if (event?.status === "finished") {
      router.replace(`/e/${code}/done`);
    }
  }, [event?.status, code, router]);

  const allPlayers = useMemo(() => Object.values(players), [players]);
  const teamsList = useMemo(() => Object.values(teams), [teams]);
  const pool = allPlayers.filter((p) => !p.teamId);

  return (
    <main className="min-h-screen flex flex-col p-5">
      <div className="text-center mt-8 mb-6">
        <div className="text-5xl mb-2">🍕</div>
        <div className="font-display text-2xl font-extrabold tracking-wider">
          {isHost ? "READY WHEN YOU ARE" : "WAITING FOR THE HOST"}
        </div>
        <div className="text-xs uppercase tracking-widest opacity-70 mt-1">
          event · {code}
        </div>
      </div>

      {isHost && (
        <div className="mb-4">
          <button
            type="button"
            disabled={starting}
            onClick={handleStart}
            className="w-full py-4 rounded-2xl bg-gradient-party font-display text-lg font-extrabold tracking-widest disabled:opacity-50"
          >
            {starting ? "STARTING…" : "▶ START HEPTATHLON"}
          </button>
          {startError ? (
            <div className="mt-2 text-xs text-accent-pink text-center">
              {startError}
            </div>
          ) : null}
        </div>
      )}

      {me && (
        <div className="rounded-2xl bg-gradient-party p-4 mb-4 text-center">
          <div className="text-xs uppercase tracking-widest opacity-90">you</div>
          <div className="font-display text-2xl font-extrabold">{me.name}</div>
          {myTeam ? (
            <div className="mt-1 text-sm font-bold">
              on {myTeam.emoji} {myTeam.name.toUpperCase()}
            </div>
          ) : (
            <div className="mt-1 text-xs opacity-90">
              no team yet — host is sorting you out
            </div>
          )}
        </div>
      )}

      {teamsList.length > 0 && (
        <div className="space-y-3 mb-4">
          {teamsList.map((team) => {
            const roster = allPlayers.filter((p) => p.teamId === team.id);
            const isMine = myTeam?.id === team.id;
            return (
              <div
                key={team.id}
                className={`rounded-2xl p-3 ${
                  isMine ? "bg-gradient-party" : "bg-bg-card"
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="font-display font-extrabold tracking-wider">
                    {team.emoji} {team.name.toUpperCase()}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest opacity-70">
                    {roster.length} {roster.length === 1 ? "player" : "players"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {roster.length === 0 ? (
                    <div className="text-xs opacity-60">empty</div>
                  ) : (
                    roster.map((p) => (
                      <span
                        key={p.id}
                        className="px-2 py-1 rounded-full bg-bg-deep/40 text-xs font-bold"
                      >
                        {p.name}
                      </span>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pool.length > 0 && (
        <div className="rounded-2xl bg-bg-card p-3 mb-4">
          <div className="text-[10px] uppercase tracking-widest opacity-60 mb-2 font-bold">
            unassigned
          </div>
          <div className="flex flex-wrap gap-2">
            {pool.map((p) => (
              <span
                key={p.id}
                className={`px-2 py-1 rounded-full text-xs font-bold ${
                  p.id === myPlayerId
                    ? "bg-accent-orange text-bg"
                    : "bg-bg-deep/40"
                }`}
              >
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto text-center text-xs opacity-60 pb-4">
        the game starts when the host hits GO. don’t close this tab, dipshit.
      </div>
    </main>
  );
}
