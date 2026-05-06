"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToastyStore } from "@/lib/store";
import { usePublisher } from "@/lib/store/bootstrap";
import { CHALLENGES } from "@/lib/challenges";
import {
  requestOrientationPermission,
  subscribeOrientation,
} from "@/lib/sensors/orientation";
import { generateMaze, getCell, type Maze } from "@/lib/challenges/tilt-maze";
import { PermissionGate } from "@/components/permissions/PermissionGate";

interface Props {
  code: string;
  myPlayerId: string;
  roundIndex: number;
}

const MAZE_W = 6;
const MAZE_H = 9;
const CELL_PX = 44; // rendered cell size
const BALL_R = 12; // ball radius in px
const WALL = 3; // wall stroke px (must match SVG strokeWidth)
const FRICTION = 0.92;
const GRAVITY_SCALE = 0.012; // px / ms² per degree of tilt
const MAX_TILT = 30; // clamp degrees so ball isn't insane

export function TiltMazeView(props: Props) {
  return (
    <PermissionGate
      icon="📳"
      label="MOTION"
      blurb="We need your phone's tilt sensor to roll the marble. Hit ENABLE and say YES."
      request={requestOrientationPermission}
      iosSetting="Motion & Orientation Access"
    >
      <TiltMazeChallenge {...props} />
    </PermissionGate>
  );
}

