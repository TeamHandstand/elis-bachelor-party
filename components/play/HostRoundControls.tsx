"use client";

import { useMemo, useState } from "react";
import type { ChallengeId, Player, Team } from "@/lib/types";
import { CHALLENGES } from "@/lib/challenges";

export interface EndPickerEntry {
  team: Team;
  completedAt: number | null;
  value: number;
  threshold: number;
  players?: Player[]; // teammates on this team — shown in the picker
  // For 'north': individual angular errors so the picker can rank by avg.
  guesses?: Array<{ playerId: string; errorDeg: number }>;
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

type Pending =
  | { kind: "team"; teamId: string; label: string }
  | { kind: "server" };

export function HostRoundControls({ variant, onStart, onEnd, onRedo }: Props) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  async function run(fn?: () => Promise<void> | void) {
    if (!fn || busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  // Sort entries: north uses smallest-avg-error, others use earliest completion.
  const sortedEntries = useMemo(() => {
    if (variant.kind !== "end") return [] as EndPickerEntry[];
    if (variant.challenge === "north") {
      return [...variant.entries].sort((a, b) => {
        const ag = a.guesses?.length ?? 0;
        const bg = b.guesses?.length ?? 0;
        if ((ag > 0) !== (bg > 0)) return ag > 0 ? -1 : 1;
        if (ag === 0 && bg === 0) return 0;
        const aAvg =
          (a.guesses ?? []).reduce((s, g) => s + g.errorDeg, 0) /
          Math.max(1, ag);
        const bAvg =
          (b.guesses ?? []).reduce((s, g) => s + g.errorDeg, 0) /
          Math.max(1, bg);
        return aAvg - bAvg;
      });
    }
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
            onClick={() => {
              setPicking(true);
              setPending(null);
            }}
            className="flex-1 py-3 rounded-xl bg-bg-deep border border-accent-pink/40 text-accent-pink font-bold disabled:opacity-50"
          >
            ⏹ END ROUND
          </button>
        </div>
      );
    }

    const def = CHALLENGES[variant.challenge];
    const anyCompleted = sortedEntries.some((e) => e.completedAt !== null);

    function cancel() {
      setPicking(false);
      setPending(null);
    }

    async function confirm() {
      if (!pending || busy) return;
      let winnerId: string | null = null;
      if (pending.kind === "team") {
        winnerId = pending.teamId;
      } else if (
        pending.kind === "server" &&
        variant.kind === "end" &&
        variant.challenge === "north" &&
        sortedEntries[0]?.guesses?.length
      ) {
        // Server can't compute avg-error (no guess data persisted server-side).
        // Resolve client-side: top of sortedEntries is the lowest-avg team.
        winnerId = sortedEntries[0].team.id;
      }
      await run(() => onEnd?.(winnerId));
      setPending(null);
      setPicking(false);
    }

    const isNorthVariant = variant.challenge === "north";
    const pendingLabel =
      pending?.kind === "team"
        ? pending.label
        : pending?.kind === "server"
          ? isNorthVariant
            ? "smallest avg error"
            : anyCompleted
              ? "first finisher"
              : "highest progress"
          : null;

    return (
      <div className="mt-3 rounded-2xl bg-bg-deep p-3 ring-1 ring-white/10">
        <div className="text-[11px] uppercase tracking-widest text-accent-orange mb-2 font-extrabold">
          ⏹ end round · pick winner
        </div>
        <div className="flex flex-col gap-2">
          {sortedEntries.map((e, idx) => {
            const isDone = e.completedAt !== null;
            const isNorth = variant.challenge === "north";
            const guessCount = e.guesses?.length ?? 0;
            const avgErr =
              isNorth && guessCount > 0
                ? (e.guesses ?? []).reduce((s, g) => s + g.errorDeg, 0) /
                  guessCount
                : null;
            const isFirst = idx === 0 && (isNorth ? guessCount > 0 : isDone);
            const valueLabel = isNorth
              ? guessCount === 0
                ? "no guesses"
                : `${avgErr!.toFixed(0)}° avg · ${guessCount} guess${
                    guessCount === 1 ? "" : "es"
                  }`
              : def.formatProgress(e.value, e.threshold);
            const isSelected =
              pending?.kind === "team" && pending.teamId === e.team.id;
            return (
              <button
                key={e.team.id}
                type="button"
                disabled={busy}
                onClick={() =>
                  setPending({
                    kind: "team",
                    teamId: e.team.id,
                    label: `${e.team.emoji} ${e.team.name}`,
                  })
                }
                className={`w-full text-left px-3 py-3 rounded-xl font-bold disabled:opacity-50 transition-all ${
                  isSelected
                    ? "bg-bg-card ring-2 ring-accent-orange shadow-[0_0_18px_rgba(255,140,66,0.35)]"
                    : "bg-bg-card border border-white/10"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{e.team.emoji}</span>
                  <span className="flex-1 truncate">{e.team.name}</span>
                  {isFirst && !isSelected && (
                    <span className="text-[10px] uppercase tracking-widest opacity-70 font-extrabold">
                      🏆 {isNorth ? "best avg" : "first"}
                    </span>
                  )}
                  {isSelected && (
                    <span className="text-[11px] uppercase tracking-widest font-extrabold text-accent-orange">
                      ✓ selected
                    </span>
                  )}
                </div>
                <div className="text-[11px] opacity-90 mt-0.5 tabular-nums">
                  {isNorth
                    ? valueLabel
                    : isDone
                      ? `✅ finished ${fmtTime(e.completedAt!)}`
                      : valueLabel}
                </div>
                {e.players && e.players.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {e.players.map((p) => (
                      <span
                        key={p.id}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-black/30 border border-white/10"
                      >
                        {p.name}
                      </span>
                    ))}
                  </div>
                )}
                {(!e.players || e.players.length === 0) && (
                  <div className="mt-1 text-[10px] opacity-50 italic">
                    no players on this team
                  </div>
                )}
              </button>
            );
          })}
          <button
            type="button"
            disabled={busy}
            onClick={() => setPending({ kind: "server" })}
            className={`w-full px-3 py-3 rounded-xl text-sm font-bold disabled:opacity-50 transition-all ${
              pending?.kind === "server"
                ? "bg-gradient-party ring-2 ring-white"
                : "bg-bg-card border border-white/10"
            }`}
          >
            🤖 let server pick{" "}
            {isNorthVariant
              ? "(smallest avg error)"
              : anyCompleted
                ? "(first finisher)"
                : "(highest progress)"}
            {pending?.kind === "server" && (
              <span className="ml-2 text-[11px] uppercase tracking-widest font-extrabold">
                ✓
              </span>
            )}
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={!pending || busy}
            className="w-full py-4 rounded-2xl bg-gradient-done font-display text-base font-extrabold tracking-widest disabled:opacity-40 disabled:bg-bg-card"
          >
            {busy
              ? "ENDING…"
              : pending
                ? `✓ CONFIRM · ${pendingLabel}`
                : "PICK A WINNER ABOVE"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="w-full py-3 rounded-2xl bg-bg-card border-2 border-white/30 font-display text-base font-extrabold tracking-widest disabled:opacity-50"
          >
            ✕ CANCEL
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
        className="w-full py-3 rounded-xl bg-bg-deep border border-white/20 text-sm font-bold tracking-widest disabled:opacity-50"
      >
        {busy ? "RESTARTING…" : "↻ REDO THIS ROUND"}
      </button>
    </div>
  );
}
