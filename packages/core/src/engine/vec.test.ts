import { describe, it, expect } from 'vitest';
import { wrap, DIRS, opposite, type Dir } from './vec';

describe('vec/grid helpers', () => {
  it('wrap wraps coordinates like a Pac-Man tunnel', () => {
    expect(wrap(10, 4)).toBe(2);
    expect(wrap(-1, 4)).toBe(3);
    expect(wrap(3, 4)).toBe(3);
  });

  it('has the four cardinal directions', () => {
    const dirs: Dir[] = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];
    expect(new Set(dirs.map((d) => `${d.dx},${d.dy}`)).size).toBe(4);
  });

  it('opposite reverses direction', () => {
    expect(opposite(DIRS.up)).toEqual(DIRS.down);
    expect(opposite(DIRS.left)).toEqual(DIRS.right);
  });
});
