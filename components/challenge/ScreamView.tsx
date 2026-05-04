"use client";

import { useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { useTeammates } from "@/lib/store/selectors";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";
import { DbMeter } from "@/lib/sensors/db-meter";
import type { Unsubscribe } from "@/lib/sensors/types";

interface Props {
  code: string;
  myPlayerId: string;
}

const PUBLISH_INTERVAL_MS = 250;
const SCREAM_DB = 80;

export function ScreamView({ code, myPlayerId }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const teammates = useTeammates();
  const liveLevels = useToastyStore((s) => s.liveLevels);
  const event = useToastyStore((s) => s.event);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());

  const [permError, setPermError] = useState(false);
  const [myLevel, setMyLevel] = useState(0);
  const [completeSent, setCompleteSent] = useState(false);

  const lastPublishRef = useRef(0);
  const sustainedStartRef = useRef<number | null>(null);
  const lastLevelRef = useRef(0);

  const def = CHALLENGES.scream;
  const threshold = event?.challenges.scream.threshold ?? def.defaultThreshold; // seconds
  const teamCompleted = !!myProgress?.scream.completed;

  useEffect(() => {
    if (!myTeamId) return;
    const sensor = new DbMeter();
    let unsub: Unsubscribe | null = null;
    let cancelled = false;

    (async () => {
      const ok = await sensor.requestPermission();
      if (!ok) {
        setPermError(true);
        return;
      }
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
            challenge: "scream",
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
  }, [myPlayerId, myTeamId, publisher]);

  // Detect "all 3 above 80dB sustained for `threshold` seconds" and publish complete.
  useEffect(() => {
    if (!myTeamId || teamCompleted || completeSent) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const recent = (lvl?: { level: number; ts: number }) =>
        !!lvl && now - lvl.ts < 1500 && lvl.level >= SCREAM_DB;

      const me = lastLevelRef.current >= SCREAM_DB;
      const others = teammates.filter((p) => p.id !== myPlayerId);
      const allOthers = others.every((p) => recent(liveLevels[p.id]?.scream));

      const allLoud = me && others.length >= 2 && allOthers;

      if (allLoud) {
        if (sustainedStartRef.current === null) {
          sustainedStartRef.current = now;
        } else if (now - sustainedStartRef.current >= threshold * 1000) {
          if (!completeSent) {
            setCompleteSent(true);
            publisher({
              kind: "complete",
              teamId: myTeamId,
              challenge: "scream",
              ts: now,
            }).catch(() => {});
          }
        }
      } else {
        sustainedStartRef.current = null;
      }
    }, 200);
    return () => clearInterval(interval);
  }, [myTeamId, teammates, liveLevels, myPlayerId, threshold, teamCompleted, completeSent, publisher]);

  const others = teammates.filter((p) => p.id !== myPlayerId);
  const meAbove = myLevel >= SCREAM_DB;
  const othersAbove = others.map((p) => {
    const lvl = liveLevels[p.id]?.scream;
    const recent = !!lvl && Date.now() - lvl.ts < 1500;
    return { player: p, level: recent ? lvl?.level ?? 0 : 0, ok: recent && (lvl?.level ?? 0) >= SCREAM_DB };
  });
  const allLoud = meAbove && othersAbove.length >= 2 && othersAbove.every((o) => o.ok);

  const sustainedSecs = sustainedStartRef.current
    ? (Date.now() - sustainedStartRef.current) / 1000
    : 0;

  return (
    <div
      className={`flex flex-col flex-1 p-4 transition-colors ${
        allLoud ? "bg-accent-pink/30 animate-pulse" : ""
      }`}
    >
      <div className="text-center mb-4">
        <div className="text-xs uppercase tracking-widest opacity-60">
          SCREAM ABOVE {SCREAM_DB} dB · all 3 sustained {threshold}s
        </div>
        <div className="text-sm mt-1 font-bold">
          {teamCompleted
            ? "YOU SCREAMED LOUD ENOUGH 🔥"
            : allLoud
              ? `HOLD IT! ${sustainedSecs.toFixed(1)}s / ${threshold}s`
              : "GET LOUD"}
        </div>
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
        {othersAbove.length === 0 && (
          <div className="text-xs opacity-50 self-center">
            need teammates to open this challenge too
          </div>
        )}
      </div>

      {permError && (
        <div className="mt-4 text-accent-pink text-xs text-center">
          Mic denied. We can’t hear your screams. Refresh & allow.
        </div>
      )}
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
