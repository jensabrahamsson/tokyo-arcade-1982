export interface RampConfig {
  base: number;
  perLevel: number;
  max: number;
}

export interface DifficultyInput {
  level: number;
  deaths: number;
  clears: number;
}

export interface Difficulty {
  /** 0.1 .. 1 — movement speed factor. */
  speed: number;
  /** 0.1 .. 1 — enemy/pickup pressure factor. */
  aggression: number;
}

export const clamp01 = (v: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, v));

export function ramp(level: number, { base, perLevel, max }: RampConfig): number {
  return Math.min(max, base + perLevel * level);
}

const BASE: RampConfig = { base: 0.35, perLevel: 0.06, max: 0.9 };

export function computeDifficulty({ level, deaths, clears }: DifficultyInput): Difficulty {
  const base = ramp(level, BASE);
  const adjust = clamp01(-0.12 * deaths + 0.04 * clears, -0.25, 0.15);
  return {
    speed: clamp01(base + adjust, 0.1, 1),
    aggression: clamp01(base + adjust * 0.8, 0.1, 1),
  };
}
