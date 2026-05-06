"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEventBootstrap } from "@/lib/store/bootstrap";
import { useProgressFlush } from "@/lib/store/flush";
import { useToastyStore } from "@/lib/store";
import { normalizeEventCode } from "@/lib/utils/code";
import {
  CHALLENGES,
  challengeCommand,
  enabledChallengeOrder,
} from "@/lib/challenges";
import { useStandings } from "@/lib/store/selectors";
import type { ChallengeId } from "@/lib/types";
import { CountdownOverlay } from "@/components/play/CountdownOverlay";
import { FinaleLock } from "@/components/play/FinaleLock";
import { RoundResults, type ResultEntry } from "@/components/play/RoundResults";
import {
  HostRoundControls,
  type EndPickerEntry,
} from "@/components/play/HostRoundControls";
import { useCookieHost } from "@/lib/auth/use-cookie-host";
import { endRound } from "@/components/host/_fetch";
import { DistanceView } from "@/components/challenge/DistanceView";
import { StepsView } from "@/components/challenge/StepsView";
import { TapsView } from "@/components/challenge/TapsView";
import { ScreamView } from "@/components/challenge/ScreamView";
import { ShakeView } from "@/components/challenge/ShakeView";
import { SpinView } from "@/components/challenge/SpinView";
import { NorthView } from "@/components/challenge/NorthView";
import { TimeGuessView } from "@/components/challenge/TimeGuessView";

const VALID_IDS: ChallengeId[] = [
  "distance",
  "steps",
  "taps",
  "scream",
  "shake",
  "spin",
  "north",
  "time-guess",
];

