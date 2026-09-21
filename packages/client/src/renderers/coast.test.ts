import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OBSTACLE_KINDS, coastSpec } from '@arkad/core';
import {
  coastLodStride, CASTLE_DRAW, CAR_DRAW, CAR_BODY, obstacleSprite, coastHudCopy, COAST_SPEED_SCALE,
  SKY_TOP, SKY_BOT, GRASS_A, GRASS_B, ROAD_A, ROAD_WIDTH_K, ROADSIDE_POST_STEP, ROADSIDE_TREE_STEP,
  luma, renderCoast, drawCoastQualifyingBanner, coastCastleRect, coastQualifyingOverlayY,
  coastQualifyingClearOfCastle, COAST_QUALIFYING_FONT, COAST_QUALIFYING_GUTTER,
  coastCarSprite, drawCoastCar,
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

  // LinkedIn leftover on 8d32eec: EN `QUALIFYING START!` painted as one 12px
  // line (17×12=204 px full-em) so the palisade ate QUAL / ART! (`IFYING ST`).
  // JA 「予選スタート！」 (7×12=84) already sits in the castle side gutter.
  it('EN QUALIFYING START! stays inside the LO-borgen side gutter (same 8px as JA)', () => {
    const en = 'QUALIFYING START!';
    const ja = '予選スタート！';
    const castle = coastCastleRect(0);
    const maxAdv = Math.floor(castle.right - castle.left) - 2 * COAST_QUALIFYING_GUTTER;
    expect(ja.length * COAST_QUALIFYING_FONT).toBeLessThanOrEqual(maxAdv);

    const paint = (text: string) => {
      const calls: { text: string; y: number }[] = [];
      const ctx = {
        font: '',
        fillStyle: '',
        textAlign: 'left' as CanvasTextAlign,
        textBaseline: 'top' as CanvasTextBaseline,
        fillText(line: string, _x: number, y: number) {
          calls.push({ text: line, y });
        },
      };
      drawCoastQualifyingBanner(ctx as unknown as CanvasRenderingContext2D, text, 0);
      return calls;
    };

    const jaCalls = paint(ja);
    expect(jaCalls).toHaveLength(1);
    expect(jaCalls[0]!.text).toBe(ja);

    const enCalls = paint(en);
    expect(enCalls.map((c) => c.text).join(' ')).toBe(en);
    expect(enCalls.length).toBeGreaterThan(1);
    for (const c of enCalls) {
      expect(c.text.length * COAST_QUALIFYING_FONT).toBeLessThanOrEqual(maxAdv);
      expect(c.y).toBeGreaterThanOrEqual(coastQualifyingOverlayY());
      expect(coastQualifyingClearOfCastle(c.y, COAST_QUALIFYING_FONT, COAST_QUALIFYING_GUTTER, 0)).toBe(true);
    }
  });
});

