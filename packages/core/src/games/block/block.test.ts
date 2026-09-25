import { describe, it, expect } from 'vitest';
import { blockSpec, createBlock, BLOCK_W, BLOCK_H, WIN_SCORE, type BlockState } from './block';
import { NO_INPUT, type GameConfig, type PlayerInput } from '../../engine/types';

const soloCfg: GameConfig = { mode: 'solo', playerIds: ['p1'], seed: 42 };
const vsCfg: GameConfig = { mode: 'versus', playerIds: ['p1', 'p2'], seed: 42 };

const play = (s: BlockState): BlockState => ({ ...s, phase: 'playing' });
const run = (s: BlockState, inputs: Record<string, PlayerInput>, ticks: number): BlockState => {
  let cur = s;
  for (let i = 0; i < ticks; i++) cur = blockSpec.step(cur, inputs);
  return cur;
};
const left = { dir: { dx: -1, dy: 0 }, button: false };
const none = NO_INPUT;

describe('block create', () => {
  it('solo has a brick wall, a paddle and 3 lives', () => {
    const s = createBlock(soloCfg);
    expect(s.phase).toBe('ready');
    expect(Object.keys(s.bricks).length).toBeGreaterThan(30);
    expect(s.lives['p1']).toBe(3);
    expect(s.paddles['p1']).toBeDefined();
  });

  it('versus has two paddles, no bricks, no lives', () => {
    const s = createBlock(vsCfg);
    expect(s.paddles['p1']).toBeDefined();
    expect(s.paddles['p2']).toBeDefined();
    expect(Object.keys(s.bricks)).toHaveLength(0);
  });
});

describe('block physics', () => {
  it('paddles move and clamp to the field', () => {
    let s = play(createBlock(soloCfg));
    let moved = run(s, { p1: left }, 10);
    expect(moved.paddles['p1']!.x).toBeLessThan(s.paddles['p1']!.x);
    moved = run(s, { p1: left }, 500);
    expect(moved.paddles['p1']!.x).toBeGreaterThanOrEqual(1);
    moved = run(moved, { p1: { dir: { dx: 1, dy: 0 }, button: false } }, 2000);
    expect(moved.paddles['p1']!.x + s.paddles['p1']!.span).toBeLessThanOrEqual(BLOCK_W - 1);
  });

  it('ball bounces off side walls', () => {
    let s = play(createBlock(soloCfg));
    s = { ...s, serveTimer: 0, ball: { ...s.ball, x: 1.5, y: 12, dx: -0.3, dy: 0.01 } };
    const moved = run(s, { p1: none }, 40);
    expect(moved.ball.x).toBeGreaterThan(1.5);
  });

  it('ball reflects off the paddle and the hit angle depends on offset', () => {
    let s = play(createBlock(soloCfg));
    const p = s.paddles['p1']!;
    s = {
      ...s,
      serveTimer: 0,
      bricks: {},
      ball: { ...s.ball, x: p.x + p.span / 2, y: p.y - 1, dx: 0.05, dy: 0.28 },
    };
    const moved = run(s, { p1: none }, 8);
    expect(moved.ball.dy).toBeLessThan(0);
  });

  it('paddle English: hitting the left edge aims the ball left even when incoming dx is positive', () => {
    let s = play(createBlock(soloCfg));
    const p = s.paddles['p1']!;
    s = {
      ...s,
      serveTimer: 0,
      bricks: {},
      ball: { x: p.x + 0.3, y: p.y + 0.2, dx: 0.15, dy: 0.3 },
    };
    const moved = blockSpec.step(s, { p1: none });
    expect(moved.ball.dy).toBeLessThan(0);
    expect(moved.ball.dx).toBeLessThan(0);
  });

  it('ball falling past the paddle costs a life in solo', () => {
    let s = play(createBlock(soloCfg));
    s = { ...s, serveTimer: 0, bricks: {}, ball: { ...s.ball, x: 1, y: 12, dx: 0.1, dy: 0.3 } };
    const moved = run(s, { p1: none }, 400);
    expect(moved.lives['p1']).toBeLessThan(3);
  });

  it('ball destroys bricks and scores', () => {
    let s = play(createBlock(soloCfg));
    const brickKey = Object.keys(s.bricks)[0]!;
    const [bx, by] = brickKey.split(',').map(Number);
    s = { ...s, serveTimer: 0, ball: { ...s.ball, x: bx! + 0.5, y: by! - 1, dx: 0, dy: 0.3 } };
    const moved = run(s, { p1: none }, 6);
    expect(moved.scores['p1']).toBeGreaterThan(0);
  });

  it('ball hitting brick side bounces horizontally', () => {
    let s = play(createBlock(soloCfg));
    s = { ...s, serveTimer: 0, bricks: { '10,3': 1 }, ball: { x: 9.9, y: 3.5, dx: 0.2, dy: 0 } };
    const moved = blockSpec.step(s, { p1: none });
    expect(moved.ball.dx).toBeLessThan(0);
  });

  it('brick hits slightly increase vertical ball speed during a rally', () => {
    let s = play(createBlock(soloCfg));
    s = { ...s, serveTimer: 0, bricks: { '10,3': 1 }, ball: { x: 10.5, y: 2.7, dx: 0, dy: 0.3 } };
    const moved = blockSpec.step(s, { p1: none });
    expect(Math.abs(moved.ball.dy)).toBeGreaterThan(0.3);
  });

  it('clearing all bricks levels up and renews the wall', () => {
    let s = play(createBlock(soloCfg));
    s = { ...s, bricks: { '15,4': 1 }, serveTimer: 0 };
    s = { ...s, ball: { ...s.ball, x: 15.5, y: 3, dx: 0, dy: 0.3 } };
    const moved = run(s, { p1: none }, 10);
    expect(moved.level).toBe(2);
    expect(moved.phase).toBe('roundOver');
    const resumed = run(moved, { p1: none }, 200);
    expect(resumed.phase).toBe('playing');
    expect(Object.keys(resumed.bricks).length).toBeGreaterThan(30);
  });
});

