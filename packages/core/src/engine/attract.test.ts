import { describe, it, expect } from 'vitest';
import { attractDemoTier, demoRuns } from './attract';

describe('attract demo tiers (R39)', () => {
  it('maps idle time to fast, normal and slow', () => {
    expect(attractDemoTier(0)).toBe('fast');
    expect(attractDemoTier(59_999)).toBe('fast');
    expect(attractDemoTier(60_000)).toBe('normal');
    expect(attractDemoTier(299_999)).toBe('normal');
    expect(attractDemoTier(300_000)).toBe('slow');
    expect(attractDemoTier(-10)).toBe('fast');
  });

  it('tick-skip is deterministic per tier', () => {
    for (let t = 0; t < 40; t++) {
      expect(demoRuns('fast', t)).toBe(true);
      expect(demoRuns('normal', t)).toBe(t % 2 === 0);
      expect(demoRuns('slow', t)).toBe(t % 4 === 0);
    }
    expect(demoRuns('slow', 7)).toBe(false);
    expect(demoRuns('slow', 8)).toBe(true);
  });

  it('a slower tier never runs more often than a faster one', () => {
    for (let t = 0; t < 40; t++) {
      if (demoRuns('slow', t)) expect(demoRuns('normal', t)).toBe(true);
      if (demoRuns('normal', t)) expect(demoRuns('fast', t)).toBe(true);
    }
  });
});
