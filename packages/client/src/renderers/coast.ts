import type { CoastState, ObstacleKind } from '@arkad/core';
import { COAST_BILLBOARDS, curveAt, OFF_ROAD_X, TRACK_LEN, MAX_SPEED, t as translate, type Lang } from '@arkad/core';
import { PAL, px, blink } from '../ui';
import { art, type ArtFile } from '../art';

const W = 320;
const H = 240;
const HORIZON = 88;
const CX = 160;

const blend = (a: readonly number[]): string => `rgb(${a[0]!},${a[1]!},${a[2]!})`;

/** Night arcade band — indigo zenith, sodium horizon. Never a black void.
 *  Old daytime zenith was [88,148,228] (luma ~139). */
export const SKY_TOP = [44, 32, 108] as const;
export const SKY_BOT = [255, 164, 64] as const;
export const GRASS_A = [18, 118, 58] as const;
export const GRASS_B = [10, 78, 40] as const;
/** Headlight asphalt: lighter than the night shoulder, not a noon gray slab. */
export const ROAD_A = [118, 108, 132] as const;
export const ROAD_B = [86, 78, 104] as const;
const RUMBLE_A = [255, 48, 64] as const;
const RUMBLE_B = [245, 245, 245] as const;
const CENTER_LINE = '#fff46e';

/** Multiplier on perspective `scale`. 2600 painted a full-width gray tunnel. */
export const ROAD_WIDTH_K = 430;
export const ROADSIDE_POST_STEP = 9;
export const ROADSIDE_TREE_STEP = 20;

export const luma = (rgb: readonly number[]): number =>
  0.299 * rgb[0]! + 0.587 * rgb[1]! + 0.114 * rgb[2]!;

function project(dist: number, camDist: number, playerX: number): { y: number; scale: number; roadW: number; offX: number } {
  const d = Math.max(0.3, dist - camDist);
  const scale = 14 / d;
  const y = HORIZON + 1500 * scale * 0.1;
  const curve = (curveAt(camDist) * Math.min(d, 120) * 0.9 - curveAt(camDist + 60) * 0);
  const roadW = ROAD_WIDTH_K * scale;
  const offX = CX - playerX * roadW * 0.55 - curve * d * 0.35;
  return { y, scale, roadW, offX };
}

/** km/h shown at MAX_SPEED — Tokyo Arcade 1982 is a metric cabinet. */
export const COAST_SPEED_SCALE = 220;

export interface CoastHudSlot {
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  align: CanvasTextAlign;
}

export function coastHudSlots(
  copy: { time: string; speed: string; gate: string; offRoad: string | null },
): { bar: typeof COAST_HUD_BAR; slots: CoastHudSlot[] } {
  const y = 3;
  const size = 10;
  const slots: CoastHudSlot[] = [
    { text: copy.time, x: 6, y, size, color: PAL.yellow, align: 'left' },
    { text: copy.gate, x: CX, y, size, color: PAL.yellow, align: 'center' },
    { text: copy.speed, x: W - 6, y, size, color: PAL.white, align: 'right' },
  ];
  if (copy.offRoad) {
    slots.push({
      text: copy.offRoad,
      x: CX,
      y: 136,
      size: 12,
      color: '#ffd75e',
      align: 'center',
    });
  }
  return { bar: COAST_HUD_BAR, slots };
}

function drawCoastHud(
  ctx: CanvasRenderingContext2D,
  copy: { time: string; speed: string; gate: string; offRoad: string | null },
): void {
  const { bar, slots } = coastHudSlots(copy);
  ctx.fillStyle = COAST_HUD_PLATE;
  ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
  for (const s of slots) {
    if (s.y >= bar.y + bar.h) {
      const tw = s.text.length * s.size;
      ctx.fillStyle = COAST_HUD_PLATE;
      ctx.fillRect(Math.round(s.x - tw / 2 - 4), s.y - 2, tw + 8, s.size + 4);
    }
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      px(ctx, s.text, s.x + dx, s.y + dy, s.size, PAL.black, s.align);
    }
    px(ctx, s.text, s.x, s.y, s.size, s.color, s.align);
  }
}

/** Fuji-scale: wide on the horizon, short enough that the sky still reads. */
export const CASTLE_DRAW = { w: 152, h: 56 } as const;
/** px() uses textBaseline top — qualifying banner must sit below LO-borgen (R56.5). */
export const COAST_QUALIFYING_FONT = 12;
export const COAST_QUALIFYING_GUTTER = 8;
/** Extra pixels between wrapped qualifying lines (EN `QUALIFYING` / `START!`). */
export const COAST_QUALIFYING_LINE_GAP = 2;