function TiltMazeChallenge({ code, myPlayerId, roundIndex }: Props) {
  const publisher = usePublisher(code);
  const myTeamId = useToastyStore((s) => s.myTeamId);
  const myProgress = useToastyStore((s) => s.getMyTeamProgress());
  const event = useToastyStore((s) => s.event);

  const def = CHALLENGES["tilt-maze"];
  const threshold =
    event?.rounds[roundIndex]?.threshold ?? def.defaultThreshold;
  const teamCompleted = !!myProgress?.[roundIndex]?.completed;

  const [maze, setMaze] = useState<Maze>(() => generateMaze(MAZE_W, MAZE_H));
  const [showHandoff, setShowHandoff] = useState(false);
  const [myLevels, setMyLevels] = useState(0);
  const [calibrated, setCalibrated] = useState(false);

  // Ball physics — kept in refs so the rAF loop doesn't churn React.
  const ballRef = useRef({
    x: CELL_PX / 2,
    y: CELL_PX / 2,
    vx: 0,
    vy: 0,
  });
  const gravityRef = useRef({ x: 0, y: 0 });
  const baselineRef = useRef<{ beta: number; gamma: number } | null>(null);
  const mazeRef = useRef<Maze>(maze);
  mazeRef.current = maze;
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  // SVG path positions need React updates — sample at ~30Hz.
  const [, setTick] = useState(0);

  // Listen to orientation. First sample is captured as the baseline so the
  // player's natural hand position becomes "level".
  useEffect(() => {
    const unsub = subscribeOrientation(({ beta, gamma }) => {
      if (!baselineRef.current) {
        baselineRef.current = { beta, gamma };
        setCalibrated(true);
      }
      const base = baselineRef.current;
      // Tilting the right edge down (gamma > base) → ball rolls right.
      // Tilting the bottom edge down (beta < base) → ball rolls down.
      const dGamma = clamp(gamma - base.gamma, -MAX_TILT, MAX_TILT);
      const dBeta = clamp(beta - base.beta, -MAX_TILT, MAX_TILT);
      gravityRef.current = {
        x: dGamma * GRAVITY_SCALE,
        // Inverted because lowering the bottom edge (smaller beta delta)
        // should accelerate the ball downward in screen space.
        y: -dBeta * GRAVITY_SCALE,
      };
    });
    return () => {
      unsub();
    };
  }, []);

  // Game loop.
  useEffect(() => {
    if (showHandoff || teamCompleted) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastFrameRef.current = null;
      return;
    }

    const goal = mazeRef.current.goal;
    const goalX = goal.cx * CELL_PX + CELL_PX / 2;
    const goalY = goal.cy * CELL_PX + CELL_PX / 2;

    const step = (now: number) => {
      const last = lastFrameRef.current ?? now;
      const dt = Math.min(40, now - last); // ms
      lastFrameRef.current = now;

      const ball = ballRef.current;
      const g = gravityRef.current;
      ball.vx = (ball.vx + g.x * dt) * FRICTION;
      ball.vy = (ball.vy + g.y * dt) * FRICTION;

      // Substep collision: move in small chunks of ≤ BALL_R/2 px.
      const totalDx = ball.vx * dt;
      const totalDy = ball.vy * dt;
      const steps = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(totalDx), Math.abs(totalDy)) / (BALL_R / 2)),
      );
      const sdx = totalDx / steps;
      const sdy = totalDy / steps;
      for (let s = 0; s < steps; s++) {
        // Try X
        let nx = ball.x + sdx;
        if (collides(nx, ball.y, mazeRef.current)) {
          ball.vx = -ball.vx * 0.2;
          nx = ball.x;
        }
        ball.x = nx;
        // Try Y
        let ny = ball.y + sdy;
        if (collides(ball.x, ny, mazeRef.current)) {
          ball.vy = -ball.vy * 0.2;
          ny = ball.y;
        }
        ball.y = ny;
      }

      // Goal check — ball center within goal cell radius.
      const dxg = ball.x - goalX;
      const dyg = ball.y - goalY;
      if (dxg * dxg + dyg * dyg < (CELL_PX * 0.35) ** 2) {
        // Cleared — credit and switch to handoff. Avoid double-fire.
        rafRef.current = null;
        lastFrameRef.current = null;
        const ts = Date.now();
        if (myTeamId) {
          publisher({
            kind: "progress",
            playerId: myPlayerId,
            teamId: myTeamId,
            roundIndex,
            challenge: "tilt-maze",
            delta: 1,
            ts,
          }).catch(() => {});
        }
        setMyLevels((c) => c + 1);
        setShowHandoff(true);
        return;
      }

      setTick((t) => (t + 1) % 1_000_000);
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastFrameRef.current = null;
    };
  }, [maze, showHandoff, teamCompleted, myPlayerId, myTeamId, publisher, roundIndex]);

  const teamLevels = Math.floor(myProgress?.[roundIndex]?.value ?? 0);

  const cells = useMemo(() => {
    // Pre-compute the wall segments for SVG. Avoids a per-frame re-walk.
    const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    const m = maze;
    for (let cy = 0; cy < m.height; cy++) {
      for (let cx = 0; cx < m.width; cx++) {
        const cell = getCell(m, cx, cy);
        if (!cell) continue;
        const x = cx * CELL_PX;
        const y = cy * CELL_PX;
        if (cell.walls.top)
          segs.push({ x1: x, y1: y, x2: x + CELL_PX, y2: y });
        if (cell.walls.left)
          segs.push({ x1: x, y1: y, x2: x, y2: y + CELL_PX });
        // Only draw bottom/right walls on the boundary or where there's no
        // shared neighbor — the neighbor's top/left already covers interior.
        if (cy === m.height - 1 && cell.walls.bottom)
          segs.push({
            x1: x,
            y1: y + CELL_PX,
            x2: x + CELL_PX,
            y2: y + CELL_PX,
          });
        if (cx === m.width - 1 && cell.walls.right)
          segs.push({
            x1: x + CELL_PX,
            y1: y,
            x2: x + CELL_PX,
            y2: y + CELL_PX,
          });
      }
    }
    return segs;
  }, [maze]);

  function nextLevel() {
    const fresh = generateMaze(MAZE_W, MAZE_H);
    setMaze(fresh);
    ballRef.current = { x: CELL_PX / 2, y: CELL_PX / 2, vx: 0, vy: 0 };
    setShowHandoff(false);
  }

  return (
    <div className="flex flex-col flex-1 items-center px-3 pt-3 pb-4">
      <div className="text-center mb-2">
        <div className="text-xs uppercase tracking-widest opacity-60">
          team progress
        </div>
        <div className="font-display text-3xl font-extrabold tabular-nums">
          {teamLevels} / {threshold}
          <span className="text-sm opacity-60 ml-1">levels</span>
        </div>
        <div className="text-[11px] opacity-60 mt-0.5">
          you cleared {myLevels} this round
        </div>
      </div>

      <div className="relative bg-bg-card rounded-2xl p-3 shadow-lg">
        <svg
          width={MAZE_W * CELL_PX}
          height={MAZE_H * CELL_PX}
          className="block"
          aria-label="tilt maze"
        >
          {/* Goal cell tint */}
          <rect
            x={maze.goal.cx * CELL_PX + 2}
            y={maze.goal.cy * CELL_PX + 2}
            width={CELL_PX - 4}
            height={CELL_PX - 4}
            rx={6}
            fill="#ff7a3d"
            opacity={0.35}
          />
          {/* Walls */}
          {cells.map((s, i) => (
            <line
              key={i}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke="#ffffff"
              strokeOpacity={0.85}
              strokeWidth={WALL}
              strokeLinecap="round"
            />
          ))}
          {/* Ball */}
          <circle
            cx={ballRef.current.x}
            cy={ballRef.current.y}
            r={BALL_R}
            fill="url(#ballGrad)"
            stroke="#fff"
            strokeWidth={1.5}
            strokeOpacity={0.9}
          />
          <defs>
            <radialGradient id="ballGrad" cx="35%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#ffe5c2" />
              <stop offset="100%" stopColor="#ff5d96" />
            </radialGradient>
          </defs>
        </svg>

        {!calibrated && (
          <div className="absolute inset-0 rounded-2xl flex items-center justify-center bg-bg-deep/85 text-center text-sm font-bold p-4">
            tilt your phone to wake the marble…
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          baselineRef.current = null;
          setCalibrated(false);
        }}
        className="mt-3 px-3 py-1.5 rounded-lg bg-bg-card border border-white/10 text-[11px] font-bold opacity-80 hover:opacity-100"
      >
        ↺ recalibrate level
      </button>

      {showHandoff && (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center text-center bg-bg/90 backdrop-blur-sm p-6">
          <div className="text-7xl mb-4 animate-bounce">📲</div>
          <div className="font-display text-3xl font-extrabold tracking-wide mb-2 text-accent-orange">
            PASS THE PHONE!
          </div>
          <div className="text-sm opacity-80 max-w-xs">
            level cleared — hand it to the next teammate, then tap below
          </div>
          <button
            type="button"
            onClick={nextLevel}
            className="mt-6 px-6 py-3 rounded-2xl bg-gradient-party font-extrabold text-lg"
          >
            START NEXT MAZE →
          </button>
        </div>
      )}

      {teamCompleted && (
        <div className="mt-4 text-sm font-bold text-accent-orange">
          DONE — your team cleared {threshold} mazes 🎉
        </div>
      )}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Returns true if a ball of radius BALL_R centered at (x, y) overlaps any
// wall in the maze.
function collides(x: number, y: number, maze: Maze): boolean {
  // Bounds — clamp to maze rect.
  if (x - BALL_R < 0 || y - BALL_R < 0) return true;
  if (x + BALL_R > maze.width * CELL_PX) return true;
  if (y + BALL_R > maze.height * CELL_PX) return true;

  // Cells the ball might overlap — at most a 2×2 cluster.
  const minCx = Math.max(0, Math.floor((x - BALL_R) / CELL_PX));
  const maxCx = Math.min(maze.width - 1, Math.floor((x + BALL_R) / CELL_PX));
  const minCy = Math.max(0, Math.floor((y - BALL_R) / CELL_PX));
  const maxCy = Math.min(maze.height - 1, Math.floor((y + BALL_R) / CELL_PX));

  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const cell = getCell(maze, cx, cy);
      if (!cell) continue;
      const left = cx * CELL_PX;
      const top = cy * CELL_PX;
      const right = left + CELL_PX;
      const bottom = top + CELL_PX;
      // Effective wall thickness: half the stroke pads inward to keep the
      // ball visually inside the channel.
      const t = WALL / 2;
      if (cell.walls.top && circleHitsSeg(x, y, left, top, right, top, t))
        return true;
      if (cell.walls.bottom && circleHitsSeg(x, y, left, bottom, right, bottom, t))
        return true;
      if (cell.walls.left && circleHitsSeg(x, y, left, top, left, bottom, t))
        return true;
      if (cell.walls.right && circleHitsSeg(x, y, right, top, right, bottom, t))
        return true;
    }
  }
  return false;
}

// Distance from circle (cx, cy, BALL_R) to line segment expanded by `pad`.
function circleHitsSeg(
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pad: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = ((cx - x1) * dx + (cy - y1) * dy) / (lenSq || 1);
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  const ddx = cx - px;
  const ddy = cy - py;
  const distSq = ddx * ddx + ddy * ddy;
  const r = BALL_R + pad;
  return distSq < r * r;
}
