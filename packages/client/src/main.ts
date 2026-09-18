import {
  GAME_IDS,
  type GameId,
  type GameMode,
  type HallTablesMsg,
  type Lang,
  type RosterMsg,
  type ScoreListMsg,
  type ServerMessage,
  type SnapshotMsg,
  type WelcomeMsg,
  t as translate,
} from '@arkad/core';
import { Net } from './net';
import { Keys } from './input';
import { Chiptune } from './audio/chiptune';
import { CANVAS_W, CANVAS_H, PAL, PLAYER_COLORS, px, blink } from './ui';
import { renderSnake } from './renderers/snake';
import { renderPuck } from './renderers/puck';
import { renderBlock } from './renderers/block';
import { renderGalaxy } from './renderers/galaxy';
import { renderRiver } from './renderers/river';
import { renderMyriad } from './renderers/myriad';
import { renderCoast } from './renderers/coast';
import { createNamePad, moveCursor, pressKey, keyAt, type NamePad } from './namepad';
import { HALL_SLOTS, MAP_SLOTS, FLOOR_Y, moveHallSel } from './hall';
import {
  DEFAULT_KNOBS, cycleKnob, crtFilterCss, scanlineOpacity, nextAccess,
  loadKnobs, saveKnobs, loadAccess, saveAccess, attractLang, tournamentBanner,
  type CrtKnobs, type AccessMode, type BannerCabinet,
} from './tweaks';
import type { StatsReplyMsg } from '@arkad/core';

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate(lang, key, params);

const renderers: Partial<Record<GameId, (ctx: CanvasRenderingContext2D, data: never, tMs: number) => void>> = {
  snake: (ctx, data, ms) => renderSnake(ctx, data, ms),
  puck: (ctx, data, ms) => renderPuck(ctx, data, ms),
  block: (ctx, data, ms) => renderBlock(ctx, data, ms),
  galaxy: (ctx, data, ms) => renderGalaxy(ctx, data, ms),
  river: (ctx, data, ms) => renderRiver(ctx, data, ms),
  myriad: (ctx, data, ms) => renderMyriad(ctx, data, ms),
  coast: (ctx, data, ms) => renderCoast(ctx, data, ms),
};

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

const net = new Net();
const keys = new Keys();
const audio = new Chiptune();

let lang: Lang = (localStorage.getItem('arkad-lang') as Lang) === 'ja' ? 'ja' : 'en';
type Scene = 'splash' | 'title' | 'name' | 'hall' | 'map' | 'table' | 'scores' | 'credits' | 'service' | 'coinInsert';
let scene: Scene = 'splash';
const bootAt = performance.now();
let creditsFrom: Scene = 'title';
let serviceFrom: Scene = 'title';
let knobs: CrtKnobs = loadKnobs(localStorage, DEFAULT_KNOBS);
let access: AccessMode = loadAccess(localStorage, 'normal');
let stats: StatsReplyMsg | null = null;
let statsAskedAt = 0;
let coinInsertAt = 0;
let pendingMode: GameMode = 'solo';
let namePad: NamePad = createNamePad();
let sel = 0;
type GameInfo = { id: GameId; solo: boolean; versus: boolean };
let world = {
  myId: '',
  games: [] as GameInfo[],
  roster: null as RosterMsg | null,
  snap: null as SnapshotMsg | null,
  scores: null as ScoreListMsg | null,
  hall: null as HallTablesMsg | null,
  error: '',
  errorAt: 0,
};
let joined = false;
let myName = 'AAA';
let lastSnapAt = 0;
let inputSeq = 0;
let lastSentDir: ReturnType<Keys['heldDir']> = null;
let lastSentBtn = false;

net.onMessage((msg: ServerMessage) => {
  switch (msg.type) {
    case 'welcome':
      world.myId = (msg as WelcomeMsg).playerId;
      world.games = (msg as WelcomeMsg).games;
      joined = true;
      break;
    case 'roster':
      world.roster = msg as RosterMsg;
      break;
    case 'snapshot':
      world.snap = msg as SnapshotMsg;
      lastSnapAt = performance.now();
      audio.playEvents(msg.events ?? []);
      break;
    case 'scoreList':
      world.scores = msg as ScoreListMsg;
      break;
    case 'hallTables':
      world.hall = msg as HallTablesMsg;
      break;
    case 'statsReply':
      stats = msg as StatsReplyMsg;
      break;
    case 'error':
      world.error = (msg as { code: string }).code;
      world.errorAt = performance.now();
      break;
  }
});

