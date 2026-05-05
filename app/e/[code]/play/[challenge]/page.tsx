"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEventBootstrap } from "@/lib/store/bootstrap";
import { useProgressFlush } from "@/lib/store/flush";
import { useToastyStore } from "@/lib/store";
import { normalizeEventCode } from "@/lib/utils/code";
import { CHALLENGES, enabledChallengeOrder } from "@/lib/challenges";
import { useStandings } from "@/lib/store/selectors";
import type { ChallengeId } from "@/lib/types";
import { CountdownOverlay } from "@/components/play/CountdownOverlay";
import { DistanceView } from "@/components/challenge/DistanceView";
import { StepsView } from "@/components/challenge/StepsView";
import { TapsView } from "@/components/challenge/TapsView";
import { ScreamView } from "@/components/challenge/ScreamView";
import { ShakeView } from "@/components/challenge/ShakeView";
import { SpinView } from "@/components/challenge/SpinView";
import { NorthView } from "@/components/challenge/NorthView";

const VALID_IDS: ChallengeId[] = [
  "distance",
  "steps",
  "taps",
  "scream",
  "shake",
  "spin",
  "north",
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

  const isValid = useMemo(() => VALID_IDS.includes(challenge), [challenge]);
  const def = isValid ? CHALLENGES[challenge] : null;

  // Lobby/finished bounce.
  useEffect(() => {
    if (event?.status === "lobby") router.replace(`/e/${code}/lobby`);
    if (event?.status === "finished") router.replace(`/e/${code}/done`);
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

  // Auto-redirect to journey when the round is decided.
  useEffect(() => {
    if (!event) return;
    if (event.currentRoundStatus === "decided") {
      router.replace(`/e/${code}/play`);
    }
  }, [event?.currentRoundStatus, router, code, event]);

  // No auto-end: every team gets a chance to keep going even after one
  // finishes. The host explicitly ends the round; the server prefers the
  // first-completed team in its recommended winner.

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
  }

  const progressLabel = myCur
    ? def.formatProgress(myCur.value, threshold)
    : def.formatProgress(0, threshold);

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
        {/* Team-finished banner — round still open; just signals to wait. */}
        {myCur?.completed && (
          <div className="px-3 py-3 bg-gradient-done text-center font-display font-extrabold tracking-widest text-sm">
            ✅ YOUR TEAM FINISHED — keep going if you want, host will end the
            round.
          </div>
        )}
        {view}
      </main>
    </>
  );
}
