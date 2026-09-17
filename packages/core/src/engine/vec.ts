export interface Vec {
  readonly dx: number;
  readonly dy: number;
}

export type Dir = Vec;

export const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
} as const satisfies Record<string, Vec>;

export const DIR_LIST: readonly Dir[] = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];

const neg = (n: number): number => (n === 0 ? 0 : -n);

export const opposite = (d: Dir): Dir => ({ dx: neg(d.dx), dy: neg(d.dy) });

export const add = (a: Vec, b: Vec): Vec => ({ dx: a.dx + b.dx, dy: a.dy + b.dy });

export const wrap = (n: number, size: number): number => ((n % size) + size) % size;

export const eq = (a: Vec, b: Vec): boolean => a.dx === b.dx && a.dy === b.dy;