net.onOpen(() => {
  if (!joined) return;
  // the server gave our old connection a new id: re-join and re-seat
  net.send({ type: 'join', name: myName, lang });
  if (scene === 'hall' || scene === 'map') net.send({ type: 'hall', watch: true });
  if (scene === 'table') {
    world.snap = null;
    const game = GAME_IDS[sel]!;
    net.send({ type: 'start', game, mode: 'versus' });
  }
});
net.connect();

function toggleLang(): void {
  lang = lang === 'en' ? 'ja' : 'en';
  localStorage.setItem('arkad-lang', lang);
  if (joined) net.send({ type: 'join', name: myName, lang });
}

function enterHall(): void {
  scene = 'hall';
  if (joined) net.send({ type: 'hall', watch: true });
}

function openNamePad(): void {
  audio.unlock();
  namePad = createNamePad();
  scene = 'name';
}

function confirmName(): void {
  const name = namePad.text.trim().slice(0, 12) || 'AAA';
  myName = name;
  net.send({ type: 'join', name, lang });
  audio.play('coin');
  enterHall();
}

function startGame(mode: GameMode): void {
  const coinMode = world.hall ? !world.hall.freePlay : false;
  if (coinMode) {
    // R18: the coin goes in first, the game takes the cabinet over after
    audio.unlock();
    net.send({ type: 'coin' });
    audio.play('coin');
    pendingMode = mode;
    coinInsertAt = performance.now();
    scene = 'coinInsert';
    return;
  }
  beginGame(mode);
}

function beginGame(mode: GameMode): void {
  const game = GAME_IDS[sel]!;
  net.send({ type: 'hall', watch: false });
  net.send({ type: 'start', game, mode });
  world.snap = null;
  lastSnapAt = performance.now();
  lastSentDir = null;
  lastSentBtn = false;
  scene = 'table';
}

function applyPresentation(): void {
  canvas.style.filter = crtFilterCss(knobs, access);
  const scan = document.querySelector('.scanlines') as HTMLElement | null;
  if (scan) scan.style.opacity = String(scanlineOpacity(knobs, access));
}

function openService(from: Scene): void {
  serviceFrom = from;
  scene = 'service';
  net.send({ type: 'stats' });
  statsAskedAt = performance.now();
}

function toggleFreePlay(): void {
  const now = world.hall ? !world.hall.freePlay : true;
  net.send({ type: 'freePlay', on: now });
  if (world.hall) world.hall = { ...world.hall, freePlay: now };
  net.send({ type: 'stats' });
}

function back(): void {
  net.send({ type: 'back' });
  world.snap = null;
  enterHall();
}

function openScores(): void {
  const game = GAME_IDS[sel]!;
  net.send({ type: 'scores', game, mode: 'solo' });
  world.scores = null;
  scene = 'scores';
  audio.play('jingle');
}

// ---- scenes -------------------------------------------------------------

