"use client";

import { useMemo, useState } from "react";
import type { ChallengeId, Team } from "@/lib/types";
import { CHALLENGES } from "@/lib/challenges";

export interface EndPickerEntry {
  team: Team;
  completedAt: number | null;
  value: number;
  threshold: number;
}

type Variant =
  | { kind: "start"; label: string }
  | { kind: "end"; entries: EndPickerEntry[]; challenge: ChallengeId }
  | { kind: "redo" };

interface Props {
  variant: Variant;
  onStart?: () => Promise<void> | void;
  onEnd?: (winnerTeamId: string | null) => Promise<void> | void; // null = server picks
  onRedo?: () => Promise<void> | void;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function HostRoundControls({ variant, onStart, onEnd, onRedo }: Props) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  async function run(fn?: () => Promise<void> | void) {
    if (!fn || busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  // Sort entries: completed first by earliest completedAt, then non-completed
  // by value desc. Memoized so stable across renders inside the picker.
  const sortedEntries = useMemo(() => {
    if (variant.kind !== "end") return [] as EndPickerEntry[];
    return [...variant.entries].sort((a, b) => {
      const aDone = a.completedAt !== null;
      const bDone = b.completedAt !== null;
      if (aDone !== bDone) return aDone ? -1 : 1;
      if (aDone && bDone) {
        return (a.completedAt ?? Infinity) - (b.completedAt ?? Infinity);
      }
      return b.value - a.value;
    });
  }, [variant]);

  if (variant.kind === "start") {
    return (
      <div className="mt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(onStart)}
          className="w-full py-4 rounded-2xl bg-gradient-party font-display text-lg font-extrabold tracking-widest disabled:opacity-50"
        >
          {busy ? "STARTING…" : `▶ ${variant.label}`}
        </button>
      </div>
    );
  }

  if (variant.kind === "end") {
    if (!picking) {
      return (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setPicking(true)}
            className="flex-1 py-3 rounded-xl bg-bg-deep border border-accent-pink/40 text-accent-pink font-bold disabled:opacity-50"
          >
            ⏹ END ROUND
          </button>
        </div>
      );
    }

    const def = CHALLENGES[variant.challenge];
    const anyCompleted = sortedEntries.some((e) => e.completedAt !== null);

    return (
      <div className="mt-3 rounded-xl bg-bg-deep p-3">
        <div className="text-[10px] uppercase tracking-widest opacity-70 mb-2 font-bold">
          pick winner
        </div>
        <div className="flex flex-col gap-2">
          {sortedEntries.map((e, idx) => {
            const isDone = e.completedAt !== null;
            const isRecommended = idx === 0 && isDone;
            const valueLabel = def.formatProgress(e.value, e.threshold);
            return (
              <button
                key={e.team.id}
                type="button"
                disabled={busy}
                onClick={async () => {
                  await run(() => onEnd?.(e.team.id));
                  setPicking(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-xl font-bold disabled:opacity-50 transition-colors ${
                  isRecommended
                    ? "bg-gradient-done ring-2 ring-accent-green"
                    : isDone
                      ? "bg-bg-card border border-accent-green/40"
                      : "bg-bg-card opacity-80"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{e.team.emoji}</span>
                  <span className="flex-1 truncate">{e.team.name}</span>
                  {isRecommended && (
                    <span className="text-[10px] uppercase tracking-widest text-accent-green font-extrabold">
                      🏆 first
                    </span>
                  )}
                </div>
                <div className="text-[11px] opacity-80 mt-0.5 tabular-nums">
                  {isDone
                    ? `✅ finished ${fmtTime(e.completedAt!)}`
                    : valueLabel}
                </div>
              </button>
            );
          })}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              await run(() => onEnd?.(null));
              setPicking(false);
            }}
            className="w-full px-3 py-2 rounded-xl bg-bg-deep border border-white/10 text-sm font-bold opacity-80 disabled:opacity-50"
          >
            🤖 server picks {anyCompleted ? "(first finisher)" : "(highest progress)"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPicking(false)}
            className="text-[11px] opacity-50 underline"
          >
            cancel
          </button>
        </div>
      </div>
    );
  }

  // variant.kind === 'redo'
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => run(onRedo)}
        className="text-xs underline opacity-70 hover:opacity-100 disabled:opacity-30"
      >
        ↻ redo this round
      </button>
    </div>
  );
}
