import type { RiverState, Lane } from '@arkad/core';
import { HOME_ROWS } from '@arkad/core';
import { PAL } from '../ui';

const CELL = 12;

const TOP = 24;

const drawLane = (ctx: CanvasRenderingContext2D, ox: number, lane: Lane, color: string, kind: 'log' | 'car') => {
  for (const x of lane.xs) {
    const lx = ox + x * CELL + 1;
    const ly = TOP + lane.y * CELL + 2;
    const lw = lane.len * CELL - 2;
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly, lw, CELL - 4);
    if (kind === 'log') {
      ctx.fillStyle = '#8a6238';
      ctx.fillRect(lx + 2, ly + 1, 2, CELL - 6);
      ctx.fillRect(lx + lw - 4, ly + 1, 2, CELL - 6);
      ctx.fillStyle = '#54371c';
      ctx.fillRect(lx, ly + 3, lw, 1);
    } else {
      ctx.fillStyle = PAL.navy;
      const cabinX = lane.dir > 0 ? lx + lw * 0.55 : lx + lw * 0.2;
      ctx.fillRect(cabinX, ly + 1, lw * 0.25, 3);
      ctx.fillStyle = PAL.black;
      ctx.fillRect(lx + 3, ly + CELL - 6, 4, 2);
      ctx.fillRect(lx + lw - 7, ly + CELL - 6, 4, 2);
      ctx.fillStyle = PAL.yellow;
      ctx.fillRect(lane.dir > 0 ? lx + lw - 2 : lx, ly + 2, 2, 2);
    }
  }
};

export function renderRiver(ctx: CanvasRenderingContext2D, data: RiverState, tMs = 0): void {
  const ox = Math.floor((320 - 26 * CELL) / 2);
  // water band with slow shimmer
  ctx.fillStyle = '#04123a';
  ctx.fillRect(ox, TOP + 1 * CELL, 26 * CELL, 5 * CELL);
  ctx.fillStyle = 'rgba(45, 226, 230, 0.08)';
  const sh = Math.floor(tMs / 120) % 24;
  for (let r = 0; r < 5; r++) ctx.fillRect(ox + ((sh + r * 7) % 26) * CELL, TOP + (2 + r) * CELL + 5, CELL, 1);
  ctx.fillStyle = PAL.dim;
  ctx.fillRect(ox, TOP + 9 * CELL, 26 * CELL, 4 * CELL);

  // goal homes
  for (let i = 0; i < HOME_ROWS.length; i++) {
    ctx.fillStyle = data.homes[i] ? PAL.green : PAL.navy;
    ctx.fillRect(ox + HOME_ROWS[i]! * CELL - CELL / 2, TOP, CELL * 2 - 2, CELL - 1);
  }

  for (const lane of data.river) drawLane(ctx, ox, lane, '#6b4a1f', 'log');
  for (const lane of data.cars) drawLane(ctx, ox, lane, lane.dir > 0 ? PAL.red : PAL.cyan, 'car');

  const drowning = data.drownTimer > 0 && data.frog.y >= 2 && data.frog.y <= 5;
  const fx = ox + data.frog.x * CELL + 6;
  const fy = TOP + data.frog.y * CELL + 6;
  const fr = drowning ? Math.max(2, 6 - data.drownTimer / 6) : 5;
  ctx.fillStyle = drowning ? PAL.yellow : PAL.lime;
  ctx.beginPath();
  ctx.arc(fx, fy, fr, 0, Math.PI * 2);
  ctx.fill();
  if (!drowning) {
    ctx.fillStyle = PAL.white;
    ctx.fillRect(fx - 4, fy - 5, 3, 3);
    ctx.fillRect(fx + 1, fy - 5, 3, 3);
    ctx.fillStyle = PAL.black;
    ctx.fillRect(fx - 3, fy - 4, 1, 1);
    ctx.fillRect(fx + 2, fy - 4, 1, 1);
  }
}
