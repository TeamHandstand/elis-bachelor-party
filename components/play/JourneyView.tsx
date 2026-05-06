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
import {
  endEvent,
  endRound,
  resetRound,
  startRound,
} from "@/components/host/_fetch";
import { EndHeptathlonControls } from "./EndHeptathlonControls";
import { FinaleLock } from "./FinaleLock";
import { Confetti } from "./Confetti";
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

  // For each past / current-decided round, compute MY team's place using
  // the same scoring as RoundResults (north uses smallest avg error, others
  // use earliest completion). Medals: 1=🥇, 2=🥈, 3=🥉, 4+=💩.
  function medalForPlace(place: number | null): string | null {
    if (place === null) return null;
    if (place === 1) return "🥇";
    if (place === 2) return "🥈";
    if (place === 3) return "🥉";
    return "💩";
  }
  function computeMyPlace(challenge: ChallengeId): number | null {
    if (!myTeamId) return null;
    const teamIds = Object.keys(teams);
    if (teamIds.length === 0) return null;
    const scored = teamIds.map((tid) => {
      const cur = progressMap[tid]?.[challenge];
      return {
        teamId: tid,
        completedAt: cur?.completedAt ?? null,
        value: cur?.value ?? 0,
        guesses: cur?.guesses ?? [],
      };
    });
    if (challenge === "north" || challenge === "time-guess") {
      scored.sort((a, b) => {
        const ag = a.guesses.length;
        const bg = b.guesses.length;
        if ((ag > 0) !== (bg > 0)) return ag > 0 ? -1 : 1;
        if (ag === 0 && bg === 0) return 0;
        const aAvg = a.guesses.reduce((s, g) => s + g.errorDeg, 0) / ag;
        const bAvg = b.guesses.reduce((s, g) => s + g.errorDeg, 0) / bg;
        return aAvg - bAvg;
      });
    } else {
      scored.sort((a, b) => {
        const aDone = a.completedAt !== null;
        const bDone = b.completedAt !== null;
        if (aDone !== bDone) return aDone ? -1 : 1;
        if (aDone && bDone) {
          return (a.completedAt ?? Infinity) - (b.completedAt ?? Infinity);
        }
        return b.value - a.value;
      });
    }
    const idx = scored.findIndex((s) => s.teamId === myTeamId);
    return idx >= 0 ? idx + 1 : null;
  }

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
  if (currentStatus === null) {
    // No round in flight — start the next one without a winner.
    const nextIdx = event.roundWinners.length;
    if (nextIdx < totalRounds) {
      startTarget = {
        ordinal: nextIdx + 1,
        label:
          nextIdx === 0 ? "START ROUND 1" : `START ROUND ${nextIdx + 1}`,
      };
    }
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

  const [redoTarget, setRedoTarget] = useState<{
    roundIndex: number;
    label: string;
  } | null>(null);
  const [redoBusy, setRedoBusy] = useState(false);

  function requestRedo(roundIndex: number, label: string) {
    setRedoTarget({ roundIndex, label });
  }

  async function confirmRedo() {
    if (!redoTarget || redoBusy) return;
    setRedoBusy(true);
    try {
      await resetRound(code, {
        ...(myPlayerId ? { playerId: myPlayerId } : {}),
        roundIndex: redoTarget.roundIndex,
      });
      setRedoTarget(null);
    } catch (err) {
      console.error("[journey] resetRound failed", err);
    } finally {
      setRedoBusy(false);
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

  // All rounds decided but the host hasn't released yet → players stay
  // locked in a sparkly waiting room. Host sees the standings and a big
  // RELEASE button (re-using EndHeptathlonControls).
  const allRoundsDone =
    totalRounds > 0 && event.roundWinners.length >= totalRounds;
  const pendingRelease = allRoundsDone && event.status === "active";

  // Confetti when status flips to finished — fire once per page life.
  const [confettiFired, setConfettiFired] = useState(false);
  useEffect(() => {
    if (event.status === "finished") setConfettiFired(true);
  }, [event.status]);

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

        {/* Big END / RELEASE affordance — host only. Label changes once all
            rounds are decided so the host knows tapping it locks in the
            scoreboard. */}
        {isHost && event.status === "active" && (
          <div className="mt-2">
            <EndHeptathlonControls
              teams={teamList}
              winsByTeamId={Object.fromEntries(
                standings.map((s) => [s.team.id, s.wins]),
              )}
              onEnd={handleEndEvent}
              releaseMode={pendingRelease}
            />
          </div>
        )}

        {/* Hosts get a "back to events list" link. */}
        {isHost && (
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
                    onRedo={() =>
                      requestRedo(
                        card.ordinal - 1,
                        `Round ${card.ordinal} · ${CHALLENGES[card.challenge].label}`,
                      )
                    }
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
                    onRedo={() =>
                      requestRedo(
                        card.ordinal - 1,
                        `Round ${card.ordinal} · ${CHALLENGES[card.challenge].label}`,
                      )
                    }
                  />
                );
              }
            }

            const myMedal =
              card.state.kind === "past" ||
              card.state.kind === "current-decided"
                ? medalForPlace(computeMyPlace(card.challenge))
                : null;

            return (
              <RoundCard
                key={card.challenge}
                ordinal={card.ordinal}
                challenge={card.challenge}
                state={card.state}
                code={code}
                isMyTeamWinner={isMyTeamWinner}
                myMedal={myMedal}
              >
                {hostControls}
              </RoundCard>
            );
          })}
        </div>

      </main>

      {/* Pre-release waiting room — players (non-host) only. */}
      {pendingRelease && !isHost && (
        <FinaleLock groomName={event.groomName} />
      )}

      {/* Confetti when the host releases the final scoreboard. */}
      <Confetti fire={confettiFired} />

      {redoTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
          onClick={() => {
            if (!redoBusy) setRedoTarget(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-bg-card border-2 border-accent-pink/60 p-5 shadow-2xl"
          >
            <div className="text-center">
              <div className="text-5xl mb-2">↻</div>
              <div className="font-display text-xl font-extrabold tracking-wider mb-2">
                REDO {redoTarget.label.toUpperCase()}?
              </div>
              <div className="text-sm opacity-80 max-w-xs mx-auto">
                This wipes that round&rsquo;s progress and any rounds after it.
                You&rsquo;ll need to tap <b>START</b> on the round to begin
                again.
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={confirmRedo}
                disabled={redoBusy}
                className="w-full py-4 rounded-2xl bg-accent-pink text-white font-display text-base font-extrabold tracking-widest disabled:opacity-50"
              >
                {redoBusy ? "RESETTING…" : "✓ YES, RESET THIS ROUND"}
              </button>
              <button
                type="button"
                onClick={() => setRedoTarget(null)}
                disabled={redoBusy}
                className="w-full py-3 rounded-2xl bg-bg-deep border border-white/20 font-display text-sm font-extrabold tracking-widest disabled:opacity-50"
              >
                ✕ CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
