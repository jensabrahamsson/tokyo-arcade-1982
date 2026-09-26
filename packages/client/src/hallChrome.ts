import type { GameId, MsgKey } from '@arkad/core';
import { badgePlateRect } from './tweaks';

/** i18n keys the hall chrome actually paints — never a hardcoded EN pair */
export const HALL_I18N = {
  freePlay: 'hall.freePlay',
  coinMode: 'hall.coinMode',
  join: 'hud.joinWindow',
  ready: 'phase.ready',
  insertCoin: 'hall.insertCoin',
  waiting: 'lobby.waiting',
} as const satisfies Record<string, MsgKey>;

export type CabLamp = 'idle' | 'now-playing' | 'out-of-order';

export function hallCoinKey(freePlay: boolean): 'hall.freePlay' | 'hall.coinMode' {
  return freePlay ? HALL_I18N.freePlay : HALL_I18N.coinMode;
}

/** JOIN n / READY n — the word is whatever i18n handed us */
export function countedStatus(word: string, n: number): string {
  return `${word} ${n}`;
}

export function cabinetTitleKey(game: GameId): MsgKey {
  return `game.${game}` as MsgKey;
}

export function cabinetTagKey(game: GameId): MsgKey {
  return `game.${game}.tag` as MsgKey;
}

/**
 * Marquee keeps the game's name even when the lamp is lit. NOW PLAYING /
 * OUT OF ORDER sit beside the title — they do not become the title.
 * (main.ts still paints OOO over the whole band; leftover after Wave 1.)
 */
export function cabinetMarquee(
  lamp: CabLamp,
  gameTitle: string,
  nowPlaying: string,
  ooo: string,
): { title: string; lampLabel: string | null } {
  if (lamp === 'out-of-order') return { title: gameTitle, lampLabel: ooo };
  if (lamp === 'now-playing') return { title: gameTitle, lampLabel: nowPlaying };
  return { title: gameTitle, lampLabel: null };
}

export function insertCoinVisible(lamp: CabLamp, freePlay: boolean): boolean {
  return lamp === 'idle' && !freePlay;
}

/** plate behind INSERT COIN, clamped to the mini-screen so scanlines cannot eat the glyphs */
export function insertCoinPlate(
  screen: { x: number; y: number; w: number; h: number },
  textW: number,
  textH: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number; w: number; h: number } {
  const cx = screen.x + screen.w / 2;
  const cy = screen.y + screen.h / 2;
  const plate = badgePlateRect('center', cx, cy, textW, textH, 3, canvasW, canvasH);
  const x = Math.max(screen.x, plate.x);
  const y = Math.max(screen.y, plate.y);
  const r = Math.min(screen.x + screen.w, plate.x + plate.w);
  const b = Math.min(screen.y + screen.h, plate.y + plate.h);
  return { x, y, w: Math.max(0, r - x), h: Math.max(0, b - y) };
}

export function waitingHintLine(
  hint: 'coin-then-start' | 'start',
  insertCoin: string,
  soloLabel: string,
): string {
  return hint === 'coin-then-start' ? `${insertCoin} + Z: ${soloLabel}` : `Z: ${soloLabel}`;
}

export function waitingPanelCopy(opts: {
  title: string;
  waiting: string;
  hintLine: string;
  back: string;
}): readonly string[] {
  return [opts.title, opts.waiting, opts.hintLine, opts.back];
}

export interface HallCabinetSpotlight {
  readonly topX: number;
  readonly topW: number;
  readonly botX: number;
  readonly botW: number;
  readonly topY: number;
  readonly botY: number;
}

export function hallCabinetSpotlight(
  slot: { x: number; y: number; w: number; h: number },
  ceilingY: number,
): HallCabinetSpotlight {
  const topW = Math.round(slot.w * 0.6);
  const botW = slot.w + 12;
  const cx = slot.x + slot.w / 2;
  return {
    topX: cx - Math.round(topW / 2),
    topW,
    botX: cx - Math.round(botW / 2),
    botW,
    topY: ceilingY,
    botY: slot.y + slot.h,
  };
}

export interface HallSelectionCrown {
  readonly x: number;
  readonly y: number;
  readonly bounceY: number;
  readonly color: string;
}

export function hallSelectionCrown(
  slot: { x: number; y: number; w: number },
  ms: number,
): HallSelectionCrown {
  const cx = slot.x + slot.w / 2;
  const bounce = Math.sin(ms / 180) * 2;
  return {
    x: cx,
    y: slot.y - 7,
    bounceY: slot.y - 7 + bounce,
    color: '#f7e766',
  };
}

export interface HallCabinetInfo {
  readonly title: string;
  readonly tag: string;
  readonly topScoreText: string;
  readonly soloMode: string;
  readonly versusMode: string | null;
  readonly isOoo: boolean;
}

export function hallCabinetInfo(
  game: GameId,
  cab: { scores?: ReadonlyArray<{ name: string; score: number }> } | undefined,
  isOoo: boolean,
  _freePlay: boolean,
  t: (key: MsgKey) => string,
): HallCabinetInfo {
  const title = t(cabinetTitleKey(game));
  const tag = t(cabinetTagKey(game));
  const topScore = cab?.scores?.[0];
  const topScoreText = topScore ? `TOP: ${topScore.name.slice(0, 5)} ${topScore.score}` : 'HIGH SCORE AVAILABLE';
  const soloMode = `Z: ${t('menu.solo')}`;
  const versusGames: GameId[] = ['snake', 'puck', 'block', 'coast', 'circuit'];
  const versusMode = versusGames.includes(game) ? `X: ${t('menu.versus')}` : null;
  return {
    title,
    tag,
    topScoreText,
    soloMode,
    versusMode,
    isOoo,
  };
}

export interface HallCarouselPip {
  readonly index: number;
  readonly active: boolean;
}

export function hallCarouselPips(
  selectedIndex: number,
  totalCount = 8,
): ReadonlyArray<HallCarouselPip> {
  return Array.from({ length: totalCount }, (_, index) => ({
    index,
    active: index === selectedIndex,
  }));
}

export interface HallNavArrows {
  readonly leftVisible: boolean;
  readonly rightVisible: boolean;
  readonly leftOffset: number;
  readonly rightOffset: number;
}

export function hallNavArrows(
  selectedIndex: number,
  totalCount = 8,
  ms: number,
): HallNavArrows {
  const bob = Math.sin(ms / 220) * 2;
  return {
    leftVisible: selectedIndex > 0,
    rightVisible: selectedIndex < totalCount - 1,
    leftOffset: -bob,
    rightOffset: bob,
  };
}

