import {
  GAME_IDS,
  type GameId,
  type GameMode,
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
import { createNamePad, moveCursor, pressKey, keyAt, type NamePad } from './namepad';

const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
  translate(lang, key, params);

const renderers: Partial<Record<GameId, (ctx: CanvasRenderingContext2D, data: never, tMs: number) => void>> = {
  snake: (ctx, data, ms) => renderSnake(ctx, data, ms),
  puck: (ctx, data, ms) => renderPuck(ctx, data, ms),
  block: (ctx, data, ms) => renderBlock(ctx, data, ms),
  galaxy: (ctx, data, ms) => renderGalaxy(ctx, data, ms),
  river: (ctx, data) => renderRiver(ctx, data),
  myriad: (ctx, data, ms) => renderMyriad(ctx, data, ms),
};

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

const net = new Net();
const keys = new Keys();
const audio = new Chiptune();

let lang: Lang = (localStorage.getItem('arkad-lang') as Lang) === 'ja' ? 'ja' : 'en';
let scene: 'title' | 'name' | 'select' | 'table' | 'scores' = 'title';
let namePad: NamePad = createNamePad();
let sel = 0;
type GameInfo = { id: GameId; solo: boolean; versus: boolean };
let world = {
  myId: '',
  games: [] as GameInfo[],
  roster: null as RosterMsg | null,
  snap: null as SnapshotMsg | null,
  scores: null as ScoreListMsg | null,
  error: '',
};
let joined = false;
let lastSnapAt = 0;
let inputSeq = 0;

net.onMessage((msg: ServerMessage) => {
  switch (msg.type) {
    case 'welcome':
      world.myId = (msg as WelcomeMsg).playerId;
      world.games = (msg as WelcomeMsg).games;
      joined = true;
      break;
    case 'roster':
      world.roster = msg as RosterMsg;
      if (scene === 'table' && !world.snap) scene = 'select';
      break;
    case 'snapshot':
      world.snap = msg as SnapshotMsg;
      lastSnapAt = performance.now();
      audio.playEvents(msg.events ?? []);
      break;
    case 'scoreList':
      world.scores = msg as ScoreListMsg;
      break;
    case 'error':
      world.error = (msg as { code: string }).code;
      break;
  }
});

net.connect();

function openNamePad(): void {
  audio.unlock();
  namePad = createNamePad();
  scene = 'name';
}

function confirmName(): void {
  const name = namePad.text.trim().slice(0, 12) || 'AAA';
  net.send({ type: 'join', name, lang });
  audio.play('coin');
  scene = 'select';
}

function startGame(mode: GameMode): void {
  const game = GAME_IDS[sel]!;
  net.send({ type: 'start', game, mode });
  world.snap = null;
  scene = 'table';
}

function back(): void {
  net.send({ type: 'back' });
  world.snap = null;
  scene = 'select';
}

// ---- scenes -------------------------------------------------------------

function update(ms: number): void {
  if (scene === 'title') {
    if (keys.take('Space', 'Enter', 'NumpadEnter')) {
      if (joined) scene = 'select';
      else openNamePad();
    }
    if (keys.take('KeyL')) lang = lang === 'en' ? 'ja' : 'en';
  } else if (scene === 'name') {
    if (keys.take('ArrowLeft', 'KeyA')) namePad = moveCursor(namePad, { dr: 0, dc: -1 });
    if (keys.take('ArrowRight', 'KeyD')) namePad = moveCursor(namePad, { dr: 0, dc: 1 });
    if (keys.take('ArrowUp', 'KeyW')) namePad = moveCursor(namePad, { dr: -1, dc: 0 });
    if (keys.take('ArrowDown', 'KeyS')) namePad = moveCursor(namePad, { dr: 1, dc: 0 });
    if (keys.take('KeyZ', 'Space', 'Enter', 'NumpadEnter')) namePad = pressKey(namePad, keyAt(namePad, namePad.cursor));
    if (keys.take('Backspace')) namePad = pressKey(namePad, '<');
    if (keys.take('Escape')) scene = 'title';
    if (namePad.done) confirmName();
  } else if (scene === 'select') {
    if (keys.take('ArrowUp', 'KeyW')) sel = (sel + GAME_IDS.length - 1) % GAME_IDS.length;
    if (keys.take('ArrowDown', 'KeyS')) sel = (sel + 1) % GAME_IDS.length;
    const game = GAME_IDS[sel]!;
    const info = world.games.find((g) => g.id === game);
    if (info?.solo && (keys.take('KeyZ', 'Space', 'Enter'))) startGame('solo');
    if (info?.versus && keys.take('KeyX')) startGame('versus');
    if (keys.take('KeyH')) {
      net.send({ type: 'scores', game, mode: 'solo' });
      world.scores = null;
      scene = 'scores';
    }
    if (keys.take('KeyL')) lang = lang === 'en' ? 'ja' : 'en';
  } else if (scene === 'table') {
    const dir = keys.takeDir();
    if (dir) net.send({ type: 'input', dir, button: false, seq: ++inputSeq });
    if (keys.take('KeyB', 'Escape')) back();
    if (world.snap && world.snap.table.phase === 'attract') back();
    if (performance.now() - lastSnapAt > 4000) back();
  } else if (scene === 'scores') {
    if (keys.take('Escape', 'KeyB', 'KeyH')) scene = 'select';
  }
  void ms;
}

function drawHud(view: SnapshotMsg['table'], snap: SnapshotMsg): void {
  view.players.forEach((p, i) => {
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length]!;
    px(ctx, p.name.slice(0, 9), 8 + i * 156, 6, 8, p.id === world.myId ? PAL.yellow : color);
    px(ctx, String(p.score).padStart(6, '0'), 8 + i * 156, 14, 8, PAL.white);
    const state = snap.data as { lives?: Record<string, number>; player?: { x: number }; frogs?: unknown } | null;
    const lifeCount = p.id === world.myId ? (p.lives ?? 0) : (state?.lives?.[p.id] ?? p.lives ?? 0);
    for (let l = 0; l < Math.min(lifeCount, 5); l++) {
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
  px(ctx, `${translate('en', `game.${g}` as never)} / ${translate('ja', `game.${g}` as never)}`, cx, 130, 8, PAL.gray, 'center');
  px(ctx, t(`game.${g}.tag` as never), cx, 144, 8, PAL.cyan, 'center');

  if (blink(ms)) px(ctx, t('hall.insertCoin'), cx, 176, 12, PAL.yellow, 'center');
  px(ctx, t('hall.pressStart'), cx, 196, 8, PAL.white, 'center');
  px(ctx, `L: ${t('menu.language')}`, cx, 228, 8, PAL.gray, 'center');
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

function renderSelect(ms: number): void {
  const cx = CANVAS_W / 2;
  px(ctx, t('menu.gameSelect'), cx, 10, 12, PAL.white, 'center');
  GAME_IDS.forEach((g, i) => {
    const y = 34 + i * 24;
    const info = world.games.find((gi) => gi.id === g);
    const color = i === sel ? (blink(ms, 500) ? PAL.yellow : PAL.orange) : info ? PAL.white : PAL.gray;
    px(ctx, t(`game.${g}` as never), 40, y, 10, color);
    px(ctx, info ? t(`game.${g}.tag` as never) : '--- --- ---', 150, y + 2, 7, i === sel ? PAL.cyan : PAL.gray);
    if (info) px(ctx, info.versus ? '1P+VS' : '1P', 296, y + 2, 7, PAL.gray);
  });
  px(ctx, `Z: ${t('menu.solo')}   X: ${t('menu.versus')}`, cx, 200, 8, PAL.lime, 'center');
  px(ctx, `H: ${t('menu.highScores')}   L: ${t('menu.language')}   ESC: ${t('menu.back')}`, cx, 214, 8, PAL.gray, 'center');
  const online = world.roster?.players.length ?? 0;
  px(ctx, `${t('lobby.players')}: ${online}`, 8, 230, 8, PAL.gray);
  drawError();
}

function renderScores(): void {
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
  px(ctx, `ESC: ${t('menu.back')}`, cx, 226, 8, PAL.gray, 'center');
}

function drawError(): void {
  if (world.error && blink(1000)) px(ctx, world.error, CANVAS_W / 2, 118, 8, PAL.red, 'center');
}

// ---- main loop ----------------------------------------------------------

function frame(ms: number): void {
  update(ms);
  ctx.fillStyle = PAL.black;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  if (net.status !== 'open') {
    px(ctx, t(net.status === 'connecting' ? 'net.connecting' : 'net.lost'), CANVAS_W / 2, 116, 10, PAL.gray, 'center');
  } else if (scene === 'title') renderTitle(ms);
  else if (scene === 'select') renderSelect(ms);
  else if (scene === 'table') {
    if (world.snap) renderGame(ms);
    else px(ctx, t('lobby.waiting'), CANVAS_W / 2, 116, 10, PAL.gray, 'center');
  } else if (scene === 'scores') renderScores();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
