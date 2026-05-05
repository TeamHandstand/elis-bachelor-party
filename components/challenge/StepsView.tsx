"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";
import { StepCounter } from "@/lib/sensors/step-counter";
import type { Unsubscribe } from "@/lib/sensors/types";

interface Props {
  code: string;
  myPlayerId: string;
}

const BATCH_SIZE = 5;

type PermState = "idle" | "requesting" | "granted" | "denied";

// iOS Safari only shows the DeviceMotionEvent permission popup in response to
// a user gesture. Calling it from a useEffect after the wizard has already
// run won't re-prompt — we have to wait for the player to tap. So we render
// a giant ENABLE button instead of a tiny error string.
function isIosMotionGated(): boolean {
  if (typeof window === "undefined") return false;
  const ME: any = (window as any).DeviceMotionEvent;
  return !!ME && typeof ME.requestPermission === "function";
}

export function StepsView({ code, myPlayerId }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const event = useToastyStore((s) => s.event);
  const [perm, setPerm] = useState<PermState>("idle");
  const [stomp, setStomp] = useState(0);

  const bufferRef = useRef(0);
  const sensorRef = useRef<StepCounter | null>(null);
  const unsubRef = useRef<Unsubscribe | null>(null);

  const startListening = useCallback(async () => {
    if (!myTeamId || unsubRef.current) return;
    if (!sensorRef.current) sensorRef.current = new StepCounter();
    unsubRef.current = await sensorRef.current.start(() => {
      bufferRef.current += 1;
      setStomp((s) => s + 1);
      if (bufferRef.current >= BATCH_SIZE) {
        const flush = bufferRef.current;
        bufferRef.current = 0;
        publisher({
          kind: "progress",
          playerId: myPlayerId,
          teamId: myTeamId,
          challenge: "steps",
          delta: flush,
          ts: Date.now(),
        }).catch(() => {});
      }
    });
  }, [myPlayerId, myTeamId, publisher]);

  const requestPermAndStart = useCallback(async () => {
    setPerm("requesting");
    if (!sensorRef.current) sensorRef.current = new StepCounter();
    const ok = await sensorRef.current.requestPermission();
    if (!ok) {
      setPerm("denied");
      return;
    }
    setPerm("granted");
    await startListening();
  }, [startListening]);

  // On non-iOS (Android, desktop), the permission is implicit — start
  // immediately. On iOS we wait for the user to tap the button.
  useEffect(() => {
    if (!myTeamId) return;
    let cancelled = false;
    (async () => {
      if (isIosMotionGated()) {
        // Try once optimistically — if iOS still has the prompt queued from
        // the wizard, this resolves; otherwise we fall through to the button.
        if (!sensorRef.current) sensorRef.current = new StepCounter();
        try {
          const ok = await sensorRef.current.requestPermission();
          if (cancelled) return;
          if (ok) {
            setPerm("granted");
            await startListening();
          } else {
            setPerm("denied");
          }
        } catch {
          if (!cancelled) setPerm("denied");
        }
      } else {
        if (cancelled) return;
        setPerm("granted");
        await startListening();
      }
    })();

    return () => {
      cancelled = true;
      if (bufferRef.current > 0 && myTeamId) {
        const remainder = bufferRef.current;
        bufferRef.current = 0;
        publisher({
          kind: "progress",
          playerId: myPlayerId,
          teamId: myTeamId,
          challenge: "steps",
          delta: remainder,
          ts: Date.now(),
        }).catch(() => {});
      }
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [myPlayerId, myTeamId, publisher, startListening]);

  const def = CHALLENGES.steps;
  const threshold = event?.challenges.steps.threshold ?? def.defaultThreshold;
  const value = Math.floor(myProgress?.steps.value ?? 0);

  if (perm !== "granted") {
    const denied = perm === "denied";
    const requesting = perm === "requesting";
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 text-center gap-4">
        <div className="text-7xl">📳</div>
        <div className="font-display text-3xl font-extrabold tracking-wide">
          {denied ? "MOTION ACCESS BLOCKED" : "ENABLE MOTION"}
        </div>
        <div className="text-sm max-w-xs opacity-90">
          We need your phone&rsquo;s motion sensor to count steps. Tap below
          and accept the popup.
        </div>
        <button
          type="button"
          onClick={requestPermAndStart}
          disabled={requesting}
          className="w-full max-w-xs py-5 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest disabled:opacity-50"
        >
          {requesting ? "ASKING…" : denied ? "TRY AGAIN" : "ENABLE MOTION"}
        </button>
        {denied && (
          <div className="mt-2 max-w-xs rounded-2xl border-2 border-accent-pink bg-accent-pink/10 p-4 text-left">
            <div className="font-display text-lg font-extrabold text-accent-pink mb-2">
              ⚠️ STILL BLOCKED?
            </div>
            <div className="text-sm leading-snug">
              On iPhone: open Settings → Safari → <b>Motion &amp; Orientation
              Access</b> and turn it ON. Then come back here and tap{" "}
              <b>TRY AGAIN</b>. If that fails, fully quit Safari from the app
              switcher and reopen this page.
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 p-6 text-center">
      <div
        key={stomp}
        className="text-8xl mb-4 select-none animate-[stomp_0.25s_ease-out]"
        style={{
          transform: stomp % 2 === 0 ? "rotate(-6deg)" : "rotate(6deg)",
          transition: "transform 0.15s",
        }}
      >
        👟
      </div>
      <div className="font-display text-7xl font-extrabold tabular-nums">
        {value.toLocaleString()}
      </div>
      <div className="text-sm uppercase tracking-widest opacity-70 mt-1">
        of {threshold.toLocaleString()} steps
      </div>
      <div className="text-xs opacity-60 mt-6 max-w-xs">
        STOMP. Phone in your pocket or your hand. Every footfall counts. Don’t
        cheat by shaking it, you idiot.
      </div>
    </div>
  );
}
