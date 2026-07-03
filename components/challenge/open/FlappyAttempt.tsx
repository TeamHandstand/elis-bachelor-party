"use client";

// Open Play "Scream Bird": 3 lives. Yell to flap, dodge pipes; each life ends on
// a crash, and the meters from all 3 lives are summed into the final score.
// Reuses FLAPPY_CONFIG + the DbMeter mic sensor (kept alive across lives so it
// doesn't re-prompt), but standalone — no team store / PubNub.

import { useEffect, useRef, useState } from "react";
import { DbMeter } from "@/lib/sensors/db-meter";
import { FLAPPY_CONFIG } from "@/components/challenge/flappy-config";
import GameIntro from "@/components/challenge/open/GameIntro";
import { OPEN_GAMES } from "@/lib/challenges";

type Phase = "idle" | "playing" | "between" | "done";

const LIVES = 3;

function flapVelocityForDb(db: number): number {
  const { flapThresholdDb, flapSaturationDb, flapVelocityMin, flapVelocityMax } =
    FLAPPY_CONFIG;
  if (db < flapThresholdDb) return 0;
  const span = flapSaturationDb - flapThresholdDb;
  const t = span <= 0 ? 1 : Math.min(1, (db - flapThresholdDb) / span);
  return flapVelocityMin + (flapVelocityMax - flapVelocityMin) * t;
}

interface Pipe {
  x: number;
  gapY: number;
}

