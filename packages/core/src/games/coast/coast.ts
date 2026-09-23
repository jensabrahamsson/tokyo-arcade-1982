import {
  type GameConfig,
  type GameMode,
  type GameSpec,
  type PlayerInput,
  type SfxEvent,
  type GameStateBase,
} from '../../engine/types';
import { enterPhase, tickPhase } from '../../engine/phase';
import { createRng } from '../../engine/rng';

export const SEG = 20;
export const TRACK_LEN = 2000;
export const CHECKPOINTS = [500, 1000, 1500];
export const MAX_SPEED = 150;
export const OFF_ROAD_X = 1.15;
export const OFF_MAX_SPEED = 45;
export const START_TIME = 3600;
export const CHECKPOINT_BONUS = 1500;
/** Shorter second road after LO castle. The 740 still has to finish it. */
export const BONUS_LEN = 520;
/** Clock added when the castle opens the bonus stage. */
export const BONUS_TIME = 1200;

/** 1984 traffic on the bonus road. Ids only — the glass draws the shape. */
export const TRAFFIC_KINDS = ['bmw', 'mercedes'] as const;
export type TrafficKind = (typeof TRAFFIC_KINDS)[number];

export interface TrafficCar {
  d: number;
  x: number;
  speed: number;
  kind: TrafficKind;
  hit: boolean;
}

export type CoastStage = 'coast' | 'bonus';

/** Outward slide of the dog in the back seat. +curve is a right-hand bend
 *  (the car is pushed left), so the dog slides left, toward -1. A straight
 *  or a crawl leaves the dog in the middle of the glass. */
export function dogSlide(curve: number, speed: number): number {
  if (speed <= 0 || curve === 0) return 0;
  const lean = -curve * Math.min(1, speed / 60);
  return Math.max(-1, Math.min(1, lean));
}

/** R54.7: drive-past billboard copy along the coast road — stylized Swedish
 * 1982 nostalgia tableaux (arcade-homage scenery, not campaign material).
 * Pure presentation data; the renderer draws PNG-or-procedural boards. */
export interface CoastBillboard {
  /** distance along the track */
  readonly d: number;
  /** -1 = left of the road, 1 = right */
  readonly side: -1 | 1;
  /** short board copy, upper case, max 24 chars */
  readonly text: string;
}

export const COAST_BILLBOARDS: readonly CoastBillboard[] = [
  { d: 180, side: -1, text: 'CENTRUM TRADPLAN' },
  { d: 620, side: 1, text: 'HARPSUND - EKAN' },
  { d: 1040, side: -1, text: 'BOMMERSVIK 1982' },
  { d: 1460, side: 1, text: 'VALDEBATT 76' },
  { d: 1840, side: -1, text: 'PALME I HAVANNA' },
];

/** road curve per segment, -1 hard left .. +1 hard right; ends straight at the castle */
export const CURVE: readonly number[] = [
  0, 0, 0.2, 0.6, 0.6, 0.3, 0, -0.4, -0.7, -0.4, 0, 0.15, 0.5, 0.5, 0.1, 0,
  -0.3, -0.6, -0.2, 0, 0.3, 0.7, 0.4, 0, 0, -0.2, -0.5, -0.3, 0, 0, 0.4, 0.6,
  0.2, 0, -0.35, -0.5, -0.15, 0, 0.25, 0.45, 0.2, 0, 0, -0.3, -0.45, -0.2, 0,
  0, 0.3, 0.35, 0.1, 0, 0, -0.2, -0.3, 0, 0, 0, 0.2, 0.2, 0, 0, 0, 0, 0,
];

export function curveAt(dist: number): number {
  return CURVE[Math.max(0, Math.floor(dist / SEG)) % CURVE.length]!;
}

/** roadside prop kinds — positions live in core; the client draws the sprite */
export const OBSTACLE_KINDS = ['barrel', 'cone', 'rock', 'post', 'crate'] as const;
export type ObstacleKind = (typeof OBSTACLE_KINDS)[number];

export interface Obstacle {
  d: number;
  x: number;
  hit: boolean;
  kind: ObstacleKind;
}

/** One driver's night-road view. Versus keeps two of these; solo mirrors the lead. */
export interface CoastRunner {
  playerX: number;
  speed: number;
  dist: number;
  timeLeft: number;
  checkpoints: number;
  obstacles: Obstacle[];
  done: boolean;
  stage: CoastStage;
  traffic: TrafficCar[];
}

export interface CoastState extends GameStateBase {
  mode: GameMode;
  playerX: number;
  speed: number;
  dist: number;
  timeLeft: number;
  checkpoints: number;
  obstacles: Obstacle[];
  deaths: number;
  clears: number;
  runners: Record<string, CoastRunner>;
  stage: CoastStage;
  traffic: TrafficCar[];
  seed: number;
}

