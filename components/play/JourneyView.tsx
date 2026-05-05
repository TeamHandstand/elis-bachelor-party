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
import { HostRoundControls, type EndPickerEntry } from "./HostRoundControls";
import { CHALLENGES } from "@/lib/challenges";
import { CountdownOverlay } from "./CountdownOverlay";
import Link from "next/link";
import { startRound, endRound, endEvent } from "@/components/host/_fetch";
import { EndHeptathlonControls } from "./EndHeptathlonControls";
import { useCookieHost } from "@/lib/auth/use-cookie-host";
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

  // Cookie-host fallback: only when nobody is crowned as host-player. If
  // event.hostPlayerId is set, we trust that single player to be the host —
  // otherwise Sam's host cookie would leak host controls to any browser he
  // ever logged in as host on.
  const { isHost: isCookieHost } = useCookieHost();

  const isHost = isHostPlayer || (!event?.hostPlayerId && isCookieHost);
  const teamList = useMemo(() => Object.values(teams), [teams]);
  const progressMap = useToastyStore((s) => s.progress);
  const playersMap = useToastyStore((s) => s.players);

  // Build the rich entry list for the End Round picker — completion times,
  // current values, and rosters per team for the active challenge.
  const endPickerEntries = useMemo<EndPickerEntry[]>(() => {
    if (!event || event.currentRoundIndex === null) return [];
    const order = enabledChallengeOrder(event.challenges);
    const ch = order[event.currentRoundIndex];
    if (!ch) return [];
    const def = CHALLENGES[ch];
    const threshold = event.challenges[ch]?.threshold ?? def.defaultThreshold;
    const playersByTeam: Record<string, typeof playersMap[string][]> = {};
    for (const p of Object.values(playersMap)) {
      if (!p.teamId) continue;
      (playersByTeam[p.teamId] ??= []).push(p);
    }
    return teamList.map((t) => {
      const cur = progressMap[t.id]?.[ch];
      return {
        team: t,
        completedAt: cur?.completedAt ?? null,
        value: cur?.value ?? 0,
        threshold,
        players: playersByTeam[t.id] ?? [],
        guesses: cur?.guesses ?? [],
      };
    });
  }, [event, teamList, progressMap, playersMap]);

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

  // No auto-redirect to the live challenge from the journey. The countdown
  // overlay handles the natural lobby→round transition (its onDone navigates
  // when timer expires); after that, players who land on the journey can
  // tap the glowing round card to enter. Otherwise the back button gets
  // trapped in a loop with /play/[challenge].

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

  // Determine where the host's "start next" button should go. Lobby has its
  // own START HEPTATHLON button (which calls /activate); the journey only
  // handles per-round starts once the event is active.
  let startTarget: { ordinal: number; label: string } | null = null;
  if (currentStatus === null && event.roundWinners.length === 0) {
    startTarget = { ordinal: 1, label: "START ROUND 1" };
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
    try {
      await startRound(code, {
        ...(myPlayerId ? { playerId: myPlayerId } : {}),
      });
    } catch (err) {
      console.error("[journey] startRound failed", err);
    }
  }

  async function handleEnd(winnerTeamId: string | null) {
    try {
      await endRound(code, {
        mode: "host",
        ...(myPlayerId ? { playerId: myPlayerId } : {}),
        ...(winnerTeamId ? { teamId: winnerTeamId } : {}),
      });
    } catch (err) {
      console.error("[journey] endRound failed", err);
    }
  }

  async function handleRedo(roundIndex: number) {
    try {
      await startRound(code, {
        ...(myPlayerId ? { playerId: myPlayerId } : {}),
        redo: true,
        roundIndex,
      });
    } catch (err) {
      console.error("[journey] redoRound failed", err);
    }
  }

  async function handleEndEvent(winnerTeamId: string | null) {
    try {
      await endEvent(code, {
        ...(myPlayerId ? { playerId: myPlayerId } : {}),
        ...(winnerTeamId ? { winnerTeamId } : {}),
      });
    } catch (err) {
      console.error("[journey] endEvent failed", err);
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

        {/* Big red END EVENT affordance — host only, pinned up top so it's
            always reachable without scrolling. */}
        {isHost && event.status === "active" && (
          <div className="mt-2">
            <EndHeptathlonControls
              teams={teamList}
              winsByTeamId={Object.fromEntries(
                standings.map((s) => [s.team.id, s.wins]),
              )}
              onEnd={handleEndEvent}
            />
          </div>
        )}

        {/* Cookie-hosts get a "back to events list" link. */}
        {isCookieHost && (
          <Link
            href="/host"
            className="self-center text-xs opacity-60 underline mt-2"
          >
            ← all events
          </Link>
        )}

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
                    variant={{
                      kind: "end",
                      entries: endPickerEntries,
                      challenge: card.challenge,
                    }}
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

      </main>
    </>
  );
}
