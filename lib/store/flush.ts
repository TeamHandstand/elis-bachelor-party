"use client";
import { useEffect, useRef } from "react";
import { useToastyStore } from "@/lib/store";
import type { ChallengeId } from "@/lib/types";
import type { ProgressSnapshotRequest } from "@/lib/api/contract";

const FLUSH_INTERVAL_MS = 2000;

interface CellSnapshot {
  roundIndex: number;
  challenge: ChallengeId;
  value: number;
  completed: boolean;
  completedAt: number | null;
}

function snapshotEqual(a: CellSnapshot, b: CellSnapshot): boolean {
  return (
    a.value === b.value &&
    a.completed === b.completed &&
    a.completedAt === b.completedAt &&
    a.challenge === b.challenge
  );
}

/**
 * Periodically flush THIS player's view of THEIR team's progress to the
 * server. Multiple teammates flush concurrently — server upserts with MAX
 * semantics, so the most-advanced state wins.
 *
 * Skips spectators (no team) and finished events.
 *
 * Also flushes once on `visibilitychange -> hidden` to catch the case where
 * a user locks their phone or backgrounds the app — the periodic interval
 * stops firing in that state.
 */
export function useProgressFlush(code: string): void {
  const lastSentRef = useRef<Record<number, CellSnapshot> | null>(null);
  const inFlightRef = useRef<boolean>(false);

  useEffect(() => {
    if (!code) return;

    function buildSnapshot(): {
      teamId: string;
      changed: CellSnapshot[];
    } | null {
      const state = useToastyStore.getState();
      const teamId = state.myTeamId;
      const event = state.event;
      if (!teamId || !event) return null;
      if (event.status === "finished") return null;
      const teamProg = state.progress[teamId];
      if (!teamProg) return null;

      const changed: CellSnapshot[] = [];
      for (let idx = 0; idx < event.rounds.length; idx++) {
        const cur = teamProg[idx];
        if (!cur) continue;
        const cell: CellSnapshot = {
          roundIndex: idx,
          challenge: event.rounds[idx].challenge,
          value: cur.value,
          completed: cur.completed,
          completedAt: cur.completedAt,
        };
        const last = lastSentRef.current?.[idx];
        if (!last || !snapshotEqual(last, cell)) {
          changed.push(cell);
        }
      }
      return { teamId, changed };
    }

    async function flush(): Promise<void> {
      if (inFlightRef.current) return;
      const snap = buildSnapshot();
      if (!snap || snap.changed.length === 0) return;
      inFlightRef.current = true;
      try {
        const body: ProgressSnapshotRequest = {
          teamId: snap.teamId,
          rounds: snap.changed,
        };
        const res = await fetch(`/api/events/${code}/progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          // Don't update lastSentRef so we'll retry next tick.
          return;
        }
        // Best-effort parse — we don't actually use the body.
        await res.json().catch(() => undefined);
        // Mark these cells as last-sent.
        const next: Record<number, CellSnapshot> = {
          ...(lastSentRef.current ?? {}),
        };
        for (const c of snap.changed) {
          next[c.roundIndex] = c;
        }
        lastSentRef.current = next;
      } catch {
        // network blip — try again next tick
      } finally {
        inFlightRef.current = false;
      }
    }

    const interval = setInterval(flush, FLUSH_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Fire and forget; not awaited because pagehide is synchronous.
        flush();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      // Final flush on unmount.
      flush();
    };
  }, [code]);
}
