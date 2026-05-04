"use client";

import Link from "next/link";
import { CHALLENGES } from "@/lib/challenges";
import type { ChallengeId, ChallengeProgress } from "@/lib/types";

interface Props {
  code: string;
  challenge: ChallengeId;
  progress: ChallengeProgress | null;
  threshold: number;
  active?: boolean;
}

export function ChallengeTile({ code, challenge, progress, threshold, active }: Props) {
  const def = CHALLENGES[challenge];
  const value = progress?.value ?? 0;
  const done = !!progress?.completed;
  const pct =
    threshold > 0
      ? Math.min(100, Math.floor((value / threshold) * 100))
      : 0;

  const base =
    "rounded-2xl p-3 aspect-square flex flex-col justify-between no-select transition-transform active:scale-95";
  const tone = done
    ? "bg-gradient-done text-white"
    : active
      ? "bg-bg-card text-white border-2 border-accent-orange shadow-[0_0_24px_rgba(255,140,66,0.35)]"
      : "bg-bg-card text-white";

  return (
    <Link href={`/e/${code}/play/${challenge}`} className={`${base} ${tone}`}>
      <div className="flex justify-between items-start">
        <div className="text-2xl leading-none">{def.emoji}</div>
        {done && (
          <div className="text-[10px] font-extrabold tracking-widest uppercase opacity-90">
            ✓
          </div>
        )}
      </div>
      <div>
        <div className="text-[11px] font-extrabold tracking-wider uppercase leading-tight">
          {def.label}
        </div>
        <div className="text-2xl font-extrabold mt-0.5 font-display">
          {done ? "DONE" : `${pct}%`}
        </div>
      </div>
    </Link>
  );
}