function update(ms: number): void {
  if (scene === 'splash') {
    if (ms - bootAt > 3400 || keys.take('Space', 'Enter', 'NumpadEnter', 'KeyZ', 'KeyX')) {
      scene = 'title';
      keys.clear();
    }
  } else if (scene === 'coinInsert') {
    if (performance.now() - coinInsertAt > 750 || keys.take('Space', 'Enter')) beginGame(pendingMode);
  } else if (scene === 'service') {
    if (performance.now() - statsAskedAt > 2000) {
      net.send({ type: 'stats' });
      statsAskedAt = performance.now();
    }
    if (keys.take('KeyF')) toggleFreePlay();
    if (keys.take('KeyA')) {
      access = nextAccess(access);
      saveAccess(localStorage, access);
      applyPresentation();
    }
    for (const k of ['KeyQ', 'KeyW', 'KeyE']) {
      if (keys.take(k)) {
        knobs = cycleKnob(knobs, k);
        saveKnobs(localStorage, knobs);
        applyPresentation();
      }
    }
    if (keys.take('Escape', 'KeyB')) scene = serviceFrom === 'hall' ? 'hall' : 'title';
  } else if (scene === 'title') {
    if (keys.take('Space', 'Enter', 'NumpadEnter')) {
      if (joined) enterHall();
      else openNamePad();
    }
    if (keys.take('KeyC')) {
      creditsFrom = 'title';
      scene = 'credits';
    }
    if (keys.isHeld('ShiftLeft', 'ShiftRight') && keys.take('KeyS')) openService('title');
    if (keys.take('KeyL')) toggleLang();
  } else if (scene === 'name') {
    if (keys.take('ArrowLeft', 'KeyA')) namePad = moveCursor(namePad, { dr: 0, dc: -1 });
    if (keys.take('ArrowRight', 'KeyD')) namePad = moveCursor(namePad, { dr: 0, dc: 1 });
    if (keys.take('ArrowUp', 'KeyW')) namePad = moveCursor(namePad, { dr: -1, dc: 0 });
    if (keys.take('ArrowDown', 'KeyS')) namePad = moveCursor(namePad, { dr: 1, dc: 0 });
    if (keys.take('KeyZ', 'Space', 'Enter', 'NumpadEnter')) namePad = pressKey(namePad, keyAt(namePad, namePad.cursor));
    if (keys.take('Backspace')) namePad = pressKey(namePad, '<');
    if (keys.take('Escape')) scene = 'title';
    if (namePad.done) confirmName();
  } else if (scene === 'hall') {
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS']) {
      if (keys.take(k)) sel = moveHallSel(sel, k);
    }
    const game = GAME_IDS[sel]!;
    const info = world.games.find((g) => g.id === game);
    if (info?.solo && keys.take('KeyZ', 'Space', 'Enter')) startGame('solo');
    if (info?.versus && keys.take('KeyX')) startGame('versus');
    if (keys.take('KeyH')) openScores();
    if (keys.take('KeyM')) scene = 'map';
    if (keys.take('KeyC')) {
      creditsFrom = 'hall';
      scene = 'credits';
    }
    if (keys.isHeld('ShiftLeft', 'ShiftRight') && keys.take('KeyS')) openService('hall');
    if (keys.take('KeyL')) toggleLang();
  } else if (scene === 'map') {
    if (keys.take('KeyM', 'Escape', 'KeyB')) scene = 'hall';
  } else if (scene === 'credits') {
    if (keys.take('KeyA')) {
      access = nextAccess(access);
      saveAccess(localStorage, access);
      applyPresentation();
    }
    if (keys.take('Escape', 'KeyB', 'KeyC')) scene = creditsFrom === 'hall' ? 'hall' : 'title';
  } else if (scene === 'table') {
    const dir = keys.heldDir();
    const button = keys.isHeld('Space', 'KeyZ', 'KeyJ');
    if (dir !== lastSentDir || button !== lastSentBtn) {
      lastSentDir = dir;
      lastSentBtn = button;
      net.send({ type: 'input', dir, button, seq: ++inputSeq });
    }
    if (keys.take('KeyB', 'Escape')) back();
    if (world.snap && world.snap.table.phase === 'attract') back();
    if (performance.now() - lastSnapAt > 4000) back();
  } else if (scene === 'scores') {
    if (keys.take('Escape', 'KeyB', 'KeyH')) scene = 'hall';
  }
  void ms;
}

function drawHud(view: SnapshotMsg['table'], snap: SnapshotMsg): void {
  view.players.forEach((p, i) => {
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length]!;
    px(ctx, p.name.slice(0, 9), 8 + i * 156, 6, 8, p.id === world.myId ? PAL.yellow : color);
    px(ctx, String(p.score).padStart(6, '0'), 8 + i * 156, 14, 8, PAL.white);
    for (let l = 0; l < Math.min(p.lives ?? 0, 5); l++) {
      ctx.fillStyle = color;
      ctx.fillRect(120 + i * 156 + l * 7, 14, 5, 5);
    }
  });
  if (view.mode === 'solo' || view.players.length === 1) {
    const level = (snap.data as { level?: number } | null)?.level ?? 1;
    px(ctx, `${t('hud.level')} ${String(level).padStart(2, '0')}`, CANVAS_W - 8, 6, 8, PAL.gray, 'right');
  } else {
    const level = (snap.data as { level?: number } | null)?.level ?? 1;
    px(ctx, `${t('hud.level')} ${String(level).padStart(2, '0')}`, CANVAS_W / 2, 6, 8, PAL.gray, 'center');
  }
}

