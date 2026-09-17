export const PHASES = [
  'attract',
  'ready',
  'playing',
  'roundOver',
  'gameOver',
] as const;

export type Phase = (typeof PHASES)[number];

export type PhaseEvent = 'coin' | 'start' | 'roundCleared' | 'finalDeath' | 'countdownDone' | 'toAttract';

export interface PhaseState {
  phase: Phase;
  phaseTimer: number;
}

const ALLOWED: Record<Phase, Partial<Record<Phase, PhaseEvent>>> = {
  attract: { ready: 'coin' },
  ready: { playing: 'start' },
  playing: { roundOver: 'roundCleared', gameOver: 'finalDeath' },
  roundOver: { playing: 'countdownDone', gameOver: 'finalDeath' },
  gameOver: { attract: 'toAttract' },
};

/** Seconds a phase lingers before its auto-event fires (0 = manual). */
const TIMERS: Partial<Record<Phase, number>> = {
  roundOver: 2.5,
  gameOver: 15,
};

export function canTransition(from: Phase, to: Phase): boolean {
  return ALLOWED[from][to] !== undefined;
}

export function eventFor(from: Phase, to: Phase): PhaseEvent {
  const ev = ALLOWED[from][to];
  if (!ev) throw new Error(`illegal transition ${from} -> ${to}`);
  return ev;
}

export function enterPhase<S extends PhaseState>(s: S, to: Phase): S {
  if (!canTransition(s.phase, to)) throw new Error(`illegal transition ${s.phase} -> ${to}`);
  return { ...s, phase: to, phaseTimer: TIMERS[to] ?? 0 };
}

export function tickPhase<S extends PhaseState>(
  s: S,
  dt: number,
): { state: S; event?: PhaseEvent } {
  const limit = TIMERS[s.phase];
  if (!limit || s.phaseTimer <= 0) return { state: s };
  const timer = s.phaseTimer - dt;
  if (timer > 0) return { state: { ...s, phaseTimer: timer } };
  const target = Object.keys(ALLOWED[s.phase])[0] as Phase;
  const event = ALLOWED[s.phase][target];
  if (!event) return { state: { ...s, phaseTimer: 0 } };
  return { state: enterPhase({ ...s, phaseTimer: 0 }, target), event };
}