/** Screen rect of LO-borgen — same numbers as drawCastle (shift follows curve + steer). */
export function coastCastleRect(shift = 0): { left: number; top: number; right: number; bottom: number } {
  const bx = CX + shift;
  const by = HORIZON + 3;
  const { w, h } = CASTLE_DRAW;
  const left = bx - w / 2;
  const top = by - h + 2;
  return { left, top, right: left + w, bottom: top + h };
}

/** Vertical band for qualifying copy drawn with px(..., baseline top). */
export function coastQualifyingClearOfCastle(
  yTop: number,
  fontPx: number,
  gutter = COAST_QUALIFYING_GUTTER,
  shift = 0,
): boolean {
  const castle = coastCastleRect(shift);
  const bandBottom = yTop + fontPx;
  return bandBottom + gutter <= castle.top || yTop >= castle.bottom + gutter;
}

export function coastQualifyingOverlayY(
  fontPx = COAST_QUALIFYING_FONT,
  gutter = COAST_QUALIFYING_GUTTER,
  shift = 0,
): number {
  return Math.round(coastCastleRect(shift).bottom + gutter);
}

/** Full-em advance — same conservative budget as hall F-hint (CJK fonts). */
export function coastQualifyingAdvance(text: string, fontPx = COAST_QUALIFYING_FONT): number {
  return Math.max(0, text.length * fontPx);
}

/** Horizontal budget under LO-borgen: castle width minus the same 8px gutter JA already has. */
export function coastQualifyingMaxAdvance(shift = 0): number {
  const c = coastCastleRect(shift);
  return Math.max(0, Math.floor(c.right - c.left) - 2 * COAST_QUALIFYING_GUTTER);
}

