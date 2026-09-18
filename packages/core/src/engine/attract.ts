/** R39: attract-bot energy policy. Pure: idle time in, tier/run-decision out. */

export type DemoTier = 'fast' | 'normal' | 'slow';

/** how long the cabinet has stood without a human seat decides the tier */
export function attractDemoTier(idleMs: number): DemoTier {
  const idle = Math.max(0, idleMs);
  if (idle < 60_000) return 'fast';
  if (idle < 300_000) return 'normal';
  return 'slow';
}

/** deterministic tick-skip: a slower tier never runs more often */
export function demoRuns(tier: DemoTier, tick: number): boolean {
  const t = Math.trunc(tick);
  if (tier === 'fast') return true;
  if (tier === 'normal') return t % 2 === 0;
  return t % 4 === 0;
}
