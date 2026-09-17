import { GAME_IDS, type GameId } from '@arkad/core';

export type HallScene = 'title' | 'name' | 'select' | 'table' | 'scores';

/** Hall attract plays on the floor, never inside a paid table. */
export function shouldRunHallDemo(scene: HallScene | string): boolean {
  return scene === 'title' || scene === 'select';
}

/** ~2.2 s per cabinet at 60 Hz, matching the old title marquee cadence. */
export const TITLE_DEMO_PERIOD = 131;

export function titleDemoIndex(ticks: number): number {
  const n = GAME_IDS.length;
  const period = TITLE_DEMO_PERIOD;
  const cycle = n * period;
  const t = ((ticks % cycle) + cycle) % cycle;
  return Math.floor(t / period) % n;
}

export function titleDemoGame(ticks: number): GameId {
  return GAME_IDS[titleDemoIndex(ticks)]!;
}

/** Hall chiptune is quieter than a coin-op cabinet. */
export const demoGain = 0.35;