export default function FlappyAttempt({
  onSubmit,
}: {
  onSubmit: (score: number, meta?: Record<string, unknown>) => Promise<void> | void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [meters, setMeters] = useState(0); // current life
  const [db, setDb] = useState(0);
  const [livesUsed, setLivesUsed] = useState(0);
  const [lifeMeters, setLifeMeters] = useState(0); // just-finished life
  const [total, setTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensorRef = useRef<DbMeter | null>(null);
  const micUnsubRef = useRef<(() => void) | null>(null);
  const dbRef = useRef(0);
  const totalRef = useRef(0);
  const livesUsedRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  if (!sensorRef.current) sensorRef.current = new DbMeter();

  // Tear down the mic on unmount.
  useEffect(() => {
    return () => {
      micUnsubRef.current?.();
      micUnsubRef.current = null;
    };
  }, []);

  // Measure play area while playing.
  useEffect(() => {
    if (phase !== "playing" || !wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
    return () => ro.disconnect();
  }, [phase]);

  // One life of the game loop.
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;
    const cfg = FLAPPY_CONFIG;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size.w * dpr);
    canvas.height = Math.floor(size.h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const W = size.w;
    const H = size.h;

    let birdY = H / 2;
    let birdVy = 0;
    let lastFlapAt = 0;
    let pipes: Pipe[] = [];
    let scrollPx = 0;
    let metersRun = 0;
    let ended = false;
    let lastTs = performance.now();
    let raf = 0;
    let lastHud = 0;

    function spawnPipe(targetX: number) {
      const minGapTop = cfg.pipeMinGapTop;
      const maxGapTop = Math.max(minGapTop + 1, H - cfg.pipeGap - cfg.pipeBottomMargin);
      const gapY = minGapTop + Math.random() * (maxGapTop - minGapTop);
      pipes.push({ x: targetX, gapY });
    }
    spawnPipe(W + 80);
    spawnPipe(W + 80 + cfg.pipeSpacingPx);
    spawnPipe(W + 80 + cfg.pipeSpacingPx * 2);

    function finish() {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      const life = Math.floor(metersRun);
      totalRef.current += life;
      livesUsedRef.current += 1;
      setLifeMeters(life);
      setTotal(totalRef.current);
      setLivesUsed(livesUsedRef.current);
      if (livesUsedRef.current >= LIVES) setPhase("done");
      else setPhase("between");
    }

    function step(now: number) {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      const curDb = dbRef.current;
      if (curDb >= cfg.flapThresholdDb && now - lastFlapAt >= cfg.flapCooldownMs) {
        birdVy = Math.min(birdVy, flapVelocityForDb(curDb));
        lastFlapAt = now;
      }
      birdVy += cfg.gravity * dt;
      birdY += birdVy * dt;

      const scrollDelta = cfg.worldSpeed * dt;
      scrollPx += scrollDelta;
      metersRun += scrollDelta / cfg.pxPerMeter;
      for (const p of pipes) p.x -= scrollDelta;
      while (pipes.length === 0 || pipes[pipes.length - 1].x < W + cfg.pipeSpacingPx) {
        const lastX = pipes.length > 0 ? pipes[pipes.length - 1].x : W + 80;
        spawnPipe(lastX + cfg.pipeSpacingPx);
      }
      pipes = pipes.filter((p) => p.x + cfg.pipeWidth > -10);

      if (birdY < cfg.birdRadius || birdY > H - cfg.birdRadius) {
        draw();
        finish();
        return;
      }
      for (const p of pipes) {
        if (cfg.birdX + cfg.birdRadius < p.x) continue;
        if (cfg.birdX - cfg.birdRadius > p.x + cfg.pipeWidth) continue;
        if (birdY - cfg.birdRadius < p.gapY || birdY + cfg.birdRadius > p.gapY + cfg.pipeGap) {
          draw();
          finish();
          return;
        }
      }

      draw();
      if (now - lastHud > 100) {
        lastHud = now;
        setMeters(Math.floor(metersRun));
        setDb(curDb);
      }
      raf = requestAnimationFrame(step);
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#1e1336");
      grad.addColorStop(1, "#3a1d4f");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      for (let i = 0; i < 6; i++) {
        const y = ((i * 60 + scrollPx * 0.4) % H + H) % H;
        ctx.fillRect(0, y, W, 1);
      }
      for (const p of pipes) {
        ctx.fillStyle = "#2cd06a";
        ctx.fillRect(p.x, 0, cfg.pipeWidth, p.gapY);
        ctx.fillRect(p.x, p.gapY + cfg.pipeGap, cfg.pipeWidth, H - (p.gapY + cfg.pipeGap));
        ctx.fillStyle = "#1ea655";
        ctx.fillRect(p.x - 2, p.gapY - 12, cfg.pipeWidth + 4, 12);
        ctx.fillRect(p.x - 2, p.gapY + cfg.pipeGap, cfg.pipeWidth + 4, 12);
      }
      ctx.save();
      ctx.translate(cfg.birdX, birdY);
      ctx.rotate(Math.max(-0.5, Math.min(0.8, birdVy / 600)));
      ctx.fillStyle = "#ffce4d";
      ctx.beginPath();
      ctx.arc(0, 0, cfg.birdRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff8c42";
      ctx.beginPath();
      ctx.moveTo(cfg.birdRadius - 2, -2);
      ctx.lineTo(cfg.birdRadius + 8, 0);
      ctx.lineTo(cfg.birdRadius - 2, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(4, -4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    setMeters(0);
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [phase, size.w, size.h]);

  async function begin() {
    setError(null);
    const ok = await sensorRef.current!.requestPermission().catch(() => false);
    if (!ok) {
      setError("Mic access denied — yelling is how the bird flies. Enable it and retry.");
      return;
    }
    // Keep one mic stream alive for all 3 lives.
    micUnsubRef.current = await sensorRef.current!.start((level) => {
      dbRef.current = level;
    });
    totalRef.current = 0;
    livesUsedRef.current = 0;
    setTotal(0);
    setLivesUsed(0);
    setMeters(0);
    setPhase("playing");
  }

  function nextLife() {
    setMeters(0);
    setPhase("playing");
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    micUnsubRef.current?.();
    micUnsubRef.current = null;
    try {
      await onSubmit(totalRef.current, { lives: LIVES });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t submit.");
      setSubmitting(false);
    }
  }

  const livesLeft = LIVES - livesUsed;

  if (phase === "idle") {
    return (
      <div className="flex flex-col gap-4">
        <GameIntro
          emoji="🐦"
          title="Scream Bird"
          blurb={OPEN_GAMES.flappy!.instruction}
          steps={OPEN_GAMES.flappy!.howTo}
          onStart={begin}
          startLabel="START LIFE 1"
          footer="3 lives — your meters add up. Find a room where you can be loud."
        />
        {error && <div className="text-accent-pink text-sm text-center">{error}</div>}
      </div>
    );
  }

  if (phase === "between") {
    return (
      <div className="rounded-2xl bg-bg-card p-6 flex flex-col gap-4 text-center">
        <div className="text-5xl">💀</div>
        <div className="text-xs uppercase tracking-widest opacity-60">
          life {livesUsed} down · you flew
        </div>
        <div className="font-display text-4xl font-extrabold">{lifeMeters}m</div>
        <div className="flex items-center justify-center gap-4 text-sm">
          <span className="opacity-70">
            total so far: <b className="text-accent-orange">{total}m</b>
          </span>
          <span className="opacity-70">
            lives left: <b>{"🐦".repeat(livesLeft)}</b>
          </span>
        </div>
        <button
          type="button"
          onClick={nextLife}
          className="w-full py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest"
        >
          START LIFE {livesUsed + 1} ▶
        </button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="rounded-2xl bg-bg-card p-6 flex flex-col gap-5 text-center">
        <div className="text-5xl">🏁</div>
        <div className="text-xs uppercase tracking-widest opacity-60">
          all 3 lives done · total distance
        </div>
        <div className="font-display text-5xl font-extrabold text-accent-orange">
          {total}m
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full py-4 rounded-2xl bg-gradient-party font-display text-xl font-extrabold tracking-widest disabled:opacity-50"
        >
          {submitting ? "SAVING…" : "SUBMIT 🔒"}
        </button>
        <div className="text-[11px] opacity-50">This locks in your total.</div>
        {error && <div className="text-accent-pink text-sm">{error}</div>}
      </div>
    );
  }

  // phase === "playing"
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="text-sm">
          life <b>{livesUsed + 1}</b>/{LIVES} · {"🐦".repeat(livesLeft)}
        </div>
        <div className="text-sm opacity-70">
          total: <b className="text-accent-orange">{total + meters}m</b>
        </div>
      </div>
      <div className="text-center pb-2">
        <div className="font-display text-5xl font-extrabold tabular-nums text-accent-orange leading-none">
          {meters}
          <span className="text-2xl opacity-70">m</span>
        </div>
        <div
          className={`text-[11px] tabular-nums mt-1 ${
            db >= FLAPPY_CONFIG.flapThresholdDb ? "text-accent-orange font-extrabold" : "opacity-70"
          }`}
        >
          {Math.round(db)} dB · flap @ {FLAPPY_CONFIG.flapThresholdDb}
        </div>
      </div>
      <div
        ref={wrapRef}
        className="relative h-[52vh] rounded-2xl overflow-hidden bg-bg-deep border border-white/10"
      >
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
        <div className="absolute bottom-2 left-0 right-0 text-center text-[11px] opacity-60 px-3 pointer-events-none">
          YELL to flap. Louder = bigger jump.
        </div>
      </div>
    </div>
  );
}
