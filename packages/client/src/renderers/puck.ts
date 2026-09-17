import type { PuckState } from '@arkad/core';
import { MAZE, MAZE_W, MAZE_H } from '@arkad/core';
import { PAL, blink } from '../ui';

const CELL = 8;

const GHOST_COLORS = [PAL.red, PAL.magenta, PAL.cyan, PAL.orange];

export function renderPuck(ctx: CanvasRenderingContext2D, data: PuckState, tMs: number): void {
  const ox = Math.floor((320 - MAZE_W * CELL) / 2);
  const oy = 38;
  const px = (x: number, y: number) => ox + x * CELL;
  const py = (x: number, y: number) => oy + y * CELL;

  MAZE.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '#') {
        ctx.fillStyle = PAL.navy;
        ctx.fillRect(px(x, y) + 1, py(x, y) + 1, CELL - 2, CELL - 2);
      } else if (c === '.') {
        ctx.fillStyle = PAL.white;
        ctx.fillRect(px(x, y) + 3, py(x, y) + 3, 2, 2);
      }
    });
  });

  for (const k of Object.keys(data.powers)) {
    const [x, y] = k.split(',').map(Number);
    if (blink(tMs, 300)) {
      ctx.fillStyle = PAL.orange;
      ctx.fillRect(px(x!, y!) + 2, py(x!, y!) + 2, CELL - 4, CELL - 4);
    }
  }

  for (const g of data.ghosts) {
    const gx = px(g.x, g.y);
    const gy = py(g.x, g.y);
    if (g.mode !== 'eaten') {
      const scared = g.mode === 'frightened';
      ctx.fillStyle = scared ? (blink(tMs, 220) ? PAL.cyan : PAL.blue) : GHOST_COLORS[g.id % 4]!;
      ctx.fillRect(gx + 1, gy + 2, CELL - 2, CELL - 4);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(gx + 2, gy + 3, 2, 2);
      ctx.fillRect(gx + 5, gy + 3, 2, 2);
    } else {
      ctx.fillStyle = PAL.white;
      ctx.fillRect(gx + 2, gy + 3, 2, 2);
      ctx.fillRect(gx + 5, gy + 3, 2, 2);
    }
  }

  const p = data.player;
  const dying = data.deathTimer > 0;
  const r = dying ? Math.max(1, (CELL / 2) * (1 - data.deathTimer / 60)) : CELL / 2 - 1;
  ctx.fillStyle = PAL.yellow;
  ctx.beginPath();
  ctx.arc(px(p.x, p.y) + CELL / 2, py(p.x, p.y) + CELL / 2, r, 0, Math.PI * 2);
  ctx.fill();
}
