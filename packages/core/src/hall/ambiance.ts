import { GAME_IDS, type GameId, type TableView } from '../protocol/protocol';
import { REGISTRY } from '../games/registry';
import type { AnyGameSpec } from '../engine/types';
import { createDemo, stepDemo, type DemoRun } from '../engine/demo';

export interface HallAmbience {
  cabinets: Record<GameId, DemoRun>;
  seed: number;
}

const specOf = (id: GameId): AnyGameSpec => REGISTRY[id] as AnyGameSpec;

const mix = (seed: number, id: string): number => {
  let h = seed >>> 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return h || 1;
};

export function createHallAmbience(seed: number): HallAmbience {
  const cabinets = {} as Record<GameId, DemoRun>;
  for (const id of GAME_IDS) cabinets[id] = createDemo(specOf(id), mix(seed, id));
  return { cabinets, seed: seed >>> 0 || 1 };
}

export function stepHallAmbience(hall: HallAmbience, occupied: ReadonlySet<GameId>): HallAmbience {
  const cabinets = { ...hall.cabinets };
  for (const id of GAME_IDS) {
    if (occupied.has(id)) continue;
    cabinets[id] = stepDemo(specOf(id), cabinets[id]!);
  }
  return { cabinets, seed: hall.seed };
}

/** Cabinets with at least one seated (non-empty) player list are live. */
export function liveGameIds(tables: readonly TableView[]): Set<GameId> {
  const live = new Set<GameId>();
  for (const t of tables) {
    if (t.players.length > 0) live.add(t.game);
  }
  return live;
}
