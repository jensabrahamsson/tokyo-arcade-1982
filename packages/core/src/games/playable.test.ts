import { describe, expect, it } from 'vitest';
import { enterPhase } from '../engine/phase';
import { DIRS, type Dir } from '../engine/vec';
import {
  NO_INPUT,
  type AnyGameSpec,
  type GameStateBase,
  type PlayerInput,
} from '../engine/types';
import { GAME_IDS } from '../protocol/protocol';
import { REGISTRY } from './registry';
import { GRID as SNAKE_GRID } from './snake/snake';

/**
 * Solo playability bar. Each shipped spec is dealt the way the server
 * deals a table (create → enterPhase ready→playing) and then stepped
 * at 60 Hz. Idle and policy runs share one seed; nothing here reimplements
 * a cabinet's rules.
 */
const PLAYER = 'p1';
const SEED = 11;
const REACTION_TICKS = 120;
const IDLE_SAFE_TICKS = 90;
const PROGRESS_TICKS = 5400;
const END_TICKS = 10800;

const STICKS: readonly Dir[] = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];

type Policy = (state: GameStateBase, tick: number) => PlayerInput;

const hold = (dir: Dir | null, button: boolean): Policy => (_state, tick) => ({
  dir,
  button,
  seq: tick,
});

const mash: Policy = (_state, tick) => ({
  dir: STICKS[tick % STICKS.length]!,
  button: tick % 2 === 0,
  seq: tick,
});

const demoOf = (spec: AnyGameSpec): Policy => (state, tick) =>
  spec.demo ? spec.demo(state, tick) : { ...NO_INPUT, seq: tick };

/** Coil a snake into itself once it is long enough; otherwise keep the shipped demo. */
const snakeEnding = (spec: AnyGameSpec): Policy => (state, tick) => {
  const snakes = (state as { snakes?: Record<string, { alive?: boolean; dir?: Dir; body?: { x: number; y: number }[] }> }).snakes;
  const sn = snakes?.[PLAYER];
  if (!sn?.alive || !sn.dir || !sn.body || sn.body.length < 2) return demoOf(spec)(state, tick);
  const head = sn.body[0]!;
  const blocked = new Set(sn.body.slice(0, -1).map((c) => `${c.x},${c.y}`));
  const left: Dir = { dx: -sn.dir.dy, dy: sn.dir.dx };
  const right: Dir = { dx: sn.dir.dy, dy: -sn.dir.dx };
  const wrap = (n: number, size: number) => ((n % size) + size) % size;
  if (sn.body.length >= 5) {
    for (const dir of [left, right]) {
      const nx = wrap(head.x + dir.dx, SNAKE_GRID.w);
      const ny = wrap(head.y + dir.dy, SNAKE_GRID.h);
      if (blocked.has(`${nx},${ny}`)) return { dir, button: false, seq: tick };
    }
    return { dir: left, button: false, seq: tick };
  }
  return demoOf(spec)(state, tick);
};

const deal = (spec: AnyGameSpec): GameStateBase => {
  const created = spec.create({ mode: 'solo', playerIds: [PLAYER], seed: SEED });
  return enterPhase(created, 'playing');
};

const sumRecord = (rec: unknown): number => {
  if (!rec || typeof rec !== 'object') return 0;
  return Object.values(rec as Record<string, unknown>).reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
};

/** Forward progress only — score and the cabinet's own advance fields. */
const signals = (state: GameStateBase, start: GameStateBase): Record<string, number> => {
  const now = state as unknown as Record<string, unknown>;
  const base = start as unknown as Record<string, unknown>;
  const sig: Record<string, number> = { score: sumRecord(state.scores) };
  for (const key of ['clears', 'checkpoints', 'lap', 'dist', 'u'] as const) {
    if (typeof now[key] === 'number') sig[key] = now[key] as number;
  }
  if (now.foodsEaten) sig.foodsEaten = sumRecord(now.foodsEaten);
  if (now.dots && base.dots && typeof now.dots === 'object' && typeof base.dots === 'object') {
    sig.dotsEaten = Object.keys(base.dots as object).length - Object.keys(now.dots as object).length;
  }
  if (now.bricks && base.bricks && typeof now.bricks === 'object' && typeof base.bricks === 'object') {
    sig.bricksCleared = sumRecord(base.bricks) - sumRecord(now.bricks);
  }
  if (Array.isArray(now.aliens) && Array.isArray(base.aliens)) {
    sig.aliensDown = base.aliens.length - now.aliens.length;
  }
  if (Array.isArray(now.segments) && Array.isArray(base.segments)) {
    sig.segmentsDown = base.segments.length - now.segments.length;
  }
  if (now.frog && base.frog && typeof now.frog === 'object' && typeof base.frog === 'object') {
    const fy = (now.frog as { y?: number }).y;
    const by = (base.frog as { y?: number }).y;
    if (typeof fy === 'number' && typeof by === 'number') sig.hopsUp = Math.max(0, by - fy);
  }
  if (Array.isArray(now.homes)) sig.homes = (now.homes as unknown[]).filter(Boolean).length;
  if (now.finished === true) sig.finished = 1;
  return sig;
};

const maxSignals = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
};

const beats = (policy: Record<string, number>, idle: Record<string, number>): boolean =>
  Object.keys(policy).some((k) => (policy[k] ?? 0) > (idle[k] ?? 0) + 1e-6);

