import type { PuckState } from '@arkad/core';
import { MAZE, MAZE_W, MAZE_H } from '@arkad/core';
import { PAL, blink } from '../ui';

const CELL = 8;

const GHOST_COLORS = [PAL.red, PAL.magenta, PAL.cyan, PAL.orange];

export function renderPuck(ctx: CanvasRenderingContext2D, data: PuckState, tMs: number): void {
  const ox = Math.floor((320 - MAZE_W * CELL) / 2);
  const oy = 38;
  const px = (x: number) => ox + x * CELL;
  const py = (y: number) => oy + y * CELL;

  MAZE.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '#') {
        ctx.fillStyle = PAL.navy;
        ctx.fillRect(px(x) + 1, py(y) + 1, CELL - 2, CELL - 2);
        ctx.fillStyle = '#3355aa';
        ctx.fillRect(px(x) + 1, py(y) + 1, CELL - 2, 1);
      }
    });
  });
  ctx.fillStyle = PAL.white;
  for (const k of Object.keys(data.dots)) {
    const [x, y] = k.split(',').map(Number);
    ctx.fillRect(px(x!) + 3, py(y!) + 3, 2, 2);
  }

  for (const k of Object.keys(data.powers)) {
    const [x, y] = k.split(',').map(Number);
    if (blink(tMs, 300)) {
      ctx.fillStyle = PAL.orange;
      ctx.fillRect(px(x!) + 2, py(y!) + 2, CELL - 4, CELL - 4);
    }
  }

  for (const g of data.ghosts) {
    const gx = px(g.x);
    const gy = py(g.y);
    if (g.mode !== 'eaten') {
      const scared = g.mode === 'frightened';
      const late = scared && data.frightTimer < 90;
      ctx.fillStyle = scared ? ((late && blink(tMs, 160)) ? PAL.white : PAL.blue) : GHOST_COLORS[g.id % 4]!;
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
  const mouth = Math.abs(Math.sin(tMs / 90)) * 0.35;
  const ang = Math.atan2(p.dir.dy, p.dir.dx);
  ctx.arc(px(p.x) + CELL / 2, py(p.y) + CELL / 2, r, ang + mouth, ang - mouth + Math.PI * 2);
  ctx.lineTo(px(p.x) + CELL / 2, py(p.y) + CELL / 2);
  ctx.fill();
}