function renderGame(ms: number): void {
  const snap = world.snap!;
  const game = snap.table.game;
  const render = renderers[game];
  drawHud(snap.table, snap);
  if (snap.data && render) render(ctx, snap.data as never, ms);

  const phase = snap.table.phase;
  const cx = CANVAS_W / 2;
  if (phase === 'ready' && blink(ms)) px(ctx, t('phase.ready'), cx, 100, 16, PAL.yellow, 'center');
  if (phase === 'roundOver') px(ctx, t('phase.clear'), cx, 100, 16, PAL.cyan, 'center');
  if (phase === 'gameOver') {
    px(ctx, t('phase.gameOver'), cx, 90, 16, PAL.red, 'center');
    if (snap.table.winner) {
      const p = snap.table.players.find((pl) => pl.id === snap.table.winner);
      if (p) px(ctx, t('phase.winner', { name: p.name }), cx, 112, 12, PAL.yellow, 'center');
    }
  }
  if (snap.table.mode === 'versus' && snap.table.turn) {
    const p = snap.table.players.find((pl) => pl.id === snap.table.turn);
    if (p) px(ctx, `${t('hud.turn')}: ${p.name}`, cx, 230, 8, PAL.orange, 'center');
  }
  const iAmSeated = snap.table.players.some((p) => p.id === world.myId);
  if (!iAmSeated) px(ctx, t('misc.spectate'), 8, 230, 8, PAL.gray);
}

function colorBar(y: number, h: number, ms: number): void {
  const colors = [PAL.red, PAL.orange, PAL.yellow, PAL.lime, PAL.cyan, PAL.blue, PAL.magenta];
  const shift = Math.floor(ms / 200) % colors.length;
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(((i + shift) * (CANVAS_W / colors.length)) % CANVAS_W, y, CANVAS_W / colors.length, h);
  });
}

function renderSplash(ms: number): void {
  const cx = CANVAS_W / 2;
  px(ctx, 'TOKYO ARCADE SYSTEM', cx, 44, 12, PAL.cyan, 'center');
  px(ctx, 'MODEL 82', cx, 62, 8, PAL.gray, 'center');
  const title = 'ARKAD';
  const colors = [PAL.red, PAL.orange, PAL.yellow, PAL.lime, PAL.cyan];
  ctx.font = '40px monospace';
  const w = ctx.measureText(title).width;
  let x = cx - w / 2;
  for (let i = 0; i < title.length; i++) {
    ctx.fillStyle = colors[(i + Math.floor(ms / 240)) % colors.length]!;
    ctx.fillText(title[i]!, x, 108);
    x += ctx.measureText(title[i]!).width;
  }
  colorBar(130, 4, ms);
  px(ctx, 'BIOS 1982.6 ... OK', cx, 152, 8, PAL.lime, 'center');
  px(ctx, 'CARTRIDGES 6/6 ... OK', cx, 164, 8, PAL.lime, 'center');
  if (blink(ms, 500)) px(ctx, 'PRESS ANY KEY', cx, 190, 10, PAL.yellow, 'center');
}

function cabinetScreenData(game: GameId): { data: unknown; demo: boolean } | null {
  const cab = world.hall?.cabinets.find((c) => c.game === game);
  return cab && cab.data !== null ? { data: cab.data, demo: cab.demo } : null;
}

