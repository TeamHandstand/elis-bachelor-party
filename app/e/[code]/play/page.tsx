"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEventBootstrap } from "@/lib/store/bootstrap";
import { useProgressFlush } from "@/lib/store/flush";
import { useToastyStore } from "@/lib/store";
import { normalizeEventCode } from "@/lib/utils/code";
import { CHALLENGE_ORDER, CHALLENGES } from "@/lib/challenges";
import { TeamHeader } from "@/components/dashboard/TeamHeader";
import { TeammateOrbit } from "@/components/dashboard/TeammateOrbit";
import { ChallengeTile } from "@/components/dashboard/ChallengeTile";
import { StandingsCard } from "@/components/dashboard/StandingsCard";
import { PermissionWizard } from "@/components/permissions/PermissionWizard";
import type { FinishEventRequest } from "@/lib/api/contract";

export default function PlayPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = normalizeEventCode(params?.code ?? "");

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [showPerms, setShowPerms] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !code) return;
    const id = localStorage.getItem(`toasty-player-id-${code}`);
    if (!id) {
      router.replace(`/e/${code}`);
      return;
    }
    setMyPlayerId(id);
    const permsDone = localStorage.getItem(`toasty-permissions-${code}`) === "1";
    setShowPerms(!permsDone);
    setHydrated(true);
  }, [code, router]);

  useEventBootstrap(code, myPlayerId);
  useProgressFlush(code);

  // Wake-lock the dashboard so the screen stays on.
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
  const isFinished = useToastyStore((s) => s.isTeamFinished);
  const progressMap = useToastyStore((s) => s.progress);

  // Redirect on event status changes.
  useEffect(() => {
    if (event?.status === "lobby") {
      router.replace(`/e/${code}/lobby`);
    } else if (event?.status === "finished") {
      router.replace(`/e/${code}/done`);
    }
  }, [event?.status, code, router]);

  // Detect team finish and POST /finish, then redirect.
  useEffect(() => {
    if (!event || !myTeamId || finishedRef.current) return;
    if (!isFinished(myTeamId)) return;
    finishedRef.current = true;

    (async () => {
      try {
        const finalProgress: FinishEventRequest["finalProgress"] = [];
        for (const teamId of Object.keys(progressMap)) {
          const tp = progressMap[teamId];
          for (const id of CHALLENGE_ORDER) {
            const cur = tp[id];
            finalProgress.push({
              teamId,
              challenge: id,
              value: cur?.value ?? 0,
              completed: !!cur?.completed,
              completedAt: cur?.completedAt ?? null,
            });
          }
        }
        await fetch(`/api/events/${code}/finish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: myTeamId,
            finalProgress,
          } as FinishEventRequest),
        });
      } catch {
        // ignore — server is source of truth, retries will surface event-state
      } finally {
        router.replace(`/e/${code}/done`);
      }
    })();
  }, [event, myTeamId, isFinished, progressMap, code, router]);

  if (!hydrated || !event) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-3 animate-spin">🍕</div>
          <div className="text-xs uppercase tracking-widest opacity-60">
            warming up...
          </div>
        </div>
      </main>
    );
  }

  const enabledChallenges = CHALLENGE_ORDER.filter(
    (id) => event.challenges[id]?.enabled,
  );

  return (
    <>
      {showPerms && (
        <PermissionWizard
          onComplete={() => {
            try {
              localStorage.setItem(`toasty-permissions-${code}`, "1");
            } catch {
              /* ignore */
            }
            setShowPerms(false);
          }}
        />
      )}
      <main className="min-h-screen flex flex-col p-3 safe-top safe-bottom">
        <TeamHeader />
        <TeammateOrbit />
        <div className="grid grid-cols-2 gap-2">
          {enabledChallenges.map((id) => (
            <ChallengeTile
              key={id}
              code={code}
              challenge={id}
              progress={myProgress?.[id] ?? null}
              threshold={
                event.challenges[id]?.threshold ?? CHALLENGES[id].defaultThreshold
              }
            />
          ))}
        </div>
        <StandingsCard />
      </main>
    </>
  );
}
