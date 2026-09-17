import type { MyriadState } from '@arkad/core';
import { MYRIAD_W } from '@arkad/core';
import { PAL } from '../ui';

const CELL = 10;

export function renderMyriad(ctx: CanvasRenderingContext2D, data: MyriadState, tMs: number): void {
  const ox = Math.floor((320 - MYRIAD_W * CELL) / 2);
  ctx.fillStyle = PAL.black;
  ctx.fillRect(ox, 24, MYRIAD_W * CELL, 24 * CELL);

  for (const [k, hp] of Object.entries(data.mushrooms)) {
    const [x, y] = k.split(',').map(Number);
    const shade = hp > 2 ? PAL.brown : hp > 1 ? '#7a5230' : '#523820';
    ctx.fillStyle = shade;
    ctx.fillRect(ox + x! * CELL + 1, 24 + y! * CELL + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(ox + x! * CELL + 3, 24 + y! * CELL + 2, 2, 2);
  }

  data.segments.forEach((p, i) => {
    if (p.y < 0) return;
    const head = i === 0;
    ctx.fillStyle = head ? PAL.white : i % 2 === 0 ? PAL.lime : PAL.green;
    const wig = Math.floor(tMs / 120) % 2 === 0 ? 1 : 0;
    ctx.fillRect(ox + p.x * CELL + 1, 24 + p.y * CELL + 1 + wig, CELL - 2, CELL - 3);
  });

  ctx.fillStyle = PAL.yellow;
  ctx.fillRect(ox + data.player.x * CELL - 2, 24 + data.player.y * CELL - 4, 6, 10);

  ctx.fillStyle = PAL.white;
  for (const b of data.bullets) ctx.fillRect(ox + b.x * CELL, 24 + b.y * CELL, 2, 6);
}
