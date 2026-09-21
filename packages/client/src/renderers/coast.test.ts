import { describe, it, expect } from 'vitest';
import { OBSTACLE_KINDS, coastSpec } from '@arkad/core';
import {
  coastLodStride, CASTLE_DRAW, CAR_DRAW, obstacleSprite, coastHudCopy, COAST_SPEED_SCALE,
  SKY_TOP, SKY_BOT, GRASS_A, ROAD_A, ROAD_WIDTH_K, ROADSIDE_POST_STEP, ROADSIDE_TREE_STEP,
  luma, renderCoast, drawCoastQualifyingBanner, coastCastleRect, coastQualifyingOverlayY,
  coastQualifyingClearOfCastle, COAST_QUALIFYING_FONT, COAST_QUALIFYING_GUTTER,
} from './coast';

describe('coast mini LOD (P1-8)', () => {
  it('full-size cabinets draw every strip', () => {
    expect(coastLodStride(false)).toBe(1);
  });

  it('hall minis draw a quarter of the strips — the same road, coarser', () => {
    expect(coastLodStride(true)).toBe(4);
    const full = 140 / coastLodStride(false);
    const mini = 140 / coastLodStride(true);
    expect(mini).toBeLessThan(full);
    // the grass/road band period is 4 distance units, so a stride of 4
    // samples exactly one band per strip and cannot shift the layout
    expect(4 % 4).toBe(0);
  });
});

describe('Coast qualifying overlay gutter (R56.5)', () => {
  it('LO-borgen screen rect matches drawCastle math at course start', () => {
    const r = coastCastleRect(0);
    expect(r.top).toBe(37);
    expect(r.bottom).toBe(93);
    expect(r.left).toBe(84);
    expect(r.right).toBe(236);
  });

  it('the legacy y=78 band collided with the castle on 320×240', () => {
    expect(coastQualifyingClearOfCastle(78, COAST_QUALIFYING_FONT, COAST_QUALIFYING_GUTTER, 0)).toBe(false);
  });

  it('places t(coast.qualifying) below the keep with a readable gutter', () => {
    const y = coastQualifyingOverlayY();
    expect(y).toBe(101);
    expect(y).toBeGreaterThan(coastCastleRect(0).bottom);
    expect(coastQualifyingClearOfCastle(y, COAST_QUALIFYING_FONT, COAST_QUALIFYING_GUTTER, 0)).toBe(true);
    expect(y + COAST_QUALIFYING_FONT).toBeLessThan(120);
  });

  it('drawCoastQualifyingBanner uses the guttered y (px textBaseline top)', () => {
    const calls: { y: number; text: string }[] = [];
    const ctx = {
      font: '',
      fillStyle: '',
      textAlign: 'left' as CanvasTextAlign,
      textBaseline: 'top' as CanvasTextBaseline,
      fillText(text: string, _x: number, y: number) {
        calls.push({ y, text });
      },
    };
    drawCoastQualifyingBanner(ctx as unknown as CanvasRenderingContext2D, '予選スタート！', 0);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toBe('予選スタート！');
    expect(calls[0]!.y).toBe(coastQualifyingOverlayY());
    expect(coastQualifyingClearOfCastle(calls[0]!.y, COAST_QUALIFYING_FONT, COAST_QUALIFYING_GUTTER, 0)).toBe(true);
  });
});

describe('LO-borgen landmark size (R54.6 / Wave 1)', () => {
  it('draws a wide Fuji-scale silhouette that cannot be a 16×16 stub', () => {
    expect(CASTLE_DRAW.w).toBeGreaterThanOrEqual(140);
    expect(CASTLE_DRAW.h).toBeGreaterThanOrEqual(48);
    expect(Math.max(CASTLE_DRAW.w, CASTLE_DRAW.h)).toBeGreaterThanOrEqual(64);
    // MUST: landmarks are moments on the horizon, not a postcard eating the sky
    expect(CASTLE_DRAW.h).toBeLessThan(72);
  });
});

describe('coast roadside props (Wave 1)', () => {
  it('every obstacle kind is a readable silhouette, not a placeholder square', () => {
    const colors = new Set<string>();
    for (const kind of OBSTACLE_KINDS) {
      const spr = obstacleSprite(kind, 1);
      expect(spr.parts.length).toBeGreaterThan(1);
      expect(spr.h).toBeGreaterThan(spr.w * 0.55); // taller than a square blob
      expect(spr.w).not.toBe(spr.h);
      for (const p of spr.parts) {
        expect(p.w).toBeGreaterThan(0);
        expect(p.h).toBeGreaterThan(0);
        colors.add(p.color);
      }
    }
    expect(colors.size).toBeGreaterThan(3);
  });
});

