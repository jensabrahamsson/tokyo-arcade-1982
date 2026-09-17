export interface Clock {
  /** Feed elapsed seconds, returns how many fixed steps to run now. */
  drain(deltaSeconds: number): number;
  readonly step: number;
}

const MAX_CATCH_UP = 5;

export function createClock(step: number): Clock {
  if (!(step > 0)) throw new RangeError('step must be > 0');
  let accumulator = 0;
  return {
    step,
    drain(delta) {
      if (delta <= 0 || !Number.isFinite(delta)) return 0;
      accumulator += Math.min(delta, MAX_CATCH_UP * step);
      const steps = Math.floor(accumulator / step);
      accumulator -= steps * step;
      return steps;
    },
  };
}