describe('block duel', () => {
  it('ball passing the top goal scores for the bottom player', () => {
    let s = play(createBlock(vsCfg));
    s = {
      ...s,
      serveTimer: 0,
      ball: { x: 15, y: 1.5, dx: 0, dy: -0.3 },
      paddles: { p1: s.paddles['p1']!, p2: { ...s.paddles['p2']!, x: 1 } },
    };
    const moved = run(s, { p1: none, p2: none }, 30);
    expect(moved.scores['p1']).toBe(1);
  });

  it('first to WIN_SCORE wins the duel', () => {
    let s = play(createBlock(vsCfg));
    s = { ...s, scores: { p1: WIN_SCORE - 1, p2: 0 }, serveTimer: 0, paddles: { p1: s.paddles['p1']!, p2: { ...s.paddles['p2']!, x: 1 } } };
    s = { ...s, ball: { x: 15, y: 1.5, dx: 0, dy: -0.3 } };
    const moved = run(s, { p1: none, p2: none }, 30);
    expect(moved.phase).toBe('gameOver');
    expect(moved.winner).toBe('p1');
    expect(moved.scores['p1']).toBe(WIN_SCORE);
  });
});

describe('block versus goal geometry', () => {
  const swapped = (ids: string[]): GameConfig => ({ mode: 'versus', playerIds: ids, seed: 3 });

  it('bottom paddle scores on a top goal regardless of join order', () => {
    let s = play(createBlock(swapped(['late', 'early'])));
    s = { ...s, serveTimer: 0, ball: { x: 15, y: 0.4, dx: 0, dy: -0.5 } };
    s = blockSpec.step(s, { late: none, early: none });
    expect(s.scores['late']).toBe(1);
    expect(s.scores['early']).toBe(0);
  });

  it('top paddle scores on a bottom goal regardless of join order', () => {
    let s = play(createBlock(swapped(['late', 'early'])));
    s = { ...s, serveTimer: 0, ball: { x: 15, y: BLOCK_H - 0.4, dx: 0, dy: 0.5 } };
    s = blockSpec.step(s, { late: none, early: none });
    expect(s.scores['early']).toBe(1);
    expect(s.scores['late']).toBe(0);
  });

  it('paddle deflection emits a bounce sfx', () => {
    let s = play(createBlock(soloCfg));
    const p1 = s.paddles['p1']!;
    s = { ...s, serveTimer: 0, ball: { x: p1.x + 2, y: 22.2, dx: 0, dy: 0.4 } };
    const next = blockSpec.step(s, { p1: none });
    expect(next.sfx.filter((e) => e.name === 'bounce').length).toBe(1);
  });

  it('wall bounce emits a bounce sfx', () => {
    let s = play(createBlock(soloCfg));
    s = { ...s, serveTimer: 0, bricks: {}, ball: { x: 0.4, y: 10, dx: -0.2, dy: 0.1 } };
    const next = blockSpec.step(s, { p1: none });
    expect(next.sfx.some((e) => e.name === 'bounce')).toBe(true);
  });
});
