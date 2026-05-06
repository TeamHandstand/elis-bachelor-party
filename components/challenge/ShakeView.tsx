"use client";

import { useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { useTeammates } from "@/lib/store/selectors";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";
import { ShakeDetector } from "@/lib/sensors/shake-detector";
import type { Unsubscribe } from "@/lib/sensors/types";
import { PermissionGate } from "@/components/permissions/PermissionGate";

interface Props {
  code: string;
  myPlayerId: string;
  roundIndex: number;
}

async function requestShakePerm(): Promise<boolean> {
  return new ShakeDetector().requestPermission();
}

export function ShakeView(props: Props) {
  return (
    <PermissionGate
      icon="📳"
      label="MOTION"
      blurb="We need your phone's motion sensor to detect shaking. Hit ENABLE and say YES."
      request={requestShakePerm}
      iosSetting="Motion & Orientation Access"
    >
      <ShakeChallenge {...props} />
    </PermissionGate>
  );
}

const PUBLISH_INTERVAL_MS = 250;
// ShakeDetector emits |mag - 9.8|; "12 m/s² magnitude" => deviation ~2.2.
const SHAKE_DEVIATION = 2.2;

function ShakeChallenge({ code, myPlayerId, roundIndex }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const teammates = useTeammates();
  const liveLevels = useToastyStore((s) => s.liveLevels);
  const event = useToastyStore((s) => s.event);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());

  const [myLevel, setMyLevel] = useState(0);
  const [completeSent, setCompleteSent] = useState(false);

  const lastPublishRef = useRef(0);
  const sustainedStartRef = useRef<number | null>(null);
  const lastLevelRef = useRef(0);

  const def = CHALLENGES.shake;
  const threshold =
    event?.rounds[roundIndex]?.threshold ?? def.defaultThreshold;
  const teamCompleted = !!myProgress?.[roundIndex]?.completed;

  useEffect(() => {
    if (!myTeamId) return;
    const sensor = new ShakeDetector();
    let unsub: Unsubscribe | null = null;
    let cancelled = false;

    (async () => {
      // PermissionGate already secured permission before mounting this view.
      if (cancelled) return;
      unsub = await sensor.start((level) => {
        lastLevelRef.current = level;
        setMyLevel(level);
        const now = Date.now();
        if (now - lastPublishRef.current >= PUBLISH_INTERVAL_MS) {
          lastPublishRef.current = now;
          publisher({
            kind: "live",
            playerId: myPlayerId,
            teamId: myTeamId,
            roundIndex,
            challenge: "shake",
            level,
            ts: now,
          }).catch(() => {});
        }
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [myPlayerId, myTeamId, publisher, roundIndex]);

  useEffect(() => {
    if (!myTeamId || teamCompleted || completeSent) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const recentOk = (lvl?: { level: number; ts: number }) =>
        !!lvl && now - lvl.ts < 1500 && lvl.level >= SHAKE_DEVIATION;

      const me = lastLevelRef.current >= SHAKE_DEVIATION;
      const others = teammates.filter((p) => p.id !== myPlayerId);
      const allOthers = others.every((p) => recentOk(liveLevels[p.id]?.shake));

      const allShaking = me && others.length >= 2 && allOthers;

      if (allShaking) {
        if (sustainedStartRef.current === null) {
          sustainedStartRef.current = now;
        } else if (now - sustainedStartRef.current >= threshold * 1000) {
          if (!completeSent) {
            setCompleteSent(true);
            publisher({
              kind: "complete",
              teamId: myTeamId,
              roundIndex,
              challenge: "shake",
              ts: now,
            }).catch(() => {});
          }
        }
      } else {
        sustainedStartRef.current = null;
      }
    }, 150);
    return () => clearInterval(interval);
  }, [myTeamId, teammates, liveLevels, myPlayerId, threshold, teamCompleted, completeSent, publisher, roundIndex]);

  const others = teammates.filter((p) => p.id !== myPlayerId);
  const meAbove = myLevel >= SHAKE_DEVIATION;
  const othersAbove = others.map((p) => {
    const lvl = liveLevels[p.id]?.shake;
    const recent = !!lvl && Date.now() - lvl.ts < 1500;
    return { player: p, level: recent ? lvl?.level ?? 0 : 0, ok: recent && (lvl?.level ?? 0) >= SHAKE_DEVIATION };
  });
  const allShaking = meAbove && othersAbove.length >= 2 && othersAbove.every((o) => o.ok);
  const sustainedSecs = sustainedStartRef.current
    ? (Date.now() - sustainedStartRef.current) / 1000
    : 0;

  return (
    <div
      className={`flex flex-col flex-1 p-4 transition-colors ${
        allShaking ? "bg-accent-orange/30 animate-pulse" : ""
      }`}
    >
      <div className="text-center mb-4">
        <div className="text-xs uppercase tracking-widest opacity-60">
          ALL 3 SHAKE FOR {threshold}s
        </div>
        <div className="text-sm mt-1 font-bold">
          {teamCompleted
            ? "PHONES ARE BROKEN, GOOD JOB"
            : allShaking
              ? `KEEP SHAKING! ${sustainedSecs.toFixed(1)}s / ${threshold}s`
              : "GO. SHAKE LIKE YOU MEAN IT."}
        </div>
      </div>

      <div className="flex justify-around items-end flex-1 gap-3">
        <ShakeBar label="YOU" level={myLevel} big highlight={meAbove} />
        {othersAbove.map((o) => (
          <ShakeBar
            key={o.player.id}
            label={o.player.name}
            level={o.level}
            highlight={o.ok}
          />
        ))}
        {othersAbove.length === 0 && (
          <div className="text-xs opacity-50 self-center">
            need teammates here too
          </div>
        )}
      </div>
    </div>
  );
}

function ShakeBar({
  label,
  level,
  big,
  highlight,
}: {
  label: string;
  level: number;
  big?: boolean;
  highlight?: boolean;
}) {
  // 0..6 m/s² -> 0..100%
  const pct = Math.min(100, Math.max(0, (level / 6) * 100));
  return (
    <div className={`flex flex-col items-center ${big ? "flex-[2]" : "flex-1"}`}>
      <div
        className={`relative w-full bg-bg-card rounded-2xl overflow-hidden ${
          big ? "h-72" : "h-56"
        }`}
      >
        <div
          className={`absolute bottom-0 left-0 right-0 ${
            highlight ? "bg-gradient-done" : "bg-gradient-party"
          } transition-all`}
          style={{ height: `${pct}%` }}
        />
        <div className="absolute inset-x-0 top-2 text-center text-[10px] opacity-70 font-bold tracking-wider">
          {level.toFixed(1)} m/s²
        </div>
      </div>
      <div className="mt-2 text-xs font-bold truncate max-w-full">{label}</div>
    </div>
  );
}