const makeObstacles = (seed: number): Obstacle[] => {
  const rng = createRng(seed);
  const out: Obstacle[] = [];
  for (let i = 0; i < 14; i++) {
    out.push({
      d: 260 + i * 120 + rng.int(60),
      x: -1.3 + rng.next() * 2.6,
      hit: false,
      kind: rng.pick(OBSTACLE_KINDS),
    });
  }
  return out;
};

function freshRunner(obstacles: Obstacle[]): CoastRunner {
  return {
    playerX: 0,
    speed: 0,
    dist: 0,
    timeLeft: START_TIME,
    checkpoints: 0,
    obstacles: obstacles.map((o) => ({ ...o })),
    done: false,
    stage: 'coast',
    traffic: [],
  };
}

/** Same-era saloons ahead of the Volvo. Both kinds always appear;
 *  lane and cruise speed come from the table seed. */
function makeTraffic(seed: number): TrafficCar[] {
  const rng = createRng(seed + 740);
  const out: TrafficCar[] = [];
  for (let i = 0; i < 6; i++) {
    out.push({
      d: 70 + i * 70,
      x: rng.next() < 0.5 ? -0.7 : 0.7,
      speed: 36 + rng.int(24),
      kind: i % 2 === 0 ? 'bmw' : 'mercedes',
      hit: false,
    });
  }
  return out;
}

export function createCoast(config: GameConfig): CoastState {
  const lives: Record<string, number> = {};
  const scores: Record<string, number> = {};
  const runners: Record<string, CoastRunner> = {};
  const field = makeObstacles(config.seed);
  for (const id of config.playerIds) {
    lives[id] = 1;
    scores[id] = 0;
    runners[id] = freshRunner(field);
  }
  const lead = runners[config.playerIds[0]!] ?? freshRunner(field);
  return {
    phase: 'ready',
    phaseTimer: 0,
    level: 1,
    scores,
    lives,
    sfx: [],
    mode: config.mode,
    playerX: lead.playerX,
    speed: lead.speed,
    dist: lead.dist,
    timeLeft: lead.timeLeft,
    checkpoints: lead.checkpoints,
    obstacles: lead.obstacles.map((o) => ({ ...o })),
    deaths: 0,
    clears: 0,
    runners,
    stage: lead.stage,
    traffic: lead.traffic.map((c) => ({ ...c })),
    seed: config.seed,
  };
}

/** One tick of the night road. Shared by solo and each versus pane. */
function integrateCoast(
  k: CoastRunner,
  id: string,
  score: number,
  input: PlayerInput | undefined,
  seed: number,
): { runner: CoastRunner; score: number; sfx: SfxEvent[]; over: 'goal' | 'time' | null } {
  if (k.done) return { runner: k, score, sfx: [], over: null };
  let speed = k.speed;
  if (input?.dir && input.dir.dy > 0) speed -= 1.5;
  else if (input?.button) speed += 0.35;
  else speed -= 0.15;
  speed = Math.min(MAX_SPEED, Math.max(0, speed));

  let x = k.playerX;
  if (input?.dir) x += input.dir.dx * 0.045 * (0.4 + speed / MAX_SPEED);
  x -= curveAt(k.dist) * speed * 0.00045;
  x = Math.min(2, Math.max(-2, x));

  if (Math.abs(x) > OFF_ROAD_X && speed > OFF_MAX_SPEED) {
    speed -= (speed - OFF_MAX_SPEED) * 0.08;
  }

  let dist = k.dist + speed * 0.011;
  let timeLeft = k.timeLeft - 1;
  let checkpoints = k.checkpoints;
  let obstacles = k.obstacles;
  const sfx: SfxEvent[] = [];

  while (checkpoints < CHECKPOINTS.length && dist >= CHECKPOINTS[checkpoints]!) {
    checkpoints += 1;
    timeLeft += CHECKPOINT_BONUS;
    score += 300;
    sfx.push({ name: 'levelUp', player: id });
  }

  const near = obstacles.some((o) => !o.hit && Math.abs(dist - o.d) < 1.2 && Math.abs(x - o.x) < 0.45 && speed > 15);
  if (near) {
    speed *= 0.35;
    obstacles = obstacles.map((o) =>
      !o.hit && Math.abs(dist - o.d) < 1.2 && Math.abs(x - o.x) < 0.45 ? { ...o, hit: true } : o,
    );
    sfx.push({ name: 'hit', player: id });
  }

  let stage = k.stage;
  let traffic = k.traffic;
  if (stage === 'bonus') {
    traffic = traffic.map((c) => (c.hit ? c : { ...c, d: c.d + c.speed * 0.011 }));
    const overlap = (c: TrafficCar) =>
      !c.hit && Math.abs(dist - c.d) < 1.2 && Math.abs(x - c.x) < 0.45 && speed > 15;
    if (traffic.some(overlap)) {
      speed *= 0.35;
      traffic = traffic.map((c) => (overlap(c) ? { ...c, hit: true } : c));
      sfx.push({ name: 'hit', player: id });
    }
  }

  const trackLen = stage === 'bonus' ? BONUS_LEN : TRACK_LEN;
  let over: 'goal' | 'time' | null = null;
  let done = false;
  if (dist >= trackLen && stage === 'coast') {
    score += 1000;
    sfx.push({ name: 'goal', player: id });
    timeLeft += BONUS_TIME;
    stage = 'bonus';
    dist = Math.max(0, dist - TRACK_LEN);
    obstacles = [];
    traffic = makeTraffic(seed);
  } else if (dist >= trackLen) {
    score += 1000;
    sfx.push({ name: 'goal', player: id });
    over = 'goal';
    done = true;
  } else if (timeLeft <= 0) {
    sfx.push({ name: 'die', player: id });
    over = 'time';
    done = true;
  }

  return {
    runner: { playerX: x, speed, dist, timeLeft, checkpoints, obstacles, done, stage, traffic },
    score,
    sfx,
    over,
  };
}

