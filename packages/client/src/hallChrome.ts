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
