import type { CoastState } from '@arkad/core';
import { curveAt, OFF_ROAD_X, TRACK_LEN, MAX_SPEED } from '@arkad/core';
import { PAL } from '../ui';

const W = 320;
const H = 240;
const HORIZON = 92;
const CX = 160;

const blend = (a: readonly number[]): string => `rgb(${a[0]!},${a[1]!},${a[2]!})`;

const SKY_TOP = [12, 8, 40];
const SKY_BOT = [210, 110, 60];
const GRASS_A = [46, 120, 60];
const GRASS_B = [30, 96, 48];
const ROAD_A = [96, 96, 104];
const ROAD_B = [84, 84, 92];
const RUMBLE_A = [214, 60, 52];
const RUMBLE_B = [230, 230, 230];

function project(dist: number, camDist: number, playerX: number): { y: number; scale: number; roadW: number; offX: number } {
  const d = Math.max(0.3, dist - camDist);
  const scale = 14 / d;
  const y = HORIZON + 1500 * scale * 0.1;
  const curve = (curveAt(camDist) * Math.min(d, 120) * 0.9 - curveAt(camDist + 60) * 0);
  const roadW = 2600 * scale;
  const offX = CX - playerX * roadW * 0.55 - curve * d * 0.35;
  return { y, scale, roadW, offX };
}

function drawCastle(ctx: CanvasRenderingContext2D, shift: number, tMs: number): void {
  const bx = CX + shift;
  const by = HORIZON + 2;
  ctx.fillStyle = '#3a2a4e';
  ctx.fillRect(bx - 34, by - 22, 68, 22);
  ctx.fillRect(bx - 40, by - 16, 12, 16);
  ctx.fillRect(bx + 28, by - 16, 12, 16);
  for (const [tx, w, h] of [[-28, 8, 14], [-8, 10, 20], [12, 8, 14]] as const) {
    ctx.fillRect(bx + tx, by - 22 - h, w, h);
    ctx.beginPath();
    ctx.moveTo(bx + tx - 2, by - 22 - h);
    ctx.lineTo(bx + tx + w / 2, by - 30 - h);
    ctx.lineTo(bx + tx + w + 2, by - 22 - h);
    ctx.fill();
  }
  if (Math.floor(tMs / 500) % 2 === 0) {
    ctx.fillStyle = '#ffd75e';
    ctx.fillRect(bx - 6, by - 14, 3, 3);
    ctx.fillRect(bx + 4, by - 10, 3, 3);
  }
}

export function renderCoast(ctx: CanvasRenderingContext2D, s: CoastState, tMs = 0): void {
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, blend(SKY_TOP));
  sky.addColorStop(1, blend(SKY_BOT));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HORIZON);
  ctx.fillStyle = '#ffce54';
  ctx.beginPath();
  ctx.arc(CX + 70, HORIZON - 8, 16, Math.PI, 0);
  ctx.fill();

  const camCurve = curveAt(s.dist);
  drawCastle(ctx, -camCurve * 140 - s.playerX * 26, tMs);

  ctx.fillStyle = blend(GRASS_A);
  ctx.fillRect(0, HORIZON, W, H - HORIZON);

  const cam = s.dist;
  for (let d = 140; d >= 1; d--) {
    const p1 = project(cam + d, cam, s.playerX);
    const p0 = project(cam + d - 1, cam, s.playerX);
    if (p1.y > H || p0.y < HORIZON) continue;
    const band = Math.floor((cam + d) / 4) % 2;
    const y = Math.max(HORIZON, p1.y);
    const y2 = Math.min(H, p0.y);
    if (y2 <= y) continue;
    ctx.fillStyle = band ? blend(GRASS_A) : blend(GRASS_B);
    ctx.fillRect(0, y, W, y2 - y);
    ctx.fillStyle = band ? blend(ROAD_A) : blend(ROAD_B);
    ctx.fillRect(p1.offX - p1.roadW / 2, y, p1.roadW, y2 - y);
    ctx.fillStyle = band ? blend(RUMBLE_A) : blend(RUMBLE_B);
    ctx.fillRect(p1.offX - p1.roadW / 2 - p1.roadW * 0.07, y, p1.roadW * 0.07, y2 - y);
    ctx.fillRect(p1.offX + p1.roadW / 2, y, p1.roadW * 0.07, y2 - y);
    if (Math.floor((cam + d) / 6) % 2 === 0) {
      ctx.fillStyle = '#e8e4c8';
      ctx.fillRect(p1.offX - p1.scale * 14, y, Math.max(1, p1.scale * 28), y2 - y);
    }
  }

  for (const o of s.obstacles) {
    if (o.hit || o.d < cam + 1 || o.d > cam + 140) continue;
    const p = project(o.d, cam, s.playerX);
    const size = Math.max(2, p.scale * 260);
    ctx.fillStyle = o.x < 0 ? '#d8b13c' : '#b06030';
    ctx.fillRect(p.offX + o.x * p.roadW * 0.55 - size / 2, p.y - size, size, size);
  }

  const carX = CX;
  const steer = Math.max(-1, Math.min(1, (s.playerX % 1) * 0.4 + curveAt(s.dist) * 0.3));
  ctx.save();
  ctx.translate(carX, H - 26 + Math.sin(tMs / 60) * (s.speed / MAX_SPEED) * 1.2);
  ctx.transform(1, 0, -steer * 0.12, 1, 0, 0);
  ctx.fillStyle = '#e03c2f';
  ctx.fillRect(-16, 0, 32, 14);
  ctx.fillRect(-11, -10, 22, 12);
  ctx.fillStyle = '#1c1c28';
  ctx.fillRect(-19, 4, 6, 9);
  ctx.fillRect(13, 4, 6, 9);
  ctx.fillStyle = '#8fd0ff';
  ctx.fillRect(-8, -8, 16, 5);
  ctx.restore();

  const secs = Math.ceil(s.timeLeft / 60);
  ctx.fillStyle = PAL.white;
  ctx.font = '8px monospace';
  ctx.fillText(`TIME ${secs}`, 6, 12);
  ctx.fillText(`${Math.round((s.speed / MAX_SPEED) * 220)} MPH`, W - 54, 12);
  ctx.fillText(`GATE ${Math.min(Math.floor(s.dist), TRACK_LEN)}/${TRACK_LEN}`, 6, 22);
  if (Math.abs(s.playerX) > OFF_ROAD_X && s.phase === 'playing') {
    ctx.fillStyle = '#ffd75e';
    ctx.fillText('OFF ROAD!', CX - 26, H - 60);
  }
}
