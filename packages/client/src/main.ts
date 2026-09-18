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
import { art, loadArtBrowser } from './art';
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
  volumeGain, effectiveGain, cycleVolume, loadVolume, saveVolume, loadMuted, saveMuted,
  joinCountdown, marqueeOffset, marqueeLamp, visibleSpectators, rejectToast, toastVisible, TOAST_MS, walkBob, creditStrip,
  freePlayBannerVisible, cabinetFocus, isNewRecord, recordFlashVisible, blinkOn,
  powerLed, ledState, scoreCrawlOffset,
  waitDots, thunkEnvelope, formatHallClock, exitToastVisible,
  attractGain, effectiveAttractGain, heatShimmer, readyCountdown, initialGlow,
  testToneAllowed, shouldRequestFullscreen, fullscreenHintVisible, cartridgeBadge, DEFAULT_VOLUME, type CrtKnobs, type AccessMode, type BannerCabinet, type VolumeDetent,
} from './tweaks';
import type { StatsReplyMsg } from '@arkad/core';

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate(lang, key, params);

const MARQUEE_KEYS = ['marquee.1', 'marquee.2', 'marquee.3'] as const;

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

loadArtBrowser(); // R38: async pixel-art atlas; renderers fall back until it lands

const net = new Net();
const keys = new Keys();
const audio = new Chiptune();

let lang: Lang = (localStorage.getItem('arkad-lang') as Lang) === 'ja' ? 'ja' : 'en';
type Scene = 'splash' | 'title' | 'name' | 'hall' | 'map' | 'table' | 'scores' | 'credits' | 'service' | 'note' | 'coinInsert';
let scene: Scene = 'splash';
const bootAt = performance.now();
let creditsFrom: Scene = 'title';
let serviceFrom: Scene = 'title';
let knobs: CrtKnobs = loadKnobs(localStorage, DEFAULT_KNOBS);
let access: AccessMode = loadAccess(localStorage, 'normal');
let stats: StatsReplyMsg | null = null;
let volume: VolumeDetent = loadVolume(localStorage, DEFAULT_VOLUME);
let muted = loadMuted(localStorage, false);
let statsAskedAt = 0;
let coinInsertAt = 0;
let pendingMode: GameMode = 'solo';
let namePad: NamePad = createNamePad();
let sel = 0;
let hallSteps = 0;
let recordFlashAt = 0;
let exitToastAt = 0;
let lastToneAt = 0;
const idleSince: Partial<Record<GameId, number>> = {};
let recordCheckedFor = '';
let pendingRecord: { tableId: string; game: GameId; mode: GameMode; myScore: number } | null = null;
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
    case 'scoreList': {
      const list = msg as ScoreListMsg;
      world.scores = list;
      if (pendingRecord && list.game === pendingRecord.game && list.mode === pendingRecord.mode) {
        if (isNewRecord(pendingRecord.myScore, list.entries.map((e) => e.score), 10)) {
          recordFlashAt = performance.now();
          audio.play('extraLife');
        }
        pendingRecord = null;
      }
      break;
    }
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
  requestHallFullscreen(); // R53: playtest wants the hall to fill the screen
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
    net.send({ type: 'coin', game: GAME_IDS[sel]! });
    audio.play('coin');
    audio.play('thunk'); // R44: the slot swallows it
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

function requestHallFullscreen(): void {
  if (!shouldRequestFullscreen('hall')) return;
  try {
    const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    void el.requestFullscreen?.().catch(() => undefined);
  } catch {
    /* graceful no-op where the API is missing */
  }
}

function toggleFullscreen(): void {
  try {
    const doc = document as Document & { exitFullscreen?: () => Promise<void> };
    if (document.fullscreenElement) void doc.exitFullscreen?.().catch(() => undefined);
    else requestHallFullscreen();
  } catch {
    /* graceful no-op */
  }
}