function renderCabinet(slot: (typeof HALL_SLOTS)[number], i: number, ms: number, selected: boolean): void {
  const { x, y, w } = slot;
  const screenX = x + 6;
  const screenY = y + 16;
  const screenW = w - 12;
  const screenH = Math.round(screenW * 0.75);

  // body
  ctx.fillStyle = '#181a26';
  ctx.fillRect(x, y, w, slot.h);
  ctx.fillStyle = selected ? PAL.navy : '#10121c';
  ctx.fillRect(x + 2, y + 2, w - 4, slot.h - 4);

  // marquee with light chase
  const marqueeColors = [PAL.red, PAL.magenta, PAL.cyan, PAL.lime, PAL.yellow, PAL.orange];
  ctx.fillStyle = '#000';
  ctx.fillRect(x + 3, y + 2, w - 6, 12);
  const lit = Math.floor(ms / 300 + i) % 2 === 0;
  ctx.fillStyle = lit ? marqueeColors[i % marqueeColors.length]! : PAL.gray;
  px(ctx, slot.game.toUpperCase().slice(0, 13), x + w / 2, y + 4, 8, lit ? PAL.black : PAL.black, 'center');

  // screen
  ctx.fillStyle = '#000';
  ctx.fillRect(screenX, screenY, screenW, screenH);
  const live = cabinetScreenData(slot.game);
  const render = renderers[slot.game];
  if (live && render) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(screenX, screenY, screenW, screenH);
    ctx.clip();
    ctx.translate(screenX, screenY);
    ctx.scale(screenW / CANVAS_W, screenH / CANVAS_H);
    render(ctx, live.data as never, ms);
    ctx.restore();
    if (live.demo && blink(ms, 700)) {
      px(ctx, t('hall.attract'), screenX + 2, screenY + screenH - 9, 7, PAL.yellow);
    }
  } else if (blink(ms, 260)) {
    ctx.fillStyle = PAL.navy;
    for (let sy = 0; sy < screenH; sy += 4) ctx.fillRect(screenX + ((ms / 13 + sy * 7) % screenW), screenY + sy, 3, 1);
  }
  if (selected) {
    ctx.strokeStyle = blink(ms, 400) ? PAL.yellow : PAL.orange;
    ctx.strokeRect(x - 1.5, y - 1.5, w + 3, slot.h + 3);
  }
}

function renderHall(ms: number): void {
  const cx = CANVAS_W / 2;
  // ceiling and back wall
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, CANVAS_W, 34);
  ctx.fillStyle = '#191327';
  ctx.fillRect(0, 34, CANVAS_W, 12);
  const attract = attractLang(ms);
  px(ctx, translate(attract, 'hall.name'), cx, 2, 8, PAL.gray, 'center');
  // R17.3 coin badge, delivered on the hall channel
  const freePlay = world.hall?.freePlay ?? false;
  px(ctx, freePlay ? 'FREE PLAY' : 'COIN 1C', CANVAS_W - 6, 2, 8, freePlay && blink(ms, 500) ? PAL.lime : PAL.orange, 'right');
  // R21.1 tournament banner with 1982 color chase
  const banner = tournamentBanner((world.hall?.cabinets ?? []) as BannerCabinet[], ms);
  const bannerColors = [PAL.red, PAL.orange, PAL.yellow, PAL.lime, PAL.cyan, PAL.magenta];
  px(ctx, banner.text, cx, 24, 9, bannerColors[banner.colorIdx]!, 'center');

  // six cabinets on the floor
  HALL_SLOTS.forEach((slot, i) => renderCabinet(slot, i, ms, i === sel));

  // carpet with neon grid
  const floorY = FLOOR_Y;
  ctx.fillStyle = '#12081c';
  ctx.fillRect(0, floorY, CANVAS_W, CANVAS_H - floorY);
  ctx.fillStyle = 'rgba(224, 58, 138, 0.16)';
  for (let gy = floorY + 6; gy < CANVAS_H - 16; gy += 10) ctx.fillRect(0, gy, CANVAS_W, 1);
  for (let gx = (Math.floor(ms / 130) % 16) * 20 - 20; gx < CANVAS_W; gx += 20) ctx.fillRect(gx, floorY, 1, CANVAS_H - floorY - 16);

  // you-are-here token under the chosen cabinet
  const slot = HALL_SLOTS[sel]!;
  const tx = slot.x + slot.w / 2;
  const ty = Math.min(CANVAS_H - 26, slot.y + slot.h + 4);
  ctx.fillStyle = PAL.yellow;
  ctx.fillRect(tx - 2, ty, 5, 2);
  ctx.fillRect(tx - 1, ty + 2, 3, 6);
  ctx.fillRect(tx - 4, ty + 3, 9, 2);
  px(ctx, myName, tx, ty - 9, 7, PAL.yellow, 'center');

  px(ctx, `Z: ${t('menu.solo')}  X: ${t('menu.versus')}  H: ${t('menu.highScores')}`, cx, CANVAS_H - 14, 8, PAL.lime, 'center');
  px(ctx, `M: ${t('menu.map')}  C: ${t('menu.credits')}  L: ${t('menu.language')}`, cx, CANVAS_H - 4, 7, PAL.gray, 'center');
  const online = world.roster?.players.length ?? 0;
  px(ctx, `${t('lobby.players')}: ${online}`, 6, CANVAS_H - 4, 7, PAL.gray);
  drawError();
}