/** Word-wrap so each line's full-em width fits the castle side gutter. */
export function coastQualifyingWrap(
  text: string,
  fontPx = COAST_QUALIFYING_FONT,
  maxAdvance = coastQualifyingMaxAdvance(),
): string[] {
  if (coastQualifyingAdvance(text, fontPx) <= maxAdvance) return [text];
  const words = text.split(' ').filter((w) => w.length > 0);
  if (words.length <= 1) return [text];
  const lines: string[] = [];
  let cur = words[0]!;
  for (const w of words.slice(1)) {
    const trial = `${cur} ${w}`;
    if (coastQualifyingAdvance(trial, fontPx) <= maxAdvance) cur = trial;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  lines.push(cur);
  return lines;
}

export function coastQualifyingBannerLayout(
  text: string,
  shift = 0,
): { lines: string[]; font: number; y: number; gap: number } {
  const maxAdv = coastQualifyingMaxAdvance(shift);
  let font = COAST_QUALIFYING_FONT;
  let lines = coastQualifyingWrap(text, font, maxAdv);
  while (lines.some((l) => coastQualifyingAdvance(l, font) > maxAdv) && font > 6) {
    font -= 1;
    lines = coastQualifyingWrap(text, font, maxAdv);
  }
  return {
    lines,
    font,
    y: coastQualifyingOverlayY(COAST_QUALIFYING_FONT, COAST_QUALIFYING_GUTTER, shift),
    gap: COAST_QUALIFYING_LINE_GAP,
  };
}

/** R56.5 / R54.5: Pole Position qualifying call — draw below LO-borgen, not on it.
 *  EN `QUALIFYING START!` wraps to the same side gutter as JA 「予選スタート！」. */
export function drawCoastQualifyingBanner(ctx: CanvasRenderingContext2D, text: string, tMs: number): void {
  const layout = coastQualifyingBannerLayout(text);
  const color = blink(tMs, 420) ? PAL.white : PAL.magenta;
  layout.lines.forEach((line, i) => {
    px(
      ctx,
      line,
      CX,
      layout.y + i * (layout.font + layout.gap),
      layout.font,
      color,
      'center',
    );
  });
}

/** Rear-view arcade car — Pole Position weight, not a C64 speck.
 *  Old body was the flat red wedge #e03c2f. 80×52 sat on the asphalt like a
 *  sticker; the seated sedan is a third of the 320 glass. Aspect matches
 *  coast-datsun.png (160×105). */
export const CAR_BODY = '#ff7a18';
export const CAR_DRAW = { w: 120, h: 79 } as const;
/** Tires rest just inside the glass so the bumper is not clipped. */
export const CAR_BOTTOM_INSET = 4;

/** Night moon. The HUD bar ends above it so TIME never sits in the disc. */
export const COAST_MOON = { x: 72, y: 26, r: 8 } as const;
/** Instrument bar — chunky digits, not bare monospace on the sky. */
export const COAST_HUD_BAR = { x: 0, y: 0, w: W, h: 16 } as const;
export const COAST_HUD_PLATE = '#05060c';

export type CoastCarRole = 'shadow' | 'wheel' | 'body' | 'glass' | 'lamp' | 'bumper' | 'plate';

export interface CoastCarPart {
  dx: number;
  dy: number;
  w: number;
  h: number;
  color: string;
  role: CoastCarRole;
}

/** Procedural orange sedan used when `coast-datsun.png` is missing.
 *  Parts stay inside the draw box and the body tracks the box width. */
export function coastCarSprite(w: number = CAR_DRAW.w, h: number = CAR_DRAW.h): CoastCarPart[] {
  const bodyW = Math.round(w * 0.82);
  const cabinW = Math.round(w * 0.5);
  const wheelW = Math.max(10, Math.round(w * 0.15));
  const wheelH = Math.round(h * 0.36);
  const lampW = Math.round(w * 0.12);
  return [
    { role: 'shadow', dx: Math.round(-w * 0.38), dy: -6, w: Math.round(w * 0.76), h: 6, color: 'rgba(20,16,32,0.45)' },
    { role: 'wheel', dx: -Math.round(w / 2), dy: -wheelH - 2, w: wheelW, h: wheelH, color: '#1c1c28' },
    { role: 'wheel', dx: Math.round(w / 2) - wheelW, dy: -wheelH - 2, w: wheelW, h: wheelH, color: '#1c1c28' },
    { role: 'body', dx: -Math.round(bodyW / 2), dy: -Math.round(h * 0.7), w: bodyW, h: Math.round(h * 0.7), color: CAR_BODY },
    { role: 'body', dx: -Math.round(cabinW / 2), dy: -h, w: cabinW, h: Math.round(h * 0.4), color: CAR_BODY },
    { role: 'glass', dx: -Math.round(cabinW * 0.4), dy: -h + 3, w: Math.round(cabinW * 0.8), h: Math.round(h * 0.16), color: '#243056' },
    { role: 'bumper', dx: -Math.round(bodyW * 0.48), dy: -Math.round(h * 0.16), w: Math.round(bodyW * 0.96), h: 6, color: '#c2c3c7' },
    { role: 'lamp', dx: -Math.round(bodyW * 0.44), dy: -Math.round(h * 0.32), w: lampW, h: 7, color: '#ff004d' },
    { role: 'lamp', dx: Math.round(bodyW * 0.44) - lampW, dy: -Math.round(h * 0.32), w: lampW, h: 7, color: '#ff004d' },
    { role: 'plate', dx: -9, dy: -Math.round(h * 0.4), w: 18, h: 7, color: '#f7e766' },
  ];
}

/** Where the seated car is painted. Bottom inset keeps the tires on the glass. */
export function coastCarScreenRect(tMs = 0, speed = 0): { x: number; y: number; w: number; h: number } {
  const bob = Math.sin(tMs / 55) * (speed / MAX_SPEED) * 1.5;
  const bottom = H - CAR_BOTTOM_INSET + bob;
  return {
    x: CX - CAR_DRAW.w / 2,
    y: bottom - CAR_DRAW.h,
    w: CAR_DRAW.w,
    h: CAR_DRAW.h,
  };
}

export interface ObstaclePart {
  dx: number;
  dy: number;
  w: number;
  h: number;
  color: string;
}

/** Pure draw recipe for a roadside prop. Core only stores `kind`. */
export function obstacleSprite(kind: ObstacleKind, scale: number): { w: number; h: number; parts: ObstaclePart[] } {
  const u = Math.max(2, scale * 260);
  switch (kind) {
    case 'barrel': {
      const w = u * 0.72;
      const h = u * 1.2;
      return {
        w, h,
        parts: [
          { dx: -w / 2, dy: -h, w, h, color: '#8a4a22' },
          { dx: -w / 2, dy: -h + h * 0.12, w, h: u * 0.1, color: '#d8b13c' },
          { dx: -w / 2, dy: -h + h * 0.55, w, h: u * 0.1, color: '#d8b13c' },
          { dx: -w * 0.22, dy: -h + h * 0.28, w: w * 0.2, h: h * 0.18, color: '#5a3014' },
        ],
      };
    }
    case 'cone': {
      const w = u * 0.58;
      const h = u * 1.25;
      return {
        w, h,
        parts: [
          { dx: -w / 2, dy: -u * 0.18, w, h: u * 0.18, color: '#1c1c28' },
          { dx: -w * 0.32, dy: -h, w: w * 0.64, h: h * 0.88, color: '#ffa300' },
          { dx: -w * 0.18, dy: -h * 0.52, w: w * 0.36, h: u * 0.1, color: '#fffff5' },
        ],
      };
    }
    case 'rock': {
      const w = u * 1.05;
      const h = u * 0.78;
      return {
        w, h,
        parts: [
          { dx: -w / 2, dy: -h, w, h, color: '#6a6878' },
          { dx: -w * 0.15, dy: -h * 1.25, w: w * 0.55, h: h * 0.55, color: '#8a8894' },
          { dx: w * 0.05, dy: -h * 0.45, w: w * 0.22, h: h * 0.18, color: '#c2c3c7' },
        ],
      };
    }
    case 'post': {
      const w = u * 0.28;
      const h = u * 1.45;
      return {
        w, h,
        parts: [
          { dx: -w / 2, dy: -h, w, h, color: '#1c1c28' },
          { dx: -w / 2, dy: -h, w, h: h * 0.22, color: '#f7e766' },
          { dx: -w / 2, dy: -h * 0.55, w, h: h * 0.22, color: '#f7e766' },
          { dx: -w / 2, dy: -h * 0.22, w, h: h * 0.12, color: '#f7e766' },
        ],
      };
    }
    case 'crate': {
      const w = u * 0.85;
      const h = u * 1.05;
      return {
        w, h,
        parts: [
          { dx: -w / 2, dy: -h, w, h, color: '#ab5236' },
          { dx: -w / 2, dy: -h, w, h: u * 0.08, color: '#d8b13c' },
          { dx: -w / 2, dy: -u * 0.08, w, h: u * 0.08, color: '#d8b13c' },
          { dx: -u * 0.04, dy: -h, w: u * 0.08, h, color: '#5a3014' },
        ],
      };
    }
  }
}

export function coastHudCopy(
  lang: Lang,
  s: { timeLeft: number; speed: number; dist: number; playerX: number; phase: string },
): { time: string; speed: string; gate: string; offRoad: string | null } {
  const secs = Math.ceil(s.timeLeft / 60);
  return {
    time: `${translate(lang, 'coast.time')} ${secs}`,
    speed: `${Math.round((s.speed / MAX_SPEED) * COAST_SPEED_SCALE)} ${translate(lang, 'coast.mph')}`,
    gate: `${translate(lang, 'coast.gate')} ${Math.min(Math.floor(s.dist), TRACK_LEN)}/${TRACK_LEN}`,
    offRoad: Math.abs(s.playerX) > OFF_ROAD_X && s.phase === 'playing' ? translate(lang, 'coast.offRoad') : null,
  };
}

/** LO-borgen is THE landmark beat of Coast — the "wait, that's in the game"
 * silhouette like Pole Position's Fuji: big, haloed by the low sun, proud
 * flag on the keep, visible from every corner of the course. */
function drawCastle(ctx: CanvasRenderingContext2D, shift: number, tMs: number): void {
  const bx = CX + shift;
  const by = HORIZON + 3;
  const { w, h } = CASTLE_DRAW;
  // low-sun halo: the silhouette must pop against the sunset, always
  const halo = ctx.createRadialGradient(bx, by - h * 0.35, 6, bx, by - h * 0.35, w * 0.42);
  halo.addColorStop(0, 'rgba(255,220,100,0.5)');
  halo.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(bx - w * 0.55, by - h - 10, w * 1.1, h + 16);
  const img = art()['coast-lo-castle.png'];
  if (img) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(bx - w / 2), Math.round(by - h + 2), w, h);
    ctx.imageSmoothingEnabled = true;
    return;
  }
  const k = w / 88;
  ctx.fillStyle = '#2c1e40';
  ctx.fillRect(bx - 44 * k, by - 29 * k, 88 * k, 29 * k);
  ctx.fillRect(bx - 52 * k, by - 21 * k, 16 * k, 21 * k);
  ctx.fillRect(bx + 36 * k, by - 21 * k, 16 * k, 21 * k);
  for (const [tx, tw, th] of [[-36, 10, 18], [-10, 13, 26], [16, 10, 18]] as const) {
    ctx.fillRect(bx + tx * k, by - 29 * k - th * k, tw * k, th * k);
    ctx.beginPath();
    ctx.moveTo(bx + tx * k - 3 * k, by - 29 * k - th * k);
    ctx.lineTo(bx + tx * k + (tw * k) / 2, by - 41 * k - th * k);
    ctx.lineTo(bx + tx * k + tw * k + 3 * k, by - 29 * k - th * k);
    ctx.fill();
  }
  if (Math.floor(tMs / 500) % 2 === 0) {
    ctx.fillStyle = '#ffd75e';
    ctx.fillRect(bx - 8 * k, by - 18 * k, 4 * k, 4 * k);
    ctx.fillRect(bx + 5 * k, by - 13 * k, 4 * k, 4 * k);
  }
  ctx.fillStyle = '#1c1c28';
  ctx.fillRect(bx - 4, by - h + 6, 2, 16);
  ctx.fillStyle = PAL.magenta;
  ctx.fillRect(bx - 2, by - h + 6 + (Math.floor(tMs / 220) % 2), 10, 5);
}

