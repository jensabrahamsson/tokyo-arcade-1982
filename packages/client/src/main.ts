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
import { Samples } from './audio/samples';
import { CANVAS_W, CANVAS_H, PAL, PLAYER_COLORS, px, blink, FONT } from './ui';
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
  testToneAllowed, shouldRequestFullscreen, fullscreenHintVisible, firstHallVisitAt, cartridgeBadge,
  hallWatchOnWelcome, coinModeFor, waitingRetryHint, badgePlateRect, escapeBackTarget, hallWatchStale, cabAccent, attractMusicActive, readyStingerDue, DEFAULT_VOLUME, type CrtKnobs, type AccessMode, type BannerCabinet, type VolumeDetent,
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
  coast: (ctx, data, ms) => renderCoast(ctx, data, ms, lang),
};

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

loadArtBrowser(); // R38: async pixel-art atlas; renderers fall back until it lands

const net = new Net();
const keys = new Keys();
const audio = new Chiptune();
const music = new Samples();
// the hall's own soundtrack (Lyria 3.5 sample, see AGENTS art/audio pipeline)
const ATTRACT_TRACK = 'audio/Late_Night_Cabinet.mp3';
const COAST_READY_STINGER = 'audio/coast_yosen_start_ja.mp3';
let coastAnnouncedFor = '';

let lang: Lang = (localStorage.getItem('arkad-lang') as Lang) === 'ja' ? 'ja' : 'en';
type Scene = 'splash' | 'title' | 'name' | 'hall' | 'map' | 'table' | 'scores' | 'credits' | 'service' | 'note' | 'coinInsert';
let scene: Scene = 'splash';
const bootAt = performance.now();
let hallEnteredAt: number | null = null; // R53 fix: hint anchors to the first hall entry
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
let lastStart: { game: GameId; mode: GameMode } | null = null; // P1-4: reconnect replays what we were playing
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
let lastHallTablesAt = 0;
let lastSnapAt = 0;
let inputSeq = 0;
let lastSentDir: ReturnType<Keys['heldDir']> = null;
let lastSentBtn = false;

net.onMessage((msg: ServerMessage) => {
  switch (msg.type) {
    case 'welcome': {
      world.myId = (msg as WelcomeMsg).playerId;
      world.games = (msg as WelcomeMsg).games;
      joined = true;
      // P0 fix: enterHall ran before this welcome arrived (join race), so the
      // first hall entry never subscribed; the cabinet data never landed and a
      // coin-mode start was rejected — WAITING FOR PLAYERS dead-end
      if (hallWatchOnWelcome(scene)) net.send({ type: 'hall', watch: true });
      break;
    }
    case 'roster':
      world.roster = msg as RosterMsg;
      break;
    case 'snapshot': {
      const snap = msg as SnapshotMsg;
      world.snap = snap;
      lastSnapAt = performance.now();
      audio.playEvents(snap.events ?? []);
      // Pole Position style 「予選スタート！」 — once per Coast table at READY
      const seated = snap.table.players.some((p) => p.id === world.myId);
      if (readyStingerDue(coastAnnouncedFor, snap.table.id, snap.table.game, snap.table.phase, seated)) {
        coastAnnouncedFor = snap.table.id;
        void music.play(COAST_READY_STINGER, 0.9);
      }
      break;
    }
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
      lastHallTablesAt = performance.now();
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
    // P1-4: replay the game+mode we were actually playing, not always versus
    const st = lastStart ?? { game: GAME_IDS[sel]!, mode: 'versus' as GameMode };
    net.send({ type: 'start', game: st.game, mode: st.mode });
  }
});
net.connect();

// one gesture is enough to open the audio doors (autoplay policy);
// everything else stays fail-closed silent
window.addEventListener('keydown', () => {
  audio.unlock();
  music.unlock();
}, { once: true });
window.addEventListener('pointerdown', () => music.unlock(), { once: true });

function toggleLang(): void {
  lang = lang === 'en' ? 'ja' : 'en';
  localStorage.setItem('arkad-lang', lang);
  if (joined) net.send({ type: 'join', name: myName, lang });
}

