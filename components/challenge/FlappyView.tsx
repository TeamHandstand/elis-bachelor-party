"use client";

import { useEffect, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";
import { DbMeter } from "@/lib/sensors/db-meter";
import { PermissionGate } from "@/components/permissions/PermissionGate";

interface Props {
  code: string;
  myPlayerId: string;
  roundIndex: number;
}

// dB threshold above which the bird flaps. Loud-talk territory; teams that
// just chat softly won't accidentally fly. Tuned to roughly the same band as
// the scream challenge, but lower because flapping should feel reactive.
const FLAP_DB = 70;
// World units (px) per second of horizontal scroll.
const WORLD_SPEED = 140;
// Pixels per meter of "distance" credited. Feel: ~1.4 m/s while alive.
const PX_PER_METER = 100;
// Death cooldown before bird respawns, in ms.
const COOLDOWN_MS = 3000;
// Gravity (px/s²) and per-flap upward velocity boost (px/s).
const GRAVITY = 900;
const FLAP_VY = -360;
// Minimum gap between flaps so a sustained yell doesn't pin the bird at the
// ceiling — instead it gets a bounce on/off rhythm.
const FLAP_COOLDOWN_MS = 220;
// Pipe geometry.
const PIPE_WIDTH = 60;
const PIPE_GAP = 170;
const PIPE_SPACING_PX = 280;
// Bird hitbox.
const BIRD_RADIUS = 16;
const BIRD_X = 80;

const PUBLISH_INTERVAL_MS = 500;
const PUBLISH_MIN_DELTA_M = 1;

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
    let nextPipeAtPx = W + 80;
    let scrollPx = 0;
    let unpublishedM = 0; // meters earned but not yet published
    let myMeters = 0; // total meters this player has earned this round
    let lastTs = performance.now();
    let lastPublishAt = lastTs;
    let raf = 0;

    function spawnPipe(targetX: number) {
      const minGapTop = 40;
      const maxGapTop = Math.max(minGapTop + 1, H - PIPE_GAP - 40);
      const gapY = minGapTop + Math.random() * (maxGapTop - minGapTop);
      pipes.push({ x: targetX, gapY, scored: false });
    }

    // Seed first few pipes off-screen to the right.
    spawnPipe(W + 80);
    spawnPipe(W + 80 + PIPE_SPACING_PX);
    spawnPipe(W + 80 + PIPE_SPACING_PX * 2);
    nextPipeAtPx = scrollPx + PIPE_SPACING_PX * 3;

    function reset() {
      state = "alive";
      birdY = H / 2;
      birdVy = 0;
      pipes = [];
      spawnPipe(W + 80);
      spawnPipe(W + 80 + PIPE_SPACING_PX);
      spawnPipe(W + 80 + PIPE_SPACING_PX * 2);
      nextPipeAtPx = scrollPx + PIPE_SPACING_PX * 3;
    }

    function die() {
      state = "cooldown";
      cooldownEndAt = performance.now() + COOLDOWN_MS;
    }

    function flush(force: boolean) {
      if (!myTeamId) return;
      if (unpublishedM <= 0) return;
      if (!force && unpublishedM < PUBLISH_MIN_DELTA_M) return;
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
        // Yelling above threshold gives an upward velocity kick on a cooldown.
        const db = dbRef.current;
        if (db >= FLAP_DB && now - lastFlapAt >= FLAP_COOLDOWN_MS) {
          birdVy = FLAP_VY;
          lastFlapAt = now;
        }
        birdVy += GRAVITY * dt;
        birdY += birdVy * dt;

        // World scroll — credits meters only while alive.
        const scrollDelta = WORLD_SPEED * dt;
        scrollPx += scrollDelta;
        unpublishedM += scrollDelta / PX_PER_METER;

        // Move pipes left. (Pipes carry world coords; we draw with x as-is
        // since the camera is fixed at scrollPx.)
        for (const p of pipes) p.x -= scrollDelta;

        // Spawn new pipes ahead.
        while (
          pipes.length === 0 ||
          pipes[pipes.length - 1].x < W + PIPE_SPACING_PX
        ) {
          const lastX =
            pipes.length > 0 ? pipes[pipes.length - 1].x : W + 80;
          spawnPipe(lastX + PIPE_SPACING_PX);
        }
        // Drop off-screen pipes.
        pipes = pipes.filter((p) => p.x + PIPE_WIDTH > -10);

        // Collision: out-of-bounds (top/bottom).
        if (birdY < BIRD_RADIUS || birdY > H - BIRD_RADIUS) {
          die();
          flush(true);
        }

        // Collision: any pipe the bird overlaps with horizontally and is
        // outside the gap vertically.
        for (const p of pipes) {
          const pl = p.x;
          const pr = p.x + PIPE_WIDTH;
          if (BIRD_X + BIRD_RADIUS < pl) continue;
          if (BIRD_X - BIRD_RADIUS > pr) continue;
          const gapTop = p.gapY;
          const gapBot = p.gapY + PIPE_GAP;
          if (birdY - BIRD_RADIUS < gapTop || birdY + BIRD_RADIUS > gapBot) {
            die();
            flush(true);
            break;
          }
        }

        // Periodic publish.
        if (now - lastPublishAt >= PUBLISH_INTERVAL_MS) {
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
        ctx.fillRect(p.x, 0, PIPE_WIDTH, p.gapY);
        ctx.fillRect(p.x, p.gapY + PIPE_GAP, PIPE_WIDTH, H - (p.gapY + PIPE_GAP));
        // Lip
        ctx.fillStyle = "#1ea655";
        ctx.fillRect(p.x - 2, p.gapY - 12, PIPE_WIDTH + 4, 12);
        ctx.fillRect(p.x - 2, p.gapY + PIPE_GAP, PIPE_WIDTH + 4, 12);
      }

      // Bird
      ctx.save();
      ctx.translate(BIRD_X, birdY);
      const tilt = Math.max(-0.5, Math.min(0.8, birdVy / 600));
      ctx.rotate(tilt);
      // body
      ctx.fillStyle = state === "cooldown" ? "#666" : "#ffce4d";
      ctx.beginPath();
      ctx.arc(0, 0, BIRD_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      // beak
      ctx.fillStyle = "#ff8c42";
      ctx.beginPath();
      ctx.moveTo(BIRD_RADIUS - 2, -2);
      ctx.lineTo(BIRD_RADIUS + 8, 0);
      ctx.lineTo(BIRD_RADIUS - 2, 4);
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
              hud.db >= FLAP_DB ? "text-accent-orange font-extrabold" : ""
            }`}
          >
            {Math.round(hud.db)} dB · flap @ {FLAP_DB}
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
          YELL to flap. Above {FLAP_DB} dB sends the bird up.
        </div>
      </div>
    </div>
  );
}
