import { describe, it, expect } from 'vitest';
import { ramp, computeDifficulty } from './difficulty';

describe('ramp', () => {
  it('rises linearly from base per level', () => {
    expect(ramp(0, { base: 0.2, perLevel: 0.1, max: 1 })).toBeCloseTo(0.2);
    expect(ramp(1, { base: 0.2, perLevel: 0.1, max: 1 })).toBeCloseTo(0.3);
    expect(ramp(5, { base: 0.2, perLevel: 0.1, max: 1 })).toBeCloseTo(0.7);
  });

  it('never exceeds max', () => {
    expect(ramp(99, { base: 0.2, perLevel: 0.1, max: 0.8 })).toBe(0.8);
  });
});

describe('adaptive difficulty', () => {
  it('dies a lot -> eases off', () => {
    const hard = computeDifficulty({ level: 4, deaths: 0, clears: 3 });
    const soft = computeDifficulty({ level: 4, deaths: 4, clears: 0 });
    expect(soft.speed).toBeLessThan(hard.speed);
    expect(soft.aggression).toBeLessThan(hard.aggression);
  });

  it('cruising without dying -> pushes harder', () => {
    const idle = computeDifficulty({ level: 2, deaths: 0, clears: 0 });
    const cruising = computeDifficulty({ level: 2, deaths: 0, clears: 4 });
    expect(cruising.speed).toBeGreaterThan(idle.speed);
  });

  it('stays inside [0.1, 1] no matter what', () => {
    const a = computeDifficulty({ level: 99, deaths: 0, clears: 50 });
    const b = computeDifficulty({ level: 0, deaths: 99, clears: 0 });
    for (const d of [a, b]) {
      expect(d.speed).toBeGreaterThanOrEqual(0.1);
      expect(d.speed).toBeLessThanOrEqual(1);
      expect(d.aggression).toBeGreaterThanOrEqual(0.1);
      expect(d.aggression).toBeLessThanOrEqual(1);
    }
  });

  it('never too easy and never too hard: mid-game lands in usable band', () => {
    const mid = computeDifficulty({ level: 3, deaths: 1, clears: 1 });
    expect(mid.speed).toBeGreaterThanOrEqual(0.3);
    expect(mid.speed).toBeLessThanOrEqual(0.9);
  });
});
