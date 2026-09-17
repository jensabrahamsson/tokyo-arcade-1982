import { describe, it, expect } from 'vitest';
import { createClock, type Clock } from './loop';

describe('fixed timestep clock', () => {
  const STEP = 1 / 60;

  const fresh = (): Clock => createClock(STEP);

  it('accumulates time and reports whole steps due', () => {
    const c = fresh();
    expect(c.drain(0)).toBe(0);
    expect(c.drain(0.5 * STEP)).toBe(0);
    expect(c.drain(1.0 * STEP)).toBe(1);
    expect(c.drain(3.7 * STEP)).toBe(4);
    // remainder 0.2 + 0.5 = 0.7 -> none; +0.5 = 1.2 -> one
    expect(c.drain(0.5 * STEP)).toBe(0);
    expect(c.drain(0.5 * STEP)).toBe(1);
  });

  it('clamps huge frame deltas (tab was in background)', () => {
    const c = fresh();
    c.drain(0.25);
    const steps = c.drain(600);
    expect(steps).toBeLessThanOrEqual(5);
    expect(steps).toBeGreaterThanOrEqual(1);
  });

  it('never returns negative steps', () => {
    const c = fresh();
    expect(c.drain(-10)).toBe(0);
  });
});
