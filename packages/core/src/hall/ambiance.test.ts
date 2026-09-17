import { describe, it, expect } from 'vitest';
import { GAME_IDS } from '../protocol/protocol';
import type { TableView } from '../protocol/protocol';
import {
  createHallAmbience,
  stepHallAmbience,
  liveGameIds,
  type HallAmbience,
} from './ambiance';

const freezeHall = (hall: HallAmbience): HallAmbience => {
  Object.freeze(hall);
  Object.freeze(hall.cabinets);
  for (const id of GAME_IDS) Object.freeze(hall.cabinets[id]);
  return hall;
};

const table = (game: TableView['game'], players: number): TableView => ({
  id: `t-${game}`,
  game,
  mode: 'solo',
  phase: 'playing',
  players: Array.from({ length: players }, (_, i) => ({
    id: `c${i}`,
    name: 'AKIRA',
    score: 0,
    lives: 3,
    active: true,
  })),
});

describe('hall demo ambience', () => {
  it('spins up a demo cabinet for every game', () => {
    const hall = createHallAmbience(42);
    expect(Object.keys(hall.cabinets).sort()).toEqual([...GAME_IDS].sort());
    for (const id of GAME_IDS) {
      expect(hall.cabinets[id]!.state.demo).toBe(true);
      expect(hall.cabinets[id]!.state.phase).toBe('playing');
      expect(hall.cabinets[id]!.game).toBe(id);
    }
  });

  it('is deterministic and does not mutate the previous hall', () => {
    const hall = freezeHall(createHallAmbience(9));
    const before = JSON.stringify(hall);
    const next = stepHallAmbience(hall, new Set());
    expect(JSON.stringify(hall)).toBe(before);
    expect(next).not.toBe(hall);
    const again = stepHallAmbience(createHallAmbience(9), new Set());
    expect(JSON.stringify(next.cabinets.snake!.state)).toEqual(
      JSON.stringify(again.cabinets.snake!.state),
    );
  });

  it('does not tick occupied cabinets; idle ones keep playing', () => {
    let hall = createHallAmbience(3);
    const occupied = new Set<(typeof GAME_IDS)[number]>(['puck']);
    const puckTicks = hall.cabinets.puck!.ticks;
    const snakeTicks = hall.cabinets.snake!.ticks;
    hall = stepHallAmbience(hall, occupied);
    expect(hall.cabinets.puck!.ticks).toBe(puckTicks);
    expect(hall.cabinets.snake!.ticks).toBe(snakeTicks + 1);
  });

  it('treats roster tables with seated players as live cabinets', () => {
    const live = liveGameIds([table('snake', 1), table('block', 2), table('galaxy', 0)]);
    expect([...live].sort()).toEqual(['block', 'snake']);
  });

  it('never invents seated players or extra tables — only demo state', () => {
    let hall = createHallAmbience(1);
    for (let i = 0; i < 30; i++) hall = stepHallAmbience(hall, new Set());
    for (const id of GAME_IDS) {
      const scores = hall.cabinets[id]!.state.scores;
      expect(Object.keys(scores)).toEqual(['DEMO']);
    }
  });
});
