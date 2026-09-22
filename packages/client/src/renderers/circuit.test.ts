import { describe, it, expect } from 'vitest';
import { CIRCUIT_MARKS, circuitSpec, createCircuit, poseAt } from '@arkad/core';
import { PAL } from '../ui';
import {
  ASPHALT,
  CAR,
  CAR_P2,
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

  it('versus draws both cars on the one overview, title unchanged', () => {
    const s = {
      ...createCircuit({ mode: 'versus', playerIds: ['a', 'b'], seed: 1 }),
      phase: 'playing' as const,
    };
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
    const car = `rgb(${CAR[0]},${CAR[1]},${CAR[2]})`;
    const rival = `rgb(${CAR_P2[0]},${CAR_P2[1]},${CAR_P2[2]})`;
    const bodies = fills.filter((f) => f.color === car || f.color === rival);
    expect(bodies.filter((f) => f.color === car).length).toBeGreaterThan(0);
    expect(bodies.filter((f) => f.color === rival).length).toBeGreaterThan(0);
    const ax = bodies.find((f) => f.color === car)!;
    const bx = bodies.find((f) => f.color === rival)!;
    expect(Math.hypot(ax.x - bx.x, ax.y - bx.y)).toBeGreaterThan(8);
    expect(texts).toContain("CIRCUIT D'OR");
    renderCircuit(ctx as unknown as CanvasRenderingContext2D, s, 0, 'ja', false);
    expect(texts).toContain('サーキット・ドール');
    for (const text of texts) expect(text.toLowerCase()).not.toContain('le mans');
  });

  it('reads as 1976 prototypes on an arch-bridge loop, without sponsor wordmarks', () => {
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

    const bridge = poseAt(CIRCUIT_MARKS.find((m) => m.kind === 'bridge')!.u);
    const above = fills.filter(
      (f) =>
        (f.color === PAL.white || f.color === '#ffffff') &&
        Math.abs(f.x + f.w / 2 - bridge.x) < 24 &&
        f.y < bridge.y - 6,
    );
    expect(above.filter((f) => f.w >= 28)).toEqual([]);
    const crownY = Math.min(...above.map((f) => f.y));
    const crown = above.filter((f) => f.y <= crownY + 1);
    expect(crown.length).toBeGreaterThan(0);
    expect(crown.every((f) => f.w <= 8)).toBe(true);
    expect(Math.abs(crown[0]!.x + crown[0]!.w / 2 - bridge.x)).toBeLessThan(8);
    expect(above.some((f) => f.x + f.w < bridge.x - 8 && f.y > crownY + 4)).toBe(true);
    expect(above.some((f) => f.x > bridge.x + 8 && f.y > crownY + 4)).toBe(true);

    const car = `rgb(${CAR[0]},${CAR[1]},${CAR[2]})`;
    // The schematic body was one 18×5 rect. A Group 6 reads along its
    // heading: long tail, cockpit, rear wing, on the order of 30 px.
    const c = Math.cos(s.heading);
    const sn = Math.sin(s.heading);
    const along = fills
      .filter((f) => f.color === car)
      .map((f) => (f.x + f.w / 2) * c + (f.y + f.h / 2) * sn);
    expect(Math.max(...along) - Math.min(...along)).toBeGreaterThanOrEqual(28);
    expect(fills.some((f) => f.color === PAL.navy && f.w >= 3 && f.h >= 2)).toBe(true);
    const wing = fills.filter((f) => f.color === car && f.w >= 14 && f.h <= 3);
    expect(wing.length).toBeGreaterThan(0);

    // The schematic grandstand was a field of 2×2 specks. The stand has mass.
    const stand = fills.filter((f) => (f.color === PAL.red || f.color === PAL.navy) && f.w >= 10 && f.h >= 6);
    expect(stand.length).toBeGreaterThan(0);
    const armco = fills.filter((f) => f.color === PAL.gray).reduce((sum, f) => sum + f.w * f.h, 0);
    expect(armco).toBeGreaterThan(400);

    const gantry = poseAt(CIRCUIT_MARKS.find((m) => m.kind === 'gantry')!.u);
    const banner = fills.filter(
      (f) => Math.hypot(f.x - gantry.x, f.y - gantry.y) < 30 && (f.color === PAL.black || f.color === PAL.white),
    );
    expect(banner.length).toBeGreaterThan(4);

    for (const text of texts) {
      expect(text.toUpperCase()).not.toMatch(/DUNLOP|PORSCHE|MARTINI|RENAULT|\bELF\b|GULF|MICHELIN/);
      expect(text.toLowerCase()).not.toContain('le mans');
    }
    expect(texts).toContain("CIRCUIT D'OR");
  });

  it('reads as a thin tree-lined road under a truss bridge, not a 28 px schematic', () => {
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

    const asphalt = `rgb(${ASPHALT[0]},${ASPHALT[1]},${ASPHALT[2]})`;
    const road = fills.filter((f) => f.color === asphalt && f.w < 300);
    // Overlapping 28×28 stamps were the schematic sausage. A road stamp stays thin.
    expect(road.length).toBeGreaterThan(0);
    expect(road.every((f) => f.w <= 12 && f.h <= 12)).toBe(true);

    const trees = fills.filter((f) => f.color === 'rgb(16,78,34)');
    expect(trees.length).toBeGreaterThanOrEqual(8);
    const treeYs = trees.map((f) => f.y);
    expect(Math.max(...treeYs) - Math.min(...treeYs)).toBeGreaterThan(8);

    const bridge = poseAt(CIRCUIT_MARKS.find((m) => m.kind === 'bridge')!.u);
    const truss = fills.filter(
      (f) =>
        (f.color === PAL.white || f.color === '#ffffff') &&
        Math.abs(f.x + f.w / 2 - bridge.x) < 28 &&
        f.y < bridge.y,
    );
    expect(truss.length).toBeGreaterThanOrEqual(14);
    const posts = truss.filter((f) => f.h >= 10);
    expect(posts.some((f) => f.x + f.w < bridge.x - 8)).toBe(true);
    expect(posts.some((f) => f.x > bridge.x + 8)).toBe(true);

    const pits = fills.filter((f) => f.color === PAL.brown && f.w >= 72 && f.h <= 12 && f.h >= 6);
    expect(pits.length).toBeGreaterThan(0);
    expect(texts).not.toContain('24H');
    expect(texts).toContain("CIRCUIT D'OR");
  });
});
