import { describe, it, expect } from 'vitest';
import { GAME_IDS } from '@arkad/core';
import { shouldRunHallDemo, titleDemoIndex, demoGain } from './hallView';

describe('hall view (title/select demo chrome)', () => {
  it('runs ambience on title and select, not at a paid table', () => {
    expect(shouldRunHallDemo('title')).toBe(true);
    expect(shouldRunHallDemo('select')).toBe(true);
    expect(shouldRunHallDemo('table')).toBe(false);
    expect(shouldRunHallDemo('scores')).toBe(false);
    expect(shouldRunHallDemo('name')).toBe(false);
  });

  it('rotates title cabinets on a fixed tick cadence, not wall-clock', () => {
    expect(titleDemoIndex(0)).toBe(0);
    expect(titleDemoIndex(131)).toBe(1);
    expect(titleDemoIndex(GAME_IDS.length * 132)).toBe(0);
  });

  it('plays hall sfx quieter than a paid cabinet', () => {
    expect(demoGain).toBeGreaterThan(0);
    expect(demoGain).toBeLessThan(1);
  });
});