/** R54: drive-past billboards along the coast road — stylized 8-bit Swedish
 * nostalgia tableaux (homage scenery, not campaign material). Distances and
 * copy live in the core (COAST_BILLBOARDS); this table adds the visual skin.
 * PNGs from Imagine drop into static/art; the procedural fallback keeps the
 * beat even before they land. LO-borgen stays the primary landmark. */
export const COAST_BOARD_SKIN: readonly { art: ArtFile; accent: string; glyph: 'tree' | 'dinghy' | 'lodge' | 'debate' | 'palm' }[] = [
  { art: 'coast-centerpartiet.png', accent: '#2ee66b', glyph: 'tree' },
  { art: 'coast-harpsund.png', accent: '#f7e766', glyph: 'dinghy' },
  { art: 'coast-bommersvik.png', accent: '#ff004d', glyph: 'lodge' },
  { art: 'coast-valdebatt76.png', accent: '#2de2e6', glyph: 'debate' },
  { art: 'coast-castro-visit.png', accent: '#ffa300', glyph: 'palm' },
];

interface BoardDraw { d: number; side: -1 | 1; text: string; art: ArtFile; accent: string; glyph: 'tree' | 'dinghy' | 'lodge' | 'debate' | 'palm' }

const ROADSIDE: readonly BoardDraw[] = COAST_BILLBOARDS.map((b, i) => ({
  ...b,
  ...COAST_BOARD_SKIN[i % COAST_BOARD_SKIN.length]!,
}));