function mirrorLead(state: CoastState, id: string, runner: CoastRunner): CoastState {
  return {
    ...state,
    playerX: runner.playerX,
    speed: runner.speed,
    dist: runner.dist,
    timeLeft: runner.timeLeft,
    checkpoints: runner.checkpoints,
    obstacles: runner.obstacles,
    stage: runner.stage,
    traffic: runner.traffic,
    runners: { ...state.runners, [id]: runner },
  };
}

const stepSolo = (state: CoastState, inputs: Record<string, PlayerInput>): CoastState => {
  const s: CoastState = { ...state, sfx: [] };
  const id = Object.keys(s.scores)[0];
  if (!id) return s;
  const base: CoastRunner = {
    playerX: s.playerX,
    speed: s.speed,
    dist: s.dist,
    timeLeft: s.timeLeft,
    checkpoints: s.checkpoints,
    obstacles: s.obstacles,
    done: false,
    stage: s.stage,
    traffic: s.traffic,
  };
  const result = integrateCoast(base, id, s.scores[id] ?? 0, inputs[id], s.seed);
  let next = mirrorLead(
    { ...s, scores: { ...s.scores, [id]: result.score }, sfx: result.sfx },
    id,
    result.runner,
  );
  if (result.over === 'goal') return enterPhase({ ...next, clears: s.clears + 1 }, 'gameOver');
  if (result.over === 'time') return enterPhase({ ...next, deaths: s.deaths + 1 }, 'gameOver');
  return next;
};

const stepVersus = (state: CoastState, inputs: Record<string, PlayerInput>): CoastState => {
  const ids = Object.keys(state.scores);
  let scores = { ...state.scores };
  let runners = { ...state.runners };
  const sfx: SfxEvent[] = [];
  let clears = state.clears;
  let deaths = state.deaths;
  for (const id of ids) {
    const runner = runners[id] ?? freshRunner(state.obstacles);
    const result = integrateCoast(runner, id, scores[id] ?? 0, inputs[id], state.seed);
    runners = { ...runners, [id]: result.runner };
    scores = { ...scores, [id]: result.score };
    sfx.push(...result.sfx);
    if (result.over === 'goal') clears += 1;
    if (result.over === 'time') deaths += 1;
  }
  const leadId = ids[0]!;
  const lead = runners[leadId] ?? freshRunner(state.obstacles);
  let next: CoastState = {
    ...state,
    sfx,
    scores,
    clears,
    deaths,
    runners,
    playerX: lead.playerX,
    speed: lead.speed,
    dist: lead.dist,
    timeLeft: lead.timeLeft,
    checkpoints: lead.checkpoints,
    obstacles: lead.obstacles,
    stage: lead.stage,
    traffic: lead.traffic,
  };
  if (!ids.every((id) => runners[id]?.done)) return next;
  let best = -Infinity;
  let winner: string | undefined;
  let ties = 0;
  for (const id of ids) {
    const sc = scores[id] ?? 0;
    if (sc > best) {
      best = sc;
      winner = id;
      ties = 1;
    } else if (sc === best) ties += 1;
  }
  if (ties !== 1) winner = undefined;
  return enterPhase({ ...next, winner }, 'gameOver');
};

const step = (state: CoastState, inputs: Record<string, PlayerInput>): CoastState => {
  if (state.phase !== 'playing') return tickPhase(state, 1 / 60).state;
  if (state.mode === 'versus') return stepVersus(state, inputs);
  return stepSolo(state, inputs);
};

/** attract bot: full throttle, feather the wheel toward the white line */
function demoCoast(state: CoastState, tick: number): PlayerInput {
  const steer = state.playerX > 0.12 ? -1 : state.playerX < -0.12 ? 1 : 0;
  return { dir: steer === 0 ? null : { dx: steer, dy: 0 }, button: true, seq: tick };
}

export const coastSpec: GameSpec<CoastState> = {
  id: 'coast',
  supportsVersus: true,
  capacity: 2,
  turnBased: false,
  create: createCoast,
  step,
  demo: demoCoast,
};
