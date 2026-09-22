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
  ctx.fillRect(108, 108, 104, 40);

  ctx.fillStyle = rgb(ASPHALT);
  for (const sample of TRACK_SAMPLES) {
    const p = overviewPoint(sample.x, sample.y);
    ctx.fillRect(p.x - 16, p.y - 16, 32, 32);
  }

  ctx.fillStyle = PAL.white;
  for (let i = 0; i < TRACK_SAMPLES.length; i += 6) {
    const p = overviewPoint(TRACK_SAMPLES[i]!.x, TRACK_SAMPLES[i]!.y);
    ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
  }

  for (const mark of CIRCUIT_MARKS) {
    const pose = poseAt(mark.u);
    const p = overviewPoint(pose.x, pose.y);
    if (mark.kind === 'gantry') {
      for (let col = 0; col < 6; col++) {
        ctx.fillStyle = col % 2 === 0 ? PAL.black : PAL.white;
        ctx.fillRect(p.x - 12 + col * 4, p.y - 22, 4, 4);
      }
      ctx.fillStyle = PAL.yellow;
      ctx.fillRect(p.x - 14, p.y - 26, 2, 10);
      ctx.fillRect(p.x + 12, p.y - 26, 2, 10);
    } else if (mark.kind === 'bridge') {
      ctx.fillStyle = PAL.white;
      ctx.fillRect(p.x - 18, p.y - 20, 4, 16);
      ctx.fillRect(p.x + 14, p.y - 20, 4, 16);
      ctx.fillRect(p.x - 18, p.y - 20, 36, 4);
    } else {
      ctx.fillStyle = PAL.brown;
      ctx.fillRect(p.x - 22, p.y + 18, 44, 8);
      px(ctx, '24H', p.x - 8, p.y + 19, 6, PAL.yellow);
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
    blit(0, 0, 12, 6, body);
    blit(6, 0, 4, 3, PAL.yellow);
    blit(-2, -3, 3, 3, PAL.navy);
    blit(-2, 3, 3, 3, PAL.navy);
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