function applyPresentation(): void {
  const liveSeat = (world.hall?.cabinets ?? []).some((c) => !c.demo && c.players > 0);
  audio.setAttract(scene === 'table' ? 1 : attractGain(liveSeat));
  audio.setMaster(effectiveGain(volume, muted));
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

function toggleOoo(): void {
  const game = GAME_IDS[sel]!;
  const out = !(world.hall?.ooo ?? []).includes(game);
  net.send({ type: 'ooo', game, out });
  world.hall = world.hall ? { ...world.hall, ooo: out ? [...(world.hall.ooo ?? []), game].sort() : (world.hall.ooo ?? []).filter((g) => g !== game) } : world.hall;
}

function isOoo(game: GameId): boolean {
  return (world.hall?.ooo ?? []).includes(game);
}

function back(): void {
  if (scene === 'table' && world.snap?.table.players.some((pl) => pl.id === world.myId)) {
    exitToastAt = performance.now(); // R47: the cabinet says goodbye
  }
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
    if (keys.take('KeyV')) {
      volume = cycleVolume(volume);
      saveVolume(localStorage, volume);
      applyPresentation();
      audio.play('bounce');
    }
    if (keys.take('KeyM')) {
      muted = !muted;
      saveMuted(localStorage, muted);
      applyPresentation();
    }
    if (keys.take('KeyO')) toggleOoo();
    if (keys.take('KeyT')) {
      const now = performance.now();
      if (testToneAllowed(lastToneAt, now)) {
        lastToneAt = now;
        audio.play('test');
      }
    }
    if (keys.take('KeyN')) {
      audio.unlock();
      namePad = createNamePad();
      scene = 'note';
    }
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
    if (keys.take('KeyF')) toggleFullscreen();
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
  } else if (scene === 'note') {
    if (keys.take('ArrowLeft', 'KeyA')) namePad = moveCursor(namePad, { dr: 0, dc: -1 });
    if (keys.take('ArrowRight', 'KeyD')) namePad = moveCursor(namePad, { dr: 0, dc: 1 });
    if (keys.take('ArrowUp', 'KeyW')) namePad = moveCursor(namePad, { dr: -1, dc: 0 });
    if (keys.take('ArrowDown', 'KeyS')) namePad = moveCursor(namePad, { dr: 1, dc: 0 });
    if (keys.take('KeyZ', 'Space', 'Enter', 'NumpadEnter')) namePad = pressKey(namePad, keyAt(namePad, namePad.cursor));
    if (keys.take('Backspace')) namePad = pressKey(namePad, '<');
    if (keys.take('Escape')) scene = 'service';
    if (namePad.done) {
      const text = namePad.text.trim().replace(/\s+/g, ' ').slice(0, 24);
      net.send({ type: 'note', text });
      if (world.hall) world.hall = { ...world.hall, note: text };
      scene = 'service';
      audio.play('coin');
    }
  } else if (scene === 'hall') {
    if (keys.take('KeyF')) toggleFullscreen();
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS']) {
      if (keys.take(k)) {
        const next = moveHallSel(sel, k);
        if (next !== sel) {
          sel = next;
          hallSteps++;
        }
      }
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
    if (world.snap?.table.phase === 'gameOver') {
      const mine = world.snap.table.players.find((pl) => pl.id === world.myId);
      if (mine && recordCheckedFor !== world.snap.table.id) {
        recordCheckedFor = world.snap.table.id;
        pendingRecord = {
          tableId: world.snap.table.id,
          game: world.snap.table.game,
          mode: world.snap.table.mode,
          myScore: mine.score,
        };
        net.send({ type: 'scores', game: pendingRecord.game, mode: pendingRecord.mode });
      }
    }
    if (keys.take('KeyP') && world.snap?.table.players.some((p) => p.id === world.myId)) {
      net.send({ type: 'pause' });
      audio.unlock();
    }
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
  const crowd = visibleSpectators(snap.table.spectators ?? 0);
  if (crowd !== null) px(ctx, `${t('hall.watching')} ${crowd}`, CANVAS_W - 6, 230, 8, PAL.cyan, 'right');
  const myStrip = creditStrip(snap.credits ?? 0, world.hall?.freePlay ?? false);
  if (myStrip !== null) px(ctx, `${t('hall.credits')} ${myStrip}`, 8, 222, 8, PAL.yellow);
  if (recordFlashVisible(recordFlashAt, performance.now())) {
    const f = Math.floor(performance.now() / 180) % 2 === 0;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 84, CANVAS_W, 52);
    px(ctx, t('record.new'), CANVAS_W / 2, 92, 18, f ? PAL.yellow : PAL.white, 'center');
  }
  if (snap.table.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    px(ctx, 'PAUSE', cx, 104, 24, blink(ms, 450) ? PAL.yellow : PAL.orange, 'center');
    px(ctx, t('pause.title'), cx, 130, 12, PAL.cyan, 'center');
  }
  if (snap.table.readyAt != null) {
    const msSinceFull = 3000 - ((snap.table.readyAt - (snap.tick ?? snap.table.readyAt)) * 1000) / 60;
    const secs = readyCountdown(msSinceFull);
    if (secs !== null) px(ctx, `READY ${secs}`, CANVAS_W / 2, 104, 20, blink(ms, 400) ? PAL.yellow : PAL.orange, 'center');
  }
  const left = joinCountdown(snap.table.joinDeadline ?? null, snap.tick ?? 0);
  if (left !== null) {
    px(ctx, `${t('hud.joinWindow')} ${left}`, cx, 218, 10, left <= 2 && blink(ms, 300) ? PAL.red : PAL.orange, 'center');
  }
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
  const logo = art()['splash-logo.png'];
  if (logo) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(logo, cx - 48, 56, 96, 96);
    ctx.imageSmoothingEnabled = true;
  }
  colorBar(130, 4, ms);
  px(ctx, 'BIOS 1982.6 ... OK', cx, 152, 8, PAL.lime, 'center');
  px(ctx, `CARTRIDGES ${cartridgeBadge(GAME_IDS.length)} ... OK`, cx, 164, 8, PAL.lime, 'center');
  if (blink(ms, 500)) px(ctx, 'PRESS ANY KEY', cx, 190, 10, PAL.yellow, 'center');
}

