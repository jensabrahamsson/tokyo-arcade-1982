import type { SnakeState } from '@arkad/core';
import { SNAKE_GRID } from '@arkad/core';
import { PAL, PLAYER_COLORS } from '../ui';

const CELL = 8;

export function renderSnake(ctx: CanvasRenderingContext2D, data: SnakeState, tMs: number): void {
  const ox = Math.floor((320 - SNAKE_GRID.w * CELL) / 2);
  const oy = 40;

  // walls / wrap border
  if (data.mode === 'versus') {
    ctx.fillStyle = PAL.navy;
    ctx.fillRect(ox - 4, oy - 4, SNAKE_GRID.w * CELL + 8, 4);
    ctx.fillRect(ox - 4, oy + SNAKE_GRID.h * CELL, SNAKE_GRID.w * CELL + 8, 4);
    ctx.fillRect(ox - 4, oy - 4, 4, SNAKE_GRID.h * CELL + 8);
    ctx.fillRect(ox + SNAKE_GRID.w * CELL, oy - 4, 4, SNAKE_GRID.h * CELL + 8);
  } else {
    ctx.fillStyle = blinkWrap(tMs) ? PAL.navy : PAL.blue;
    for (let x = 0; x < SNAKE_GRID.w; x++) {
      if (x % 2 === 0) {
        ctx.fillRect(ox + x * CELL, oy - 3, 4, 2);
        ctx.fillRect(ox + x * CELL, oy + SNAKE_GRID.h * CELL + 1, 4, 2);
      }
    }
  }

  // food
  if (data.food && blinkWrap(tMs, 500)) {
    ctx.fillStyle = PAL.orange;
    ctx.fillRect(ox + data.food.x * CELL + 1, oy + data.food.y * CELL + 1, CELL - 2, CELL - 2);
  }

  // snakes
  const ids = Object.keys(data.snakes);
  ids.forEach((id, i) => {
    const snake = data.snakes[id]!;
    const color = snake.alive ? PLAYER_COLORS[i % PLAYER_COLORS.length]! : '#3a3a4a';
    snake.body.forEach((cell, j) => {
      ctx.fillStyle = snake.alive ? (j === 0 ? PAL.white : color) : color;
      ctx.fillRect(ox + cell.x * CELL + 1, oy + cell.y * CELL + 1, CELL - 2, CELL - 2);
    });
  });
}

const blinkWrap = (t: number, period = 600): boolean => Math.floor(t / period) % 2 === 0;
