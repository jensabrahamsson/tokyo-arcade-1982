import { describe, it, expect } from 'vitest';
import { myriadSpec, createMyriad, type MyriadState } from './myriad';
import { NO_INPUT, type GameConfig, type PlayerInput } from '../../engine/types';

const cfg: GameConfig = { mode: 'solo', playerIds: ['p1'], seed: 42 };

const play = (s: MyriadState): MyriadState => ({ ...s, phase: 'playing' });
const run = (s: MyriadState, inputs: Record<string, PlayerInput>, ticks: number): MyriadState => {
  let cur = s;
  for (let i = 0; i < ticks; i++) cur = myriadSpec.step(cur, inputs);
  return cur;
};
const none = NO_INPUT;
const fire = { dir: null, button: true };

describe('myriad create', () => {
  it('has a 10-segment bug waiting at the top and a mushroom field', () => {
    const s = createMyriad(cfg);
    expect(s.phase).toBe('ready');
    expect(s.segments).toHaveLength(10);
    expect(s.segments.every((p) => p.y < 0)).toBe(true);
    expect(Object.keys(s.mushrooms).length).toBeGreaterThan(25);
    expect(s.lives['p1']).toBe(3);
  });
});

describe('myriad movement', () => {
  it('the head marches and reverses at the wall', () => {
    let s = play(createMyriad(cfg));
    const head = { x: 27, y: 5 };
    s = { ...s, segments: s.segments.map((p) => ({ ...p })), };
    s.segments[0] = head;
    s.segments.forEach((p, i) => {
      p.x = 27 - i;
      p.y = 5;
    });
    const moved = run(s, { p1: none }, 25);
    expect(moved.dir).toBe(-1);
    expect(moved.segments[0]!.y).toBeGreaterThanOrEqual(5);
  });

  it('dropping to the player line costs a life and resets the bug', () => {
    let s = play(createMyriad(cfg));
    s.segments.forEach((p) => {
      p.y = 20;
    });
    s = { ...s, mushrooms: {} };
    const moved = run(s, { p1: none }, 9);
    expect(moved.lives['p1']).toBe(2);
    expect(moved.deaths).toBe(1);
    expect(moved.segments).toHaveLength(10);
    expect(moved.segments.every((p) => p.y <= 0)).toBe(true);
  });
});

describe('myriad combat', () => {
  it('shots destroy segments which turn into mushrooms', () => {
    let s = play(createMyriad(cfg));
    const seg = s.segments[0]!;
    seg.x = 14;
    seg.y = 10;
    s.segments.forEach((p, i) => {
      if (i > 0) {
        p.y = -5;
        p.x = 14;
      }
    });
    s = { ...s, bullets: [{ x: seg.x + 0.5, y: seg.y + 2, dy: -0.9 }] };
    const moved = run(s, { p1: none }, 3);
    expect(moved.segments).toHaveLength(9);
    expect(moved.scores['p1']).toBeGreaterThanOrEqual(10);
    expect(Object.keys(moved.mushrooms)).toContain(`${seg.x},${seg.y}`);
  });

  it('mushrooms take four hits', () => {
    let s = play(createMyriad(cfg));
    const mKey = Object.keys(s.mushrooms)[0]!;
    const [mx, my] = mKey.split(',').map(Number);
    let moved = s;
    for (let i = 0; i < 4; i++) {
      moved = { ...moved, bullets: [{ x: mx! + 0.5, y: my! + 2, dy: -0.9 }] };
      moved = run(moved, { p1: none }, 3);
    }
    expect(Object.keys(moved.mushrooms)).not.toContain(mKey);
    expect(moved.scores['p1']).toBeGreaterThanOrEqual(4 * 4);
  });

  it('clearing the bug levels up', () => {
    let s = play(createMyriad(cfg));
    s.segments.forEach((p, i) => {
      p.x = 14;
      p.y = 3 + i;
    });
    for (let i = 0; i < 12; i++) {
      if (s.segments.length < 10) break;
      s = { ...s, bullets: [{ x: 14.5, y: 13, dy: -0.9 }] };
      s = run(s, { p1: none }, 2);
    }
    expect(s.segments.length).toBeLessThan(10);
  });

  it('player moves and clamps to the bottom area', () => {
    let s = play(createMyriad(cfg));
    const moved = run(s, { p1: { dir: { dx: 1, dy: 0 }, button: false } }, 40);
    expect(moved.player.x).toBeGreaterThan(s.player.x);
    const clamped = run(s, { p1: { dir: { dx: 0, dy: 1 }, button: false } }, 200);
    expect(clamped.player.y).toBeLessThanOrEqual(23);
  });
});
