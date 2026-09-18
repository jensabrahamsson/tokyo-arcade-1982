import { describe, it, expect } from 'vitest';
import { REGISTRY } from './games/registry';
import { GAME_IDS } from './protocol/protocol';
import { snakeSpec, type SnakeState } from './games/snake/snake';
import { puckSpec, type PuckState } from './games/puck/puck';
import { blockSpec, type BlockState } from './games/block/block';
import { riverSpec, type RiverState } from './games/river/river';
import { galaxySpec, type GalaxyState } from './games/galaxy/galaxy';
import { myriadSpec, type MyriadState } from './games/myriad/myriad';
import type { AnyGameSpec, GameSpec, PlayerInput, GameStateBase } from './engine/types';
import type { Dir } from './engine/vec';

const cfg = (id: string) => ({ mode: 'solo' as const, playerIds: ['demo'], seed: 11 });

const isUnitDir = (d: unknown): boolean => {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Dir;
  const unit = (n: number) => n === -1 || n === 0 || n === 1;
  return unit(o.dx) && unit(o.dy) && (o.dx === 0) !== (o.dy === 0);
};

const runDemo = <S extends GameStateBase>(spec: GameSpec<S>, ticks: number, seed = 11) => {
  let s: S = spec.create({ mode: 'solo', playerIds: ['demo'], seed });
  s = { ...s, phase: 'playing' };
  const trace: PlayerInput[] = [];
  for (let i = 0; i < ticks; i++) {
    const input = spec.demo!(s, i);
    trace.push(input);
    s = spec.step(s, { demo: input });
  }
  return { state: s, trace };
};

describe('every game exposes a pure deterministic demo bot (R8)', () => {
  for (const id of GAME_IDS) {
    const spec = REGISTRY[id]!;
    it(`${id}: demo() exists, is valid and deterministic`, () => {
      expect(typeof spec.demo).toBe('function');
      const a = runDemo(spec, 5);
      const b = runDemo(spec, 5);
      expect(JSON.stringify(a.trace)).toBe(JSON.stringify(b.trace));
      for (const inp of a.trace) {
        if (inp.dir !== null && inp.dir !== undefined) expect(isUnitDir(inp.dir)).toBe(true);
        expect(typeof inp.button).toBe('boolean');
      }
      expect(JSON.parse(JSON.stringify(a.state))).toBeTruthy();
    });

    it(`${id}: demo does not mutate the state it was given`, () => {
      let s = spec.create(cfg(id));
      for (let i = 0; i < 40; i++) {
        const before = JSON.stringify(s);
        spec.demo!(s, i);
        spec.step(s, { demo: spec.demo!(s, i) });
        // the ORIGINAL state must be untouched by both calls:
        expect(JSON.stringify(s)).toBe(before);
        s = spec.step(s, { demo: spec.demo!(s, i) });
      }
    });
  }
});

describe('demo bots actually play their cabinets', () => {
  it('snake bot eats food and is still alive after 400 ticks', () => {
    const { state } = runDemo(snakeSpec, 400);
    expect(state.snakes['demo']!.alive).toBe(true);
    expect(state.foodsEaten['demo']).toBeGreaterThan(0);
  });

  it('puck bot eats at least 5 dots within 600 ticks', () => {
    const start = puckSpec.create(cfg('puck'));
    const eaten = Object.keys(start.dots).length - Object.keys(runDemo(puckSpec, 600).state.dots).length;
    expect(eaten).toBeGreaterThanOrEqual(5);
  });

  it('block bot tracks the ball', () => {
    let s: BlockState = { ...blockSpec.create(cfg('block')), phase: 'playing', serveTimer: 1 };
    s = blockSpec.step(s, { demo: { dir: null, button: false } });
    s = { ...s, phase: 'playing' as const };
    const paddle = s.paddles['demo']!;
    const before = Math.abs(paddle.x + paddle.span / 2 - s.ball.x);
    const r = runDemo(blockSpec, 120);
    const p2 = r.state.paddles['demo']!;
    const after = Math.abs(p2.x + p2.span / 2 - r.state.ball.x);
    expect(after).toBeLessThanOrEqual(before + 1);
  });

  it('galaxy bot shoots within 60 ticks', () => {
    let fired = false;
    let s: GalaxyState = { ...galaxySpec.create(cfg('galaxy')), phase: 'playing' };
    for (let i = 0; i < 60; i++) {
      s = galaxySpec.step(s, { demo: galaxySpec.demo!(s, i) });
      if (s.bullets.length > 0) fired = true;
    }
    expect(fired).toBe(true);
  });

  it('myriad bot shoots within 60 ticks', () => {
    let s: MyriadState = { ...myriadSpec.create(cfg('myriad')), phase: 'playing' };
    let fired = false;
    for (let i = 0; i < 60; i++) {
      s = myriadSpec.step(s, { demo: myriadSpec.demo!(s, i) });
      if (s.bullets.length > 0) fired = true;
    }
    expect(fired).toBe(true);
  });

  it('river bot crosses (hops up at least once) within 400 ticks', () => {
    let s: RiverState = { ...riverSpec.create(cfg('river')), phase: 'playing' };
    let moved = false;
    for (let i = 0; i < 400; i++) {
      s = riverSpec.step(s, { demo: riverSpec.demo!(s, i) });
      if (s.frog.y < 16 || s.clears > 0) moved = true;
    }
    expect(moved).toBe(true);
  });
});
