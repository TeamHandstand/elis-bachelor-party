"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToastyStore } from "@/lib/store";
import {
  useRoundStandings,
  useRoundWinnerByIndex,
} from "@/lib/store/selectors";
import { enabledChallengeOrder } from "@/lib/challenges";
import { TeamHeader } from "@/components/dashboard/TeamHeader";
import { TeammateOrbit } from "@/components/dashboard/TeammateOrbit";
import { RoundCard, type RoundCardState } from "./RoundCard";
import { HostRoundControls } from "./HostRoundControls";
import { CountdownOverlay } from "./CountdownOverlay";
import { startRound, endRound } from "@/components/host/_fetch";
import type { ChallengeId } from "@/lib/types";

interface Props {
  code: string;
  myPlayerId: string | null;
}

export function JourneyView({ code, myPlayerId }: Props) {
  const router = useRouter();
  const event = useToastyStore((s) => s.event);
  const teams = useToastyStore((s) => s.teams);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const standings = useRoundStandings();
  const winnerByRound = useRoundWinnerByIndex();

  const isHostPlayer =
    !!myPlayerId && event?.hostPlayerId === myPlayerId;

  // Cookie-host detection: anyone with a valid host cookie also gets host
  // controls, even without being the designated host-player. Lets Sam start
  // the race from the game UI without crowning himself first.
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
        /* ignore — non-host */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isHost = isHostPlayer || isCookieHost;
  const teamList = useMemo(() => Object.values(teams), [teams]);

  const order = useMemo<ChallengeId[]>(() => {
    if (!event) return [];
    return enabledChallengeOrder(event.challenges);
  }, [event]);

  const [showCountdown, setShowCountdown] = useState(false);

  useEffect(() => {
    if (!event) return;
    const startsAt = event.currentRoundStartsAt;
    const isLive = event.currentRoundStatus === "live";
    if (!isLive || startsAt === null) {
      setShowCountdown(false);
      return;
    }
    if (Date.now() < startsAt) {
      setShowCountdown(true);
    } else {
      setShowCountdown(false);
    }
  }, [event?.currentRoundStartsAt, event?.currentRoundStatus, event]);

  // Auto-navigate to challenge view when countdown expires (or live with
  // startsAt already past, e.g. on refresh).
  useEffect(() => {
    if (!event) return;
    if (event.currentRoundStatus !== "live") return;
    if (event.currentRoundIndex === null) return;
    const startsAt = event.currentRoundStartsAt;
    if (startsAt === null) return;
    if (showCountdown) return;
    if (Date.now() < startsAt) return;
    const challenge = order[event.currentRoundIndex];
    if (challenge) {
      router.replace(`/e/${code}/play/${challenge}`);
    }
  }, [
    event?.currentRoundStatus,
    event?.currentRoundIndex,
    event?.currentRoundStartsAt,
    showCountdown,
    order,
    router,
    code,
    event,
  ]);

  if (!event) return null;

  const currentIdx = event.currentRoundIndex;
  const currentStatus = event.currentRoundStatus;
  const totalRounds = order.length;

  const cards: Array<{
    ordinal: number;
    challenge: ChallengeId;
    state: RoundCardState;
  }> = order.map((challenge, idx) => {
    if (idx < (event.roundWinners?.length ?? 0)) {
      const winnerTeamId = winnerByRound[idx] ?? null;
      const winner = winnerTeamId ? teams[winnerTeamId] ?? null : null;
      return {
        ordinal: idx + 1,
        challenge,
        state: { kind: "past", winner },
      };
    }
    if (idx === currentIdx) {
      if (currentStatus === "decided") {
        const winnerTeamId = winnerByRound[idx] ?? null;
        const winner = winnerTeamId ? teams[winnerTeamId] ?? null : null;
        return {
          ordinal: idx + 1,
          challenge,
          state: { kind: "current-decided", winner },
        };
      }
      return { ordinal: idx + 1, challenge, state: { kind: "current-live" } };
    }
    return { ordinal: idx + 1, challenge, state: { kind: "future" } };
  });

  // Determine where the host's "start next" button should go.
  let startTarget: { ordinal: number; label: string } | null = null;
  if (
    event.status === "lobby" ||
    (currentStatus === null && event.roundWinners.length === 0)
  ) {
    startTarget = { ordinal: 1, label: "START HEPTATHLON" };
  } else if (
    currentStatus === "decided" &&
    (currentIdx ?? -1) + 1 < totalRounds
  ) {
    startTarget = {
      ordinal: (currentIdx ?? 0) + 2,
      label: `START ROUND ${(currentIdx ?? 0) + 2}`,
    };
  }

  const startCardIdx =
    startTarget && startTarget.ordinal - 1 < cards.length
      ? startTarget.ordinal - 1
      : null;

  async function handleStart() {
    if (!myPlayerId) return;
    try {
      await startRound(code, { playerId: myPlayerId });
    } catch (err) {
      console.error("[journey] startRound failed", err);
    }
  }

  async function handleEnd(winnerTeamId: string | null) {
    if (!myPlayerId) return;
    try {
      await endRound(code, {
        mode: "host",
        playerId: myPlayerId,
        ...(winnerTeamId ? { teamId: winnerTeamId } : {}),
      });
    } catch (err) {
      console.error("[journey] endRound failed", err);
    }
  }

  async function handleRedo(roundIndex: number) {
    if (!myPlayerId) return;
    try {
      await startRound(code, {
        playerId: myPlayerId,
        redo: true,
        roundIndex,
      });
    } catch (err) {
      console.error("[journey] redoRound failed", err);
    }
  }

  return (
    <>
      {showCountdown &&
        currentIdx !== null &&
        event.currentRoundStartsAt !== null && (
          <CountdownOverlay
            startsAt={event.currentRoundStartsAt}
            challenge={order[currentIdx]}
            onDone={() => {
              setShowCountdown(false);
              router.replace(`/e/${code}/play/${order[currentIdx]}`);
            }}
          />
        )}
      <main className="min-h-screen flex flex-col p-3 safe-top safe-bottom">
        <TeamHeader />
        <TeammateOrbit />

        {/* Round-wins standings */}
        <div className="rounded-2xl bg-bg-card p-3 mt-2">
          <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1 font-bold">
            Standings · {event.roundWinners.length}/{totalRounds} rounds
          </div>
          {standings.map((row, i) => {
            const medals = ["🥇", "🥈", "🥉"];
            const isMe = row.team.id === myTeamId;
            return (
              <div
                key={row.team.id}
                className={`flex justify-between items-center py-1 text-sm ${
                  isMe ? "text-accent-orange font-extrabold" : ""
                }`}
              >
                <span className="truncate">
                  {medals[i] ?? "·"} {row.team.emoji} {row.team.name}
                  {isMe ? " (us)" : ""}
                </span>
                <span className="font-bold tabular-nums">
                  {row.wins} {row.wins === 1 ? "win" : "wins"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Journey */}
        <div className="flex flex-col gap-2 mt-3">
          {cards.map((card) => {
            const isMyTeamWinner =
              card.state.kind === "past" || card.state.kind === "current-decided"
                ? card.state.winner?.id === myTeamId
                : false;

            let hostControls: React.ReactNode = null;
            if (isHost) {
              if (card.state.kind === "current-live") {
                hostControls = (
                  <HostRoundControls
                    variant={{ kind: "end", teams: teamList }}
                    onEnd={handleEnd}
                  />
                );
              } else if (card.state.kind === "current-decided") {
                hostControls = (
                  <HostRoundControls
                    variant={{ kind: "redo" }}
                    onRedo={() => handleRedo(card.ordinal - 1)}
                  />
                );
              } else if (
                card.state.kind === "future" &&
                startCardIdx === card.ordinal - 1
              ) {
                hostControls = (
                  <HostRoundControls
                    variant={{
                      kind: "start",
                      label: startTarget?.label ?? "START",
                    }}
                    onStart={handleStart}
                  />
                );
              } else if (card.state.kind === "past") {
                hostControls = (
                  <HostRoundControls
                    variant={{ kind: "redo" }}
                    onRedo={() => handleRedo(card.ordinal - 1)}
                  />
                );
              }
            }

            return (
              <RoundCard
                key={card.challenge}
                ordinal={card.ordinal}
                challenge={card.challenge}
                state={card.state}
                code={code}
                isMyTeamWinner={isMyTeamWinner}
              >
                {hostControls}
              </RoundCard>
            );
          })}
        </div>

        {/* Lobby start button (when no rounds have run yet and host is set) */}
        {isHost &&
          event.roundWinners.length === 0 &&
          currentStatus === null && (
            <div className="mt-4">
              <HostRoundControls
                variant={{ kind: "start", label: "START HEPTATHLON" }}
                onStart={handleStart}
              />
            </div>
          )}
      </main>
    </>
  );
}
