import { describe, it, expect } from 'vitest';
import { circuitSpec, createCircuit } from '@arkad/core';
import {
  ASPHALT,
  CAR,
  GRASS,
  circuitHudCopy,
  luma,
  overviewPoint,
  renderCircuit,
} from './circuit';

describe('circuit overview (R55.4)', () => {
  it('keeps world distance — the camera is not a vanishing point', () => {
    const far = overviewPoint(100, 84);
    const near = overviewPoint(100, 176);
    expect(near.y - far.y).toBe(92);
    expect(overviewPoint(240, 176).x - overviewPoint(80, 176).x).toBe(160);
    expect(luma(GRASS)).toBeGreaterThan(100);
    expect(luma(ASPHALT)).toBeGreaterThan(luma(GRASS) - 40);
    expect(luma(ASPHALT)).toBeGreaterThan(140);
  });

  it('the HUD title is Circuit d\'Or in both languages', () => {
    const s = createCircuit({ mode: 'solo', playerIds: ['p1'], seed: 1 });
    const en = circuitHudCopy('en', s);
    const ja = circuitHudCopy('ja', s);
    expect(en.title).toBe("CIRCUIT D'OR");
    expect(ja.title).toBe('サーキット・ドール');
    expect(en.speed).toMatch(/KM\/H/);
    expect(en.speed).not.toMatch(/MPH/);
    expect(ja.speed).toContain('キロ');
    for (const line of [en.title, en.time, en.lap, en.speed, ja.title, ja.time, ja.lap, ja.speed]) {
      expect(line.toLowerCase()).not.toContain('le mans');
      expect(line.toLowerCase()).not.toContain('arkad');
      expect(line.toLowerCase()).not.toContain('coast');
    }
  });

  it('a frozen frame is a bright loop with the car, not a black tunnel', () => {
    const s = { ...createCircuit({ mode: 'solo', playerIds: ['p1'], seed: 1 }), phase: 'playing' as const };
    const fills: { color: string; x: number; y: number; w: number; h: number }[] = [];
    const texts: string[] = [];
    let fillStyle = '';
    const ctx = {
      get fillStyle() {
        return fillStyle;
      },
      set fillStyle(v: string) {
        fillStyle = String(v);
      },
      font: '',
      textAlign: 'left' as CanvasTextAlign,
      textBaseline: 'top' as CanvasTextBaseline,
      fillRect(x: number, y: number, w: number, h: number) {
        fills.push({ color: fillStyle, x, y, w, h });
      },
      fillText(text: string) {
        texts.push(text);
      },
    };
    renderCircuit(ctx as unknown as CanvasRenderingContext2D, s, 0, 'en', false);

    const area = (pred: (f: (typeof fills)[number]) => boolean) =>
      fills.filter(pred).reduce((sum, f) => sum + f.w * f.h, 0);
    const grass = `rgb(${GRASS[0]},${GRASS[1]},${GRASS[2]})`;
    const asphalt = `rgb(${ASPHALT[0]},${ASPHALT[1]},${ASPHALT[2]})`;
    const car = `rgb(${CAR[0]},${CAR[1]},${CAR[2]})`;
    expect(area((f) => f.color === grass)).toBeGreaterThanOrEqual(320 * 240);
    expect(area((f) => f.color === asphalt)).toBeGreaterThan(4000);
    expect(area((f) => f.color === '#000000' || f.color === '#000')).toBeLessThan(320 * 240 * 0.05);
    const body = fills.find((f) => f.color === car);
    expect(body).toBeTruthy();
    expect(Math.abs(body!.x - s.x)).toBeLessThan(24);
    expect(Math.abs(body!.y - s.y)).toBeLessThan(24);
    expect(texts).toContain("CIRCUIT D'OR");
    for (const text of texts) expect(text.toLowerCase()).not.toContain('le mans');
    expect(circuitSpec.id).toBe('circuit');
  });
});
