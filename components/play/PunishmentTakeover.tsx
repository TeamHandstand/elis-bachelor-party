"use client";

import { useEffect, useState } from "react";
import type { Team } from "@/lib/types";

interface Props {
  message: string;
  // The team in last place. `null` when no rounds have been decided yet, or
  // when teams are tied at zero — in that case "everyone drinks".
  losingTeam: Team | null;
  ordinal: number;
  myTeamId: string | null;
  // Host-only: shown at the bottom so the host can mark the punishment done
  // without scrolling. Players see no controls.
  hostControls?: React.ReactNode;
}

/**
 * Fullscreen takeover players see while a punishment round is live. Bright
 * red, hard to ignore — calls out the losing team by name and renders the
 * host-authored punishment text.
 */
export function PunishmentTakeover({
  message,
  losingTeam,
  ordinal,
  myTeamId,
  hostControls,
}: Props) {
  const isMyTeam = !!losingTeam && losingTeam.id === myTeamId;
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setPulse(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      role="dialog"
      aria-label="Punishment round"
      className="fixed inset-0 z-50 overflow-y-auto bg-gradient-to-br from-[#5b0010] via-[#a00020] to-[#1a0006] safe-top safe-bottom"
    >
      <div className="min-h-full flex flex-col items-center justify-center px-5 py-8 text-center">
        <div className="text-[10px] uppercase tracking-[0.4em] text-white/70 mb-2">
          Punishment · Round {ordinal}
        </div>
        <div className="text-7xl sm:text-8xl mb-3 animate-[pulse_1.6s_ease-in-out_infinite]">
          💀
        </div>
        <div className="font-display font-extrabold tracking-widest text-white text-2xl sm:text-3xl uppercase mb-5">
          Punishment Round
        </div>

        {losingTeam ? (
          <div
            className={`rounded-2xl px-5 py-4 mb-5 border-2 transition-all duration-500 ${
              pulse
                ? "scale-105 border-white shadow-[0_0_45px_rgba(255,255,255,0.45)]"
                : "scale-100 border-white/40"
            } bg-black/30 backdrop-blur-sm max-w-md w-full`}
          >
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/70 mb-1">
              Last place
            </div>
            <div className="flex items-center justify-center gap-3">
              <span className="text-5xl">{losingTeam.emoji}</span>
              <span className="font-display font-extrabold tracking-wide text-white text-3xl sm:text-4xl uppercase">
                {losingTeam.name}
              </span>
            </div>
            {isMyTeam ? (
              <div className="mt-2 text-xs uppercase tracking-widest font-extrabold text-yellow-200">
                ☠️ that&rsquo;s you ☠️
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl px-5 py-4 mb-5 border-2 border-white/40 bg-black/30 backdrop-blur-sm max-w-md w-full">
            <div className="font-display font-extrabold tracking-wide text-white text-2xl uppercase">
              Everyone drinks
            </div>
            <div className="text-[11px] opacity-80 mt-1">
              No standings yet — nobody&rsquo;s losing, so everybody loses.
            </div>
          </div>
        )}

        <div className="font-display font-extrabold tracking-wide text-white text-2xl sm:text-4xl leading-tight uppercase max-w-xl">
          {message}
        </div>

        {hostControls ? (
          <div className="mt-8 w-full max-w-md">{hostControls}</div>
        ) : (
          <div className="mt-8 text-[11px] uppercase tracking-widest text-white/60">
            waiting on host…
          </div>
        )}
      </div>
    </div>
  );
}
