import { describe, it, expect } from 'vitest';
import { riverSpec, createRiver, HOME_ROWS, type RiverState } from './river';
import { NO_INPUT, type GameConfig, type PlayerInput } from '../../engine/types';

const cfg: GameConfig = { mode: 'solo', playerIds: ['p1'], seed: 42 };

const play = (s: RiverState): RiverState => ({ ...s, phase: 'playing' });
const run = (s: RiverState, inputs: Record<string, PlayerInput>, ticks: number): RiverState => {
  let cur = s;
  for (let i = 0; i < ticks; i++) cur = riverSpec.step(cur, inputs);
  return cur;
};
const up: PlayerInput = { dir: { dx: 0, dy: -1 }, button: false };
let seqCounter = 1;
const tap = (dir: (typeof up)['dir']): PlayerInput => ({ dir, button: false, seq: seqCounter++ });
const none: PlayerInput = NO_INPUT;

describe('river create', () => {
  it('frog starts at the bottom safe zone with 3 lives', () => {
    const s = createRiver(cfg);
    expect(s.phase).toBe('ready');
    expect(s.frog.y).toBeGreaterThanOrEqual(14);
    expect(s.lives['p1']).toBe(3);
    expect(s.homes.filter(Boolean)).toHaveLength(0);
    expect(HOME_ROWS).toHaveLength(5);
  });
});

describe('river frog moves', () => {
  it('moves one cell per direction press (edge triggered)', () => {
    let s = play(createRiver(cfg));
    s = run(s, { p1: tap(up.dir) }, 3);
    expect(s.frog.y).toBe(15);
    const still = run(s, { p1: tap(up.dir) }, 30);
    expect(still.frog.y).toBe(14);
    const paused = run({ ...still, frog: { x: still.frog.x, y: 15 } }, { p1: { ...up, seq: undefined } }, 30);
    expect(paused.frog.y).toBe(15);
  });

  it('buffers a rapid tap received during moveCooldown and executes upon landing', () => {
    let s = play(createRiver(cfg));
    expect(s.frog.y).toBe(16);
    s = riverSpec.step(s, { p1: { dir: { dx: 0, dy: -1 }, button: false, seq: 100 } });
    expect(s.frog.y).toBe(15);
    s = riverSpec.step(s, { p1: { dir: { dx: 0, dy: -1 }, button: false, seq: 101 } });
    s = run(s, { p1: none }, 10);
    expect(s.frog.y).toBe(14);
  });

  it('cannot move off the field', () => {
    let s = play(createRiver(cfg));
    let m = s;
    for (let i = 0; i < 40; i++) {
      m = run(m, { p1: { dir: { dx: 0, dy: -1 }, button: false, seq: i + 1 } }, 8);
      expect(m.frog.y).toBeGreaterThanOrEqual(0);
      expect(m.frog.y).toBeLessThanOrEqual(17);
    }
    expect(m.lives['p1']).toBeLessThan(3);
  });
});

describe('river water & cars', () => {
  it('frog drowns in open water', () => {
    let s = play(createRiver(cfg));
    s = { ...s, frog: { x: 13.5, y: 4 }, lastInputDir: null };
    const moved = run(s, { p1: none }, 30);
    expect(moved.lives['p1']).toBe(2);
    expect(moved.frog.y).toBeGreaterThanOrEqual(14);
  });

  it('frog rides a log', () => {
    let s = play(createRiver(cfg));
    const lane = s.river[0]!;
    const logX = lane.xs[1]! + 2;
    s = { ...s, frog: { x: logX, y: lane.y }, lastInputDir: null };
    const moved = run(s, { p1: none }, 20);
    expect(moved.lives['p1']).toBe(3);
    expect(Math.abs(moved.frog.x - logX)).toBeGreaterThan(0.1);
  });

  it('a car kills the frog', () => {
    let s = play(createRiver(cfg));
    const lane = s.cars[0]!;
    s = { ...s, frog: { x: lane.xs[0]! + 0.5, y: lane.y }, lastInputDir: null };
    const moved = run(s, { p1: none }, 30);
    expect(moved.lives['p1']).toBe(2);
  });

  it('last life lost ends the game', () => {
    let s = play(createRiver(cfg));
    s = { ...s, lives: { p1: 1 }, frog: { x: 13.5, y: 4 }, lastInputDir: null };
    const moved = run(s, { p1: none }, 30);
    expect(moved.phase).toBe('gameOver');
  });
});

describe('river goals', () => {
  let tapSeq = 1;
  const tapHome = (s: RiverState, homeIdx: number): RiverState => {
    s = { ...s, frog: { x: HOME_ROWS[homeIdx]!, y: 1 } };
    return run(s, { p1: { ...up, seq: tapSeq++ } }, 8);
  };

  it('reaching a home slot scores and resets the frog', () => {
    let s = play(createRiver(cfg));
    const moved = tapHome(s, 2);
    expect(moved.scores['p1']).toBeGreaterThanOrEqual(50);
    expect(moved.homes.filter(Boolean).length).toBe(1);
    expect(moved.frog.y).toBeGreaterThanOrEqual(14);
  });

  it('a wrong home coordinate is a miss', () => {
    let s = play(createRiver(cfg));
    s = { ...s, frog: { x: 13.5, y: 1 } };
    const moved = run(s, { p1: { ...up, seq: 1 } }, 8);
    expect(moved.lives['p1']).toBe(2);
    expect(moved.scores['p1']).toBe(0);
  });

  it('all five homes clears the level', () => {
    let s = play(createRiver(cfg));
    for (let h = 0; h < 5; h++) {
      s = tapHome(s, h);
    }
    expect(s.level).toBe(2);
    expect(s.phase).toBe('roundOver');
    const resumed = run(s, { p1: none }, 200);
    expect(resumed.phase).toBe('playing');
    expect(resumed.homes.filter(Boolean)).toHaveLength(0);
  });
});

describe('river drown timer', () => {
  it('resets when the frog gets back to dry land', () => {
    let s = play(createRiver(cfg));
    s = { ...s, frog: { x: 5, y: 2 } };
    for (let i = 0; i < 10; i++) s = riverSpec.step(s, { p1: none });
    expect(s.drownTimer).toBe(10);
    // wade back to safety
    s = { ...s, frog: { x: 5, y: 7 }, drownTimer: s.drownTimer };
    s = riverSpec.step(s, { p1: none });
    expect(s.drownTimer).toBe(0);
    // re-entry gets the full window again
    s = { ...s, frog: { x: 5, y: 2 } };
    for (let i = 0; i < 19; i++) s = riverSpec.step(s, { p1: none });
    expect(s.lives['p1']).toBe(3);
    s = riverSpec.step(s, { p1: none });
    expect(s.lives['p1']).toBe(2);
  });
});