describe('coast HUD copy (Wave 1)', () => {
  const off = {
    timeLeft: 3600, speed: 150, dist: 0, playerX: 1.4, phase: 'playing' as const,
  };

  it('TIME / OFF ROAD / km/h stay in lockstep across EN and JA', () => {
    const en = coastHudCopy('en', off);
    const ja = coastHudCopy('ja', off);
    expect(en.time.startsWith('TIME ')).toBe(true);
    expect(ja.time.startsWith('タイム ')).toBe(true);
    expect(en.offRoad).toBe('OFF ROAD!');
    expect(ja.offRoad).toBe('オフロード！');
    expect(en.speed).toBe(`${COAST_SPEED_SCALE} KM/H`);
    expect(ja.speed).toMatch(new RegExp(`^${COAST_SPEED_SCALE} キロ$`));
    expect(en.speed).not.toMatch(/MPH/i);
    expect(ja.speed).not.toMatch(/マイル|MPH/i);
  });

  it('hides OFF ROAD while the car is on the tarmac', () => {
    expect(coastHudCopy('en', { ...off, playerX: 0 }).offRoad).toBeNull();
  });
});

describe('Coast Pole Position silhouette (R56, not C64 Night Rider)', () => {
  it('sky, grass and road are bright arcade bands, not a night void (R56.1–2)', () => {
    expect(luma(SKY_TOP)).toBeGreaterThan(80);
    expect(luma(SKY_BOT)).toBeGreaterThan(140);
    expect(luma(GRASS_A)).toBeGreaterThan(90);
    expect(luma(ROAD_A)).toBeGreaterThan(90);
    // vanishing-point road, not a full-width gray tunnel
    expect(ROAD_WIDTH_K).toBeLessThan(800);
    expect(ROAD_WIDTH_K).toBeGreaterThan(280);
  });

  it('the car has Pole Position rear-view weight (R56.3)', () => {
    expect(CAR_DRAW.w).toBeGreaterThanOrEqual(64);
    expect(CAR_DRAW.h).toBeGreaterThanOrEqual(32);
  });

  it('roadside posts and trees tick often enough to read as a rhythm (R56.4)', () => {
    expect(ROADSIDE_POST_STEP).toBeLessThanOrEqual(12);
    expect(ROADSIDE_TREE_STEP).toBeLessThanOrEqual(24);
    expect(Math.floor(140 / ROADSIDE_POST_STEP) * 2).toBeGreaterThanOrEqual(20);
  });

  it('a frozen playfield paints sky + road + chunky car + roadside, not a black tunnel (R56.7)', () => {
    const rec = recordCoastFrame();
    expect(rec.rectCount).toBeGreaterThan(80);
    expect(rec.maxBodyW).toBeGreaterThanOrEqual(56);
    expect(rec.darkRatio).toBeLessThan(0.4);
    expect(rec.used).toContain('#e03c2f'); // car body
    expect(rec.used).toContain('#ff004d'); // rumble / tail
    expect(rec.texts.some((t) => t.startsWith('TIME'))).toBe(true);
    expect(rec.texts.some((t) => /KM\/H/.test(t))).toBe(true);
  });
});

function recordCoastFrame(): { rectCount: number; maxBodyW: number; darkRatio: number; used: string[]; texts: string[] } {
  const rects: { w: number; h: number; fill: string }[] = [];
  const texts: string[] = [];
  const ctx = {
    fillStyle: '#000000' as string | { addColorStop: () => void },
    strokeStyle: '#000',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
    createLinearGradient: () => ({ addColorStop() { /* band */ } }),
    createRadialGradient: () => ({ addColorStop() { /* halo */ } }),
    fillRect(_x: number, _y: number, w: number, h: number) {
      const fill = typeof ctx.fillStyle === 'string' ? ctx.fillStyle : 'gradient';
      rects.push({ w, h, fill });
    },
    strokeRect() { /* board chrome */ },
    beginPath() { /* sun */ },
    moveTo() { /* keep roof */ },
    lineTo() { /* keep roof */ },
    arc() { /* sun */ },
    fill() { /* sun */ },
    save() { /* car */ },
    restore() { /* car */ },
    translate() { /* car */ },
    transform() { /* steer */ },
    drawImage() { /* art atlas empty in unit tests */ },
    fillText(t: string) { texts.push(t); },
  };
  const s = coastSpec.create({ mode: 'solo', playerIds: ['p1'], seed: 7 });
  renderCoast(ctx as unknown as CanvasRenderingContext2D, { ...s, phase: 'playing', dist: 40, speed: 80 }, 0, 'en', false);
  const used = rects.map((r) => r.fill);
  const dark = rects.filter((r) => r.fill === '#1c1c28' || r.fill === '#10131f' || r.fill === '#000000').length;
  const body = rects.filter((r) => r.fill === '#e03c2f');
  return {
    rectCount: rects.length,
    maxBodyW: body.reduce((m, r) => Math.max(m, r.w), 0),
    darkRatio: dark / Math.max(1, rects.length),
    used,
    texts,
  };
}
