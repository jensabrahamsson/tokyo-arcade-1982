import type { CoastState } from '@arkad/core';
import { COAST_BILLBOARDS, curveAt, OFF_ROAD_X, TRACK_LEN, MAX_SPEED, t as translate, type Lang } from '@arkad/core';
import { PAL } from '../ui';
import { art, type ArtFile } from '../art';

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

/** LO-borgen is THE landmark beat of Coast — the "wait, that's in the game"
 * silhouette like Pole Position's Fuji: big, haloed by the low sun, proud
 * flag on the keep, visible from every corner of the course. */
function drawCastle(ctx: CanvasRenderingContext2D, shift: number, tMs: number): void {
  const bx = CX + shift;
  const by = HORIZON + 3;
  // low-sun halo: the silhouette must pop against the sunset, always
  const halo = ctx.createRadialGradient(bx, by - 30, 6, bx, by - 30, 56);
  halo.addColorStop(0, 'rgba(255,206,84,0.45)');
  halo.addColorStop(1, 'rgba(255,206,84,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(bx - 70, by - 92, 140, 100);
  const img = art()['coast-lo-castle.png'];
  if (img) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, bx - 56, by - 56, 112, 56);
    ctx.imageSmoothingEnabled = true;
  } else {
    ctx.fillStyle = '#2c1e40';
    ctx.fillRect(bx - 44, by - 29, 88, 29);
    ctx.fillRect(bx - 52, by - 21, 16, 21);
    ctx.fillRect(bx + 36, by - 21, 16, 21);
    for (const [tx, w, h] of [[-36, 10, 18], [-10, 13, 26], [16, 10, 18]] as const) {
      ctx.fillRect(bx + tx, by - 29 - h, w, h);
      ctx.beginPath();
      ctx.moveTo(bx + tx - 3, by - 29 - h);
      ctx.lineTo(bx + tx + w / 2, by - 41 - h);
      ctx.lineTo(bx + tx + w + 3, by - 29 - h);
      ctx.fill();
    }
    if (Math.floor(tMs / 500) % 2 === 0) {
      ctx.fillStyle = '#ffd75e';
      ctx.fillRect(bx - 8, by - 18, 4, 4);
      ctx.fillRect(bx + 5, by - 13, 4, 4);
    }
  }
  // the flag: mast above the tallest keep, pink banner snapping in the sea wind
  ctx.fillStyle = '#1c1c28';
  ctx.fillRect(bx - 4, by - 78, 1, 15);
  ctx.fillStyle = PAL.magenta;
  ctx.fillRect(bx - 3, by - 78 + (Math.floor(tMs / 220) % 2), 7, 4);
}

/** R54: drive-past billboards along the coast road — stylized 8-bit Swedish
 * nostalgia tableaux (homage scenery, not campaign material). Distances and
 * copy live in the core (COAST_BILLBOARDS); this table adds the visual skin.
 * PNGs from Imagine drop into static/art; the procedural fallback keeps the
 * beat even before they land. LO-borgen stays the primary landmark. */
const ROADSIDE_SKIN: readonly { art: ArtFile; accent: string; glyph: 'tree' | 'dinghy' | 'lodge' | 'debate' | 'palm' }[] = [
  { art: 'coast-centerpartiet.png', accent: '#2ee66b', glyph: 'tree' },
  { art: 'coast-harpsund.png', accent: '#f7e766', glyph: 'dinghy' },
  { art: 'coast-bommersvik.png', accent: '#ff004d', glyph: 'lodge' },
  { art: 'coast-valdebatt76.png', accent: '#2de2e6', glyph: 'debate' },
  { art: 'coast-castro-visit.png', accent: '#ffa300', glyph: 'palm' },
];

interface BoardDraw { d: number; side: -1 | 1; text: string; art: ArtFile; accent: string; glyph: 'tree' | 'dinghy' | 'lodge' | 'debate' | 'palm' }

const ROADSIDE: readonly BoardDraw[] = COAST_BILLBOARDS.map((b, i) => ({
  ...b,
  ...ROADSIDE_SKIN[i % ROADSIDE_SKIN.length]!,
}));

function drawBillboard(ctx: CanvasRenderingContext2D, b: BoardDraw, p: { y: number; scale: number; roadW: number; offX: number }, tMs: number): void {
  const bw = Math.max(12, p.scale * 900);
  const bh = Math.round(bw * 0.62);
  const bx = p.offX + b.side * (p.roadW * 1.35 + bw * 0.7);
  if (bx < -bw || bx > W + bw) return;
  const groundY = p.y;
  const postW = Math.max(1, Math.round(bw * 0.06));
  const postH = Math.max(2, Math.round(bh * 0.45));
  ctx.fillStyle = '#241a12';
  ctx.fillRect(bx - bw * 0.3, groundY - postH, postW, postH);
  ctx.fillRect(bx + bw * 0.3 - postW, groundY - postH, postW, postH);
  const boardTop = groundY - postH - bh;
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
  if (bw >= 44) {
    // the board carries its 1982 copy once it is big enough to read
    ctx.font = `${Math.max(5, Math.min(8, Math.round(bw / 12)))}px monospace`;
    ctx.fillStyle = b.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(b.text, Math.round(bx), Math.round(boardTop + bh - 12));
  }
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

export function renderCoast(ctx: CanvasRenderingContext2D, s: CoastState, tMs = 0, lang: Lang = 'en'): void {
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
  // a landmark this far away barely shifts with the car — it anchors the sky
  drawCastle(ctx, -camCurve * 110 - s.playerX * 16, tMs);

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

  for (const b of ROADSIDE) {
    if (b.d < cam + 1 || b.d > cam + 140) continue;
    drawBillboard(ctx, b, project(b.d, cam, s.playerX), tMs);
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
  ctx.fillText(`${translate(lang, 'coast.time')} ${secs}`, 6, 12);
  ctx.fillText(`${Math.round((s.speed / MAX_SPEED) * 220)} ${translate(lang, 'coast.mph')}`, W - 54, 12);
  ctx.fillText(`${translate(lang, 'coast.gate')} ${Math.min(Math.floor(s.dist), TRACK_LEN)}/${TRACK_LEN}`, 6, 22);
  if (Math.abs(s.playerX) > OFF_ROAD_X && s.phase === 'playing') {
    ctx.fillStyle = '#ffd75e';
    ctx.fillText(translate(lang, 'coast.offRoad'), CX - 26, H - 60);
  }
}