function enterHall(): void {
  scene = 'hall';
  hallEnteredAt = firstHallVisitAt(hallEnteredAt, performance.now()); // first visit only (R53 fix)
  requestHallFullscreen(); // R53: playtest wants the hall to fill the screen
  if (joined) {
    net.send({ type: 'hall', watch: true });
    lastHallTablesAt = performance.now(); // P4: arm the staleness watchdog
  }
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
  const coinMode = coinModeFor(world.hall); // unknown hall: insert coin first, never dead-end
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
  lastStart = { game, mode }; // P1-4: remember for the reconnect re-seat
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
  // attract music: the hall has a soundtrack, a cabinet does not need one
  music.setMaster(effectiveGain(volume, muted));
  if (attractMusicActive(scene)) void music.startLoop(ATTRACT_TRACK);
  else music.stopLoop();
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

/** P4 fix: one Escape rule for the whole app (escapeBackTarget): post-join
 * states always land in the multi-cabinet hall, pre-join states at title —
 * a single-cabinet attract must never be a stuck "home" screen */
function escapeHome(): void {
  if (scene !== 'table' && scene !== 'coinInsert' && scene !== 'title' && scene !== 'name' && scene !== 'map') return;
  const target = escapeBackTarget(scene, joined);
  if (target === 'hall') {
    if (scene === 'table') back(); // must release the seat ('back' on the wire)
    else enterHall();
    return;
  }
  net.send({ type: 'back' });
  world.snap = null;
  scene = 'title';
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
    // P4 fix: Escape during the coin thunk aborts into the hall — the coin
    // stays on the account, the player never gets dragged into the cabinet
    if (keys.take('Escape', 'KeyB')) escapeHome();
    else if (performance.now() - coinInsertAt > 750 || keys.take('Space', 'Enter')) beginGame(pendingMode);
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
    if (keys.take('Escape') && escapeBackTarget('title', joined) === 'hall') enterHall();
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
    if (keys.take('Escape')) escapeHome(); // P4: welcome may have arrived while typing — hall is home
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
    // P4 fix (hardtest: hallTablesSeen=false, hall dark forever): a silently
    // dropped hall subscription self-heals — 2.5 s of silence and we re-watch
    if (joined && hallWatchStale(lastHallTablesAt, performance.now())) {
      net.send({ type: 'hall', watch: true });
      lastHallTablesAt = performance.now();
    }
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
    if (keys.take('KeyM')) scene = 'hall';
    if (keys.take('Escape', 'KeyB')) escapeHome();
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
    if (keys.take('KeyB', 'Escape')) escapeHome(); // P4: table attract/waiting/pause -> hall, never a dead end
    if (keys.take('KeyF')) toggleFullscreen(); // R53 fix: F must work mid-game too
    // P0 fix: a rejected start must not dead-end — Z/Space retries the 1P game here
    if (!world.snap && keys.take('Space', 'KeyZ', 'Enter')) startGame('solo');
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

/** P3 fix: badge label with a 1 px black outline (and optional dark plate +
 * rim) so the CRT scanline/glow overlay can not stripe out small credits and
 * free-play text; the CRT itself stays on top, untouched */
function badgeLabel(
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = 'left',
  plate = true,
): void {
  ctx.font = `${size}px ${FONT}`;
  const w = Math.ceil(ctx.measureText(text).width);
  if (plate) {
    const r = badgePlateRect(
      align === 'right' || align === 'end' ? 'right' : align === 'center' ? 'center' : 'left',
      x, y, w, size + 2, 2, CANVAS_W, CANVAS_H,
    );
    ctx.fillStyle = '#000';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = color;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  }
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) px(ctx, text, x + dx, y + dy, size, PAL.black, align);
  px(ctx, text, x, y, size, color, align);
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
  if (myStrip !== null) badgeLabel(`${t('hall.credits')} ${myStrip}`, 8, 222, 8, PAL.yellow);
  if (recordFlashVisible(recordFlashAt, performance.now())) {
    const f = Math.floor(performance.now() / 180) % 2 === 0;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 84, CANVAS_W, 52);
    px(ctx, t('record.new'), CANVAS_W / 2, 92, 18, f ? PAL.yellow : PAL.white, 'center');
  }
  if (snap.table.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // P1 fix: exactly one pause label — the big blinking line used to stack a
    // second cyan i18n 'PAUSE' under the literal one (en pause.title === 'PAUSE')
    px(ctx, t('pause.title'), cx, 110, 24, blink(ms, 450) ? PAL.yellow : PAL.orange, 'center');
  }
  if (snap.table.readyAt != null) {
    const msSinceFull = 3000 - ((snap.table.readyAt - (snap.tick ?? snap.table.readyAt)) * 1000) / 60;
    const secs = readyCountdown(msSinceFull);
    if (secs !== null) px(ctx, `READY ${secs}`, CANVAS_W / 2, 104, 20, blink(ms, 400) ? PAL.yellow : PAL.orange, 'center');
  }
  // R54.5: Pole Position qualifying call — the text twin of the 予選スタート sample
  if (game === 'coast' && (phase === 'ready' || snap.table.readyAt != null)) {
    px(ctx, t('coast.qualifying'), cx, 78, 12, blink(ms, 420) ? PAL.white : PAL.magenta, 'center');
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

/** UX shell: the one wordmark — white body, a single deep-magenta offset
 * shadow, amber year below. Intentional, static, no rainbow churn. */
function drawWordmark(y: number, size: number): void {
  const cx = CANVAS_W / 2;
  const name = t('app.title');
  ctx.font = `${size}px ${FONT}`;
  const w = ctx.measureText(name).width;
  const x = cx - w / 2;
  px(ctx, name, x + 2, y + 2, size, '#5e1740');
  px(ctx, name, x, y, size, PAL.white);
  px(ctx, `— ${t('app.year')} —`, cx, y + size + 4, Math.max(8, Math.round(size / 3)), PAL.orange, 'center');
}

function renderSplash(ms: number): void {
  const cx = CANVAS_W / 2;
  // warm night: the hall after closing time, before the doors open
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  sky.addColorStop(0, '#0d0710');
  sky.addColorStop(0.62, '#1b0e17');
  sky.addColorStop(1, '#2a1512');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // a string of paper lanterns over the entrance — the human 1982 touch
  for (let i = 0; i < 7; i++) {
    const lx = 24 + i * 46;
    const sway = Math.sin(ms / 900 + i * 1.3) * 1.6;
    ctx.strokeStyle = '#3a2530';
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx + sway, 22);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,163,0,0.14)';
    ctx.fillRect(lx + sway - 7, 16, 16, 16);
    ctx.fillStyle = i % 2 === 0 ? PAL.orange : PAL.red;
    ctx.fillRect(lx + sway - 4, 20, 9, 11);
    ctx.fillStyle = PAL.black;
    ctx.fillRect(lx + sway - 4, 24, 9, 1);
  }
  drawWordmark(60, 26);
  px(ctx, t('splash.welcome'), cx, 124, 9, PAL.yellow, 'center');
  // boot lines: kept, because they are charming — just quiet and warm now
  px(ctx, 'BIOS 1982.6 ...... OK', cx, 148, 8, PAL.lime, 'center');
  px(ctx, `CARTRIDGES ${cartridgeBadge(GAME_IDS.length)} ..... OK`, cx, 160, 8, PAL.lime, 'center');
  // the doorway: a warm strip of floor light with the house name
  ctx.fillStyle = 'rgba(255,163,0,0.10)';
  ctx.fillRect(cx - 78, 176, 156, 60);
  if (blink(ms, 620)) px(ctx, t('splash.enter'), cx, 190, 10, PAL.yellow, 'center');
  px(ctx, t('hall.name'), cx, 224, 7, PAL.gray, 'center');
}

