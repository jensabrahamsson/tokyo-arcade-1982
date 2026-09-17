import { describe, it, expect } from 'vitest';
import { galaxySpec, createGalaxy, type GalaxyState } from './galaxy';
import { NO_INPUT, type GameConfig, type PlayerInput } from '../../engine/types';

const cfg: GameConfig = { mode: 'solo', playerIds: ['p1'], seed: 42 };

const play = (s: GalaxyState): GalaxyState => ({ ...s, phase: 'playing' });
const run = (s: GalaxyState, inputs: Record<string, PlayerInput>, ticks: number): GalaxyState => {
  let cur = s;
  for (let i = 0; i < ticks; i++) cur = galaxySpec.step(cur, inputs);
  return cur;
};
const fire = { dir: null, button: true };
const left = { dir: { dx: -1, dy: 0 }, button: false };
const none = NO_INPUT;

describe('galaxy create', () => {
  it('has a 6x4 invasion formation and 3 lives', () => {
    const s = createGalaxy(cfg);
    expect(s.phase).toBe('ready');
    expect(s.aliens).toHaveLength(24);
    expect(s.lives['p1']).toBe(3);
    expect(s.player.y).toBeGreaterThan(19);
  });
});

describe('galaxy player', () => {
  it('moves and clamps', () => {
    let s = play(createGalaxy(cfg));
    const moved = run(s, { p1: left }, 10);
    expect(moved.player.x).toBeLessThan(s.player.x);
    const clamped = run(s, { p1: left }, 2000);
    expect(clamped.player.x).toBeGreaterThanOrEqual(1);
  });

  it('fires bullets with a cooldown and max 2 on screen', () => {
    let s = play(createGalaxy(cfg));
    s = run(s, { p1: fire }, 1);
    expect(s.bullets).toHaveLength(1);
    s = run(s, { p1: fire }, 120);
    expect(s.bullets.length).toBeLessThanOrEqual(2);
    const before = s.bullets.map((b) => b.y);
    const moved = run(s, { p1: none }, 5);
    expect(moved.bullets.every((b) => before.some((y) => b.y < y))).toBe(true);
  });
});

describe('galaxy formation', () => {
  it('marches and bounces off the edges dropping lower', () => {
    let s = play(createGalaxy(cfg));
    const moved = run(s, { p1: none }, 200);
    expect(moved.formationOffset).not.toBe(0);
    const bounced = run(s, { p1: none }, 800);
    expect(Math.abs(bounced.formationOffset)).toBeLessThanOrEqual(3);
    expect(bounced.dropOffset).toBeGreaterThan(0);
  });

  it('sends divers periodically', () => {
    let s = play(createGalaxy(cfg));
    const moved = run(s, { p1: none }, s.diveInterval + 5);
    expect(moved.aliens.some((a) => a.mode === 'dive')).toBe(true);
  });

  it('a diver that reaches the bottom returns to formation', () => {
    let s = play(createGalaxy(cfg));
    s = { ...s, diveInterval: 100, diveTimer: 2 };
    s = run(s, { p1: none }, 300);
    expect(s.aliens.every((a) => a.mode === 'grid')).toBe(true);
  });

  it('aliens reaching the player line costs a life and resets the wave', () => {
    let s = play(createGalaxy(cfg));
    s = { ...s, dropOffset: 18 };
    const moved = run(s, { p1: none }, 2);
    expect(moved.lives['p1']).toBe(2);
    expect(moved.aliens.every((a) => a.y < 8)).toBe(true);
  });
});

describe('galaxy combat', () => {
  it('a bullet destroys an alien and scores', () => {
    let s = play(createGalaxy(cfg));
    const target = s.aliens[s.aliens.length - 1]!;
    s = { ...s, bullets: [{ x: target.x, y: target.y + 2, dy: -0.7 }] };
    const moved = run(s, { p1: none }, 4);
    expect(moved.scores['p1']).toBeGreaterThan(0);
    expect(moved.aliens.some((a) => a.id === target.id)).toBe(false);
  });

  it('destroying the whole wave levels up', () => {
    let s = play(createGalaxy(cfg));
    for (let id = 23; id >= 0; id--) {
      if (s.level > 1) break;
      const t = s.aliens.find((a) => a.id === id);
      if (!t) continue;
      s = { ...s, bullets: [{ x: t.x, y: t.y + 1, dy: -0.7 }] };
      s = run(s, { p1: none }, 3);
    }
    expect(s.level).toBe(2);
    expect(s.phase).toBe('roundOver');
    const resumed = run(s, { p1: none }, 200);
    expect(resumed.phase).toBe('playing');
    expect(resumed.aliens).toHaveLength(24);
  });
});