function cabinetScreenData(game: GameId): { data: unknown; demo: boolean } | null {
  const cab = world.hall?.cabinets.find((c) => c.game === game);
  return cab && cab.data !== null ? { data: cab.data, demo: cab.demo } : null;
}

function renderCabinet(
  slot: (typeof HALL_SLOTS)[number],
  i: number,
  ms: number,
  selected: boolean,
  focusIdx: number | null = null,
): void {
  const { x, y, w } = slot;
  const screenX = x + 6;
  const screenY = y + 16;
  const screenW = w - 12;
  const screenH = Math.round(screenW * 0.75);

  // body
  const bezel = art()['cabinet-bezel.png'];
  if (bezel) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bezel, x, y, w, slot.h);
    ctx.imageSmoothingEnabled = true;
  }
  ctx.fillStyle = 'rgba(24,26,38,0.75)';
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
  const cab = world.hall?.cabinets.find((c) => c.game === slot.game);
  const lamp = marqueeLamp({ demo: cab?.demo ?? true, players: cab?.players ?? 0 }, isOoo(slot.game));
  if (lamp === 'out-of-order') {
    ctx.fillStyle = PAL.darkred;
    ctx.fillRect(x + 3, y + 2, w - 6, 12);
    px(ctx, t('cab.ooo'), x + w / 2, y + 4, 8, blink(ms, 400) ? PAL.yellow : PAL.red, 'center');
  } else if (lamp === 'now-playing') {
    ctx.fillStyle = PAL.lime;
    ctx.fillRect(x + 4, y + 4, 4, 4);
    px(ctx, t('hall.nowPlaying'), x + w - 4, y + 4, 7, blink(ms, 600) ? PAL.lime : PAL.green, 'right');
  }

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
    const left = joinCountdown(cab?.joinDeadline ?? null, world.hall?.tick ?? 0);
    if (left !== null) {
      px(ctx, `JOIN ${left}`, screenX + screenW - 2, screenY + screenH - 9, 7, blink(ms, 400) ? PAL.red : PAL.orange, 'right');
    }
    if (selected && lamp === 'now-playing') {
      const badge = art()['wait-badge.png'];
      if (badge) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(badge, screenX + 2, screenY + 2, 12, 12);
        ctx.imageSmoothingEnabled = true;
      }
      const dots = '.'.repeat(1 + waitDots(Math.floor(ms / 300), 4));
      px(ctx, `${t('hall.wait')}${dots}`, screenX + 16, screenY + 5, 7, PAL.yellow);
    }
    const crowd = visibleSpectators(cab?.spectators ?? 0);
    if (crowd !== null) {
      px(ctx, `${t('hall.watching')} ${crowd}`, screenX + 2, screenY + 2, 7, PAL.cyan);
    }
    const scores = cab?.scores ?? [];
    if (live.demo && scores.length > 0) {
      // R41: top-3 roll crawl over the attract noise
      ctx.fillStyle = 'rgba(0,0,10,0.78)';
      ctx.fillRect(screenX + screenW - 62, screenY, 62, screenH);
      px(ctx, t('hall.topScores'), screenX + screenW - 60, screenY + 1, 6, PAL.yellow);
      ctx.save();
      ctx.beginPath();
      ctx.rect(screenX + screenW - 62, screenY + 10, 62, screenH - 20);
      ctx.clip();
      const off = scoreCrawlOffset(ms, 9, 5000);
      const strip = [...scores.slice(0, 3), null];
      strip.forEach((e, r) => {
        const ry = screenY + 11 + r * 9 - off + screenH;
        if (!e || ry < screenY - 2 || ry > screenY + screenH) return;
        px(ctx, e.name.slice(0, 5).toUpperCase(), screenX + screenW - 60, ry, 6, PAL.white);
        px(ctx, String(e.score).slice(0, 6), screenX + screenW - 4, ry, 6, PAL.cyan, 'right');
      });
      ctx.restore();
    }
  } else if (blink(ms, 260)) {
    ctx.fillStyle = PAL.navy;
    for (let sy = 0; sy < screenH; sy += 4) ctx.fillRect(screenX + ((ms / 13 + sy * 7) % screenW), screenY + sy, 3, 1);
  }
  // R40 power LED: OOO > playing > idle, red pulses
  const led = powerLed(ledState({ live: lamp === 'now-playing', ooo: isOoo(slot.game) }));
  const ledOn = led.duty === 1 || (led.duty > 0 ? blinkOn(Math.floor(ms / 300), 4, led.duty) : false);
  ctx.fillStyle = ledOn ? (led.color === 'red' ? PAL.red : led.color === 'lime' ? PAL.lime : PAL.gray) : PAL.dim;
  ctx.fillRect(x + 2, y + slot.h - 4, 3, 3);
  if (focusIdx === i) {
    ctx.strokeStyle = PAL.cyan;
    ctx.strokeRect(x - 3.5, y - 3.5, w + 7, slot.h + 7);
  }
  if (selected) {
    ctx.strokeStyle = blink(ms, 400) ? PAL.yellow : PAL.orange;
    ctx.strokeRect(x - 1.5, y - 1.5, w + 3, slot.h + 3);
  }
  // R33 credit digits: yours on every cabinet you point at; free-play hides them,
  // OOO wins visually (the marquee overlay already claims attention)
  const strip = creditStrip(world.hall?.credits ?? 0, world.hall?.freePlay ?? false);
  if (strip !== null && lamp !== 'out-of-order') {
    const panel = art()['credit-panel.png'];
    if (panel) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(panel, x + w - 40, y + slot.h - 11, 38, 10);
      ctx.imageSmoothingEnabled = true;
    }
    px(ctx, `${t('hall.credits')} ${strip}`, x + w - 2, y + slot.h - 8, 7, PAL.yellow, 'right');
  }
  if (lamp === 'idle') {
    if (idleSince[slot.game] === undefined) idleSince[slot.game] = ms;
    const idleFor = Math.min(ms - idleSince[slot.game]!, 600_000);
    const heat = heatShimmer(idleFor, Math.floor(ms / 130));
    if (heat.alpha > 0) {
      ctx.save();
      ctx.globalAlpha = heat.alpha;
      ctx.fillStyle = PAL.white;
      for (let sy = 0; sy < screenH; sy += 4) ctx.fillRect(screenX + heat.offset, screenY + sy + heat.offset, screenW, 1);
      ctx.restore();
    }
  } else {
    idleSince[slot.game] = ms;
  }
  // R37 attract INSERT COIN blink: idle cabinets only, OOO and live win first
  if (lamp === 'idle' && !isOoo(slot.game) && !(world.hall?.freePlay ?? false)
    && blinkOn(Math.floor(ms / 320), 6, 0.5)) {
    ctx.strokeStyle = PAL.orange;
    ctx.strokeRect(screenX + 0.5, screenY + 0.5, screenW - 1, screenH - 1);
    px(ctx, t('hall.insertCoin'), screenX + screenW / 2, screenY + screenH / 2, 8, PAL.yellow, 'center');
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
  // R27: neon marquee scroll along the back wall, EN/JA parity, presentation only
  {
    const flavorKey = MARQUEE_KEYS[Math.floor(ms / 9000) % MARQUEE_KEYS.length]!;
    const flavor = translate(attractLang(ms, 3000), flavorKey);
    const neon = art()['marquee-neon.png'];
    if (neon) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      for (let nx = 20; nx < CANVAS_W - 20; nx += 120) ctx.drawImage(neon, nx, 7, 120, 11);
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(20, 8, CANVAS_W - 40, 10);
    ctx.clip();
    const off = marqueeOffset(ms, (CANVAS_W - 40) / 2 + 60, 7000);
    px(ctx, flavor, cx + off, 12, 8, PAL.magenta, 'center');
    ctx.restore();
  }
  // R17.3 coin badge, delivered on the hall channel
  const freePlay = world.hall?.freePlay ?? false;
  px(ctx, freePlay ? 'FREE PLAY' : 'COIN 1C', CANVAS_W - 6, 2, 8, freePlay && blink(ms, 500) ? PAL.lime : PAL.orange, 'right');
  // R21.1 tournament banner with 1982 color chase
  if (freePlayBannerVisible(world.hall?.freePlay ?? false)) {
    const fp = t('hall.freePlay');
    const w = ctx.measureText(fp).width;
    ctx.fillStyle = PAL.navy;
    ctx.fillRect(cx - 60, CANVAS_H - 56, 120, 12);
    px(ctx, fp, cx, CANVAS_H - 54, 9, blink(ms, 500) ? PAL.lime : PAL.cyan, 'center');
    void w;
  }
  const wallClock = formatHallClock(Date.now(), -new Date().getTimezoneOffset());
  px(ctx, t('hall.clock'), CANVAS_W - 6, 14, 6, PAL.dim, 'right');
  px(ctx, wallClock, CANVAS_W - 6, 22, 10, PAL.cyan, 'right');
  const note = world.hall?.note ?? '';
  if (note) {
    ctx.font = '8px monospace';
    const nw = ctx.measureText(note).width + 18;
    ctx.save();
    ctx.translate(cx, 46);
    ctx.rotate(-0.03);
    ctx.fillStyle = PAL.yellow;
    ctx.fillRect(-nw / 2, -3, nw, 12);
    px(ctx, note, 0, 0, 8, PAL.black, 'center');
    ctx.restore();
    px(ctx, t('hall.sticker'), cx - nw / 2 - 2, 40, 6, PAL.gray, 'right');
  }
  const banner = tournamentBanner((world.hall?.cabinets ?? []) as BannerCabinet[], ms);
  const bannerColors = [PAL.red, PAL.orange, PAL.yellow, PAL.lime, PAL.cyan, PAL.magenta];
  px(ctx, banner.text, cx, 24, 9, bannerColors[banner.colorIdx]!, 'center');

  // all cabinets on the floor
  const focusIdx = cabinetFocus(sel, HALL_SLOTS.map((_s, i) => i));
  HALL_SLOTS.forEach((slot, i) => renderCabinet(slot, i, ms, i === sel, focusIdx));

  // carpet with neon grid
  const floorY = FLOOR_Y;
  ctx.fillStyle = '#12081c';
  ctx.fillRect(0, floorY, CANVAS_W, CANVAS_H - floorY);
  const floor = art()['hall-floor.png'];
  if (floor) {
    const pat = ctx.createPattern(floor, 'repeat');
    if (pat) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = pat;
      ctx.fillRect(0, floorY, CANVAS_W, CANVAS_H - floorY);
      ctx.restore();
    }
  }
  ctx.fillStyle = 'rgba(224, 58, 138, 0.16)';
  for (let gy = floorY + 6; gy < CANVAS_H - 16; gy += 10) ctx.fillRect(0, gy, CANVAS_W, 1);
  for (let gx = (Math.floor(ms / 130) % 16) * 20 - 20; gx < CANVAS_W; gx += 20) ctx.fillRect(gx, floorY, 1, CANVAS_H - floorY - 16);

  // you-are-here token under the chosen cabinet
  const slot = HALL_SLOTS[sel]!;
  const tx = slot.x + slot.w / 2;
  const ty = Math.min(CANVAS_H - 26, slot.y + slot.h + 4) + walkBob(hallSteps);
  ctx.fillStyle = PAL.yellow;
  ctx.fillRect(tx - 2, ty, 5, 2);
  ctx.fillRect(tx - 1, ty + 2, 3, 6);
  ctx.fillRect(tx - 4, ty + 3, 9, 2);
  px(ctx, myName, tx, ty - 9, 7, PAL.yellow, 'center');

  px(ctx, `Z: ${t('menu.solo')}  X: ${t('menu.versus')}  H: ${t('menu.highScores')}`, cx, CANVAS_H - 14, 8, PAL.lime, 'center');
  px(ctx, `M: ${t('menu.map')}  C: ${t('menu.credits')}  L: ${t('menu.language')}`, cx, CANVAS_H - 4, 7, PAL.gray, 'center');
  if (fullscreenHintVisible(ms)) px(ctx, 'F: FULLSCREEN', 6, 2, 8, blink(ms, 700) ? PAL.cyan : PAL.gray);
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
  px(ctx, `${GAME_IDS.length} CABINETS · TOKYO 1982`, cx, 150, 8, PAL.gray, 'center');
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
  px(ctx, `TODAY ${stats?.day ?? '----/--/--'}  PLAYS ${stats?.playsToday ?? 0}  COINS ${stats?.coinsToday ?? 0}`, 40, 93, 8, PAL.lime);
  px(ctx, `MODE: ${stats?.freePlay ?? false ? 'FREE PLAY' : 'COIN 1C'}`, 40, 80, 9, (stats?.freePlay ?? false) ? PAL.lime : PAL.orange);
  px(ctx, `BRIGHT ${knobMark(knobs.brightness)}  CONTRAST ${knobMark(knobs.contrast)}  SCAN ${knobMark(knobs.scanlines)}`, 40, 102, 9, PAL.cyan);
  px(ctx, `ACCESS: ${access.toUpperCase()}`, 40, 116, 9, access === 'normal' ? PAL.gray : PAL.yellow);
  const volLabel = muted ? 'MUTE' : `VOL ${'▮'.repeat(volume)}${'░'.repeat(3 - volume)} ${volumeGain(volume).toFixed(2)}`;
  px(ctx, volLabel, 40, 130, 9, muted ? PAL.red : PAL.cyan);
  px(ctx, 'Q/W/E: KNOB   F: FREE PLAY   A: ACCESS', cx, 146, 8, PAL.white, 'center');
  px(ctx, 'V: VOLUME   M: MUTE   T: TEST TONE', cx, 153, 8, PAL.white, 'center');
  const oooGame = GAME_IDS[sel]!;
  px(ctx, `CAB: ${oooGame.toUpperCase()} ${isOoo(oooGame) ? 'OUT OF ORDER' : 'IN SERVICE'}`, 40, 30, 8, isOoo(oooGame) ? PAL.red : PAL.lime);
  px(ctx, `O: TOGGLE OUT OF ORDER (${GAME_IDS.length} CABINET BY HALL SELECTION)`, cx, 167, 7, PAL.gray, 'center');
  const noteNow = world.hall?.note ?? '';
  px(ctx, `N: STICKER ${noteNow ? `= ${noteNow}` : '(NONE)'}`, 40, 141, 8, noteNow ? PAL.yellow : PAL.gray);
  px(ctx, `ESC: ${t('menu.back')}`, cx, 160, 8, PAL.gray, 'center');
  px(ctx, 'DO NOT ADJUST DURING PLAY', cx, 186, 8, blink(ms, 900) ? PAL.red : PAL.darkred, 'center');
  drawError();
}

