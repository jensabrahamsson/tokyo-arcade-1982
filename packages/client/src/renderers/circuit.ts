import {
  CIRCUIT_LAPS,
  CIRCUIT_MARKS,
  CIRCUIT_MAX_SPEED,
  TRACK_SAMPLES,
  poseAt,
  t as translate,
  type CircuitState,
  type Lang,
} from '@arkad/core';
import { PAL, px } from '../ui';

const W = 320;
const H = 240;

/** Bright grass. A flat navy field would read as Night Driver. */
export const GRASS: readonly [number, number, number] = [78, 196, 74];
export const INFIELD: readonly [number, number, number] = [48, 150, 62];
export const ASPHALT: readonly [number, number, number] = [198, 192, 174];
export const CAR: readonly [number, number, number] = [255, 112, 28];
/** Second human on the same overview. Orange stays player one. */
export const CAR_P2: readonly [number, number, number] = [45, 226, 230];
/** Trees along the long straight. Darker than the grass, not a wordmark. */
export const TREE: readonly [number, number, number] = [16, 78, 34];

const rgb = (c: readonly [number, number, number]): string => `rgb(${c[0]},${c[1]},${c[2]})`;

export const luma = (c: readonly [number, number, number]): number =>
  0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

/**
 * Overview camera: world units are screen pixels. Far and near asphalt
 * keep their separation. Not Coast's vanishing-point trapezoid.
 */
export function overviewPoint(x: number, y: number): { x: number; y: number } {
  return { x, y };
}

export function circuitHudCopy(
  lang: Lang,
  s: { timeLeft: number; speed: number; lap: number },
): { title: string; time: string; lap: string; speed: string } {
  const shownLap = Math.min(CIRCUIT_LAPS, s.lap + 1);
  return {
    title: translate(lang, 'game.circuit'),
    time: `${translate(lang, 'circuit.time')} ${Math.max(0, Math.ceil(s.timeLeft / 60))}`,
    lap: `${translate(lang, 'circuit.lap')} ${shownLap}/${CIRCUIT_LAPS}`,
    speed: `${Math.round((s.speed / CIRCUIT_MAX_SPEED) * 210)} ${translate(lang, 'circuit.kmh')}`,
  };
}

function insideLoop(x: number, y: number): boolean {
  let c = false;
  const poly = TRACK_SAMPLES;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i]!;
    const pj = poly[j]!;
    if (pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x) c = !c;
  }
  return c;
}

/** Curved truss over the road. Posts sit on the verges. No wordmark. */
function drawBridge(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = PAL.white;
  ctx.fillRect(x - 18, y - 20, 3, 16);
  ctx.fillRect(x + 15, y - 20, 3, 16);
  for (let i = -4; i <= 4; i++) {
    const t = i / 4;
    const rise = Math.round(Math.cos((t * Math.PI) / 2) * 14);
    const sx = x + Math.round(t * 14) - 2;
    ctx.fillRect(sx, y - 24 - rise, 4, 4);
    ctx.fillRect(sx, y - 12, 4, 3);
    if (i % 2 === 0) ctx.fillRect(sx + 1, y - 20 - Math.round(rise / 2), 2, 6);
  }
}

function drawGrandstand(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = PAL.navy;
  ctx.fillRect(x - 20, y, 40, 14);
  ctx.fillStyle = PAL.red;
  ctx.fillRect(x - 18, y + 2, 36, 8);
  ctx.fillStyle = PAL.yellow;
  for (let col = 0; col < 8; col++) ctx.fillRect(x - 16 + col * 4, y + 4, 2, 4);
}