function renderMap(ms: number): void {
  const cx = CANVAS_W / 2;
  px(ctx, t('menu.map'), cx, 8, 12, PAL.yellow, 'center');
  // room outline
  ctx.strokeStyle = PAL.gray;
  ctx.strokeRect(16.5, 36.5, CANVAS_W - 33, CANVAS_H - 72);
  ctx.fillStyle = PAL.dim;
  ctx.fillRect(17, 37, CANVAS_W - 34, CANVAS_H - 73);
  // entrance
  ctx.fillStyle = PAL.lime;
  ctx.fillRect(cx - 14, CANVAS_H - 38, 28, 3);
  px(ctx, 'ENTRY', cx, CANVAS_H - 32, 7, PAL.lime, 'center');

  MAP_SLOTS.forEach((m, i) => {
    const selected = i === sel;
    ctx.fillStyle = selected ? PAL.navy : '#15151f';
    ctx.fillRect(m.x - 14, m.y - 8, 28, 16);
    ctx.strokeStyle = selected ? (blink(ms, 400) ? PAL.yellow : PAL.orange) : PAL.gray;
    ctx.strokeRect(m.x - 14.5, m.y - 8.5, 29, 17);
    px(ctx, GAME_IDS[i]!.slice(0, 5).toUpperCase(), m.x, m.y - 4, 7, selected ? PAL.yellow : PAL.white, 'center');
  });

  const you = MAP_SLOTS[sel]!;
  ctx.fillStyle = PAL.yellow;
  ctx.beginPath();
  ctx.arc(you.x, you.y + 18, 3, 0, Math.PI * 2);
  ctx.fill();
  px(ctx, 'YOU', you.x, you.y + 22, 7, PAL.yellow, 'center');
  px(ctx, `M/ESC: ${t('menu.back')}`, cx, CANVAS_H - 14, 8, PAL.gray, 'center');
}

function renderCredits(ms: number): void {
  const cx = CANVAS_W / 2;
  const title = t('menu.credits');
  const colors = [PAL.red, PAL.orange, PAL.yellow, PAL.lime, PAL.cyan];
  px(ctx, title, cx, 26, 16, PAL.white, 'center');
  for (let i = 0; i < title.length; i++) {
    ctx.font = `16px ${'monospace'}`;
    ctx.fillStyle = colors[(i + Math.floor(ms / 300)) % colors.length]!;
    const w = ctx.measureText(title).width;
    let x = cx - w / 2;
    for (let j = 0; j < i; j++) x += ctx.measureText(title[j]!).width;
    ctx.fillText(title[i]!, x, 26);
  }
  px(ctx, 'ARKAD', cx, 58, 12, PAL.cyan, 'center');
  px(ctx, 'CREATED BY JENS ABRAHAMSSON', cx, 80, 9, PAL.white, 'center');
  px(ctx, 'LICENSE GPL-3.0-ONLY', cx, 94, 9, PAL.gray, 'center');
  px(ctx, 'TYPESCRIPT · NODE · WS', cx, 116, 8, PAL.lime, 'center');
  px(ctx, 'CANVAS2D · WEB AUDIO · VITEST', cx, 128, 8, PAL.lime, 'center');
  px(ctx, '6 CABINETS · TOKYO 1982', cx, 150, 8, PAL.gray, 'center');
  px(ctx, 'NO AUDIO FILES WERE HARMED', cx, 162, 8, PAL.gray, 'center');
  colorBar(176, 3, ms);
  if (blink(ms)) px(ctx, `ESC: ${t('menu.back')}`, cx, 196, 9, PAL.yellow, 'center');
}

