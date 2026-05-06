// Tilt Maze — small procedural maze generator. Pure logic, no DOM. Used by
// components/challenge/TiltMazeView.tsx to seed each level.
//
// Algorithm: recursive backtracking on a w×h grid. Each cell starts with all
// four walls; DFS removes the wall between adjacent cells, guaranteeing a
// single path between any two cells (a "perfect" maze).
//
// Coordinates: cell (cx, cy) where cx ∈ [0..w), cy ∈ [0..h). Walls are stored
// as four booleans per cell (top/right/bottom/left). Render units are abstract
// — the view component picks a pixel size per cell.

export interface MazeCell {
  walls: { top: boolean; right: boolean; bottom: boolean; left: boolean };
}

export interface Maze {
  width: number;
  height: number;
  cells: MazeCell[]; // row-major: index = cy * width + cx
  start: { cx: number; cy: number };
  goal: { cx: number; cy: number };
}

function cellIndex(w: number, cx: number, cy: number): number {
  return cy * w + cx;
}

export function generateMaze(width: number, height: number): Maze {
  const cells: MazeCell[] = [];
  for (let i = 0; i < width * height; i++) {
    cells.push({
      walls: { top: true, right: true, bottom: true, left: true },
    });
  }

  const visited = new Array<boolean>(width * height).fill(false);
  const stack: Array<{ cx: number; cy: number }> = [];
  const startCx = 0;
  const startCy = 0;
  stack.push({ cx: startCx, cy: startCy });
  visited[cellIndex(width, startCx, startCy)] = true;

  while (stack.length > 0) {
    const cur = stack[stack.length - 1];
    const neighbors: Array<{
      cx: number;
      cy: number;
      dir: "top" | "right" | "bottom" | "left";
    }> = [];
    if (cur.cy > 0 && !visited[cellIndex(width, cur.cx, cur.cy - 1)]) {
      neighbors.push({ cx: cur.cx, cy: cur.cy - 1, dir: "top" });
    }
    if (
      cur.cx < width - 1 &&
      !visited[cellIndex(width, cur.cx + 1, cur.cy)]
    ) {
      neighbors.push({ cx: cur.cx + 1, cy: cur.cy, dir: "right" });
    }
    if (
      cur.cy < height - 1 &&
      !visited[cellIndex(width, cur.cx, cur.cy + 1)]
    ) {
      neighbors.push({ cx: cur.cx, cy: cur.cy + 1, dir: "bottom" });
    }
    if (cur.cx > 0 && !visited[cellIndex(width, cur.cx - 1, cur.cy)]) {
      neighbors.push({ cx: cur.cx - 1, cy: cur.cy, dir: "left" });
    }

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const next = neighbors[Math.floor(Math.random() * neighbors.length)];
    const curCell = cells[cellIndex(width, cur.cx, cur.cy)];
    const nextCell = cells[cellIndex(width, next.cx, next.cy)];
    if (next.dir === "top") {
      curCell.walls.top = false;
      nextCell.walls.bottom = false;
    } else if (next.dir === "right") {
      curCell.walls.right = false;
      nextCell.walls.left = false;
    } else if (next.dir === "bottom") {
      curCell.walls.bottom = false;
      nextCell.walls.top = false;
    } else {
      curCell.walls.left = false;
      nextCell.walls.right = false;
    }
    visited[cellIndex(width, next.cx, next.cy)] = true;
    stack.push({ cx: next.cx, cy: next.cy });
  }

  return {
    width,
    height,
    cells,
    start: { cx: 0, cy: 0 },
    goal: { cx: width - 1, cy: height - 1 },
  };
}

export function getCell(maze: Maze, cx: number, cy: number): MazeCell | null {
  if (cx < 0 || cy < 0 || cx >= maze.width || cy >= maze.height) return null;
  return maze.cells[cellIndex(maze.width, cx, cy)];
}
