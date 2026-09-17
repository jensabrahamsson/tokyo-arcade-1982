import type { BlockState } from '@arkad/core';
import { BLOCK_W, BLOCK_H } from '@arkad/core';
import { PAL, PLAYER_COLORS } from '../ui';

const CELL = 8;

export function renderBlock(ctx: CanvasRenderingContext2D, data: BlockState, _tMs: number): void {
  const ox = Math.floor((320 - BLOCK_W * CELL) / 2);
  const oy = 26;
  ctx.fillStyle = PAL.dim;
  ctx.fillRect(ox - 2, oy - 2, BLOCK_W * CELL + 4, BLOCK_H * CELL + 4);
  ctx.fillStyle = PAL.black;
  ctx.fillRect(ox, oy, BLOCK_W * CELL, BLOCK_H * CELL);

  for (const [k, hits] of Object.entries(data.bricks)) {
    const [x, y] = k.split(',').map(Number);
    ctx.fillStyle = hits! > 1 ? PAL.red : hits! === 1 ? PAL.orange : PAL.brown;
    ctx.fillRect(ox + x! * CELL + 1, oy + y! * CELL + 1, CELL - 2, CELL - 2);
  }

  const ids = Object.keys(data.paddles);
  ids.forEach((id, i) => {
    const p = data.paddles[id]!;
    ctx.fillStyle = PLAYER_COLORS[i % PLAYER_COLORS.length]!;
    ctx.fillRect(ox + p.x * CELL, oy + p.y * CELL + 1, p.span * CELL, CELL - 2);
  });

  if (data.mode === 'versus') {
    ctx.fillStyle = PAL.navy;
    for (let x = 0; x < BLOCK_W * CELL; x += 10) ctx.fillRect(ox + x, oy + (BLOCK_H * CELL) / 2, 5, 1);
  }

  // ball with a short phosphor trail
  ctx.fillStyle = '#3a3a12';
  ctx.fillRect(ox + (data.ball.x - data.ball.dx * 2) * CELL - 2, oy + (data.ball.y - data.ball.dy * 2) * CELL - 2, 5, 5);
  ctx.fillStyle = '#8a8a30';
  ctx.fillRect(ox + (data.ball.x - data.ball.dx) * CELL - 2, oy + (data.ball.y - data.ball.dy) * CELL - 2, 5, 5);
  ctx.fillStyle = PAL.white;
  ctx.fillRect(ox + data.ball.x * CELL - 2, oy + data.ball.y * CELL - 2, 5, 5);
}