function knobMark(level: 0 | 1 | 2): string {
  return `${'-'.repeat(level)}${level === 0 ? '' : ''}${'▮'.repeat(0)}${['○', '◐', '●'][level]}`;
}

function renderService(ms: number): void {
  const cx = CANVAS_W / 2;
  px(ctx, 'OPERATOR ONLY', cx, 8, 12, PAL.red, 'center');
  px(ctx, t('service.title'), cx, 26, 10, PAL.yellow, 'center');
  const up = stats ? `${Math.floor(stats.uptimeSec / 60)}:${String(stats.uptimeSec % 60).padStart(2, '0')}` : '--:--';
  px(ctx, `PLAYS ${stats?.plays ?? 0}   COINS ${stats?.coins ?? 0}`, 40, 52, 9, PAL.white);
  px(ctx, `UPTIME ${up}`, 40, 66, 9, PAL.white);
  px(ctx, `MODE: ${stats?.freePlay ?? false ? 'FREE PLAY' : 'COIN 1C'}`, 40, 80, 9, (stats?.freePlay ?? false) ? PAL.lime : PAL.orange);
  px(ctx, `BRIGHT ${knobMark(knobs.brightness)}  CONTRAST ${knobMark(knobs.contrast)}  SCAN ${knobMark(knobs.scanlines)}`, 40, 102, 9, PAL.cyan);
  px(ctx, `ACCESS: ${access.toUpperCase()}`, 40, 116, 9, access === 'normal' ? PAL.gray : PAL.yellow);
  px(ctx, 'Q/W/E: KNOB   F: FREE PLAY   A: ACCESS', cx, 146, 8, PAL.white, 'center');
  px(ctx, `ESC: ${t('menu.back')}`, cx, 160, 8, PAL.gray, 'center');
  px(ctx, 'DO NOT ADJUST DURING PLAY', cx, 186, 8, blink(ms, 900) ? PAL.red : PAL.darkred, 'center');
  drawError();
}

function renderCoinInsert(ms: number): void {
  const cx = CANVAS_W / 2;
  const t0 = performance.now() - coinInsertAt;
  px(ctx, t('hall.insertCoin'), cx, 40, 10, PAL.yellow, 'center');
  // cabinet slot
  ctx.fillStyle = PAL.navy;
  ctx.fillRect(cx - 26, 96, 52, 60);
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - 3, 104, 6, 26);
  // the coin dropping in
  const drop = Math.min(1, t0 / 420);
  ctx.fillStyle = PAL.yellow;
  ctx.beginPath();
  ctx.arc(cx, 60 + drop * 48, 6, 0, Math.PI * 2);
  ctx.fill();
  if (t0 > 420 && blink(ms, 150)) {
    ctx.fillStyle = PAL.white;
    ctx.fillRect(cx - 8, 100, 16, 2);
  }
  px(ctx, t('hall.pressStart'), cx, 176, 8, PAL.gray, 'center');
}

function renderTitle(ms: number): void {
  const cx = CANVAS_W / 2;
  const title = t('app.title');
  const colors = [PAL.red, PAL.orange, PAL.yellow, PAL.lime, PAL.cyan];
  px(ctx, title, cx, 48, 36, PAL.white, 'center');
  colors.forEach((c, i) => {
    ctx.font = `36px ${'monospace'}`;
    ctx.fillStyle = c;
    const w = ctx.measureText(title).width;
    const startX = cx - w / 2;
    let x = startX;
    for (let j = 0; j < i; j++) x += ctx.measureText(title[j]!).width;
    ctx.fillText(title[i]!, x, 48);
  });
  px(ctx, t('hall.name'), cx, 92, 8, PAL.gray, 'center');

  const idx = Math.floor(ms / 2200) % GAME_IDS.length;
  const g = GAME_IDS[idx]!;
  const flavorLang = attractLang(ms, 3000);
  px(ctx, translate(flavorLang, `game.${g}` as never), cx, 130, 8, PAL.gray, 'center');
  px(ctx, t(`game.${g}.tag` as never), cx, 144, 8, PAL.cyan, 'center');

  if (blink(ms)) px(ctx, t('hall.insertCoin'), cx, 176, 12, PAL.yellow, 'center');
  px(ctx, t('hall.pressStart'), cx, 196, 8, PAL.white, 'center');
  px(ctx, `L: ${t('menu.language')}  C: ${t('menu.credits')}`, cx, 228, 8, PAL.gray, 'center');
  drawError();
}

