"use client";

import { useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { useTeammates } from "@/lib/store/selectors";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";
import { DbMeter } from "@/lib/sensors/db-meter";
import type { Unsubscribe } from "@/lib/sensors/types";
import { PermissionGate } from "@/components/permissions/PermissionGate";

interface Props {
  code: string;
  myPlayerId: string;
  roundIndex: number;
}

const PUBLISH_INTERVAL_MS = 250;
const SCREAM_DB = 80;

export function ScreamView(props: Props) {
  // Share a single DbMeter between the gate and the challenge body. The gate
  // calls requestPermission() (which opens the mic + AudioContext); the
  // challenge body reuses the already-warm instance to call start().
  const sensorRef = useRef<DbMeter | null>(null);
  if (!sensorRef.current) sensorRef.current = new DbMeter();
  return (
    <PermissionGate
      icon="🎤"
      label="MIC"
      blurb="We need your phone's mic to hear how loud you scream. Hit ENABLE and say YES."
      request={() => sensorRef.current!.requestPermission()}
      iosSetting="Microphone"
      requireUserGesture
    >
      <ScreamChallenge {...props} sensor={sensorRef.current} />
    </PermissionGate>
  );
}

function ScreamChallenge({
  code,
  myPlayerId,
  roundIndex,
  sensor,
}: Props & { sensor: DbMeter }) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const teammates = useTeammates();
  const liveLevels = useToastyStore((s) => s.liveLevels);
  const event = useToastyStore((s) => s.event);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());

  const [myLevel, setMyLevel] = useState(0);
  const [completeSent, setCompleteSent] = useState(false);
  const [sustainedSecsState, setSustainedSecsState] = useState(0);

  const lastPublishRef = useRef(0);
  const sustainedStartRef = useRef<number | null>(null);
  const lastLevelRef = useRef(0);

  const def = CHALLENGES.scream;
  const threshold =
    event?.rounds[roundIndex]?.threshold ?? def.defaultThreshold; // seconds
  const teamCompleted = !!myProgress?.[roundIndex]?.completed;

  // Pull-via-ref so the detector loop below doesn't depend on ever-changing
  // store values. Subscribing via useToastyStore re-renders the component,
  // and that's fine; we just want the interval itself to stay mounted.
  const myTeamIdRef = useRef(myTeamId);
  myTeamIdRef.current = myTeamId;
  const teamCompletedRef = useRef(teamCompleted);
  teamCompletedRef.current = teamCompleted;
  const completeSentRef = useRef(completeSent);
  completeSentRef.current = completeSent;
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;

  useEffect(() => {
    if (!myTeamId) return;
    let unsub: Unsubscribe | null = null;
    let cancelled = false;

    (async () => {
      // PermissionGate already opened the mic + AudioContext on this instance.
      if (cancelled) return;
      unsub = await sensor.start((level) => {
        if (cancelled) return;
        lastLevelRef.current = level;
        setMyLevel(level);
        const now = Date.now();
        if (now - lastPublishRef.current >= PUBLISH_INTERVAL_MS) {
          lastPublishRef.current = now;
          const tid = myTeamIdRef.current;
          if (tid) {
            publisher({
              kind: "live",
              playerId: myPlayerId,
              teamId: tid,
              roundIndex,
              challenge: "scream",
              level,
              ts: now,
            }).catch(() => {});
          }
        }
      });
      // If the effect was already torn down before sensor.start resolved, run
      // the cleanup now.
      if (cancelled && unsub) {
        try {
          unsub();
        } catch {
          /* ignore */
        }
        unsub = null;
      }
    })();

    return () => {
      cancelled = true;
      const u = unsub;
      unsub = null;
      try {
        u?.();
      } catch {
        /* ignore */
      }
    };
    // Intentionally minimal deps: we want this audio pipeline to start once
    // and stay alive for the whole challenge. The cleanup closes the
    // AudioContext, and re-opening on iOS Safari requires a user gesture —
    // so we DON'T want stable values that change once (e.g., myTeamId
    // hydrating from null) to retrigger this effect after start.
  }, [myPlayerId, roundIndex, sensor, myTeamId]);

  // Detect "all teammates above 80dB sustained for `threshold` seconds" and
  // publish complete. Reads teammates / liveLevels from the store inside the
  // interval so this effect stays mounted across the full round — otherwise
  // the dep array would re-run it every ~250ms (each live publish), and at
  // 3+ teammates publishing concurrently the 200ms interval can be cleared
  // before it ever fires, leaving the timer permanently stuck at 0.
  useEffect(() => {
    if (!myTeamId) return;
    const interval = setInterval(() => {
      if (teamCompletedRef.current || completeSentRef.current) {
        sustainedStartRef.current = null;
        setSustainedSecsState(0);
        return;
      }

      const now = Date.now();
      const recent = (lvl?: { level: number; ts: number }) =>
        !!lvl && now - lvl.ts < 1500 && lvl.level >= SCREAM_DB;

      const state = useToastyStore.getState();
      const liveLevelsNow = state.liveLevels;
      const teammatesNow = Object.values(state.players).filter(
        (p) => p.teamId === myTeamIdRef.current,
      );

      const me = lastLevelRef.current >= SCREAM_DB;
      const others = teammatesNow.filter((p) => p.id !== myPlayerId);
      const allOthers = others.every((p) =>
        recent(liveLevelsNow[p.id]?.scream),
      );

      const allLoud = me && allOthers;

      if (allLoud) {
        if (sustainedStartRef.current === null) {
          sustainedStartRef.current = now;
        }
        const elapsedMs = now - sustainedStartRef.current;
        setSustainedSecsState(elapsedMs / 1000);
        if (elapsedMs >= thresholdRef.current * 1000) {
          if (!completeSentRef.current) {
            completeSentRef.current = true;
            setCompleteSent(true);
            const tid = myTeamIdRef.current;
            if (tid) {
              publisher({
                kind: "complete",
                teamId: tid,
                roundIndex,
                challenge: "scream",
                ts: now,
              }).catch(() => {});
            }
          }
        }
      } else {
        if (sustainedStartRef.current !== null) {
          sustainedStartRef.current = null;
          setSustainedSecsState(0);
        }
      }
    }, 200);
    return () => clearInterval(interval);
  }, [myTeamId, myPlayerId, publisher, roundIndex]);

  const others = teammates.filter((p) => p.id !== myPlayerId);
  const meAbove = myLevel >= SCREAM_DB;
  const othersAbove = others.map((p) => {
    const lvl = liveLevels[p.id]?.scream;
    const recent = !!lvl && Date.now() - lvl.ts < 1500;
    return { player: p, level: recent ? lvl?.level ?? 0 : 0, ok: recent && (lvl?.level ?? 0) >= SCREAM_DB };
  });
  const allLoud = meAbove && othersAbove.every((o) => o.ok);

  // Pull from state (set by the detector interval) so the visible timer
  // stays in sync with the same source of truth that decides completion.
  const sustainedSecs = sustainedSecsState;
  const sustainedPct = Math.min(
    100,
    threshold > 0 ? (sustainedSecs / threshold) * 100 : 0,
  );

  return (
    <div
      className={`flex flex-col flex-1 p-4 transition-colors ${
        allLoud ? "bg-accent-pink/30 animate-pulse" : ""
      }`}
    >
      <div className="text-center mb-4">
        <div className="text-xs uppercase tracking-widest opacity-60">
          SCREAM ABOVE {SCREAM_DB} dB ·{" "}
          {teammates.length > 1 ? `all ${teammates.length}` : "you"} sustained{" "}
          {threshold}s
        </div>
        <div className="text-sm mt-1 font-bold">
          {teamCompleted
            ? "YOU SCREAMED LOUD ENOUGH 🔥"
            : allLoud
              ? `HOLD IT! ${sustainedSecs.toFixed(1)}s / ${threshold}s`
              : "GET LOUD"}
        </div>
        {!teamCompleted && (
          <div className="mt-2 mx-auto w-56 h-2 bg-bg-card rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-done transition-all"
              style={{ width: `${sustainedPct}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex justify-around items-end flex-1 gap-3">
        <ScreamBar
          label="YOU"
          level={myLevel}
          big
          highlight={meAbove}
        />
        {othersAbove.map((o) => (
          <ScreamBar
            key={o.player.id}
            label={o.player.name}
            level={o.level}
            highlight={o.ok}
          />
        ))}
        {teammates.length > 1 && othersAbove.length === 0 && (
          <div className="text-xs opacity-50 self-center">
            need teammates to open this challenge too
          </div>
        )}
      </div>
    </div>
  );
}

function ScreamBar({
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
  // Map dB roughly to 0-100% from 30-100dB.
  const pct = Math.min(100, Math.max(0, ((level - 30) / 70) * 100));
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
          {Math.round(level)} dB
        </div>
      </div>
      <div className="mt-2 text-xs font-bold truncate max-w-full">{label}</div>
    </div>
  );
}
