import {
  type GameConfig,
  type GameSpec,
  type PlayerInput,
  withSfx,
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

export interface Obstacle {
  d: number;
  x: number;
  hit: boolean;
}

export interface CoastState extends GameStateBase {
  playerX: number;
  speed: number;
  dist: number;
  timeLeft: number;
  checkpoints: number;
  obstacles: Obstacle[];
  deaths: number;
  clears: number;
}

const makeObstacles = (seed: number): Obstacle[] => {
  const rng = createRng(seed);
  const out: Obstacle[] = [];
  for (let i = 0; i < 14; i++) {
    out.push({ d: 260 + i * 120 + rng.int(60), x: -1.3 + rng.next() * 2.6, hit: false });
  }
  return out;
};

export function createCoast(config: GameConfig): CoastState {
  const lives: Record<string, number> = {};
  const scores: Record<string, number> = {};
  for (const id of config.playerIds) {
    lives[id] = 1;
    scores[id] = 0;
  }
  return {
    phase: 'ready',
    phaseTimer: 0,
    level: 1,
    scores,
    lives,
    sfx: [],
    playerX: 0,
    speed: 0,
    dist: 0,
    timeLeft: START_TIME,
    checkpoints: 0,
    obstacles: makeObstacles(config.seed),
    deaths: 0,
    clears: 0,
  };
}

const step = (state: CoastState, inputs: Record<string, PlayerInput>): CoastState => {
  if (state.phase !== 'playing') return tickPhase(state, 1 / 60).state;
  let s: CoastState = { ...state, sfx: [] as CoastState['sfx'] };
  const id = Object.keys(s.scores)[0]!;
  const input = inputs[id];

  // pedals
  let speed = s.speed;
  if (input?.dir && input.dir.dy > 0) speed -= 1.5;
  else if (input?.button) speed += 0.35;
  else speed -= 0.15;
  speed = Math.min(MAX_SPEED, Math.max(0, speed));

  // steering + curve centrifugal push
  let x = s.playerX;
  if (input?.dir) x += input.dir.dx * 0.045 * (0.4 + speed / MAX_SPEED);
  x -= curveAt(s.dist) * speed * 0.00045;
  x = Math.min(2, Math.max(-2, x));

  // off-road bleed
  if (Math.abs(x) > OFF_ROAD_X && speed > OFF_MAX_SPEED) {
    speed -= (speed - OFF_MAX_SPEED) * 0.08;
  }

  let next: CoastState = { ...s, playerX: x, speed, dist: s.dist + speed * 0.011, timeLeft: s.timeLeft - 1 };
  s = next;

  // checkpoint gates
  while (s.checkpoints < CHECKPOINTS.length && s.dist >= CHECKPOINTS[s.checkpoints]!) {
    s = withSfx(
      {
        ...s,
        checkpoints: s.checkpoints + 1,
        timeLeft: s.timeLeft + CHECKPOINT_BONUS,
        scores: { ...s.scores, [id]: s.scores[id]! + 300 },
      },
      { name: 'levelUp', player: id },
    );
  }

  // roadside obstacles: one violent, once-only meeting each
  const near = s.obstacles.some((o) => !o.hit && Math.abs(s.dist - o.d) < 1.2 && Math.abs(s.playerX - o.x) < 0.45 && s.speed > 15);
  if (near) {
    s = withSfx(
      {
        ...s,
        speed: s.speed * 0.35,
        obstacles: s.obstacles.map((o) =>
          !o.hit && Math.abs(s.dist - o.d) < 1.2 && Math.abs(s.playerX - o.x) < 0.45 ? { ...o, hit: true } : o,
        ),
      },
      { name: 'hit', player: id },
    );
  }

  // the castle gate
  if (s.dist >= TRACK_LEN) {
    s = withSfx(
      { ...s, scores: { ...s.scores, [id]: s.scores[id]! + 1000 }, clears: s.clears + 1 },
      { name: 'goal', player: id },
    );
    return enterPhase(s, 'gameOver');
  }

  // the clock
  if (s.timeLeft <= 0) {
    s = withSfx({ ...s, deaths: s.deaths + 1 }, { name: 'die', player: id });
    return enterPhase(s, 'gameOver');
  }
  return s;
};

/** attract bot: full throttle, feather the wheel toward the white line */
function demoCoast(state: CoastState, tick: number): PlayerInput {
  const steer = state.playerX > 0.12 ? -1 : state.playerX < -0.12 ? 1 : 0;
  return { dir: steer === 0 ? null : { dx: steer, dy: 0 }, button: true, seq: tick };
}

export const coastSpec: GameSpec<CoastState> = {
  id: 'coast',
  supportsVersus: false,
  capacity: 2,
  turnBased: false,
  create: createCoast,
  step,
  demo: demoCoast,
};
