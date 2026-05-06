"use client";

import { useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";
import { AirTimeDetector } from "@/lib/sensors/air-time";
import type { Unsubscribe } from "@/lib/sensors/types";
import { PermissionGate } from "@/components/permissions/PermissionGate";

interface Props {
  code: string;
  myPlayerId: string;
  roundIndex: number;
}

async function requestAirTimePerm(): Promise<boolean> {
  return new AirTimeDetector().requestPermission();
}

export function AirTimeView(props: Props) {
  return (
    <PermissionGate
      icon="📳"
      label="MOTION"
      blurb="We need your phone's motion sensor to detect airtime. Hit ENABLE and say YES."
      request={requestAirTimePerm}
      iosSetting="Motion & Orientation Access"
    >
      <AirTimeChallenge {...props} />
    </PermissionGate>
  );
}

function AirTimeChallenge({ code, myPlayerId, roundIndex }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const event = useToastyStore((s) => s.event);

  const [lastTossSec, setLastTossSec] = useState<number | null>(null);
  const [tossCount, setTossCount] = useState(0);
  const [airborne, setAirborne] = useState(false);

  const sensorRef = useRef<AirTimeDetector | null>(null);
  const unsubRef = useRef<Unsubscribe | null>(null);
  const [pendingMine, setPendingMine] = useState(0);

  const myCreditedAir =
    (myProgress?.[roundIndex]?.perPlayer?.[myPlayerId] ?? 0) as number;
  const lastCreditedRef = useRef(0);
  useEffect(() => {
    const prev = lastCreditedRef.current;
    if (myCreditedAir > prev + 1e-3) {
      const delta = myCreditedAir - prev;
      setPendingMine((p) => Math.max(0, p - delta));
      lastCreditedRef.current = myCreditedAir;
    } else if (myCreditedAir < prev) {
      setPendingMine(0);
      lastCreditedRef.current = myCreditedAir;
    }
  }, [myCreditedAir]);

  useEffect(() => {
    if (!myTeamId) return;
    if (!sensorRef.current) sensorRef.current = new AirTimeDetector();
    const sensor = sensorRef.current;

    (async () => {
      // PermissionGate already secured permission before mounting this view.
      unsubRef.current = await sensor.start((deltaSec) => {
        // A complete airborne window finished. Credit immediately.
        setPendingMine((p) => p + deltaSec);
        setLastTossSec(deltaSec);
        setTossCount((c) => c + 1);
        setAirborne(false);

        publisher({
          kind: "progress",
          playerId: myPlayerId,
          teamId: myTeamId,
          roundIndex,
          challenge: "air-time",
          delta: deltaSec,
          ts: Date.now(),
        }).catch(() => {});
      });

      // Cheap "currently airborne" indicator — independent of the detector's
      // internal state. We sample devicemotion mag with a polling listener
      // so the UI can flash while the phone is in the air.
      const motionHandler = (e: DeviceMotionEvent) => {
        const a = e.accelerationIncludingGravity;
        if (!a) return;
        const mag = Math.sqrt(
          (a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2,
        );
        setAirborne(mag < 4);
      };
      window.addEventListener("devicemotion", motionHandler);

      // Stash so we can remove it on unmount.
      const prevUnsub = unsubRef.current;
      unsubRef.current = () => {
        window.removeEventListener("devicemotion", motionHandler);
        prevUnsub?.();
      };
    })();

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [myPlayerId, myTeamId, publisher, roundIndex]);

  const def = CHALLENGES["air-time"];
  const threshold =
    event?.rounds[roundIndex]?.threshold ?? def.defaultThreshold;
  const teamValue = myProgress?.[roundIndex]?.value ?? 0;
  const displayedTeam = Math.min(teamValue + pendingMine, threshold);
  const teamCompleted = !!myProgress?.[roundIndex]?.completed;
  const pct = Math.min(100, (displayedTeam / threshold) * 100);

  return (
    <div
      className={`flex flex-col flex-1 items-center justify-center p-6 text-center transition-colors ${
        airborne ? "bg-accent-orange/30" : ""
      }`}
    >
      <div
        className={`text-8xl mb-4 select-none transition-transform duration-200 ${
          airborne ? "translate-y-[-24px] scale-110" : "translate-y-0"
        }`}
        aria-hidden
      >
        {airborne ? "🪂" : "✈️"}
      </div>

      <div className="font-display text-7xl font-extrabold tabular-nums leading-none">
        {displayedTeam.toFixed(1)}
        <span className="text-3xl opacity-60">s</span>
      </div>
      <div className="text-sm uppercase tracking-widest opacity-70 mt-1">
        of {threshold.toFixed(1)}s airborne
      </div>

      <div className="w-full max-w-xs h-3 mt-5 rounded-full bg-bg-card overflow-hidden">
        <div
          className="h-full bg-gradient-party transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-6 text-xs opacity-70 max-w-xs leading-relaxed">
        {teamCompleted
          ? "YOUR PHONES SURVIVED. NICE."
          : "TOSS your phone, jump with it, do whatever — every airborne second counts."}
      </div>

      <div className="mt-4 flex items-baseline gap-4 text-xs opacity-80">
        <div>
          <span className="font-bold tabular-nums">{tossCount}</span>{" "}
          <span className="opacity-60">tosses</span>
        </div>
        {lastTossSec !== null && (
          <div>
            last:{" "}
            <span className="font-bold tabular-nums">
              {lastTossSec.toFixed(2)}s
            </span>
          </div>
        )}
      </div>

      <div className="mt-5 text-[10px] opacity-50 max-w-[18rem] leading-relaxed">
        ⚠ Soft surface only. We are not liable for cracked screens, deflated
        egos, or busted relationships.
      </div>
    </div>
  );
}
