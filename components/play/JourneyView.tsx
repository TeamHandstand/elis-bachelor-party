"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToastyStore } from "@/lib/store";
import {
  useRoundStandings,
  useRoundWinnerByIndex,
} from "@/lib/store/selectors";
import { TeamHeader } from "@/components/dashboard/TeamHeader";
import { TeammateOrbit } from "@/components/dashboard/TeammateOrbit";
import { RoundCard, type RoundCardState } from "./RoundCard";
import { HostRoundControls, type EndPickerEntry } from "./HostRoundControls";
import { CHALLENGES, DEFAULT_PUNISHMENT_MESSAGE } from "@/lib/challenges";
import { CountdownOverlay } from "./CountdownOverlay";
import { PunishmentTakeover } from "./PunishmentTakeover";
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
import { ChampionBanner } from "./ChampionBanner";
import { RoundBreakdown, type BreakdownEntry } from "./RoundBreakdown";
import { useCookieHost } from "@/lib/auth/use-cookie-host";
import {
  buildRankInputs,
  formatPoints,
  rankRound,
} from "@/lib/scoring";
import { ScoringExplainer } from "./ScoringExplainer";

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
  // current values, and rosters per team for the active round.
  const endPickerEntries = useMemo<EndPickerEntry[]>(() => {
    if (!event || event.currentRoundIndex === null) return [];
    const round = event.rounds[event.currentRoundIndex];
    if (!round) return [];
    const def = CHALLENGES[round.challenge];
    const threshold = round.threshold ?? def.defaultThreshold;
    const playersByTeam: Record<string, typeof playersMap[string][]> = {};
    for (const p of Object.values(playersMap)) {
      if (!p.teamId) continue;
      (playersByTeam[p.teamId] ??= []).push(p);
    }
    return teamList.map((t) => {
      const cur = progressMap[t.id]?.[event.currentRoundIndex!];
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

  const [showCountdown, setShowCountdown] = useState(false);

  useEffect(() => {
    if (!event) return;
    const startsAt = event.currentRoundStartsAt;
    const isLive = event.currentRoundStatus === "live";
    if (!isLive || startsAt === null) {
      setShowCountdown(false);
      return;
    }
    // Punishment rounds skip the 3-2-1 countdown and the redirect to
    // /play/[idx] — the takeover overlay rendered below is the entire UX.
    const curIdx = event.currentRoundIndex;
    if (
      curIdx !== null &&
      event.rounds[curIdx]?.challenge === "punishment"
    ) {
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
  // trapped in a loop with /play/[index].

  if (!event) return null;

  const currentIdx = event.currentRoundIndex;
  const currentStatus = event.currentRoundStatus;
  const totalRounds = event.rounds.length;

  // For each past / current-decided round, compute MY team's place using
  // the shared scoring utility. Medals: 1=🥇, 2=🥈, 3=🥉, 4+=💩.
  function medalForPlace(place: number | null): string | null {
    if (place === null) return null;
    if (place === 1) return "🥇";
    if (place === 2) return "🥈";
    if (place === 3) return "🥉";
    return "💩";
  }
  function computeMyPlace(roundIndex: number): number | null {
    if (!myTeamId) return null;
    const round = event!.rounds[roundIndex];
    if (!round) return null;
    if (teamList.length === 0) return null;
    const winnerForRound =
      event!.roundWinners[roundIndex]?.teamId ?? null;
    const inputs = buildRankInputs(teamList, progressMap, roundIndex);
    const ranked = rankRound(round.challenge, inputs, winnerForRound);
    const me = ranked.find((r) => r.team.id === myTeamId);
    return me ? me.rank : null;
  }

  const cards: Array<{
    ordinal: number;
    roundIndex: number;
    state: RoundCardState;
  }> = event.rounds.map((_, idx) => {
    if (idx < (event.roundWinners?.length ?? 0)) {
      const winnerTeamId = winnerByRound[idx] ?? null;
      const winner = winnerTeamId ? teams[winnerTeamId] ?? null : null;
      return {
        ordinal: idx + 1,
        roundIndex: idx,
        state: { kind: "past", winner },
      };
    }
    if (idx === currentIdx) {
      if (currentStatus === "decided") {
        const winnerTeamId = winnerByRound[idx] ?? null;
        const winner = winnerTeamId ? teams[winnerTeamId] ?? null : null;
        return {
          ordinal: idx + 1,
          roundIndex: idx,
          state: { kind: "current-decided", winner },
        };
      }
      return { ordinal: idx + 1, roundIndex: idx, state: { kind: "current-live" } };
    }
    return { ordinal: idx + 1, roundIndex: idx, state: { kind: "future" } };
  });

  // Determine where the host's "start next" button should go. Lobby has its
  // own START HEPTATHLON button (which calls /activate); the journey only
  // handles per-round starts once the event is active.
  let startTarget: { ordinal: number; label: string } | null = null;
  if (currentStatus === null) {
    // No round in flight — start the next one without a winner.
    const nextIdx = event.roundWinners.length;
    if (nextIdx < totalRounds) {
      const isPunish = event.rounds[nextIdx]?.challenge === "punishment";
      startTarget = {
        ordinal: nextIdx + 1,
        label: isPunish
          ? `💀 PUNISH NOW`
          : nextIdx === 0
            ? "START ROUND 1"
            : `START ROUND ${nextIdx + 1}`,
      };
    }
  } else if (
    currentStatus === "decided" &&
    (currentIdx ?? -1) + 1 < totalRounds
  ) {
    const nextIdx = (currentIdx ?? 0) + 1;
    const isPunish = event.rounds[nextIdx]?.challenge === "punishment";
    startTarget = {
      ordinal: nextIdx + 1,
      label: isPunish ? `💀 PUNISH NOW` : `START ROUND ${nextIdx + 1}`,
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

  // Pick the team currently in last place — used to call out who has to do
  // the punishment. Standings exclude punishment rounds, so this reflects
  // only the real challenges decided so far. If every team is tied (e.g.,
  // punishment is the very first round), return null → "everyone drinks".
  function pickLosingTeam() {
    if (standings.length < 2) return null;
    const top = standings[0].points;
    const bottom = standings[standings.length - 1].points;
    if (top === bottom) return null;
    return standings[standings.length - 1].team;
  }

  const [punishmentBusy, setPunishmentBusy] = useState(false);

  async function handleCompletePunishment() {
    if (punishmentBusy) return;
    setPunishmentBusy(true);
    try {
      // Mark the round decided. The `winnerTeamId` here is just the team that
      // got punished — scoring ignores punishment rounds, so this entry is
      // essentially a marker. Sending the losing team's id keeps the journey
      // history readable ("Round 3 · 💀 hit Team Alpha").
      const losing = pickLosingTeam();
      await endRound(code, {
        mode: "host",
        ...(myPlayerId ? { playerId: myPlayerId } : {}),
        ...(losing ? { teamId: losing.id } : {}),
      });
    } catch (err) {
      console.error("[journey] complete punishment failed", err);
    } finally {
      setPunishmentBusy(false);
    }
  }

  const [redoTarget, setRedoTarget] = useState<{
    roundIndex: number;
    label: string;
  } | null>(null);
  const [redoBusy, setRedoBusy] = useState(false);
  const [redoError, setRedoError] = useState<string | null>(null);

  function requestRedo(roundIndex: number, label: string) {
    setRedoTarget({ roundIndex, label });
    setRedoError(null);
  }

  async function confirmRedo() {
    if (!redoTarget || redoBusy) return;
    setRedoBusy(true);
    setRedoError(null);
    try {
      const res = await resetRound(code, {
        ...(myPlayerId ? { playerId: myPlayerId } : {}),
        roundIndex: redoTarget.roundIndex,
      });
      // Apply the server response directly. The round-reset PubNub message
      // is best-effort and can be lost (publish failure / subscription gap)
      // so we MUST self-update the store on success — otherwise the user
      // sees no visible change after tapping confirm. The PubNub message,
      // if it arrives, is idempotent.
      const fromIndex = redoTarget.roundIndex;
      const ev = res.event;
      const cur = useToastyStore.getState();
      const newProgress: Record<string, typeof cur.progress[string]> = {};
      for (const tid of Object.keys(cur.progress)) {
        const tp = cur.progress[tid];
        const cleaned: typeof tp = {};
        for (const key of Object.keys(tp)) {
          const idx = Number(key);
          if (Number.isFinite(idx) && idx < fromIndex) {
            cleaned[idx] = tp[idx];
          }
        }
        newProgress[tid] = cleaned;
      }
      useToastyStore.setState({
        event: ev,
        progress: newProgress,
        liveLevels: {},
      });
      setRedoTarget(null);
    } catch (err) {
      console.error("[journey] resetRound failed", err);
      const message =
        err instanceof Error ? err.message : "Reset failed";
      setRedoError(message);
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
        event.currentRoundStartsAt !== null &&
        event.rounds[currentIdx] && (
          <CountdownOverlay
            startsAt={event.currentRoundStartsAt}
            challenge={event.rounds[currentIdx].challenge}
            threshold={
              event.rounds[currentIdx].threshold ??
              CHALLENGES[event.rounds[currentIdx].challenge].defaultThreshold
            }
            onDone={() => {
              setShowCountdown(false);
              router.replace(`/e/${code}/play/${currentIdx}`);
            }}
          />
        )}
      {currentIdx !== null &&
        currentStatus === "live" &&
        event.rounds[currentIdx]?.challenge === "punishment" && (
          <PunishmentTakeover
            ordinal={currentIdx + 1}
            message={
              event.rounds[currentIdx]?.message ?? DEFAULT_PUNISHMENT_MESSAGE
            }
            losingTeam={pickLosingTeam()}
            myTeamId={myTeamId}
            hostControls={
              isHost ? (
                <button
                  type="button"
                  onClick={handleCompletePunishment}
                  disabled={punishmentBusy}
                  className="w-full py-4 rounded-2xl bg-white text-[#5b0010] font-display text-base font-extrabold tracking-widest disabled:opacity-50"
                >
                  {punishmentBusy ? "ENDING…" : "✓ PUNISHMENT COMPLETE"}
                </button>
              ) : undefined
            }
          />
        )}
      <main className="min-h-screen flex flex-col p-3 safe-top safe-bottom">
        {event.status === "finished" ? (
          <ChampionBanner
            winner={
              event.winnerTeamId ? teams[event.winnerTeamId] ?? null : null
            }
            myTeamId={myTeamId}
            totalRounds={totalRounds}
            pointsByTeamId={Object.fromEntries(
              standings.map((s) => [s.team.id, s.points]),
            )}
          />
        ) : (
          <>
            <TeamHeader />
            <TeammateOrbit />
          </>
        )}

        {/* RELEASE FINAL SCORES — host only, only once every round is
            decided. The earlier "END EVENT NOW" affordance is gone; the host
            advances the event by ending each round, not by short-circuiting
            the whole heptathlon. */}
        {isHost && event.status === "active" && pendingRelease && (
          <div className="mt-2">
            <EndHeptathlonControls
              teams={teamList}
              pointsByTeamId={Object.fromEntries(
                standings.map((s) => [s.team.id, s.points]),
              )}
              onEnd={handleEndEvent}
              releaseMode
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

        {/* Standings — Olympic-style points across decided rounds. */}
        <div className="rounded-2xl bg-bg-card p-3 mt-2">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] uppercase tracking-widest opacity-60 font-bold">
              Standings · {event.roundWinners.length}/{totalRounds} rounds
            </div>
            <ScoringExplainer teamCount={standings.length} />
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
                  {formatPoints(row.points)}{" "}
                  {row.points === 1 ? "pt" : "pts"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Journey */}
        <div className="flex flex-col gap-2 mt-3">
          {cards.map((card) => {
            const round = event.rounds[card.roundIndex];
            const isMyTeamWinner =
              card.state.kind === "past" || card.state.kind === "current-decided"
                ? card.state.winner?.id === myTeamId
                : false;

            const isPunishment = round.challenge === "punishment";

            let hostControls: React.ReactNode = null;
            if (isHost && event.status !== "finished") {
              if (card.state.kind === "current-live") {
                // Live punishment: the takeover overlay rendered above the
                // journey owns the "Complete" button — skip the in-card
                // controls so the host doesn't see two buttons.
                if (!isPunishment) {
                  hostControls = (
                    <HostRoundControls
                      variant={{
                        kind: "end",
                        entries: endPickerEntries,
                        challenge: round.challenge,
                      }}
                      onEnd={handleEnd}
                    />
                  );
                }
              } else if (card.state.kind === "current-decided") {
                hostControls = (
                  <HostRoundControls
                    variant={{ kind: "redo" }}
                    onRedo={() =>
                      requestRedo(
                        card.ordinal - 1,
                        `Round ${card.ordinal} · ${CHALLENGES[round.challenge].label}`,
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
                        `Round ${card.ordinal} · ${CHALLENGES[round.challenge].label}`,
                      )
                    }
                  />
                );
              }
            }

            const myMedal =
              card.state.kind === "past" ||
              card.state.kind === "current-decided"
                ? medalForPlace(computeMyPlace(card.roundIndex))
                : null;

            // Expandable breakdown for past + current-decided rounds —
            // shows every team's score/time when the user taps the card.
            // Punishments have no per-team breakdown, so skip.
            let expandable: React.ReactNode = null;
            if (
              !isPunishment &&
              (card.state.kind === "past" ||
                card.state.kind === "current-decided")
            ) {
              const def = CHALLENGES[round.challenge];
              const threshold = round.threshold ?? def.defaultThreshold;
              const breakdownEntries: BreakdownEntry[] = teamList.map(
                (t) => {
                  const tp = progressMap[t.id]?.[card.roundIndex];
                  return {
                    team: t,
                    value: tp?.value ?? 0,
                    completedAt: tp?.completedAt ?? null,
                    guesses: tp?.guesses,
                    perPlayer: tp?.perPlayer,
                  };
                },
              );
              const winnerForRound =
                winnerByRound[card.ordinal - 1] ?? null;
              const roundStartedAt =
                card.state.kind === "current-decided"
                  ? event.currentRoundStartsAt
                  : event.roundWinners[card.roundIndex]?.startedAt ?? null;
              expandable = (
                <RoundBreakdown
                  challenge={round.challenge}
                  threshold={threshold}
                  roundStartedAt={roundStartedAt}
                  myTeamId={myTeamId}
                  winnerTeamId={winnerForRound}
                  entries={breakdownEntries}
                  players={playersMap}
                />
              );
            }

            return (
              <RoundCard
                key={card.roundIndex}
                ordinal={card.ordinal}
                challenge={round.challenge}
                threshold={round.threshold ?? CHALLENGES[round.challenge].defaultThreshold}
                state={card.state}
                code={code}
                roundIndex={card.roundIndex}
                isMyTeamWinner={isMyTeamWinner}
                myMedal={myMedal}
                expandable={expandable}
                revealLocked={isHost}
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

            {redoError ? (
              <div className="mt-4 rounded-xl bg-accent-pink/15 border border-accent-pink/40 p-3 text-xs text-accent-pink">
                ⚠ {redoError}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={confirmRedo}
                disabled={redoBusy}
                className="w-full py-4 rounded-2xl bg-accent-pink text-white font-display text-base font-extrabold tracking-widest disabled:opacity-50"
              >
                {redoBusy
                  ? "RESETTING…"
                  : redoError
                    ? "↻ TRY AGAIN"
                    : "✓ YES, RESET THIS ROUND"}
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
