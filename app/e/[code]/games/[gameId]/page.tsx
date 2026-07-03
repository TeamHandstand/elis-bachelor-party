"use client";

// Open Play single-game screen. If the player already has a score, show the
// per-game leaderboard (locked). Otherwise run one SoloAttempt and submit it.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SoloAttempt from "@/components/challenge/SoloAttempt";
import NorthAttempt from "@/components/challenge/open/NorthAttempt";
import TimeGuessAttempt from "@/components/challenge/open/TimeGuessAttempt";
import FlappyAttempt from "@/components/challenge/open/FlappyAttempt";
import TriviaAttempt from "@/components/challenge/open/TriviaAttempt";
import { CHALLENGES, OPEN_GAMES, isOpenGame } from "@/lib/challenges";
import { formatPoints } from "@/lib/scoring";
import { normalizeEventCode } from "@/lib/utils/code";
import type { ChallengeId, TriviaQuestion } from "@/lib/types";
import type {
  GetEventResponse,
  OpenLeaderboardResponse,
  SubmitOpenScoreRequest,
} from "@/lib/api/contract";

type Screen = "loading" | "play" | "done";

export default function OpenGamePage() {
  const router = useRouter();
  const params = useParams<{ code: string; gameId: string }>();
  const code = normalizeEventCode(params?.code ?? "");
  const gameId = (params?.gameId ?? "") as ChallengeId;

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [event, setEvent] = useState<GetEventResponse | null>(null);
  const [board, setBoard] = useState<OpenLeaderboardResponse | null>(null);
  const [screen, setScreen] = useState<Screen>("loading");

  const spec = OPEN_GAMES[gameId];
  const meta = isOpenGame(gameId) ? CHALLENGES[gameId] : null;

  // Bad game id → back to the hub.
  useEffect(() => {
    if (!code) return;
    if (!isOpenGame(gameId)) router.replace(`/e/${code}/games`);
  }, [code, gameId, router]);

  // Identity gate.
  useEffect(() => {
    if (typeof window === "undefined" || !code) return;
    const id = localStorage.getItem(`toasty-player-id-${code}`);
    if (!id) {
      router.replace(`/e/${code}`);
      return;
    }
    setMyPlayerId(id);
  }, [code, router]);

  const loadBoard = useCallback(async () => {
    const res = await fetch(`/api/events/${code}/open/leaderboard`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenLeaderboardResponse;
    setBoard(data);
    return data;
  }, [code]);

  useEffect(() => {
    if (!code || !myPlayerId || !isOpenGame(gameId)) return;
    (async () => {
      const [evRes, data] = await Promise.all([
        fetch(`/api/events/${code}`, { cache: "no-store" }),
        loadBoard(),
      ]);
      if (evRes.ok) {
        const ev = (await evRes.json()) as GetEventResponse;
        if (ev.event.mode !== "open") {
          router.replace(`/e/${code}/lobby`);
          return;
        }
        setEvent(ev);
      }
      const played = data?.perGame[gameId]?.some((r) => r.playerId === myPlayerId);
      setScreen(played ? "done" : "play");
    })();
  }, [code, myPlayerId, gameId, loadBoard, router]);

  const round = useMemo(
    () => event?.event.rounds.find((r) => r.challenge === gameId),
    [event, gameId],
  );
  const durationMs = round?.threshold ?? spec?.durationMs ?? 15000;
  const triviaQuestions: TriviaQuestion[] = round?.questions ?? [];

  const handleSubmit = useCallback(
    async (score: number, scoreMeta?: Record<string, unknown>) => {
      if (!myPlayerId) throw new Error("Not joined");
      const body: SubmitOpenScoreRequest = {
        playerId: myPlayerId,
        gameId,
        score,
        ...(scoreMeta ? { meta: scoreMeta } : {}),
      };
      const res = await fetch(`/api/events/${code}/open/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        // Already played (e.g. another tab). Show the board anyway.
        await loadBoard();
        setScreen("done");
        return;
      }
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `HTTP ${res.status}`);
      }
      await loadBoard();
      setScreen("done");
    },
    [code, gameId, myPlayerId, loadBoard],
  );

  const rows = board?.perGame[gameId] ?? [];

  return (
    <main className="min-h-screen flex flex-col p-5">
      <div className="flex items-center gap-3 mt-4 mb-5">
        <Link
          href={`/e/${code}/games`}
          className="text-sm opacity-70 underline shrink-0"
        >
          ← games
        </Link>
        <div className="flex-1 text-center">
          <div className="font-display text-xl font-extrabold tracking-wider">
            {meta?.emoji} {meta?.label ?? "GAME"}
          </div>
        </div>
        <div className="w-12" />
      </div>

      {screen === "loading" && (
        <div className="text-center opacity-60 py-16">loading…</div>
      )}

      {screen === "play" && spec && (
        <>
          {spec.kind === "counting" && (
            <SoloAttempt gameId={gameId} durationMs={durationMs} onSubmit={handleSubmit} />
          )}
          {spec.kind === "north" && <NorthAttempt onSubmit={handleSubmit} />}
          {spec.kind === "time-guess" && (
            <TimeGuessAttempt targetMs={durationMs} onSubmit={handleSubmit} />
          )}
          {spec.kind === "flappy" && <FlappyAttempt onSubmit={handleSubmit} />}
          {spec.kind === "trivia" && (
            <TriviaAttempt questions={triviaQuestions} onSubmit={handleSubmit} />
          )}
        </>
      )}

      {screen === "done" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-gradient-party p-4 text-center">
            <div className="text-xs uppercase tracking-widest opacity-90">
              locked in
            </div>
            <div className="font-display text-lg font-extrabold mt-1">
              You’ve played {meta?.label}. One shot each!
            </div>
          </div>

          <div className="rounded-2xl bg-bg-card p-4">
            <div className="text-xs uppercase tracking-widest opacity-60 mb-3 font-bold">
              {meta?.label} leaderboard
            </div>
            <div className="flex flex-col gap-1.5">
              {rows.map((r) => (
                <div
                  key={r.playerId}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                    r.playerId === myPlayerId
                      ? "bg-gradient-party"
                      : "bg-bg-deep/40"
                  }`}
                >
                  <div className="font-display font-extrabold w-6 text-center">
                    {r.rank}
                  </div>
                  <div className="flex-1 font-bold truncate">{r.name}</div>
                  <div className="text-xs opacity-80">{r.scoreLabel}</div>
                  <div className="font-display font-extrabold w-8 text-right">
                    {formatPoints(r.points)}
                  </div>
                </div>
              ))}
              {rows.length === 0 && (
                <div className="text-sm opacity-60 text-center py-3">
                  No scores recorded.
                </div>
              )}
            </div>
          </div>

          <Link
            href={`/e/${code}/games`}
            className="w-full py-4 rounded-2xl bg-bg-card text-center font-display text-lg font-extrabold tracking-widest"
          >
            BACK TO GAMES →
          </Link>
        </div>
      )}
    </main>
  );
}
