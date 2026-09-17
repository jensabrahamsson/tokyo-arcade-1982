import type { RiverState, Lane } from '@arkad/core';
import { HOME_ROWS } from '@arkad/core';
import { PAL } from '../ui';

const CELL = 12;

const drawLane = (ctx: CanvasRenderingContext2D, ox: number, lane: Lane, color: string) => {
  ctx.fillStyle = color;
  for (const x of lane.xs) ctx.fillRect(ox + x * CELL + 1, 14 + lane.y * CELL + 2, lane.len * CELL - 2, CELL - 4);
};

export function renderRiver(ctx: CanvasRenderingContext2D, data: RiverState, tMs = 0): void {
  const ox = Math.floor((320 - 26 * CELL) / 2);
  // water band with slow shimmer
  ctx.fillStyle = '#04123a';
  ctx.fillRect(ox, 14 + 1 * CELL, 26 * CELL, 5 * CELL);
  ctx.fillStyle = 'rgba(45, 226, 230, 0.08)';
  const sh = Math.floor(tMs / 120) % 24;
  for (let r = 0; r < 5; r++) ctx.fillRect(ox + ((sh + r * 7) % 26) * CELL, 14 + (2 + r) * CELL + 5, CELL, 1);
  ctx.fillStyle = PAL.dim;
  ctx.fillRect(ox, 14 + 9 * CELL, 26 * CELL, 4 * CELL);

  // goal homes
  for (let i = 0; i < HOME_ROWS.length; i++) {
    ctx.fillStyle = data.homes[i] ? PAL.green : PAL.navy;
    ctx.fillRect(ox + HOME_ROWS[i]! * CELL - CELL / 2, 14, CELL * 2 - 2, CELL - 1);
  }

  for (const lane of data.river) drawLane(ctx, ox, lane, '#6b4a1f');
  for (const lane of data.cars) drawLane(ctx, ox, lane, lane.dir > 0 ? PAL.red : PAL.cyan);

  const drowning = data.drownTimer > 0 && data.frog.y >= 2 && data.frog.y <= 5;
  ctx.fillStyle = drowning ? PAL.lime : PAL.yellow;
  ctx.beginPath();
  ctx.arc(ox + data.frog.x * CELL + 6, 14 + data.frog.y * CELL + 6, drowning ? 6 - data.drownTimer / 6 : 5, 0, Math.PI * 2);
  ctx.fill();
}
