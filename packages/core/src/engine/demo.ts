import type { AnyGameSpec, GameStateBase, PlayerInput } from './types';
import { enterPhase } from './phase';
import { createRng } from './rng';
import { DIR_LIST, DIRS, opposite, eq, type Dir } from './vec';

export const DEMO_PLAYER_ID = 'DEMO';

/** Restart a still-alive attract loop so cabinets do not freeze on one round. */
export const DEMO_MAX_TICKS = 60 * 20;

export interface DemoRun {
  game: string;
  state: GameStateBase;
  rngSeed: number;
  ticks: number;
  seq: number;
  lastDir: Dir;
}

export function createDemo(spec: AnyGameSpec, seed: number): DemoRun {
  const s = seed >>> 0 || 1;
  const created = spec.create({
    mode: 'solo',
    playerIds: [DEMO_PLAYER_ID],
    seed: s,
    demo: true,
  });
  const playing = enterPhase(created, 'playing');
  return {
    game: spec.id,
    state: { ...playing, demo: true, sfx: [] },
    rngSeed: (s ^ 0xde40) >>> 0 || 1,
    ticks: 0,
    seq: 0,
    lastDir: DIRS.right,
  };
}

function autoplay(run: DemoRun): { input: PlayerInput; rngSeed: number; seq: number; lastDir: Dir } {
  const rng = createRng(run.rngSeed);
  let dir = run.lastDir;
  let seq = run.seq;
  if (rng.next() < 0.12) {
    const candidates = DIR_LIST.filter((d) => !eq(d, opposite(dir)));
    dir = rng.pick(candidates.length > 0 ? candidates : DIR_LIST);
    seq += 1;
  }
  const button = rng.next() < 0.4;
  if (button) seq += 1;
  return {
    input: { dir, button, seq },
    rngSeed: rng.state,
    seq,
    lastDir: dir,
  };
}

function shouldRestart(run: DemoRun): boolean {
  return run.state.phase === 'gameOver' || run.state.phase === 'attract' || run.ticks >= DEMO_MAX_TICKS;
}

export function stepDemo(spec: AnyGameSpec, run: DemoRun): DemoRun {
  if (shouldRestart(run)) {
    const nextSeed = (run.rngSeed ^ (run.ticks + 1) ^ 0x9e37) >>> 0 || 1;
    return createDemo(spec, nextSeed);
  }
  const play = autoplay(run);
  const next = spec.step(run.state, { [DEMO_PLAYER_ID]: play.input });
  return {
    game: run.game,
    state: { ...next, demo: true },
    rngSeed: play.rngSeed,
    ticks: run.ticks + 1,
    seq: play.seq,
    lastDir: play.lastDir,
  };
}