export default function ChallengePage() {
  const router = useRouter();
  const params = useParams<{ code: string; challenge: string }>();
  const code = normalizeEventCode(params?.code ?? "");
  const challenge = params?.challenge as ChallengeId;

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
  useProgressFlush(code);

  useEffect(() => {
    if (!hydrated) return;
    let lock: any;
    (async () => {
      try {
        lock = await (navigator as any).wakeLock?.request?.("screen");
      } catch {
        /* ignore */
      }
    })();
    return () => {
      try {
        lock?.release?.();
      } catch {
        /* ignore */
      }
    };
  }, [hydrated]);

  const event = useToastyStore((s) => s.event);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const standings = useStandings();
  const progressMap = useToastyStore((s) => s.progress);
  const teamsMap = useToastyStore((s) => s.teams);

  const isHostPlayer =
    !!myPlayerId && event?.hostPlayerId === myPlayerId;
  const { isHost: isCookieHost } = useCookieHost();
  const isHost =
    isHostPlayer || (!event?.hostPlayerId && isCookieHost);

  const isValid = useMemo(() => VALID_IDS.includes(challenge), [challenge]);
  const def = isValid ? CHALLENGES[challenge] : null;

  // Lobby bounce. (Finished events stay on this view long enough to render
  // the final round results — players go back to journey via the back arrow.)
  useEffect(() => {
    if (event?.status === "lobby") router.replace(`/e/${code}/lobby`);
    if (event?.status === "finished") router.replace(`/e/${code}/play`);
  }, [event?.status, code, router]);

  // If this challenge isn't the current round, bounce back to journey.
  useEffect(() => {
    if (!event) return;
    if (event.currentRoundIndex === null) {
      router.replace(`/e/${code}/play`);
      return;
    }
    const order = enabledChallengeOrder(event.challenges);
    const currentChallenge = order[event.currentRoundIndex];
    if (currentChallenge !== challenge) {
      router.replace(`/e/${code}/play`);
    }
  }, [
    event?.currentRoundIndex,
    event?.currentRoundStatus,
    event,
    challenge,
    router,
    code,
  ]);

  // No auto-redirect when the round becomes decided — players linger on
  // this page to see the all-teams results. They can navigate back to the
  // journey via the back arrow; the host advances to the next round, which
  // triggers a round-start that lands everyone on the next challenge view.

  // Auto-end the round once every team has completed the challenge. The
  // server picks the first finisher as the winner. Host-only — non-host
  // clients can't trigger /round/end without auth. Guard with a ref so we
  // only fire once per round even if the effect re-runs.
  const autoEndedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isHost || !event) return;
    if (event.currentRoundStatus !== "live") return;
    if (autoEndedRef.current === challenge) return;
    const allTeamsList = Object.values(teamsMap);
    if (allTeamsList.length === 0) return;
    const allDone = allTeamsList.every(
      (t) => progressMap[t.id]?.[challenge]?.completed === true,
    );
    if (!allDone) return;
    autoEndedRef.current = challenge;

    // For north + time-guess, smallest avg error wins. Server doesn't have
    // the per-player guess data — pick the winner client-side and pass it
    // along.
    let chosenTeamId: string | undefined;
    if (challenge === "north" || challenge === "time-guess") {
      let best: { teamId: string; avg: number } | null = null;
      for (const t of allTeamsList) {
        const guesses =
          progressMap[t.id]?.[challenge as "north" | "time-guess"]
            ?.guesses ?? [];
        if (guesses.length === 0) continue;
        const avg =
          guesses.reduce((s, g) => s + g.errorDeg, 0) / guesses.length;
        if (!best || avg < best.avg) best = { teamId: t.id, avg };
      }
      chosenTeamId = best?.teamId;
    }

    endRound(code, {
      mode: "host",
      ...(myPlayerId ? { playerId: myPlayerId } : {}),
      ...(chosenTeamId ? { teamId: chosenTeamId } : {}),
    }).catch((err) => {
      console.error("[challenge] auto endRound failed", err);
      autoEndedRef.current = null;
    });
  }, [
    isHost,
    event,
    teamsMap,
    progressMap,
    challenge,
    code,
    myPlayerId,
  ]);

  // Reset the guard whenever the round transitions back to 'live' (covers
  // round-advance + redo). Other transitions don't clear it so we don't
  // double-fire after the auto-end completes.
  useEffect(() => {
    if (event?.currentRoundStatus === "live") {
      autoEndedRef.current = null;
    }
  }, [event?.currentRoundStatus, challenge, event?.currentRoundStartsAt]);

  if (!hydrated || !myPlayerId) {
    return (
      <main className="min-h-screen flex items-center justify-center text-center">
        <div className="text-5xl animate-spin">🍕</div>
      </main>
    );
  }

  if (!isValid || !def) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-3">🤔</div>
        <div className="font-bold mb-3">unknown challenge</div>
        <Link
          href={`/e/${code}/play`}
          className="px-4 py-2 rounded-2xl bg-gradient-party font-bold"
        >
          ← back
        </Link>
      </main>
    );
  }

  const myCur = myProgress?.[challenge];
  const threshold =
    event?.challenges[challenge]?.threshold ?? def.defaultThreshold;
  const totalRounds = event ? enabledChallengeOrder(event.challenges).length : 0;
  const ordinal = (event?.currentRoundIndex ?? 0) + 1;

  const showCountdown =
    !!event &&
    event.currentRoundStatus === "live" &&
    event.currentRoundStartsAt !== null &&
    Date.now() < event.currentRoundStartsAt;

  let view: React.ReactNode = null;
  switch (challenge) {
    case "distance":
      view = <DistanceView code={code} myPlayerId={myPlayerId} />;
      break;
    case "steps":
      view = <StepsView code={code} myPlayerId={myPlayerId} />;
      break;
    case "taps":
      view = <TapsView code={code} myPlayerId={myPlayerId} />;
      break;
    case "scream":
      view = <ScreamView code={code} myPlayerId={myPlayerId} />;
      break;
    case "shake":
      view = <ShakeView code={code} myPlayerId={myPlayerId} />;
      break;
    case "spin":
      view = <SpinView code={code} myPlayerId={myPlayerId} />;
      break;
    case "north":
      view = <NorthView code={code} myPlayerId={myPlayerId} />;
      break;
    case "time-guess":
      view = <TimeGuessView code={code} myPlayerId={myPlayerId} />;
      break;
  }

  const progressLabel = myCur
    ? def.formatProgress(myCur.value, threshold)
    : def.formatProgress(0, threshold);

  const allTeams = useToastyStore.getState().teams;
  const allPlayers = useToastyStore.getState().players;
  const resultEntries: ResultEntry[] = Object.values(allTeams).map((t) => {
    const tp = progressMap[t.id]?.[challenge];
    return {
      team: t,
      value: tp?.value ?? 0,
      completedAt: tp?.completedAt ?? null,
      perPlayer: tp?.perPlayer,
      guesses: tp?.guesses,
    };
  });

  const roundDecided = event?.currentRoundStatus === "decided";
  const roundLive = event?.currentRoundStatus === "live";
  const myTeamDone = !!myCur?.completed;
  const showAllTeamResults = roundDecided;
  const showMyTeamResult = !roundDecided && myTeamDone;
  const winnerForRound =
    roundDecided && event && event.currentRoundIndex !== null
      ? event.roundWinners[event.currentRoundIndex]?.teamId ?? null
      : null;
  const roundStartedAt = event?.currentRoundStartsAt ?? null;

  // End-Round picker entries: every team's current progress for this round.
  // HostRoundControls sorts internally (completed-first by completedAt) so
  // the recommended winner is highlighted at the top.
  const playersByTeam: Record<string, typeof allPlayers[string][]> = {};
  for (const p of Object.values(allPlayers)) {
    if (!p.teamId) continue;
    (playersByTeam[p.teamId] ??= []).push(p);
  }
  const endPickerEntries: EndPickerEntry[] = Object.values(teamsMap).map(
    (t) => {
      const tp = progressMap[t.id]?.[challenge];
      return {
        team: t,
        completedAt: tp?.completedAt ?? null,
        value: tp?.value ?? 0,
        threshold,
        players: playersByTeam[t.id] ?? [],
        guesses: tp?.guesses ?? [],
      };
    },
  );

  async function handleEndRound(winnerTeamId: string | null) {
    try {
      await endRound(code, {
        mode: "host",
        ...(myPlayerId ? { playerId: myPlayerId } : {}),
        ...(winnerTeamId ? { teamId: winnerTeamId } : {}),
      });
    } catch (err) {
      console.error("[challenge] endRound failed", err);
    }
  }

  // Pre-release lock: every round decided, host hasn't released yet.
  const totalEnabledRounds = event
    ? enabledChallengeOrder(event.challenges).length
    : 0;
  const pendingRelease =
    !!event &&
    totalEnabledRounds > 0 &&
    event.roundWinners.length >= totalEnabledRounds &&
    event.status === "active";

  return (
    <>
      {showCountdown && event.currentRoundStartsAt !== null && (
        <CountdownOverlay
          startsAt={event.currentRoundStartsAt}
          challenge={challenge}
          onDone={() => {
            /* fall through to challenge view */
          }}
        />
      )}

      {pendingRelease && !isHost && (
        <FinaleLock groomName={event?.groomName} />
      )}
      <main className="min-h-screen flex flex-col">
        <header className="flex items-center gap-3 p-3 bg-bg-deep">
          <Link
            href={`/e/${code}/play`}
            className="px-3 py-2 rounded-xl bg-bg-card font-bold text-sm no-select"
          >
            ←
          </Link>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest opacity-60 truncate">
              Round {ordinal} / {totalRounds} · {def.label}
            </div>
            <div className="font-extrabold tabular-nums truncate">
              {progressLabel}
            </div>
          </div>
          <div className="text-3xl">{def.emoji}</div>
        </header>
        {/* Host's End Round affordance — pinned just under the header so
            it's always reachable. Only shown while the round is live;
            the picker pre-recommends the first finisher. */}
        {isHost && roundLive && (
          <div className="px-3 pt-3 bg-bg-deep">
            <HostRoundControls
              variant={{
                kind: "end",
                entries: endPickerEntries,
                challenge,
              }}
              onEnd={handleEndRound}
            />
          </div>
        )}
        {/* Live mini-leaderboard */}
        <div className="px-3 py-2 flex flex-wrap gap-2 bg-bg-deep/60 border-b border-white/5">
          {standings.map((row) => {
            const isMine = row.team.id === myTeamId;
            const tp = progressMap[row.team.id];
            const cur = tp?.[challenge];
            const isDone = !!cur?.completed;
            const valueStr = cur
              ? def.formatProgress(cur.value, threshold)
              : def.formatProgress(0, threshold);
            return (
              <div
                key={row.team.id}
                className={`px-2 py-1 rounded-lg text-[11px] tabular-nums ${
                  isMine
                    ? "bg-accent-orange/20 text-accent-orange font-extrabold"
                    : "bg-bg-card opacity-80"
                } ${isDone ? "ring-1 ring-accent-green/60" : ""}`}
              >
                {row.team.emoji} {isDone ? "✅ " : ""}
                {valueStr}
              </div>
            );
          })}
        </div>
        {showAllTeamResults ? (
          <RoundResults
            challenge={challenge}
            threshold={threshold}
            roundStartedAt={roundStartedAt}
            myTeamId={myTeamId}
            entries={resultEntries}
            players={allPlayers}
            mode="all-teams"
            winnerTeamId={winnerForRound}
            code={code}
          />
        ) : showMyTeamResult ? (
          <RoundResults
            challenge={challenge}
            threshold={threshold}
            roundStartedAt={roundStartedAt}
            myTeamId={myTeamId}
            entries={resultEntries}
            players={allPlayers}
            mode="my-team"
            code={code}
          />
        ) : (
          <>
            <div className="px-4 pt-4 pb-2 text-center bg-bg-deep/40 border-b border-white/5">
              <div className="font-display text-xl sm:text-2xl font-extrabold leading-tight text-accent-orange tracking-wide">
                {challengeCommand(challenge, threshold)}
              </div>
            </div>
            {view}
          </>
        )}
      </main>
    </>
  );
}