/** Drive-past window. Farther than this is a vanishing-point speck; closer
 * and the shoulder is gone, so the Swedish plate would be a sliver off-glass. */
export const COAST_BOARD_AHEAD = { near: 46, far: 74 } as const;

/** Screen box for one homage board. Null when it would not read. */
export function coastBillboardScreen(
  boardD: number,
  cam: number,
  side: -1 | 1,
  playerX = 0,
): { x: number; top: number; w: number; h: number } | null {
  const ahead = boardD - cam;
  if (ahead < COAST_BOARD_AHEAD.near || ahead > COAST_BOARD_AHEAD.far) return null;
  const p = project(boardD, cam, playerX);
  const shoulder = (W - Math.min(W, p.roadW)) / 2;
  const w = Math.floor(Math.min(112, shoulder - 8));
  if (w < 80) return null;
  const h = Math.round(w * 0.62);
  const shift = Math.max(-12, Math.min(12, (p.offX - CX) * 0.12));
  const anchor = side < 0 ? shoulder / 2 : W - shoulder / 2;
  const x = Math.max(w / 2 + 1, Math.min(W - w / 2 - 1, anchor + shift));
  const postH = Math.max(4, Math.round(h * 0.28));
  return { x, top: p.y - postH - h, w, h };
}

function drawBillboard(ctx: CanvasRenderingContext2D, b: BoardDraw, cam: number, playerX: number, tMs: number): void {
  const box = coastBillboardScreen(b.d, cam, b.side, playerX);
  if (!box) return;
  const { w: bw, h: bh, x: bx, top: boardTop } = box;
  const postH = Math.max(4, Math.round(bh * 0.28));
  const groundY = boardTop + bh + postH;
  const postW = Math.max(2, Math.round(bw * 0.06));
  ctx.fillStyle = '#241a12';
  ctx.fillRect(bx - bw * 0.3, groundY - postH, postW, postH);
  ctx.fillRect(bx + bw * 0.3 - postW, groundY - postH, postW, postH);
  const img = art()[b.art];
  if (img) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, bx - bw / 2, boardTop, bw, bh);
    ctx.imageSmoothingEnabled = true;
    return;
  }
  ctx.fillStyle = '#10131f';
  ctx.fillRect(bx - bw / 2, boardTop, bw, bh);
  ctx.strokeStyle = PAL.gray;
  ctx.lineWidth = 1;
  ctx.strokeRect(bx - bw / 2 + 0.5, boardTop + 0.5, bw - 1, bh - 1);
  const caption = Math.max(7, Math.min(8, Math.floor(bw / 12)));
  px(ctx, b.text, bx, boardTop + bh - caption - 3, caption, b.accent, 'center');
  const u = bw / 24; // unit grid so glyphs read at every distance
  ctx.fillStyle = b.accent;
  switch (b.glyph) {
    case 'tree':
      ctx.fillRect(bx - u, boardTop + bh - 7 * u, 2 * u, 4 * u);
      ctx.fillRect(bx - 4 * u, boardTop + 3 * u, 8 * u, 6 * u);
      ctx.fillRect(bx - 2.5 * u, boardTop + 1.5 * u, 5 * u, 2 * u);
      break;
    case 'dinghy':
      ctx.fillStyle = 'rgba(45,226,230,0.4)';
      ctx.fillRect(bx - 9 * u, boardTop + bh - 4 * u, 18 * u, 1);
      ctx.fillStyle = b.accent;
      ctx.fillRect(bx - 5 * u, boardTop + bh - 8 * u, 10 * u, 3 * u);
      ctx.fillRect(bx - u * 0.5, boardTop + 3 * u, u, 5 * u);
      break;
    case 'lodge':
      ctx.fillRect(bx - 9 * u, boardTop + bh - 8 * u, 18 * u, 4 * u);
      ctx.fillRect(bx - 10 * u, boardTop + bh - 10 * u, 20 * u, 2 * u);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(bx - 6 * u, boardTop + bh - 7 * u, u, 2 * u);
      ctx.fillRect(bx + 5 * u, boardTop + bh - 7 * u, u, 2 * u);
      break;
    case 'debate':
      ctx.fillRect(bx - 7 * u, boardTop + 3 * u, 14 * u, 8 * u);
      ctx.fillStyle = '#05060c';
      ctx.fillRect(bx - 5 * u, boardTop + 5 * u, 4 * u, 4 * u);
      ctx.fillRect(bx + u, boardTop + 5 * u, 4 * u, 4 * u);
      ctx.fillStyle = PAL.gray;
      ctx.fillRect(bx - u * 0.5, boardTop + 0.5 * u, u, 2.5 * u);
      break;
    case 'palm':
      ctx.fillStyle = '#7a4a20';
      ctx.fillRect(bx - u * 0.5, boardTop + 6 * u, u, 6 * u);
      ctx.fillStyle = b.accent;
      ctx.fillRect(bx - 5 * u, boardTop + 4 * u, 10 * u, 2 * u);
      ctx.fillRect(bx - 2 * u, boardTop + 2 * u, 4 * u, 2 * u);
      if (Math.floor(tMs / 900) % 2 === 0) ctx.fillRect(bx + 6 * u, boardTop + 2 * u, u, u);
      break;
  }
}