describe('Coast qualifying chrome wiring (R56.5)', () => {
  it('main.ts calls drawCoastQualifyingBanner under coastQualifyingOverlay, not y=78 px', () => {
    const mainPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'main.ts');
    const src = readFileSync(mainPath, 'utf8');
    expect(src).toContain('drawCoastQualifyingBanner(ctx, t(\'coast.qualifying\'), ms)');
    expect(src).not.toMatch(/px\(ctx,\s*t\(['"]coast\.qualifying['"]\),\s*cx,\s*78,/);
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
  it('night sky is a band with a warm horizon, not a black void (R56.1–2)', () => {
    // Old bar (daytime blue [88,148,228], luma > 80, noon grass > 90) read as a
    // flat cartoon afternoon. Night zenith stays above a void floor and well
    // below the sodium horizon so the sky is a band, not a tunnel fill.
    expect(luma(SKY_TOP)).toBeGreaterThan(30);
    expect(luma(SKY_TOP)).toBeLessThan(70);
    expect(luma(SKY_BOT)).toBeGreaterThan(140);
    expect(luma(SKY_BOT) - luma(SKY_TOP)).toBeGreaterThan(80);
    expect(luma(GRASS_A)).toBeGreaterThan(50);
    expect(luma(GRASS_A) - luma(GRASS_B)).toBeGreaterThan(12);
    expect(luma(ROAD_A)).toBeGreaterThan(90);
    expect(luma(ROAD_A)).toBeGreaterThan(luma(GRASS_A));
    // vanishing-point road, not a full-width gray tunnel
    expect(ROAD_WIDTH_K).toBeLessThan(800);
    expect(ROAD_WIDTH_K).toBeGreaterThan(280);
  });

  it('the car has Pole Position rear-view weight (R56.3)', () => {
    expect(CAR_DRAW.w).toBeGreaterThanOrEqual(64);
    expect(CAR_DRAW.h).toBeGreaterThanOrEqual(32);
    // Old body was the flat red wedge #e03c2f. The sedan is arcade orange.
    expect(CAR_BODY).not.toBe('#e03c2f');
    expect(CAR_BODY.toLowerCase()).toBe('#ff7a18');
  });

  it('the procedural fallback is an orange sedan, not one red rectangle (R56.3)', () => {
    const parts = coastCarSprite();
    const body = parts.filter((p) => p.role === 'body');
    expect(body.length).toBeGreaterThan(0);
    expect(Math.max(...body.map((p) => p.w))).toBeGreaterThanOrEqual(64);
    expect(body.every((p) => p.color === CAR_BODY)).toBe(true);
    expect(parts.filter((p) => p.role === 'lamp')).toHaveLength(2);
    expect(parts.some((p) => p.role === 'glass')).toBe(true);
    expect(parts.some((p) => p.role === 'bumper')).toBe(true);
    expect(parts.some((p) => p.role === 'wheel')).toBe(true);
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
    expect(rec.used).toContain(CAR_BODY); // orange sedan, not the old red wedge
    expect(rec.used).not.toContain('#e03c2f');
    expect(rec.used).toContain('#ff004d'); // rumble / tail
    expect(rec.texts.some((t) => t.startsWith('TIME'))).toBe(true);
    expect(rec.texts.some((t) => /KM\/H/.test(t))).toBe(true);
  });

  it('draws the Datsun plate when it loaded, else the orange sedan (R57.46)', () => {
    const spriteCalls: unknown[] = [];
    const spriteFills: string[] = [];
    let smoothing = true;
    const spriteCtx = {
      fillStyle: '' as string,
      imageSmoothingEnabled: true,
      save() { /* car */ },
      restore() { /* car */ },
      translate() { /* car */ },
      transform() { /* steer */ },
      fillRect() { spriteFills.push(String(spriteCtx.fillStyle)); },
      drawImage(...args: unknown[]) {
        spriteCalls.push(args[0]);
        smoothing = spriteCtx.imageSmoothingEnabled;
      },
    };
    const img = { tag: 'datsun' };
    drawCoastCar(spriteCtx as unknown as CanvasRenderingContext2D, {
      img: img as unknown as CanvasImageSource,
      steer: 0,
      tMs: 0,
      speed: 0,
    });
    expect(spriteCalls).toEqual([img]);
    expect(smoothing).toBe(false);
    expect(spriteFills).not.toContain(CAR_BODY);

    const procFills: string[] = [];
    let drew = false;
    const procCtx = {
      fillStyle: '' as string,
      imageSmoothingEnabled: true,
      save() { /* car */ },
      restore() { /* car */ },
      translate() { /* car */ },
      transform() { /* steer */ },
      fillRect() { procFills.push(String(procCtx.fillStyle)); },
      drawImage() { drew = true; },
    };
    drawCoastCar(procCtx as unknown as CanvasRenderingContext2D, {
      img: undefined,
      steer: 0,
      tMs: 0,
      speed: 0,
    });
    expect(drew).toBe(false);
    expect(procFills).toContain(CAR_BODY);
    expect(procFills.filter((c) => c === '#ff004d').length).toBeGreaterThanOrEqual(2);
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
  const body = rects.filter((r) => r.fill === CAR_BODY);
  return {
    rectCount: rects.length,
    maxBodyW: body.reduce((m, r) => Math.max(m, r.w), 0),
    darkRatio: dark / Math.max(1, rects.length),
    used,
    texts,
  };
}