function cabinetScreenData(game: GameId): { data: unknown; demo: boolean } | null {
  const cab = world.hall?.cabinets.find((c) => c.game === game);
  return cab && cab.data !== null ? { data: cab.data, demo: cab.demo } : null;
}

/** UX shell: the dark idle screen gets a small procedural thumbnail of the
 * game itself, in that cabinet's accent color — every cabinet reads as a
 * game, not as an empty cyan debug frame */
function cabThumb(game: GameId, sx: number, sy: number, sw: number, sh: number, ms: number): void {
  ctx.fillStyle = '#05060c';
  ctx.fillRect(sx, sy, sw, sh);
  const accent = cabAccent(game);
  const cx = sx + sw / 2;
  const cy = sy + sh / 2;
  switch (game) {
    case 'snake': {
      ctx.fillStyle = accent;
      for (let s = 0; s < 5; s++) ctx.fillRect(sx + 8 + s * 5, sy + 8 + s * 5, 4, 4);
      if (blink(ms, 640)) ctx.fillRect(sx + sw - 14, sy + sh - 14, 3, 3);
      break;
    }
    case 'puck': {
      ctx.fillStyle = 'rgba(247,231,102,0.4)';
      for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 8; gx++) ctx.fillRect(sx + 6 + gx * 8, sy + 8 + gy * 9, 2, 2);
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 4, cy - 4, 7, 7);
      break;
    }
    case 'block': {
      ctx.fillStyle = accent;
      for (let r = 0; r < 3; r++) {
        for (let b = 0; b < 5; b++) ctx.fillRect(sx + 6 + b * 12 + (r % 2) * 6, sy + 8 + r * 7, 10, 5);
      }
      ctx.fillStyle = PAL.white;
      ctx.fillRect(cx - 5, sy + sh - 10, 10, 2);
      break;
    }
    case 'river': {
      ctx.fillStyle = 'rgba(45,226,230,0.25)';
      for (let r = 0; r < 4; r++) ctx.fillRect(sx, sy + 8 + r * 10, sw, 1);
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 3, cy - 3, 6, 6);
      break;
    }
    case 'galaxy': {
      ctx.fillStyle = PAL.white;
      ctx.fillRect(sx + 10, sy + 8, 1, 1); ctx.fillRect(sx + 34, sy + 14, 1, 1);
      ctx.fillRect(sx + 52, sy + 6, 1, 1); ctx.fillRect(sx + 22, sy + 26, 1, 1);
      ctx.fillRect(sx + 46, sy + 30, 1, 1);
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 1, cy + 6, 3, 6);
      ctx.fillRect(cx - 5, cy + 10, 11, 3);
      break;
    }
    case 'myriad': {
      ctx.fillStyle = accent;
      for (let d = 0; d < 9; d++) {
        const dx = (d * 17 + 5) % (sw - 10);
        const dy = (d * 23 + 7) % (sh - 12);
        ctx.fillRect(sx + dx, sy + 6 + dy, 2, 2);
      }
      ctx.fillStyle = PAL.white;
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
      break;
    }
    case 'coast': {
      ctx.fillStyle = 'rgba(45,226,230,0.22)';
      for (let w = 0; w < 3; w++) ctx.fillRect(sx + 4 + w * 20, sy + sh - 12, 12, 1);
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 8, sy + 8, 16, 12);
      ctx.fillRect(cx - 3, sy + 4, 6, 4);
      ctx.fillRect(cx - 9, sy + 6, 3, 3);
      ctx.fillRect(cx + 6, sy + 6, 3, 3);
      break;
    }
  }
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
  const lit = Math.floor(ms / 300 + i) % 2 === 0;
  // UX shell: the marquee band lights up in the cabinet's color and carries
  // the game's real name in the hall's language — black on color, always legible
  ctx.fillStyle = '#000';
  ctx.fillRect(x + 3, y + 2, w - 6, 12);
  ctx.fillStyle = lit ? marqueeColors[i % marqueeColors.length]! : '#3a3a46';
  ctx.fillRect(x + 3, y + 2, w - 6, 12);
  px(ctx, t(`game.${slot.game}` as never), x + w / 2, y + 4, 7, PAL.black, 'center');
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
  } else {
    // UX shell: an idle cabinet shows what game lives inside it, not static
    cabThumb(slot.game, screenX, screenY, screenW, screenH, ms);
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
    badgeLabel(`${t('hall.credits')} ${strip}`, x + w - 2, y + slot.h - 8, 7, PAL.yellow, 'right', false);
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
  // UX shell: the Tron grid is now carpet piping, not neon laser lines
  ctx.fillStyle = 'rgba(224, 58, 138, 0.05)';
  for (let gy = floorY + 6; gy < CANVAS_H - 16; gy += 10) ctx.fillRect(0, gy, CANVAS_W, 1);
  ctx.fillStyle = 'rgba(255, 163, 0, 0.05)';
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

  // UX shell: two roomy legend lines; the player counter moved to the header
  // so nothing crowds the you-are-here token anymore
  px(ctx, `Z: ${t('menu.solo')}  X: ${t('menu.versus')}  H: ${t('menu.highScores')}`, cx, CANVAS_H - 14, 7, PAL.lime, 'center');
  px(ctx, `M: ${t('menu.map')}  C: ${t('menu.credits')}  L: ${t('menu.language')}`, cx, CANVAS_H - 4, 7, PAL.gray, 'center');
  // R53 fix: the window counts from the first hall entry, not from boot —
  // splash + title + name pad routinely ate all 10 s before the hall showed
  if (hallEnteredAt !== null && fullscreenHintVisible(performance.now() - hallEnteredAt)) {
    px(ctx, 'F: FULLSCREEN', 6, 2, 8, blink(ms, 700) ? PAL.cyan : PAL.gray);
  }
  const online = world.roster?.players.length ?? 0;
  px(ctx, `${t('lobby.players')}: ${online}`, 6, 2, 7, PAL.gray);
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
  px(ctx, t('menu.credits'), cx, 28, 16, PAL.white, 'center');
  px(ctx, `${t('app.title')} ${t('app.year')}`, cx, 52, 10, PAL.orange, 'center');
  px(ctx, 'CREATED BY JENS ABRAHAMSSON', cx, 80, 9, PAL.white, 'center');
  px(ctx, 'LICENSE GPL-3.0-ONLY', cx, 94, 9, PAL.gray, 'center');
  px(ctx, 'TYPESCRIPT · NODE · WS', cx, 116, 8, PAL.lime, 'center');
  px(ctx, 'CANVAS2D · WEB AUDIO · VITEST', cx, 128, 8, PAL.lime, 'center');
  px(ctx, `${GAME_IDS.length} CABINETS · TOKYO 1982`, cx, 150, 8, PAL.gray, 'center');
  px(ctx, 'NO AUDIO FILES WERE HARMED', cx, 162, 8, PAL.gray, 'center');
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
  // night behind the door, same room the splash opened
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  sky.addColorStop(0, '#0d0710');
  sky.addColorStop(1, '#1c1018');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawWordmark(20, 24);
  px(ctx, t('hall.name'), cx, 66, 8, PAL.gray, 'center');

  // tonight's cabinets rotate through the spotlight, one accent each
  const idx = Math.floor(ms / 2200) % GAME_IDS.length;
  const g = GAME_IDS[idx]!;
  const flavorLang = attractLang(ms, 3000);
  ctx.fillStyle = 'rgba(255,163,0,0.06)';
  ctx.fillRect(cx - 92, 96, 184, 52);
  ctx.strokeStyle = '#3a2530';
  ctx.strokeRect(cx - 92.5, 96.5, 185, 51);
  ctx.fillStyle = cabAccent(g); // the game's own color announces the next cabinet
  ctx.fillRect(cx - 92, 96, 3, 52);
  ctx.fillRect(cx + 89, 96, 3, 52);
  px(ctx, translate(flavorLang, `game.${g}` as never), cx, 108, 12, PAL.white, 'center');
  px(ctx, t(`game.${g}.tag` as never), cx, 132, 8, PAL.cyan, 'center');

  if (blink(ms)) px(ctx, t('hall.insertCoin'), cx, 168, 12, PAL.yellow, 'center');
  px(ctx, t('hall.pressStart'), cx, 190, 8, PAL.gray, 'center');
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

/** P0 fix (HARDTEST): the no-snapshot table screen was a dark dead-end; it now
 * shows the rejection toast and names the key that unsticks it (Z/Space retry).
 * UX shell: a warm hosted-table panel with seats instead of an empty void */
function renderTableWaiting(ms: number): void {
  const cx = CANVAS_W / 2;
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  sky.addColorStop(0, '#100a12');
  sky.addColorStop(1, '#1e1116');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#241422';
  ctx.fillRect(36, 56, 248, 128);
  ctx.strokeStyle = PAL.orange;
  ctx.strokeRect(36.5, 56.5, 247, 127);
  px(ctx, t('app.title'), cx, 64, 8, PAL.gray, 'center');
  px(ctx, `${t('lobby.waiting')}${'.'.repeat(1 + waitDots(Math.floor(ms / 400), 3))}`, cx, 80, 10, PAL.yellow, 'center');
  // two seats: yours is taken, the next one is being waited for
  ctx.fillStyle = PAL.lime;
  ctx.fillRect(cx - 40, 100, 14, 14);
  px(ctx, t('misc.you'), cx - 33, 116, 7, PAL.lime, 'center');
  if (blink(ms, 900)) {
    ctx.strokeStyle = PAL.orange;
    ctx.strokeRect(cx + 26.5, 100.5, 13, 13);
    px(ctx, '?', cx + 33, 100, 10, PAL.orange, 'center');
  } else {
    ctx.fillStyle = '#3a2530';
    ctx.fillRect(cx + 26, 100, 14, 14);
  }
  px(ctx, t('splash.welcome'), cx, 132, 8, PAL.gray, 'center');
  const hint = waitingRetryHint(coinModeFor(world.hall), world.hall?.credits ?? 0);
  const line = hint === 'coin-then-start'
    ? `${t('hall.insertCoin')} + Z: ${t('menu.solo')}`
    : `Z: ${t('menu.solo')}`;
  px(ctx, line, cx, 150, 9, blink(ms, 700) ? PAL.yellow : PAL.orange, 'center');
  px(ctx, `ESC: ${t('menu.back')}`, cx, 166, 8, PAL.gray, 'center');
  drawError();
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
    else renderTableWaiting(ms); // P0 fix: the screen names its own way out
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
