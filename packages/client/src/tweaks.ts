/** Presentation-only operator knobs (R19/R21). Pure; persisted in localStorage. */

import type { GameId, GameMode } from '@arkad/core';

export interface CrtKnobs {
  brightness: 0 | 1 | 2;
  contrast: 0 | 1 | 2;
  scanlines: 0 | 1 | 2;
}

export type AccessMode = 'normal' | 'hi' | 'cb';

export const DEFAULT_KNOBS: CrtKnobs = { brightness: 1, contrast: 1, scanlines: 1 };
export const ACCESS_MODES: AccessMode[] = ['normal', 'hi', 'cb'];

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const cycle = (n: 0 | 1 | 2): 0 | 1 | 2 => (((n + 1) % 3) as 0 | 1 | 2);

export function cycleKnob(knobs: CrtKnobs, key: string): CrtKnobs {
  if (key === 'KeyQ') return { ...knobs, brightness: cycle(knobs.brightness) };
  if (key === 'KeyW') return { ...knobs, contrast: cycle(knobs.contrast) };
  if (key === 'KeyE') return { ...knobs, scanlines: cycle(knobs.scanlines) };
  return knobs;
}

const BRIGHT = [1, 1.12, 1.25];
const CONTRAST = [1, 1.15, 1.32];

/** one CSS filter string for the whole canvas: knobs first, palette assist second (R19.2) */
export function crtFilterCss(knobs: CrtKnobs, access: AccessMode): string {
  const base = `brightness(${BRIGHT[knobs.brightness]}) contrast(${CONTRAST[knobs.contrast]})`;
  const assist = accessFilterCss(access);
  return assist ? `${base} ${assist}` : base;
}

export function accessFilterCss(mode: AccessMode): string {
  if (mode === 'hi') return 'contrast(1.45) brightness(1.1) saturate(0.7)';
  if (mode === 'cb') return 'hue-rotate(160deg) saturate(1.3)';
  return '';
}

export function scanlineOpacity(knobs: CrtKnobs, access: AccessMode): number {
  const base = [0, 0.25, 0.45][knobs.scanlines]!;
  return access === 'hi' ? base * 0.4 : base;
}

export function nextAccess(mode: AccessMode): AccessMode {
  return ACCESS_MODES[(ACCESS_MODES.indexOf(mode) + 1) % ACCESS_MODES.length]!;
}

const KNOB_KEY = 'arkad-crt';
const ACCESS_KEY = 'arkad-access';

const isDetent = (v: unknown): v is 0 | 1 | 2 => v === 0 || v === 1 || v === 2;

export function loadKnobs(store: StorageLike, fallback: CrtKnobs): CrtKnobs {
  try {
    const raw = store.getItem(KNOB_KEY);
    if (!raw) return fallback;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (isDetent(o.brightness) && isDetent(o.contrast) && isDetent(o.scanlines)) {
      return { brightness: o.brightness, contrast: o.contrast, scanlines: o.scanlines };
    }
  } catch {
    /* fall through */
  }
  return fallback;
}

export function saveKnobs(store: StorageLike, knobs: CrtKnobs): void {
  store.setItem(KNOB_KEY, JSON.stringify(knobs));
}

export function loadAccess(store: StorageLike, fallback: AccessMode): AccessMode {
  const v = store.getItem(ACCESS_KEY);
  return ACCESS_MODES.includes(v as AccessMode) ? (v as AccessMode) : fallback;
}

export function saveAccess(store: StorageLike, mode: AccessMode): void {
  store.setItem(ACCESS_KEY, mode);
}

/** attract flavor: hall signage alternates EN and JA on a fixed period (R20) */
export function attractLang(ms: number, period = 4000): 'en' | 'ja' {
  return Math.floor(Math.max(0, ms) / period) % 2 === 0 ? 'en' : 'ja';
}

export interface BannerCabinet {
  scores: { name: string; score: number }[];
}

const BANNER_COLORS = 6;

/** the hall's tournament banner, derived from the live boards (R21.1) */
export function tournamentBanner(
  cabinets: BannerCabinet[],
  ms: number,
): { text: string; colorIdx: number } {
  let best: { name: string; score: number } | null = null;
  for (const c of cabinets) {
    for (const e of c.scores) {
      if (!best || e.score > best.score) best = e;
    }
  }
  const text = best
    ? `TOKYO ARCADE OPEN: ${best.name.slice(0, 12)} ${best.score}`
    : 'TOKYO ARCADE OPEN HALL';
  return { text, colorIdx: Math.floor(ms / 1600) % BANNER_COLORS };
}