/** P1-8: hall minis shrink the road to a thumbnail — a quarter of the
 * strips still reads as the same road, because the grass/road band period
 * is exactly 4 distance units, so a stride of 4 samples one band per strip
 * and the layout is identical, just coarser. Full-size cabinets keep 1. */
export const coastLodStride = (mini: boolean): number => (mini ? 4 : 1);

function nearBillboard(d: number): boolean {
  return ROADSIDE.some((b) => Math.abs(b.d - d) < 12);
}

/** Pole Position rhythm: striped posts every few meters, trees a bit farther
 * out. Presentation only — core obstacles stay the collidable props. */
function drawRoadsideRhythm(
  ctx: CanvasRenderingContext2D,
  cam: number,
  playerX: number,
): void {
  const firstPost = Math.ceil((cam + 6) / ROADSIDE_POST_STEP) * ROADSIDE_POST_STEP;
  for (let d = firstPost; d < cam + 130; d += ROADSIDE_POST_STEP) {
    if (nearBillboard(d)) continue;
    const p = project(d, cam, playerX);
    const ph = Math.max(5, p.scale * 380);
    const pw = Math.max(1, p.scale * 42);
    for (const side of [-1, 1] as const) {
      const x = p.offX + side * (p.roadW * 0.58 + pw);
      ctx.fillStyle = '#fffff5';
      ctx.fillRect(x - pw / 2, p.y - ph, pw, ph);
      ctx.fillStyle = '#ff004d';
      ctx.fillRect(x - pw / 2, p.y - ph, pw, ph * 0.38);
      ctx.fillRect(x - pw / 2, p.y - ph * 0.42, pw, ph * 0.18);
    }
  }
  const firstTree = Math.ceil((cam + 10) / ROADSIDE_TREE_STEP) * ROADSIDE_TREE_STEP;
  for (let d = firstTree; d < cam + 130; d += ROADSIDE_TREE_STEP) {
    if (nearBillboard(d)) continue;
    const p = project(d, cam, playerX);
    const th = Math.max(8, p.scale * 620);
    const tw = Math.max(3, p.scale * 160);
    const side: -1 | 1 = Math.floor(d / ROADSIDE_TREE_STEP) % 2 === 0 ? -1 : 1;
    const x = p.offX + side * (p.roadW * 0.95 + tw);
    ctx.fillStyle = '#6a3a18';
    ctx.fillRect(x - tw * 0.12, p.y - th * 0.45, tw * 0.24, th * 0.45);
    ctx.fillStyle = '#0e6e32';
    ctx.fillRect(x - tw / 2, p.y - th, tw, th * 0.62);
    ctx.fillStyle = '#1c9a44';
    ctx.fillRect(x - tw * 0.32, p.y - th * 0.88, tw * 0.64, th * 0.28);
  }
}

