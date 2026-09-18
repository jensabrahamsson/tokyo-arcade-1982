import { GAME_IDS, type GameId } from '@arkad/core';

export interface CabinetSlot {
  game: GameId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CANVAS_W = 320;
export const CANVAS_H = 240;

const COLS = 4;
const CW = 78;
const CH = 78;

/** top edge of the carpet floor, below the second cabinet row */
export const FLOOR_Y = 40 + 2 * (CH + 6) - 6;

/** where the six cabinets stand on the hall floor (R10) */
export const HALL_SLOTS: CabinetSlot[] = GAME_IDS.map((game, i) => ({
  game,
  x: 8 + (i % COLS) * CW,
  y: 40 + Math.floor(i / COLS) * (CH + 6),
  w: CW - 8,
  h: CH,
}));

/** top-down floor plan positions (R11) */
export const MAP_SLOTS: { game: GameId; x: number; y: number }[] = GAME_IDS.map((game, i) => ({
  game,
  x: 40 + (i % COLS) * 70,
  y: 60 + Math.floor(i / COLS) * 90,
}));

const NAV: Record<string, { dr: number; dc: number }> = {
  ArrowLeft: { dr: 0, dc: -1 },
  KeyA: { dr: 0, dc: -1 },
  ArrowRight: { dr: 0, dc: 1 },
  KeyD: { dr: 0, dc: 1 },
  ArrowUp: { dr: -1, dc: 0 },
  KeyW: { dr: -1, dc: 0 },
  ArrowDown: { dr: 1, dc: 0 },
  KeyS: { dr: 1, dc: 0 },
};

/** grid navigation with wrap: arrows and WASD are equal (R9) */
export function moveHallSel(sel: number, key: string): number {
  const d = NAV[key];
  if (!d) return sel;
  const rows = Math.ceil(HALL_SLOTS.length / COLS);
  let r = Math.floor(sel / COLS) + d.dr;
  let c = (sel % COLS) + d.dc;
  const wrap = (v: number, n: number) => ((v % n) + n) % n;
  r = wrap(r, rows);
  c = wrap(c, COLS);
  let next = r * COLS + c;
  if (next >= HALL_SLOTS.length) next = HALL_SLOTS.length - 1;
  return next;
}