const gameplay = (state: GameStateBase): string => {
  const view: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) {
    if (k === 'sfx' || k === 'phaseTimer') continue;
    view[k] = v;
  }
  return JSON.stringify(view);
};

const stepWith = (spec: AnyGameSpec, state: GameStateBase, input: PlayerInput): GameStateBase =>
  spec.step(state, { [PLAYER]: input });

interface Scan {
  best: Record<string, number>;
  gameOverTick: number | null;
  successTick: number | null;
}

const scan = (spec: AnyGameSpec, policy: Policy, ticks: number): Scan => {
  const start = deal(spec);
  let state = start;
  let best = signals(start, start);
  let gameOverTick: number | null = null;
  let successTick: number | null = null;
  for (let tick = 0; tick < ticks; tick++) {
    state = stepWith(spec, state, policy(state, tick));
    best = maxSignals(best, signals(state, start));
    if (gameOverTick === null && state.phase === 'gameOver') gameOverTick = tick + 1;
    const cleared =
      (typeof (state as { clears?: number }).clears === 'number' && (state as { clears?: number }).clears! > 0) ||
      (state as { finished?: boolean }).finished === true;
    if (successTick === null && cleared) successTick = tick + 1;
    if (gameOverTick !== null) break;
  }
  return { best, gameOverTick, successTick };
};

const reactionPolicies = (spec: AnyGameSpec): Policy[] => [
  ...STICKS.flatMap((dir) => [hold(dir, false), hold(dir, true)]),
  hold(null, true),
  mash,
  demoOf(spec),
];

const progressPolicies = (spec: AnyGameSpec): Policy[] => [
  demoOf(spec),
  mash,
  ...STICKS.map((dir) => hold(dir, true)),
  hold(null, true),
];

const endingPolicies = (spec: AnyGameSpec): Policy[] => [
  hold(null, false),
  hold(DIRS.up, false),
  hold(DIRS.down, false),
  mash,
  demoOf(spec),
  snakeEnding(spec),
];

describe('shipped solo cabinets are playable', () => {
  it('registry deals every shipped id, including circuit', () => {
    expect(Object.keys(REGISTRY).sort()).toEqual([...GAME_IDS].sort());
    for (const id of GAME_IDS) expect(REGISTRY[id]).toBeTruthy();
  });

  for (const id of GAME_IDS) {
    it(`${id}: reacts, beats idle, and can end`, () => {
      const spec = REGISTRY[id];
      expect(spec, id).toBeTruthy();
      const problems: string[] = [];

      const idleShort = scan(spec!, hold(null, false), IDLE_SAFE_TICKS);
      if (idleShort.gameOverTick !== null) {
        problems.push(`no-input reached gameOver at tick ${idleShort.gameOverTick} (within ${IDLE_SAFE_TICKS})`);
      }

      let reacted = false;
      const idleReaction = deal(spec!);
      let idleState = idleReaction;
      const runners = reactionPolicies(spec!).map(() => deal(spec!));
      for (let tick = 0; tick < REACTION_TICKS && !reacted; tick++) {
        idleState = stepWith(spec!, idleState, NO_INPUT);
        const idleView = gameplay(idleState);
        for (let p = 0; p < runners.length; p++) {
          const policy = reactionPolicies(spec!)[p]!;
          runners[p] = stepWith(spec!, runners[p]!, policy(runners[p]!, tick));
          if (gameplay(runners[p]!) !== idleView) reacted = true;
        }
      }
      if (!reacted) problems.push(`no legal input changed a gameplay field within ${REACTION_TICKS} ticks`);

      const idleProgress = scan(spec!, hold(null, false), PROGRESS_TICKS);
      let progressed = false;
      let progressNote = `idle ${JSON.stringify(idleProgress.best)}`;
      for (const policy of progressPolicies(spec!)) {
        const run = scan(spec!, policy, PROGRESS_TICKS);
        if (beats(run.best, idleProgress.best)) {
          progressed = true;
          progressNote = `policy ${JSON.stringify(run.best)} > idle ${JSON.stringify(idleProgress.best)}`;
          break;
        }
        progressNote = `last ${JSON.stringify(run.best)} vs idle ${JSON.stringify(idleProgress.best)}`;
      }
      if (!progressed) problems.push(`no policy advanced further than idle within ${PROGRESS_TICKS} (${progressNote})`);

      const idleEnd = scan(spec!, hold(null, false), END_TICKS);
      let ended = idleEnd.gameOverTick !== null;
      let endNote = idleEnd.gameOverTick !== null ? `idle gameOver at ${idleEnd.gameOverTick}` : 'idle never ended';
      if (!ended) {
        for (const policy of endingPolicies(spec!)) {
          const run = scan(spec!, policy, END_TICKS);
          if (run.gameOverTick !== null) {
            ended = true;
            endNote = `gameOver at ${run.gameOverTick}`;
            break;
          }
          if (run.successTick !== null && idleEnd.successTick === null) {
            ended = true;
            endNote = `cleared at ${run.successTick} and idle did not`;
            break;
          }
          endNote = `no gameOver; success ${run.successTick ?? 'none'}; idle success ${idleEnd.successTick ?? 'none'}`;
        }
      }
      if (!ended) problems.push(`no ending within ${END_TICKS} (${endNote})`);

      expect(problems, problems.join('\n')).toEqual([]);
    }, 30_000);
  }
});