/** Fixed night stars — presentation only, no Math.random. */
const COAST_STARS: readonly (readonly [number, number])[] = [
  [18, 20], [42, 28], [96, 20], [210, 18], [248, 32], [286, 22], [150, 22],
];

/** Orange sedan. Sprite when `coast-datsun.png` loaded, else coastCarSprite. */
export function drawCoastCar(
  ctx: CanvasRenderingContext2D,
  opts: { img?: CanvasImageSource; steer: number; tMs: number; speed: number },
): void {
  const { img, steer, tMs, speed } = opts;
  const rect = coastCarScreenRect(tMs, speed);
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h);
  ctx.transform(1, 0, -steer * 0.1, 1, 0, 0);
  if (img) {
    ctx.fillStyle = 'rgba(5,6,12,0.5)';
    ctx.fillRect(-rect.w * 0.34, -7, rect.w * 0.68, 6);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -rect.w / 2, -rect.h, rect.w, rect.h);
    ctx.imageSmoothingEnabled = true;
    ctx.restore();
    return;
  }
  for (const part of coastCarSprite(rect.w, rect.h)) {
    ctx.fillStyle = part.color;
    ctx.fillRect(part.dx, part.dy, part.w, part.h);
  }
  ctx.restore();
}

/** Top/bottom panes keep the full 320-wide road. A left/right split would be 160 and unreadable. */
export function coastSplitPanes(w = W, h = H): { x: number; y: number; w: number; h: number }[] {
  const half = Math.floor(h / 2);
  return [
    { x: 0, y: 0, w, h: half },
    { x: 0, y: half, w, h: h - half },
  ];
}

