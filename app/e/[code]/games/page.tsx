"use client";

// Open Play hub. Two tabs: GAMES (cards to play each game once) and LEADERBOARD
// (game-wide standings + per-game boards). Self-paced — no host, no lobby. Uses
// a lightweight data path (plain fetch + a PubNub nudge subscription), NOT the
// heptathlon team store.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { normalizeEventCode } from "@/lib/utils/code";
import { getOrCreateDeviceId } from "@/lib/utils/device";
import { getPubNubClient, subscribeToEvent } from "@/lib/pubnub/client";
import { formatPoints } from "@/lib/scoring";
import type { GetEventResponse, OpenLeaderboardResponse } from "@/lib/api/contract";

type Tab = "games" | "leaderboard";

export default function GamesHubPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = normalizeEventCode(params?.code ?? "");

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [event, setEvent] = useState<GetEventResponse | null>(null);
  const [board, setBoard] = useState<OpenLeaderboardResponse | null>(null);
  const [tab, setTab] = useState<Tab>("games");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Identity gate — bounce to join if we don't know who this is.
  useEffect(() => {
    if (typeof window === "undefined" || !code) return;
    const id = localStorage.getItem(`toasty-player-id-${code}`);
    if (!id) {
      router.replace(`/e/${code}`);
      return;
    }
    setMyPlayerId(id);
  }, [code, router]);

  const loadEvent = useCallback(async () => {
    const res = await fetch(`/api/events/${code}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as GetEventResponse;
    // Wrong mode → send to the heptathlon flow instead.
    if (data.event.mode !== "open") {
      router.replace(`/e/${code}/lobby`);
      return;
    }
    setEvent(data);
  }, [code, router]);

  const loadBoard = useCallback(async () => {
    const res = await fetch(`/api/events/${code}/open/leaderboard`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    setBoard((await res.json()) as OpenLeaderboardResponse);
  }, [code]);

  useEffect(() => {
    if (!code || !myPlayerId) return;
    void loadEvent();
    void loadBoard();
  }, [code, myPlayerId, loadEvent, loadBoard]);

  // Live updates: refetch the leaderboard when anyone submits a score.
  useEffect(() => {
    if (!code || !myPlayerId) return;
    const deviceId = getOrCreateDeviceId();
    const client = getPubNubClient(deviceId);
    const handle = subscribeToEvent(client, code, (msg) => {
      if (msg.kind === "open-score") void loadBoard();
    });
    return () => handle.unsubscribe();
  }, [code, myPlayerId, loadBoard]);

  const myName = useMemo(() => {
    if (!event || !myPlayerId) return "";
    return event.players.find((p) => p.id === myPlayerId)?.name ?? "";
  }, [event, myPlayerId]);

  // Which gameIds this player has already played (has a score for).
  const playedIds = useMemo(() => {
    const set = new Set<string>();
    if (!board || !myPlayerId) return set;
    for (const [gameId, rows] of Object.entries(board.perGame)) {
      if (rows.some((r) => r.playerId === myPlayerId)) set.add(gameId);
    }
    return set;
  }, [board, myPlayerId]);

  const games = board?.games ?? [];

  return (
    <main className="min-h-screen flex flex-col p-5">
      <div className="text-center mt-6 mb-5">
        <div className="text-5xl mb-2">🍕</div>
        <div className="font-display text-2xl font-extrabold tracking-wider">
          {event?.event.title ?? "OPEN PLAY"}
        </div>
        <div className="text-[11px] uppercase tracking-widest opacity-70 mt-1">
          open play · {code}
          {myName ? ` · ${myName}` : ""}
        </div>
      </div>

      {/* Tab switch */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        {(["games", "leaderboard"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`py-3 rounded-2xl font-display font-extrabold tracking-widest text-sm ${
              tab === t ? "bg-gradient-party" : "bg-bg-card opacity-70"
            }`}
          >
            {t === "games" ? "GAMES" : "LEADERBOARD"}
          </button>
        ))}
      </div>

      {tab === "games" && (
        <div className="flex flex-col gap-3">
          {games.length === 0 && (
            <div className="text-center opacity-60 text-sm py-8">
              No games set up yet.
            </div>
          )}
          {games.map((g) => {
            const played = playedIds.has(g.gameId);
            const myRow = board?.perGame[g.gameId]?.find(
              (r) => r.playerId === myPlayerId,
            );
            const inner = (
              <div
                className={`rounded-2xl p-4 flex items-center gap-4 ${
                  played ? "bg-bg-card opacity-80" : "bg-bg-card"
                }`}
              >
                <div className="text-3xl">{g.emoji}</div>
                <div className="flex-1">
                  <div className="font-display font-extrabold tracking-wide">
                    {g.label}
                  </div>
                  {played && myRow ? (
                    <div className="text-xs opacity-70 mt-0.5">
                      ✅ played · {myRow.scoreLabel} · #{myRow.rank} ·{" "}
                      {formatPoints(myRow.points)} pts
                    </div>
                  ) : (
                    <div className="text-xs opacity-60 mt-0.5">
                      tap to play — one shot!
                    </div>
                  )}
                </div>
                <div className="font-display text-lg font-extrabold opacity-80">
                  {played ? "🔒" : "▶"}
                </div>
              </div>
            );
            return played ? (
              <div key={g.gameId}>{inner}</div>
            ) : (
              <Link key={g.gameId} href={`/e/${code}/games/${g.gameId}`}>
                {inner}
              </Link>
            );
          })}
        </div>
      )}

      {tab === "leaderboard" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-bg-card p-4">
            <div className="text-xs uppercase tracking-widest opacity-60 mb-3 font-bold">
              overall · {board?.totalPlayers ?? 0} players
            </div>
            <div className="flex flex-col gap-1.5">
              {(board?.global ?? []).map((row, i) => (
                <div
                  key={row.playerId}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                    row.playerId === myPlayerId
                      ? "bg-gradient-party"
                      : "bg-bg-deep/40"
                  }`}
                >
                  <div className="font-display font-extrabold w-6 text-center">
                    {i + 1}
                  </div>
                  <div className="flex-1 font-bold truncate">{row.name}</div>
                  <div className="text-xs opacity-70">{row.gamesPlayed} games</div>
                  <div className="font-display font-extrabold">
                    {formatPoints(row.points)}
                  </div>
                </div>
              ))}
              {(board?.global ?? []).length === 0 && (
                <div className="text-sm opacity-60 text-center py-3">
                  No scores yet — be the first!
                </div>
              )}
            </div>
          </div>

          {/* Per-game boards (collapsible). */}
          {games.map((g) => {
            const rows = board?.perGame[g.gameId] ?? [];
            const open = expanded === g.gameId;
            return (
              <div key={g.gameId} className="rounded-2xl bg-bg-card p-3">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : g.gameId)}
                  className="w-full flex items-center gap-3"
                >
                  <div className="text-2xl">{g.emoji}</div>
                  <div className="flex-1 text-left font-display font-extrabold tracking-wide">
                    {g.label}
                  </div>
                  <div className="text-xs opacity-60">
                    {rows.length} played {open ? "▲" : "▼"}
                  </div>
                </button>
                {open && (
                  <div className="mt-3 flex flex-col gap-1">
                    {rows.length === 0 && (
                      <div className="text-xs opacity-60 py-2">
                        Nobody’s played this yet.
                      </div>
                    )}
                    {rows.map((r) => (
                      <div
                        key={r.playerId}
                        className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${
                          r.playerId === myPlayerId
                            ? "bg-gradient-party"
                            : "bg-bg-deep/40"
                        }`}
                      >
                        <div className="font-display font-extrabold w-5 text-center">
                          {r.rank}
                        </div>
                        <div className="flex-1 font-bold truncate">{r.name}</div>
                        <div className="text-xs opacity-80">{r.scoreLabel}</div>
                        <div className="font-display font-extrabold w-8 text-right">
                          {formatPoints(r.points)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-auto pt-6 text-center text-[11px] opacity-50">
        1st place scores {board?.totalPlayers ?? "N"} pts per game, 2nd gets one
        less, and so on. Play everything!
      </div>
    </main>
  );
}