function renderNamePad(ms: number): void {
  const cx = CANVAS_W / 2;
  px(ctx, t('hall.insertCoin'), cx, 18, 10, PAL.yellow, 'center');
  px(ctx, t('name.title'), cx, 36, 8, PAL.white, 'center');
  px(ctx, `${namePad.text}${blink(ms) ? '_' : ' '}`, cx, 58, 12, PAL.lime, 'center');

  const kw = 24;
  const kh = 15;
  namePad.rows.forEach((row, r) => {
    const y = 84 + r * 22;
    const x0 = cx - (row.length * kw) / 2;
    row.forEach((k, c) => {
      const label = k === ' ' ? 'SPACE' : k === '<' ? 'DEL' : k;
      const w = label === 'SPACE' ? kw + 16 : label === 'DEL' ? kw : kw;
      const kx = x0 + c * kw + (label === 'SPACE' ? -8 : 0);
      const hot = namePad.cursor.row === r && namePad.cursor.col === c;
      ctx.fillStyle = hot ? (blink(ms, 350) ? PAL.yellow : PAL.orange) : PAL.navy;
      ctx.fillRect(kx, y, w - 2, kh);
      px(ctx, label, kx + (w - 2) / 2, y + 4, 8, hot ? PAL.black : PAL.white, 'center');
    });
  });
  px(ctx, `Z: ${t('name.select')}  ESC: ${t('name.cancel')}`, cx, 186, 8, PAL.gray, 'center');
  px(ctx, `${namePad.text.length}/12`, cx, 202, 8, PAL.gray, 'center');
}

function renderScores(ms: number): void {
  const cx = CANVAS_W / 2;
  px(ctx, t('score.title'), cx, 12, 12, PAL.yellow, 'center');
  const entries = world.scores?.entries ?? [];
  if (entries.length === 0) {
    px(ctx, t('score.empty'), cx, 100, 10, PAL.gray, 'center');
  }
  entries.forEach((e, i) => {
    const y = 36 + i * 14;
    const color = i === 0 ? PAL.yellow : i === 1 ? PAL.gray : i === 2 ? PAL.orange : PAL.white;
    px(ctx, `${String(i + 1).padStart(2, '0')}`, 60, y, 9, PAL.gray);
    px(ctx, e.name, 84, y, 9, color);
    px(ctx, String(e.score).padStart(7, '0'), 240, y, 9, color);
  });
  if (blink(ms, 1200)) colorBar(2, 2, ms);
  px(ctx, `ESC: ${t('menu.back')}`, cx, 226, 8, PAL.gray, 'center');
}

function drawError(): void {
  if (world.error && performance.now() - world.errorAt < 2500) px(ctx, world.error, CANVAS_W / 2, 118, 8, PAL.red, 'center');
}

// ---- main loop ----------------------------------------------------------

function frame(ms: number): void {
  update(ms);
  ctx.fillStyle = PAL.black;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  if (net.status !== 'open' && scene !== 'splash') {
    px(ctx, t(net.status === 'connecting' ? 'net.connecting' : 'net.lost'), CANVAS_W / 2, 116, 10, PAL.gray, 'center');
  } else if (scene === 'splash') renderSplash(ms);
  else if (scene === 'title') renderTitle(ms);
  else if (scene === 'name') renderNamePad(ms);
  else if (scene === 'hall') renderHall(ms);
  else if (scene === 'map') renderMap(ms);
  else if (scene === 'credits') renderCredits(ms);
  else if (scene === 'table') {
    if (world.snap) renderGame(ms);
    else px(ctx, t('lobby.waiting'), CANVAS_W / 2, 116, 10, PAL.gray, 'center');
  } else if (scene === 'scores') renderScores(ms);
  applyPresentation();
requestAnimationFrame(frame);
}

applyPresentation();
requestAnimationFrame(frame);