function renderCoastPane(ctx: CanvasRenderingContext2D, s: CoastState, tMs = 0, lang: Lang = 'en', mini = false): void {
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, blend(SKY_TOP));
  sky.addColorStop(1, blend(SKY_BOT));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HORIZON);
  ctx.fillStyle = '#fff6d0';
  for (const [sx, sy] of COAST_STARS) ctx.fillRect(sx, sy, 2, 2);
  ctx.fillStyle = '#f4e6a8';
  ctx.beginPath();
  ctx.arc(COAST_MOON.x, COAST_MOON.y, COAST_MOON.r, 0, Math.PI * 2);
  ctx.fill();

  const camCurve = curveAt(s.dist);
  drawCastle(ctx, -camCurve * 90 - s.playerX * 14, tMs);

  ctx.fillStyle = blend(GRASS_A);
  ctx.fillRect(0, HORIZON, W, H - HORIZON);

  const cam = s.dist;
  const stride = coastLodStride(mini);
  for (let d = 140; d >= 1; d -= stride) {
    const p1 = project(cam + d, cam, s.playerX);
    const p0 = project(cam + d - stride, cam, s.playerX);
    if (p1.y > H || p0.y < HORIZON) continue;
    const band = Math.floor((cam + d) / 4) % 2;
    const y = Math.max(HORIZON, p1.y);
    const y2 = Math.min(H, p0.y);
    if (y2 <= y) continue;
    ctx.fillStyle = band ? blend(GRASS_A) : blend(GRASS_B);
    ctx.fillRect(0, y, W, y2 - y);
    ctx.fillStyle = band ? blend(ROAD_A) : blend(ROAD_B);
    ctx.fillRect(p1.offX - p1.roadW / 2, y, p1.roadW, y2 - y);
    const rumble = p1.roadW * 0.1;
    ctx.fillStyle = band ? blend(RUMBLE_A) : blend(RUMBLE_B);
    ctx.fillRect(p1.offX - p1.roadW / 2 - rumble, y, rumble, y2 - y);
    ctx.fillRect(p1.offX + p1.roadW / 2, y, rumble, y2 - y);
    const edge = Math.max(1, p1.scale * 12);
    ctx.fillStyle = '#fffff5';
    ctx.fillRect(p1.offX - p1.roadW / 2, y, edge, y2 - y);
    ctx.fillRect(p1.offX + p1.roadW / 2 - edge, y, edge, y2 - y);
    if (Math.floor((cam + d) / 6) % 2 === 0) {
      ctx.fillStyle = CENTER_LINE;
      ctx.fillRect(p1.offX - Math.max(1, p1.scale * 10), y, Math.max(1, p1.scale * 20), y2 - y);
    }
  }

  if (!mini) drawRoadsideRhythm(ctx, cam, s.playerX);

  for (const b of ROADSIDE) drawBillboard(ctx, b, cam, s.playerX, tMs);

  for (const o of s.obstacles) {
    if (o.hit || o.d < cam + 1 || o.d > cam + 140) continue;
    const p = project(o.d, cam, s.playerX);
    const spr = obstacleSprite(o.kind, p.scale);
    const x = p.offX + o.x * p.roadW * 0.55;
    for (const part of spr.parts) {
      ctx.fillStyle = part.color;
      ctx.fillRect(x + part.dx, p.y + part.dy, part.w, part.h);
    }
  }

  const steer = Math.max(-1, Math.min(1, (s.playerX % 1) * 0.4 + curveAt(s.dist) * 0.3));
  drawCoastCar(ctx, { img: art()['coast-datsun.png'], steer, tMs, speed: s.speed });

  if (!mini) drawCoastHud(ctx, coastHudCopy(lang, s));
}

export function renderCoast(ctx: CanvasRenderingContext2D, s: CoastState, tMs = 0, lang: Lang = 'en', mini = false): void {
  const ids = Object.keys(s.runners ?? {});
  if (s.mode === 'versus' && ids.length >= 2 && !mini) {
    const panes = coastSplitPanes();
    for (let i = 0; i < 2; i++) {
      const id = ids[i]!;
      const pane = panes[i]!;
      const r = s.runners[id];
      if (!r) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(pane.x, pane.y, pane.w, pane.h);
      ctx.clip();
      ctx.translate(pane.x, pane.y);
      ctx.scale(pane.w / W, pane.h / H);
      renderCoastPane(ctx, {
        ...s,
        playerX: r.playerX,
        speed: r.speed,
        dist: r.dist,
        timeLeft: r.timeLeft,
        checkpoints: r.checkpoints,
        obstacles: r.obstacles,
      }, tMs, lang, false);
      ctx.restore();
    }
    ctx.fillStyle = '#f7e766';
    ctx.fillRect(0, H / 2 - 1, W, 2);
    return;
  }
  renderCoastPane(ctx, s, tMs, lang, mini);
}
