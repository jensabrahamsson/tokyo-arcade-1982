export interface Rng {
  next(): number;
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  const next = (): number => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  return {
    next,
    int: (n) => {
      if (n <= 0) throw new RangeError('int() needs n > 0');
      return Math.floor(next() * n);
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError('pick() from empty array');
      return items[Math.floor(next() * items.length)] as T;
    },
  };
}