/** 4-step master volume detent + mute (R23). Web Audio gain only. */
export type VolumeDetent = 0 | 1 | 2 | 3;
export const DEFAULT_VOLUME: VolumeDetent = 2;
const VOLUME_GAIN: readonly number[] = [0, 0.35, 0.7, 1];

export const volumeGain = (v: VolumeDetent): number => VOLUME_GAIN[v]!;

export function cycleVolume(v: VolumeDetent): VolumeDetent {
  return ((v + 1) % 4) as VolumeDetent;
}

export function effectiveGain(v: VolumeDetent, muted: boolean): number {
  return muted ? 0 : volumeGain(v);
}

const VOLUME_KEY = 'arkad-volume';
const MUTE_KEY = 'arkad-mute';

const isDetent4 = (v: unknown): v is VolumeDetent => v === 0 || v === 1 || v === 2 || v === 3;

export function loadVolume(store: StorageLike, fallback: VolumeDetent): VolumeDetent {
  try {
    const raw = store.getItem(VOLUME_KEY);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return isDetent4(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function saveVolume(store: StorageLike, v: VolumeDetent): void {
  store.setItem(VOLUME_KEY, JSON.stringify(v));
}

export function loadMuted(store: StorageLike, fallback: boolean): boolean {
  const v = store.getItem(MUTE_KEY);
  return v === 'true' ? true : v === 'false' ? false : fallback;
}

export function saveMuted(store: StorageLike, muted: boolean): void {
  store.setItem(MUTE_KEY, String(muted));
}

/** whole seconds left in a join window, derived from server ticks (R25); null = no window */
export function joinCountdown(deadlineTick: number | null, nowTick: number): number | null {
  if (deadlineTick === null || deadlineTick === undefined) return null;
  const left = deadlineTick - nowTick;
  if (left <= 0) return null;
  return Math.ceil(left / 60);
}

/** x-offset from the marquee center for a right-to-left scroll; pure clock math (R27) */
export function marqueeOffset(ms: number, width: number, period: number): number {
  if (width <= 0 || period <= 0) return 0;
  const p = (Math.max(0, ms) % period) / period;
  return width - p * (width * 2);
}

/** hall marquee lamp state: OUT OF ORDER beats NOW PLAYING beats idle (R28) */
export type LampMode = 'idle' | 'now-playing' | 'out-of-order';
export function marqueeLamp(cab: { demo: boolean; players: number }, ooo = false): LampMode {
  if (ooo) return 'out-of-order';
  return !cab.demo && cab.players > 0 ? 'now-playing' : 'idle';
}

/** the spectator badge only ever renders for a real audience (R29) */
export function visibleSpectators(n: number): number | null {
  return n > 0 ? n : null;
}

/** reason → i18n key for canvas reject toasts (R30); unknown reasons stay safe */
const REJECT_KEYS: Record<string, string> = {
  'insert-coin': 'toast.insertCoin',
  'out-of-order': 'toast.outOfOrder',
  'solo-only': 'toast.soloOnly',
  'unknown-game': 'toast.unknownGame',
};
export const TOAST_MS = 1800;

export function rejectToast(reason: string): string {
  return REJECT_KEYS[reason] ?? 'toast.generic';
}

/** pure clear-window: shownAt/now are wall-clock ms supplied by the caller */
export function toastVisible(shownAt: number, now: number): boolean {
  return now - shownAt < TOAST_MS;
}

/** subtle vertical bob for the walking you-are-here token, 4-step cycle (R32) */
const BOB: readonly number[] = [0, -1.5, -3, -1.5];
export function walkBob(stepIndex: number): number {
  const i = ((Math.trunc(stepIndex) % 4) + 4) % 4;
  return BOB[i]!;
}

/** coin-mode credit digits for one player; free-play hides the strip (R33) */
export function creditStrip(credits: number, freePlay: boolean): string | null {
  if (freePlay) return null;
  return String(Math.max(0, Math.trunc(credits)));
}

/** the hall's FREE PLAY banner flies only in free-play mode (R34) */
export function freePlayBannerVisible(freePlay: boolean): boolean {
  return freePlay;
}

/** index into cabinetTiles of the cabinet the token stands on; max one ring (R35) */
export function cabinetFocus(playerTile: number, cabinetTiles: readonly number[]): number | null {
  const i = cabinetTiles.findIndex((tile) => tile === playerTile);
  return i === -1 ? null : i;
}

/** does a finished score enter the top-rows table? (R36) */
export function isNewRecord(score: number, tableScores: readonly number[], maxRows: number): boolean {
  if (score <= 0) return false;
  if (tableScores.length < maxRows) return true;
  const last = tableScores[tableScores.length - 1]!;
  return score >= last;
}

export const RECORD_FLASH_MS = 2600;
export function recordFlashVisible(shownAt: number, now: number): boolean {
  return now - shownAt < RECORD_FLASH_MS;
}

/** duty-cycle square wave over integer ticks (R37); never blinks on a bad period */
export function blinkOn(tick: number, period: number, duty: number): boolean {
  if (period <= 0) return false;
  if (duty <= 0) return false;
  if (duty >= 1) return true;
  const phase = ((Math.trunc(tick) % period) + period) % period;
  return phase < duty * period;
}

/** cabinet power LED (R40): dim idle, bright while playing, red pulse when broken */
export type LedState = 'idle' | 'playing' | 'ooo';
export function powerLed(state: LedState): { color: 'gray' | 'lime' | 'red'; duty: number } {
  if (state === 'ooo') return { color: 'red', duty: 0.5 };
  if (state === 'playing') return { color: 'lime', duty: 1 };
  return { color: 'gray', duty: 0 };
}

/** the one truth: OUT OF ORDER beats NOW PLAYING beats idle */
export function ledState({ live, ooo }: { live: boolean; ooo: boolean }): LedState {
  if (ooo) return 'ooo';
  return live ? 'playing' : 'idle';
}

/** vertical crawl offset for a strip of 3 rows + 1 gap (R41) */
export function scoreCrawlOffset(ms: number, rowH: number, period: number): number {
  if (rowH <= 0 || period <= 0) return 0;
  const p = (Math.max(0, ms) % period) / period;
  return p * (rowH * 4);
}

/** animated wait dots: 0-3 cycling over the period, deterministic (R43) */
export function waitDots(tick: number, period: number): number {
  if (period <= 0) return 0;
  const t = ((Math.trunc(tick) % period) + period) % period;
  return Math.floor((t / period) * 4);
}

/** linear-decay envelope for the coin-slot thunk; silent outside the window (R44) */
export function thunkEnvelope(tMs: number, durMs: number): number {
  if (durMs <= 0 || tMs < 0 || tMs >= durMs) return 0;
  return 1 - tMs / durMs;
}

/** HH:MM 24h at an injected timezone offset; never reads the clock itself (R45) */
export function formatHallClock(epochMs: number, tzOffsetMin: number): string {
  const local = new Date(epochMs + tzOffsetMin * 60_000);
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** thank-you exit flash window: from sinceMs, for durMs, never retroactive (R47) */
export function exitToastVisible(sinceMs: number, nowMs: number, durMs: number): boolean {
  const elapsed = nowMs - sinceMs;
  return elapsed >= 0 && elapsed < durMs;
}

/** attract/demo channel gain: ducks while a human seat is occupied (R48) */
export function attractGain(hasHumanSeat: boolean): number {
  return hasHumanSeat ? 0.35 : 1;
}

/** mute (R23) always wins over the attract dip */
export function effectiveAttractGain(hasHumanSeat: boolean, muted: boolean): number {
  return muted ? 0 : attractGain(hasHumanSeat);
}

/** subtle long-attract heat shimmer: grows after 30 s, capped, periodic in tick (R49) */
const HEAT_OFFSETS: readonly number[] = [0, 1, 0, -1];
export function heatShimmer(idleMs: number, tick: number): { alpha: number; offset: number } {
  const idle = Math.max(0, idleMs);
  const alpha = idle <= 30_000 ? 0 : Math.min(0.18, ((idle - 30_000) / 150_000) * 0.18);
  const t = ((Math.trunc(tick) % 4) + 4) % 4;
  return { alpha, offset: HEAT_OFFSETS[t]! };
}

/** READY 3-2-1 over a 3 s server-authoritative window; null outside it (R50) */
export function readyCountdown(msSinceFull: number, windowMs = 3000): number | null {
  if (msSinceFull < 0 || msSinceFull >= windowMs) return null;
  return Math.ceil((windowMs - msSinceFull) / 1000);
}

/** glow pulse for the current initials slot (R51) */
const GLOW: readonly number[] = [0.4, 0.7, 1, 0.7];
export function initialGlow(tick: number): number {
  const t = ((Math.trunc(tick) % 4) + 4) % 4;
  return GLOW[t]!;
}

/** rate gate for the operator test tone (R52) */
export function testToneAllowed(lastMs: number, nowMs: number, gapMs = 800): boolean {
  // lastMs === nowMs is the cold start (boot clock 0); otherwise the gap applies
  return nowMs === lastMs || nowMs - lastMs >= gapMs;
}

/** fullscreen belongs to hall and table scenes (R53) */
export function shouldRequestFullscreen(scene: 'splash' | 'title' | 'hall' | 'table' | 'service' | string): boolean {
  return scene === 'hall' || scene === 'table';
}

/** fixed hint window, elapsed since the anchor (first hall entry, not boot) (R53 fix) */
export function fullscreenHintVisible(msSinceHallEnter: number, windowMs = 10_000): boolean {
  return msSinceHallEnter >= 0 && msSinceHallEnter < windowMs;
}

/** first-visit flag for the hint anchor: null until the hall is seen, never reset after (R53 fix) */
export function firstHallVisitAt(hallEnteredAt: number | null, nowMs: number): number {
  return hallEnteredAt ?? nowMs;
}

/** P0 fix: confirmName -> enterHall races the join welcome, so the very first
 * hall entry never sends hall:watch; resubscribe when the welcome finally lands */
export function hallWatchOnWelcome(scene: string): boolean {
  return scene === 'hall' || scene === 'map';
}

/** P0 fix: unknown hall state plays safe — a spare coin is harmless in free
 * play, but skipping it in coin mode dead-ends the start (insert-coin reject) */
export function coinModeFor(hall: { freePlay: boolean } | null): boolean {
  return hall ? !hall.freePlay : true;
}

/** P0 fix: the no-snapshot table screen must name its own way out */
export function waitingRetryHint(coinMode: boolean, credits: number): 'coin-then-start' | 'start' {
  return coinMode && credits < 1 ? 'coin-then-start' : 'start';
}

/** P4 fix (hardtest ticks 10:26–10:32: single-cab attract became the "home"
 * screen with no way back): the documented Escape/back map. Every state that
 * can trap the player inside one cabinet (attract, table waiting, pause,
 * coin insert) and every post-join screen returns to the multi-cabinet hall;
 * pre-join states fall back to title. */
export type EscapeScene = 'table' | 'coinInsert' | 'title' | 'name' | 'map';

export function escapeBackTarget(scene: EscapeScene, joined: boolean): 'hall' | 'title' {
  if (!joined) return 'title';
  switch (scene) {
    case 'table':
    case 'coinInsert':
    case 'title':
    case 'name':
    case 'map':
      return 'hall';
  }
}

/** P4 fix: hall-watch self-heal — the hall must never sit dark forever on a
 * silently dropped subscription; stale after 2.5 s without hallTables */
export function hallWatchStale(lastHallTablesAt: number, now: number, staleMs = 2500): boolean {
  return now - lastHallTablesAt >= staleMs;
}

/** P2-9: one Escape rule — while the browser is fullscreen the first Escape
 * only drops fullscreen and never the app's back action; the press that
 * arrives while windowed (or the second one after FS dropped) goes home */
export function escapeClearsFullscreenOnly(isFullscreen: boolean): boolean {
  return isFullscreen;
}

/**
 * P2-8/P2-10 provenance — the honest credits-wall lines, short enough for
 * the 320 px screen. The two Lyria 3.5 samples are the deliberate,
 * documented exception to the all-synthesized rule (attract loop + Coast
 * READY call, operator volume/mute applied, fail-closed silent when a file
 * is missing, never touched by core). Pixel art is original work, checked
 * for watermarks *when* it lands in static/art/. Until then the drop
 * zone is 16×16 stubs and the credits wall must not claim originals.
 */
export const provenanceLines = (): string[] => [
  'SFX SYNTHESIZED LIVE - CHIPTUNE ONLY',
  'ATTRACT TRACK: LATE NIGHT CABINET (LYRIA 3.5)',
  'READY CALL: COAST YOSEN START JA (LYRIA 3.5)',
  'PIXEL ART: PROCEDURAL UNTIL ART LANDS',
  'WATERMARK CHECK WHEN REAL PNGS LAND',
];

/**
 * P1-7: one throwing renderer must never take down the canvas or the rAF
 * loop. The guarded call returns whether the frame survived; the logger is
 * injected (no console in a pure helper), so callers decide how loud — and
 * how often — to be about a broken cabinet.
 */
export function guardRender(
  label: string,
  fn: () => void,
  log: (msg: string) => void = () => undefined,
): boolean {
  try {
    fn();
    return true;
  } catch {
    log(`[arkad] render ${label} failed`);
    return false;
  }
}

/** P3 fix: plate rect behind a small badge label so the CRT scanline/glow
 * overlay cannot stripe out the glyphs; honor alignment, clamp to the canvas */
export function badgePlateRect(
  align: 'left' | 'center' | 'right',
  x: number,
  y: number,
  textW: number,
  textH: number,
  pad: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number; w: number; h: number } {
  const raw = align === 'right' ? x - textW : align === 'center' ? x - textW / 2 : x;
  const x0 = Math.max(0, Math.floor(raw - pad));
  const y0 = Math.max(0, Math.floor(y - pad));
  const x1 = Math.min(canvasW, Math.ceil(raw + textW + pad));
  const y1 = Math.min(canvasH, Math.ceil(y + textH + pad));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** boot splash cartridge count follows the registry (regression: was hardcoded 6/6) */
export const cartridgeBadge = (count: number): string => `${count}/${count}`;

/** attract music rule: the Late Night Cabinet loop lives outside the cabinets
 * (splash/hall/attract chrome) and must never compete with game sound inside
 * a table */
export function attractMusicActive(scene: string): boolean {
  return scene !== 'table';
}

/** Pole Position style 「予選スタート！」: once per Coast table at
 * prepare-to-start — the READY window (versus) or the first seated snapshot
 * (solo tables deal straight into playing), never while spectating */
export function readyStingerDue(announcedFor: string, tableId: string, game: string, phase: string, seated: boolean): boolean {
  if (game !== 'coast' || announcedFor === tableId) return false;
  return phase === 'ready' || seated;
}

/** UX shell: one warm accent per cabinet so hall cabinets read as games,
 * not as seven identical debug frames; distinct, palette-true colors */
const CAB_ACCENTS: Record<GameId, string> = {
  snake: '#2ee66b',
  puck: '#f7e766',
  block: '#ff004d',
  river: '#38b764',
  galaxy: '#2de2e6',
  myriad: '#e03a8a',
  coast: '#ffa300',
};

export function cabAccent(game: GameId): string {
  return CAB_ACCENTS[game]!;
}

/** P2-G: one header chrome row — left stack vs right stack, never the same cell */
export const HALL_CHROME = {
  leftY: 2,
  leftY2: 12,
  rightY: 2,
  rightY2: 12,
} as const;

/** P2-E: FREE PLAY / COIN 1C from the i18n tables, not a hardcoded English pair */
export function hallCoinBadge(freePlay: boolean, freePlayLabel: string, coinLabel: string): string {
  return freePlay ? freePlayLabel : coinLabel;
}

/** JOIN n / READY n — the word comes from i18n, the count is the live number */
export function countedChrome(word: string, n: number): string {
  return `${word} ${n}`;
}

export type StartChoice = { game: GameId; mode: GameMode };

/** P1-4/P2-H: onOpen re-seats the table we were at; lastStart wins so a
 *  dropped solo Coast does not come back as a versus fallback. */
export function reconnectStart(lastStart: StartChoice | null, fallbackGame: GameId): StartChoice {
  return lastStart ?? { game: fallbackGame, mode: 'versus' };
}

/** P2-H: windowed Escape from a seated table sends `back` (reopens attract).
 *  Fullscreen spends the first Escape leaving FS. */
export function escapeSendsBack(scene: EscapeScene, joined: boolean, fullscreen: boolean): boolean {
  if (escapeClearsFullscreenOnly(fullscreen)) return false;
  return escapeBackTarget(scene, joined) === 'hall';
}
