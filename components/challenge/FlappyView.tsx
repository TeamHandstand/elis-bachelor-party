"use client";

import { useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";
import { DbMeter } from "@/lib/sensors/db-meter";
import { PermissionGate } from "@/components/permissions/PermissionGate";
import { FLAPPY_CONFIG } from "./flappy-config";

interface Props {
  code: string;
  myPlayerId: string;
  roundIndex: number;
}

// Map a dB reading to an upward velocity boost. Below threshold → 0 (no
// flap). At saturation → max flap. Linear in between. Velocities are
// negative because canvas Y grows downward.
function flapVelocityForDb(db: number): number {
  const { flapThresholdDb, flapSaturationDb, flapVelocityMin, flapVelocityMax } =
    FLAPPY_CONFIG;
  if (db < flapThresholdDb) return 0;
  const span = flapSaturationDb - flapThresholdDb;
  const t = span <= 0 ? 1 : Math.min(1, (db - flapThresholdDb) / span);
  return flapVelocityMin + (flapVelocityMax - flapVelocityMin) * t;
}

interface Pipe {
  x: number; // left edge in world units (canvas coords)
  gapY: number; // top of gap in canvas coords
  scored: boolean;
}

type GameState = "alive" | "dying" | "cooldown";

export function FlappyView(props: Props) {
  const sensorRef = useRef<DbMeter | null>(null);
  if (!sensorRef.current) sensorRef.current = new DbMeter();
  return (
    <PermissionGate
      icon="🎤"
      label="MIC"
      blurb="We need your phone's mic — yelling is how the bird flies. Hit ENABLE and say YES."
      request={() => sensorRef.current!.requestPermission()}
      iosSetting="Microphone"
      requireUserGesture
    >
      <FlappyChallenge {...props} sensor={sensorRef.current} />
    </PermissionGate>
  );
}

function FlappyChallenge({
  code,
  myPlayerId,
  roundIndex,
  sensor,
}: Props & { sensor: DbMeter }) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const event = useToastyStore((s) => s.event);

  const def = CHALLENGES.flappy;
  const threshold =
    event?.rounds[roundIndex]?.threshold ?? def.defaultThreshold;
  const teamMeters = (myProgress?.[roundIndex]?.value ?? 0) as number;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Live UI state — kept lightweight; the heavy game state lives in refs to
  // avoid React re-renders inside the rAF loop.
  const [hud, setHud] = useState<{
    state: GameState;
    cooldownLeft: number;
    db: number;
    myMeters: number;
  }>({ state: "alive", cooldownLeft: 0, db: 0, myMeters: 0 });

  // ---------- mic ----------
  const dbRef = useRef(0);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      // PermissionGate already opened the mic.
      if (cancelled) return;
      unsub = await sensor.start((level) => {
        dbRef.current = level;
      });
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [sensor]);

  // ---------- canvas size ----------
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
    return () => ro.disconnect();
  }, []);

  // ---------- game loop ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !myTeamId) return;
    if (size.w === 0 || size.h === 0) return;
    const cfg = FLAPPY_CONFIG;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size.w * dpr);
    canvas.height = Math.floor(size.h * dpr);
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;
    ctx.scale(dpr, dpr);

    const W = size.w;
    const H = size.h;

    // Game state
    let state: GameState = "alive";
    let cooldownEndAt = 0;
    let birdY = H / 2;
    let birdVy = 0;
    let lastFlapAt = 0;
    let pipes: Pipe[] = [];
    let scrollPx = 0;
    let unpublishedM = 0; // meters earned but not yet published
    let myMeters = 0; // total meters this player has earned this round
    let lastTs = performance.now();
    let lastPublishAt = lastTs;
    let raf = 0;

    function spawnPipe(targetX: number) {
      const minGapTop = cfg.pipeMinGapTop;
      const maxGapTop = Math.max(
        minGapTop + 1,
        H - cfg.pipeGap - cfg.pipeBottomMargin,
      );
      const gapY = minGapTop + Math.random() * (maxGapTop - minGapTop);
      pipes.push({ x: targetX, gapY, scored: false });
    }

    // Seed first few pipes off-screen to the right.
    spawnPipe(W + 80);
    spawnPipe(W + 80 + cfg.pipeSpacingPx);
    spawnPipe(W + 80 + cfg.pipeSpacingPx * 2);

    function reset() {
      state = "alive";
      birdY = H / 2;
      birdVy = 0;
      pipes = [];
      spawnPipe(W + 80);
      spawnPipe(W + 80 + cfg.pipeSpacingPx);
      spawnPipe(W + 80 + cfg.pipeSpacingPx * 2);
    }

    function die() {
      state = "cooldown";
      cooldownEndAt = performance.now() + cfg.cooldownMs;
    }

    function flush(force: boolean) {
      if (!myTeamId) return;
      if (unpublishedM <= 0) return;
      if (!force && unpublishedM < cfg.publishMinDeltaM) return;
      const delta = unpublishedM;
      unpublishedM = 0;
      myMeters += delta;
      publisher({
        kind: "progress",
        playerId: myPlayerId,
        teamId: myTeamId,
        roundIndex,
        challenge: "flappy",
        delta,
        ts: Date.now(),
      }).catch(() => {});
    }

    function step(now: number) {
      const dtRaw = (now - lastTs) / 1000;
      const dt = Math.min(0.05, dtRaw); // clamp tab-stutter spikes
      lastTs = now;

      // ---- update ----
      if (state === "cooldown") {
        if (now >= cooldownEndAt) reset();
      }

      if (state === "alive") {
        // Volume-modulated flap. The flap fires when the player is loud
        // enough AND the per-flap cooldown has elapsed; the *size* of the
        // flap (the Vy boost) scales with how loud they are at flap time.
        // A whisper-yell nudges the bird; a full scream sends it to the
        // ceiling.
        const db = dbRef.current;
        if (db >= cfg.flapThresholdDb && now - lastFlapAt >= cfg.flapCooldownMs) {
          const vy = flapVelocityForDb(db);
          // Take whichever is more upward — so a partial flap during an
          // already-rising bird doesn't damp it.
          birdVy = Math.min(birdVy, vy);
          lastFlapAt = now;
        }
        birdVy += cfg.gravity * dt;
        birdY += birdVy * dt;

        // World scroll — credits meters only while alive.
        const scrollDelta = cfg.worldSpeed * dt;
        scrollPx += scrollDelta;
        unpublishedM += scrollDelta / cfg.pxPerMeter;

        // Move pipes left. (Pipes carry world coords; we draw with x as-is
        // since the camera is fixed at scrollPx.)
        for (const p of pipes) p.x -= scrollDelta;

        // Spawn new pipes ahead.
        while (
          pipes.length === 0 ||
          pipes[pipes.length - 1].x < W + cfg.pipeSpacingPx
        ) {
          const lastX =
            pipes.length > 0 ? pipes[pipes.length - 1].x : W + 80;
          spawnPipe(lastX + cfg.pipeSpacingPx);
        }
        // Drop off-screen pipes.
        pipes = pipes.filter((p) => p.x + cfg.pipeWidth > -10);

        // Collision: out-of-bounds (top/bottom).
        if (birdY < cfg.birdRadius || birdY > H - cfg.birdRadius) {
          die();
          flush(true);
        }

        // Collision: any pipe the bird overlaps with horizontally and is
        // outside the gap vertically.
        for (const p of pipes) {
          const pl = p.x;
          const pr = p.x + cfg.pipeWidth;
          if (cfg.birdX + cfg.birdRadius < pl) continue;
          if (cfg.birdX - cfg.birdRadius > pr) continue;
          const gapTop = p.gapY;
          const gapBot = p.gapY + cfg.pipeGap;
          if (birdY - cfg.birdRadius < gapTop || birdY + cfg.birdRadius > gapBot) {
            die();
            flush(true);
            break;
          }
        }

        // Periodic publish.
        if (now - lastPublishAt >= cfg.publishIntervalMs) {
          lastPublishAt = now;
          flush(false);
        }
      }

      // ---- draw ----
      ctx.clearRect(0, 0, W, H);
      // Sky gradient
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#1e1336");
      grad.addColorStop(1, "#3a1d4f");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Ground stripes for parallax feel.
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      for (let i = 0; i < 6; i++) {
        const y = ((i * 60 + scrollPx * 0.4) % H + H) % H;
        ctx.fillRect(0, y, W, 1);
      }

      // Pipes
      for (const p of pipes) {
        ctx.fillStyle = "#2cd06a";
        ctx.fillRect(p.x, 0, cfg.pipeWidth, p.gapY);
        ctx.fillRect(p.x, p.gapY + cfg.pipeGap, cfg.pipeWidth, H - (p.gapY + cfg.pipeGap));
        // Lip
        ctx.fillStyle = "#1ea655";
        ctx.fillRect(p.x - 2, p.gapY - 12, cfg.pipeWidth + 4, 12);
        ctx.fillRect(p.x - 2, p.gapY + cfg.pipeGap, cfg.pipeWidth + 4, 12);
      }

      // Bird
      ctx.save();
      ctx.translate(cfg.birdX, birdY);
      const tilt = Math.max(-0.5, Math.min(0.8, birdVy / 600));
      ctx.rotate(tilt);
      // body
      ctx.fillStyle = state === "cooldown" ? "#666" : "#ffce4d";
      ctx.beginPath();
      ctx.arc(0, 0, cfg.birdRadius, 0, Math.PI * 2);
      ctx.fill();
      // beak
      ctx.fillStyle = "#ff8c42";
      ctx.beginPath();
      ctx.moveTo(cfg.birdRadius - 2, -2);
      ctx.lineTo(cfg.birdRadius + 8, 0);
      ctx.lineTo(cfg.birdRadius - 2, 4);
      ctx.closePath();
      ctx.fill();
      // eye
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(4, -4, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // HUD update at ~10Hz
      const hudDb = dbRef.current;
      const cooldownLeft =
        state === "cooldown" ? Math.max(0, cooldownEndAt - now) : 0;
      // Throttle React updates so the rAF loop stays cheap.
      if (Math.random() < 0.18) {
        setHud({
          state,
          cooldownLeft,
          db: hudDb,
          myMeters,
        });
      }

      raf = requestAnimationFrame(step);
    }

    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      // Final flush on unmount.
      flush(true);
    };
  }, [size.w, size.h, myPlayerId, myTeamId, publisher, roundIndex]);

  const teamPct = threshold > 0 ? Math.min(100, (teamMeters / threshold) * 100) : 0;
  const cooldownSecs = (hud.cooldownLeft / 1000).toFixed(1);

  return (
    <div className="flex flex-col flex-1 relative">
      <div className="px-4 pt-3 pb-2 text-center">
        <div className="text-[10px] uppercase tracking-[0.3em] opacity-60">
          team total
        </div>
        <div className="font-display text-5xl font-extrabold tabular-nums text-accent-orange leading-none">
          {Math.floor(teamMeters)}
          <span className="text-2xl opacity-70"> / {threshold}m</span>
        </div>
        <div className="w-full h-1.5 bg-bg-card rounded-full mt-2 overflow-hidden">
          <div
            className="h-full bg-gradient-party transition-all"
            style={{ width: `${teamPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2 text-[11px] opacity-70">
          <span>you: {Math.floor(hud.myMeters)}m</span>
          <span
            className={`tabular-nums ${
              hud.db >= FLAPPY_CONFIG.flapThresholdDb
                ? "text-accent-orange font-extrabold"
                : ""
            }`}
          >
            {Math.round(hud.db)} dB · flap @ {FLAPPY_CONFIG.flapThresholdDb}
          </span>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="relative flex-1 mx-3 mb-3 rounded-2xl overflow-hidden bg-bg-deep border border-white/10"
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
        {hud.state === "cooldown" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="text-5xl mb-2">💀</div>
            <div className="font-display text-2xl font-extrabold tracking-widest mb-1">
              SPLAT!
            </div>
            <div className="text-sm opacity-80">
              Respawning in {cooldownSecs}s
            </div>
          </div>
        )}
        <div className="absolute bottom-2 left-0 right-0 text-center text-[11px] opacity-60 px-3 pointer-events-none">
          YELL to flap. Louder = bigger jump (
          {FLAPPY_CONFIG.flapThresholdDb}–{FLAPPY_CONFIG.flapSaturationDb} dB).
        </div>
      </div>
    </div>
  );
}
