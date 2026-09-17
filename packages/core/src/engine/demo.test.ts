import { describe, it, expect } from 'vitest';
import { snakeSpec } from '../games/snake/snake';
import { galaxySpec } from '../games/galaxy/galaxy';
import { riverSpec } from '../games/river/river';
import { blockSpec } from '../games/block/block';
import { puckSpec } from '../games/puck/puck';
import { myriadSpec } from '../games/myriad/myriad';
import { REGISTRY } from '../games/registry';
import { GAME_IDS } from '../protocol/protocol';
import type { AnyGameSpec } from './types';
import {
  DEMO_PLAYER_ID,
  createDemo,
  stepDemo,
  type DemoRun,
} from './demo';

const ALL: AnyGameSpec[] = [snakeSpec, puckSpec, blockSpec, galaxySpec, riverSpec, myriadSpec];

const freezeRun = (run: DemoRun): DemoRun => {
  Object.freeze(run);
  Object.freeze(run.state);
  return run;
};

describe('cabinet demo autoplay', () => {
  it('starts playing with the demo flag and a single DEMO player', () => {
    const run = createDemo(snakeSpec, 42);
    expect(run.game).toBe('snake');
    expect(run.state.phase).toBe('playing');
    expect(run.state.demo).toBe(true);
    expect(Object.keys(run.state.scores)).toEqual([DEMO_PLAYER_ID]);
    expect(DEMO_PLAYER_ID).toBe('DEMO');
  });

  it('advances snake on the board without a human input', () => {
    let run = createDemo(snakeSpec, 7);
    const before = (run.state as { snakes: Record<string, { body: { x: number }[] }> }).snakes[DEMO_PLAYER_ID]!
      .body[0]!.x;
    for (let i = 0; i < 40; i++) run = stepDemo(snakeSpec, run);
    const after = (run.state as { snakes: Record<string, { body: { x: number }[] }> }).snakes[DEMO_PLAYER_ID]!
      .body[0]!.x;
    expect(after).not.toBe(before);
    expect(run.ticks).toBe(40);
  });

  it('is deterministic for the same seed', () => {
    const snap = (n: number) => {
      let run = createDemo(snakeSpec, 99);
      for (let i = 0; i < n; i++) run = stepDemo(snakeSpec, run);
      return JSON.stringify(run.state);
    };
    expect(snap(80)).toEqual(snap(80));
    let a = createDemo(galaxySpec, 3);
    let b = createDemo(galaxySpec, 3);
    for (let i = 0; i < 50; i++) {
      a = stepDemo(galaxySpec, a);
      b = stepDemo(galaxySpec, b);
    }
    expect(JSON.stringify(a.state)).toEqual(JSON.stringify(b.state));
  });

  it('does not mutate the input DemoRun or its state', () => {
    const run = freezeRun(createDemo(snakeSpec, 1));
    const before = JSON.stringify(run);
    const next = stepDemo(snakeSpec, run);
    expect(JSON.stringify(run)).toBe(before);
    expect(next).not.toBe(run);
    expect(next.state).not.toBe(run.state);
  });

  it('loops back to playing after gameOver instead of lingering in attract', () => {
    const over = createDemo(snakeSpec, 11);
    const run = stepDemo(snakeSpec, { ...over, state: { ...over.state, phase: 'gameOver' } });
    expect(run.state.phase).toBe('playing');
    expect(run.state.demo).toBe(true);
    expect(run.ticks).toBe(0);
    const fromAttract = stepDemo(snakeSpec, {
      ...over,
      state: { ...over.state, phase: 'attract' },
    });
    expect(fromAttract.state.phase).toBe('playing');
  });

  it('restarts on a max-tick attract loop even if the player is still alive', () => {
    let run = createDemo(blockSpec, 5);
    const limit = 60 * 25;
    for (let i = 0; i < limit; i++) run = stepDemo(blockSpec, run);
    expect(run.ticks).toBeLessThan(limit);
    expect(run.state.phase).toBe('playing');
    expect(run.state.demo).toBe(true);
  });

  it('keeps demo scores off the paid identity — only DEMO is present', () => {
    let run = createDemo(galaxySpec, 2);
    for (let i = 0; i < 120; i++) run = stepDemo(galaxySpec, run);
    expect(Object.keys(run.state.scores).every((id) => id === DEMO_PLAYER_ID)).toBe(true);
  });

  it('every registered cabinet can create and step a demo', () => {
    for (const id of GAME_IDS) {
      const spec = REGISTRY[id] as AnyGameSpec;
      let run = createDemo(spec, 21 + id.length);
      expect(run.state.demo).toBe(true);
      run = stepDemo(spec, run);
      expect(run.state.phase).toBe('playing');
      expect(() => JSON.stringify(run.state)).not.toThrow();
    }
    expect(ALL).toHaveLength(6);
  });
});
