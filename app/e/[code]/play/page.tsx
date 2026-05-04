"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEventBootstrap } from "@/lib/store/bootstrap";
import { useProgressFlush } from "@/lib/store/flush";
import { useToastyStore } from "@/lib/store";
import { normalizeEventCode } from "@/lib/utils/code";
import { JourneyView } from "@/components/play/JourneyView";
import { PermissionWizard } from "@/components/permissions/PermissionWizard";

export default function PlayPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = normalizeEventCode(params?.code ?? "");

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [showPerms, setShowPerms] = useState(false);
  const [hydrated, setHydrated] = useState(false);

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

  // Lobby/finished routing.
  useEffect(() => {
    if (event?.status === "lobby") {
      router.replace(`/e/${code}/lobby`);
    } else if (event?.status === "finished") {
      router.replace(`/e/${code}/done`);
    }
  }, [event?.status, code, router]);

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
      <JourneyView code={code} myPlayerId={myPlayerId} />
    </>
  );
}
