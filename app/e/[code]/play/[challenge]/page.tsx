"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEventBootstrap } from "@/lib/store/bootstrap";
import { useToastyStore } from "@/lib/store";
import { normalizeEventCode } from "@/lib/utils/code";
import { CHALLENGES } from "@/lib/challenges";
import type { ChallengeId } from "@/lib/types";
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

  // Wake-lock for the duration of the challenge view.
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
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());

  const isValid = useMemo(() => VALID_IDS.includes(challenge), [challenge]);
  const def = isValid ? CHALLENGES[challenge] : null;

  // Auto-bounce to dashboard if event reverts/finishes.
  useEffect(() => {
    if (event?.status === "lobby") router.replace(`/e/${code}/lobby`);
    if (event?.status === "finished") router.replace(`/e/${code}/done`);
  }, [event?.status, code, router]);

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
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center gap-3 p-3 bg-bg-deep">
        <Link
          href={`/e/${code}/play`}
          className="px-3 py-2 rounded-xl bg-bg-card font-bold text-sm no-select"
        >
          ←
        </Link>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-widest opacity-60 truncate">
            {def.label}
          </div>
          <div className="font-extrabold tabular-nums truncate">
            {progressLabel}
          </div>
        </div>
        <div className="text-3xl">{def.emoji}</div>
      </header>
      {view}
    </main>
  );
}
