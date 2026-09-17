import type { GalaxyState } from '@arkad/core';
import { PAL, blink } from '../ui';

const CELL = 11;

export function renderGalaxy(ctx: CanvasRenderingContext2D, data: GalaxyState, tMs: number): void {
  const ox = Math.floor((320 - 26 * CELL) / 2);
  const py = (y: number) => 24 + y * CELL;
  ctx.fillStyle = PAL.black;
  ctx.fillRect(ox, 24, 26 * CELL, 24 * CELL);

  // starfield
  for (let i = 0; i < 40; i++) {
    const x = ((i * 73) % 286) + ox + 1;
    const y = ((i * 131 + Math.floor(tMs / 40) * 2) % (23 * CELL)) + 24;
    ctx.fillStyle = i % 5 === 0 ? PAL.gray : PAL.navy;
    ctx.fillRect(x, y, 1, 1);
  }

  for (const a of data.aliens) {
    const x = ox + a.x * CELL;
    const y = py(a.y);
    const rowColor = [PAL.red, PAL.orange, PAL.yellow, PAL.lime][a.row % 4]!;
    ctx.fillStyle = a.mode === 'dive' ? PAL.white : rowColor;
    ctx.fillRect(x + 1, y + 3, CELL - 2, CELL - 6);
    ctx.fillRect(x + 3, y + 1, CELL - 6, 3);
    ctx.fillRect(x, y + CELL - 4, 3, 3);
    ctx.fillRect(x + CELL - 3, y + CELL - 4, 3, 3);
  }

  ctx.fillStyle = PAL.cyan;
  ctx.fillRect(ox + data.player.x * CELL - 4, py(data.player.y), 8, 8);
  ctx.fillRect(ox + data.player.x * CELL - 1, py(data.player.y) - 3, 3, 4);

  ctx.fillStyle = PAL.white;
  for (const b of data.bullets) ctx.fillRect(ox + b.x * CELL - 1, py(b.y) - 3, 2, 6);

  // engine glow on the player ship
  if (blink(tMs, 160)) {
    ctx.fillStyle = PAL.orange;
    ctx.fillRect(ox + data.player.x * CELL - 2, py(data.player.y) + 6, 4, 3);
  }
}