function renderCoinInsert(ms: number): void {
  const cx = CANVAS_W / 2;
  const t0 = performance.now() - coinInsertAt;
  px(ctx, t('hall.insertCoin'), cx, 40, 10, PAL.yellow, 'center');
  // cabinet slot (R46 art chrome when present)
  const slotArt = art()['coin-slot.png'];
  if (slotArt) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(slotArt, cx - 26, 96, 52, 52);
    ctx.imageSmoothingEnabled = true;
  } else {
    ctx.fillStyle = PAL.navy;
    ctx.fillRect(cx - 26, 96, 52, 60);
  }
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - 3, 104, 6, 26);
  // the coin dropping in; R44 thunk envelope drives its glow
  const drop = Math.min(1, t0 / 420);
  const thunk = thunkEnvelope(Math.max(0, t0 - 420), 300);
  if (thunk > 0) {
    ctx.fillStyle = `rgba(247,231,102,${thunk.toFixed(2)})`;
    ctx.fillRect(cx - 14, 130, 28, 4);
  }
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
      if (hot) {
        ctx.save();
        ctx.globalAlpha = initialGlow(Math.floor(ms / 200));
        ctx.fillStyle = PAL.yellow;
        ctx.fillRect(kx - 2, y - 2, w + 2, kh + 4);
        ctx.restore();
      }
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
  if (!world.error || !toastVisible(world.errorAt, performance.now())) return;
  const msg = t(rejectToast(world.error) as never);
  ctx.font = '9px monospace';
  const w = ctx.measureText(msg).width + 14;
  const x = (CANVAS_W - w) / 2;
  ctx.fillStyle = PAL.navy;
  ctx.fillRect(x, 110, w, 14);
  ctx.strokeStyle = blink(world.errorAt + TOAST_MS / 2, 300) ? PAL.yellow : PAL.red;
  ctx.strokeRect(x + 0.5, 110.5, w - 1, 13);
  px(ctx, msg, CANVAS_W / 2, 114, 9, PAL.yellow, 'center');
}

// ---- main loop ----------------------------------------------------------

function frame(ms: number): void {
  update(ms);
  ctx.fillStyle = PAL.black;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  if (net.status !== 'open' && scene !== 'splash') {
    const reason = net.status === 'lost' && net.closeInfo ? ` (${net.closeInfo})` : '';
    px(ctx, `${t(net.status === 'connecting' ? 'net.connecting' : 'net.lost')}${reason}`, CANVAS_W / 2, 116, 10, PAL.gray, 'center');
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
  const now = performance.now();
  if (
    (scene === 'hall' || scene === 'title' || scene === 'map') &&
    !recordFlashVisible(recordFlashAt, now) &&
    exitToastVisible(exitToastAt, now, 1200)
  ) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(CANVAS_W / 2 - 70, 200, 140, 18);
    px(ctx, t('hall.thanks'), CANVAS_W / 2, 205, 10, PAL.lime, 'center');
  }
  applyPresentation();
requestAnimationFrame(frame);
}

applyPresentation();
requestAnimationFrame(frame);
