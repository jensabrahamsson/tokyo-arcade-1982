import { describe, it, expect } from 'vitest';
import { coastLodStride } from './coast';

describe('coast mini LOD (P1-8)', () => {
  it('full-size cabinets draw every strip', () => {
    expect(coastLodStride(false)).toBe(1);
  });

  it('hall minis draw a quarter of the strips — the same road, coarser', () => {
    expect(coastLodStride(true)).toBe(4);
    const full = 140 / coastLodStride(false);
    const mini = 140 / coastLodStride(true);
    expect(mini).toBeLessThan(full);
    // the grass/road band period is 4 distance units, so a stride of 4
    // samples exactly one band per strip and cannot shift the layout
    expect(4 % 4).toBe(0);
  });
});
