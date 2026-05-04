"use client";

import { useState } from "react";
import type { Team } from "@/lib/types";

type Variant =
  | { kind: "start"; label: string }
  | { kind: "end"; teams: Team[] }
  | { kind: "redo" };

interface Props {
  variant: Variant;
  onStart?: () => Promise<void> | void;
  onEnd?: (winnerTeamId: string | null) => Promise<void> | void; // null = server picks
  onRedo?: () => Promise<void> | void;
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
    return (
      <div className="mt-3 rounded-xl bg-bg-deep p-3">
        <div className="text-[10px] uppercase tracking-widest opacity-70 mb-2 font-bold">
          pick winner
        </div>
        <div className="flex flex-col gap-2">
          {variant.teams.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={async () => {
                await run(() => onEnd?.(t.id));
                setPicking(false);
              }}
              className="w-full text-left px-3 py-2 rounded-xl bg-bg-card font-bold disabled:opacity-50"
            >
              {t.emoji} {t.name}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              await run(() => onEnd?.(null));
              setPicking(false);
            }}
            className="w-full px-3 py-2 rounded-xl bg-bg-deep border border-white/10 text-sm font-bold opacity-80 disabled:opacity-50"
          >
            🤖 auto (server picks)
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
