"use client";

import { useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { useTeammates } from "@/lib/store/selectors";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";

interface Props {
  code: string;
  myPlayerId: string;
  roundIndex: number;
}

type Phase = "idle" | "running" | "submitted";

export function TimeGuessView({ code, myPlayerId, roundIndex }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const event = useToastyStore((s) => s.event);
  const teammates = useTeammates();

  const def = CHALLENGES["time-guess"];
  const targetMs =
    event?.rounds[roundIndex]?.threshold ?? def.defaultThreshold;

  const guesses = myProgress?.[roundIndex]?.guesses ?? [];
  const myGuess = guesses.find((g) => g.playerId === myPlayerId);

  const [phase, setPhase] = useState<Phase>(myGuess ? "submitted" : "idle");
  const startedAtRef = useRef<number | null>(null);
  // Live ticker so the running screen has *some* indication something is
  // happening — but we deliberately DON'T show elapsed seconds (would defeat
  // the point of guessing). Instead a wobble dot animates.
  const [wobble, setWobble] = useState(0);

  useEffect(() => {
    if (phase !== "running") return;
    let raf = 0;
    function tick() {
      setWobble((w) => (w + 1) % 30);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  function startGuessing() {
    if (phase !== "idle" || !myTeamId) return;
    startedAtRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    setPhase("running");
  }

  function stopGuessing() {
    if (phase !== "running" || !myTeamId || startedAtRef.current === null) return;
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = now - startedAtRef.current;
    const deviation = Math.abs(elapsed - targetMs);
    setPhase("submitted");
    publisher({
      kind: "guess",
      playerId: myPlayerId,
      teamId: myTeamId,
      roundIndex,
      challenge: "time-guess",
      errorDeg: deviation, // ms — reused field name from generic guess msg
      ts: Date.now(),
    }).catch(() => {});
  }

  const allGuessed =
    teammates.length > 0 &&
    teammates.every((p) => guesses.some((g) => g.playerId === p.id));

  const seconds = (targetMs / 1000).toFixed(0);

  return (
    <div className="flex flex-col items-center justify-center flex-1 p-6 text-center select-none">
      <div className="text-xs uppercase tracking-widest opacity-70 mb-2">
        Target
      </div>
      <div className="font-display text-5xl font-extrabold tabular-nums">
        {seconds}s
      </div>
      <div className="text-[11px] uppercase tracking-widest opacity-50 mt-1">
        no clocks. no counting out loud. just feel it.
      </div>

      {phase === "idle" && (
        <button
          type="button"
          onClick={startGuessing}
          className="mt-10 w-44 h-44 rounded-full bg-gradient-party font-display text-3xl font-extrabold tracking-widest shadow-[0_0_40px_rgba(255,140,66,0.35)] active:scale-95 transition-transform"
          aria-label="Start the timer"
        >
          GO
        </button>
      )}

      {phase === "running" && (
        <button
          type="button"
          onClick={stopGuessing}
          className="mt-10 w-44 h-44 rounded-full bg-accent-pink text-white font-display text-3xl font-extrabold tracking-widest shadow-[0_0_40px_rgba(232,79,131,0.5)] active:scale-95 transition-transform"
          aria-label="Stop the timer"
        >
          STOP
        </button>
      )}

      {phase === "running" && (
        <div className="mt-8 flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-white/60"
              style={{
                opacity: 0.2 + ((wobble + i * 6) % 30) / 30,
                transform: `translateY(${Math.sin((wobble + i * 5) / 4) * 4}px)`,
              }}
            />
          ))}
        </div>
      )}

      {phase === "submitted" && (
        <div className="mt-8 px-6 py-5 rounded-2xl bg-bg-card w-full max-w-xs">
          <div className="text-xs uppercase tracking-widest opacity-60 mb-1">
            you locked in
          </div>
          <div className="font-display text-base font-extrabold mb-3">
            🤐 deviation hidden until everyone guesses
          </div>
          <div className="space-y-1">
            {teammates.map((p) => {
              const has = guesses.some((g) => g.playerId === p.id);
              const isMe = p.id === myPlayerId;
              return (
                <div
                  key={p.id}
                  className="flex justify-between items-center text-xs py-1"
                >
                  <span className={isMe ? "font-bold" : ""}>
                    {isMe ? "you" : p.name}
                  </span>
                  <span className="opacity-80">
                    {has ? "🔒 locked in" : "⏳ pending"}
                  </span>
                </div>
              );
            })}
          </div>
          {allGuessed && (
            <div className="mt-4 text-[11px] uppercase tracking-widest opacity-70">
              waiting for the host to crown the winner
            </div>
          )}
        </div>
      )}

      {phase !== "running" && (
        <div className="mt-8 text-xs opacity-60 max-w-xs">
          Tap GO. Wait what feels like {seconds} seconds. Tap STOP. Closest
          team avg wins.
        </div>
      )}
    </div>
  );
}