/** Longest colinear run, so the trees follow the uninterrupted straight. */
function longestStraight(): { i0: number; i1: number } {
  const n = TRACK_SAMPLES.length;
  let best = { i0: 0, i1: 1, len: 0 };
  let i = 0;
  while (i < n - 1) {
    let j = i + 1;
    while (j < n) {
      const a = TRACK_SAMPLES[i]!;
      const b = TRACK_SAMPLES[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1;
      let ok = true;
      for (let k = i + 1; k < j; k++) {
        const p = TRACK_SAMPLES[k]!;
        if (Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / L > 4) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
      j++;
    }
    const end = Math.max(i, j - 1);
    const len = TRACK_SAMPLES[end]!.s - TRACK_SAMPLES[i]!.s;
    if (len > best.len) best = { i0: i, i1: end, len };
    i = end === i ? i + 1 : end;
  }
  return best;
}

export function renderCircuit(
  ctx: CanvasRenderingContext2D,
  s: CircuitState,
  _tMs = 0,
  lang: Lang = 'en',
  _mini = false,
): void {
  ctx.fillStyle = rgb(GRASS);
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = rgb(INFIELD);
  for (let y = 16; y < H - 16; y += 8) {
    for (let x = 8; x < W; x += 8) {
      if (insideLoop(x + 4, y + 4)) ctx.fillRect(x, y, 8, 8);
    }
  }

  ctx.fillStyle = rgb(ASPHALT);
  for (let i = 0; i < TRACK_SAMPLES.length; i++) {
    const a = TRACK_SAMPLES[i]!;
    const b = TRACK_SAMPLES[(i + 1) % TRACK_SAMPLES.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const steps = Math.max(1, Math.round(len / 3));
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      const p = overviewPoint(a.x + dx * f, a.y + dy * f);
      ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
    }
  }

  const straight = longestStraight();
  ctx.fillStyle = rgb(TREE);
  for (let i = straight.i0; i <= straight.i1; i += 4) {
    const sample = TRACK_SAMPLES[i]!;
    const p = overviewPoint(sample.x, sample.y);
    const nx = Math.sin(sample.heading);
    const ny = -Math.cos(sample.heading);
    for (const side of [-1, 1]) {
      const tx = p.x + nx * 16 * side;
      const ty = p.y + ny * 16 * side;
      ctx.fillRect(tx - 2, ty - 6, 5, 8);
      ctx.fillRect(tx - 1, ty - 9, 3, 4);
    }
  }

  ctx.fillStyle = PAL.gray;
  for (let i = 0; i < TRACK_SAMPLES.length; i += 3) {
    const a = TRACK_SAMPLES[i]!;
    const b = TRACK_SAMPLES[Math.min(i + 3, TRACK_SAMPLES.length - 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const nx = Math.sin(a.heading);
    const ny = -Math.cos(a.heading);
    for (const side of [-1, 1]) {
      const x = a.x + nx * 8 * side;
      const y = a.y + ny * 8 * side;
      if (Math.abs(dx) >= Math.abs(dy)) ctx.fillRect(Math.min(x, x + dx), y - 1, Math.abs(dx) + 2, 2);
      else ctx.fillRect(x - 1, Math.min(y, y + dy), 2, Math.abs(dy) + 2);
    }
  }

  ctx.fillStyle = PAL.white;
  for (let i = 0; i < TRACK_SAMPLES.length; i += 6) {
    const p = overviewPoint(TRACK_SAMPLES[i]!.x, TRACK_SAMPLES[i]!.y);
    ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }

  for (const mark of CIRCUIT_MARKS) {
    const pose = poseAt(mark.u);
    const p = overviewPoint(pose.x, pose.y);
    if (mark.kind === 'gantry') {
      for (let col = 0; col < 8; col++) {
        ctx.fillStyle = col % 2 === 0 ? PAL.black : PAL.white;
        ctx.fillRect(p.x - 16 + col * 4, p.y - 28, 4, 5);
      }
      ctx.fillStyle = PAL.yellow;
      ctx.fillRect(p.x - 18, p.y - 32, 3, 16);
      ctx.fillRect(p.x + 15, p.y - 32, 3, 16);
      const nx = Math.sin(pose.heading);
      const ny = -Math.cos(pose.heading);
      drawGrandstand(ctx, p.x - nx * 28, p.y - ny * 28);
    } else if (mark.kind === 'bridge') {
      drawBridge(ctx, p.x, p.y);
    } else {
      const c = Math.cos(pose.heading);
      const along = Math.abs(c) >= 0.5;
      ctx.fillStyle = PAL.brown;
      if (along) ctx.fillRect(p.x - 46, p.y + 12, 92, 8);
      else ctx.fillRect(p.x + 12, p.y - 46, 8, 92);
      ctx.fillStyle = PAL.navy;
      for (let box = 0; box < 6; box++) {
        if (along) ctx.fillRect(p.x - 40 + box * 14, p.y + 14, 8, 4);
        else ctx.fillRect(p.x + 14, p.y - 40 + box * 14, 4, 8);
      }
    }
  }

  const paintCar = (x: number, y: number, heading: number, body: string) => {
    const car = overviewPoint(x, y);
    const c = Math.cos(heading);
    const sn = Math.sin(heading);
    const blit = (ox: number, oy: number, w: number, h: number, color: string) => {
      const wx = car.x + ox * c - oy * sn;
      const wy = car.y + ox * sn + oy * c;
      ctx.fillStyle = color;
      ctx.fillRect(wx - w / 2, wy - h / 2, w, h);
    };
    // 1976 Group 6, about 30 px along the nose. Centre stamp first.
    blit(0, 0, 4, 5, body);
    for (let ox = -14; ox <= 14; ox += 4) {
      if (ox !== 0) blit(ox, 0, 4, 5, body);
    }
    blit(16, 0, 5, 3, body);
    blit(-16, 0, 16, 2, body);
    blit(-16, -4, 2, 6, PAL.yellow);
    blit(-16, 4, 2, 6, PAL.yellow);
    blit(2, 0, 6, 3, PAL.navy);
    blit(8, -3, 3, 3, PAL.navy);
    blit(8, 3, 3, 3, PAL.navy);
    blit(-6, -3, 3, 3, PAL.navy);
    blit(-6, 3, 3, 3, PAL.navy);
  };
  if (s.mode === 'versus' && s.cars) {
    const ids = Object.keys(s.cars);
    ids.forEach((id, i) => {
      const car = s.cars[id];
      if (!car) return;
      paintCar(car.x, car.y, car.heading, rgb(i === 0 ? CAR : CAR_P2));
    });
  } else {
    paintCar(s.x, s.y, s.heading, rgb(CAR));
  }

  const hud = circuitHudCopy(lang, s);
  px(ctx, hud.title, W / 2, 4, 8, PAL.white, 'center');
  px(ctx, hud.time, 6, H - 14, 8, PAL.white);
  px(ctx, hud.lap, W / 2, H - 14, 8, PAL.yellow, 'center');
  px(ctx, hud.speed, W - 6, H - 14, 8, PAL.white, 'right');
}
