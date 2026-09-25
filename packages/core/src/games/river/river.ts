import {
  type GameConfig,
  type GameStateBase,
  type GameSpec,
  type PlayerInput,
  withSfx,
} from '../../engine/types';
import { enterPhase, tickPhase } from '../../engine/phase';
import type { Dir } from '../../engine/vec';

export const RIVER_W = 26;
export const RIVER_H = 18;
export const HOME_ROWS = [1, 6, 11, 16, 21];
const FROG_START = { x: 13, y: 16 };

export interface Lane {
  y: number;
  dir: 1 | -1;
  speed: number;
  len: number;
  xs: number[];
}

export interface RiverState extends GameStateBase {
  frog: { x: number; y: number };
  river: Lane[];
  cars: Lane[];
  homes: boolean[];
  drownTimer: number;
  moveCooldown: number;
  lastInputDir: Dir | null;
  lastSeq: number;
  pendingHop?: { dir: Dir; seq: number } | null;
  deaths: number;
  clears: number;
}

const mkLane = (y: number, dir: 1 | -1, speed: number, len: number, count: number): Lane => ({
  y,
  dir,
  speed,
  len,
  xs: Array.from({ length: count }, (_, i) => ((RIVER_W + 4) / count) * i - 2),
});

function makeLanes(): { river: Lane[]; cars: Lane[] } {
  return {
    river: [
      mkLane(2, -1, 0.05, 4, 2),
      mkLane(3, 1, 0.045, 3, 2),
      mkLane(4, -1, 0.06, 3, 3),
      mkLane(5, 1, 0.04, 5, 2),
    ],
    cars: [
      mkLane(9, 1, 0.06, 2, 2),
      mkLane(10, -1, 0.05, 2, 2),
      mkLane(11, 1, 0.07, 2, 3),
      mkLane(12, -1, 0.045, 2, 2),
    ],
  };
}

export function createRiver(config: GameConfig): RiverState {
  const lives: Record<string, number> = {};
  const scores: Record<string, number> = {};
  for (const id of config.playerIds) {
    lives[id] = 3;
    scores[id] = 0;
  }
  return {
    phase: 'ready',
    phaseTimer: 0,
    level: 1,
    scores,
    lives,
    sfx: [],
    frog: { ...FROG_START },
    ...makeLanes(),
    homes: HOME_ROWS.map(() => false),
    drownTimer: 0,
    moveCooldown: 0,
    lastInputDir: null,
    lastSeq: -1,
    pendingHop: null,
    deaths: 0,
    clears: 0,
  };
}

const step = (state: RiverState, inputs: Record<string, PlayerInput>): RiverState => {
  if (state.phase !== 'playing') return tickPhase(state, 1 / 60).state;
  let s: RiverState = { ...state, sfx: [] as RiverState['sfx'] };
  const id = Object.keys(s.lives)[0]!;
  const speedScale = 1 + (s.level - 1) * 0.15;

  // lanes move
  const advance = (l: Lane): Lane => ({
    ...l,
    xs: l.xs.map((x) => {
      let nx = x + l.dir * l.speed * speedScale;
      if (nx > RIVER_W + 2) nx -= RIVER_W + 4 + l.len;
      if (nx < -l.len - 2) nx += RIVER_W + 4 + l.len;
      return nx;
    }),
  });
  s = { ...s, river: s.river.map(advance), cars: s.cars.map(advance) };

  const frog = { ...s.frog };

  // edge-triggered hop with cooldown buffering
  s.moveCooldown = Math.max(0, s.moveCooldown - 1);
  const input = inputs[id];
  let nextHop: { dir: Dir; seq: number } | null = null;
  if (input?.dir && input.seq !== undefined && input.seq !== s.lastSeq) {
    if (s.moveCooldown === 0) {
      nextHop = { dir: input.dir, seq: input.seq };
      s.pendingHop = null;
    } else {
      s.pendingHop = { dir: input.dir, seq: input.seq };
    }
  } else if (s.moveCooldown === 0 && s.pendingHop) {
    nextHop = s.pendingHop;
    s.pendingHop = null;
  }

  if (nextHop) {
    frog.x = Math.min(RIVER_W - 1, Math.max(0, frog.x + nextHop.dir.dx));
    frog.y = Math.min(RIVER_H - 1, Math.max(0, frog.y + nextHop.dir.dy));
    s.moveCooldown = 6;
    s.lastSeq = nextHop.seq;
    s.lastInputDir = nextHop.dir;
    s = withSfx(s, { name: 'hop', player: id });
  }
  s = { ...s, frog };

  const die = (): RiverState => {
    const lives = { ...s.lives, [id]: s.lives[id]! - 1 };
    let next = withSfx({ ...s, lives, deaths: s.deaths + 1, drownTimer: 0, pendingHop: null, frog: { ...FROG_START } }, { name: 'die', player: id });
    if (lives[id]! <= 0) next = enterPhase(next, 'gameOver');
    return next;
  };

  // goal row
  if (frog.y <= 0) {
    const slot = HOME_ROWS.findIndex((hx) => Math.abs(frog.x - hx) <= 1 && !s.homes[HOME_ROWS.indexOf(hx)]);
    if (slot >= 0) {
      const homes = [...s.homes];
      homes[slot] = true;
      let next = withSfx({ ...s, homes, scores: { ...s.scores, [id]: s.scores[id]! + 50 + 10 * s.level } }, { name: 'goal', player: id });
      next = { ...next, frog: { ...FROG_START }, drownTimer: 0, pendingHop: null };
      if (homes.every(Boolean)) {
        next = {
          ...next,
          level: next.level + 1,
          clears: next.clears + 1,
          scores: { ...next.scores, [id]: (next.scores[id] ?? 0) + 1000 },
          homes: HOME_ROWS.map(() => false),
        };
        next = enterPhase(next, 'roundOver');
      }
      return next;
    }
    return die();
  }

  // river: ride logs or drown
  const lane = s.river.find((l) => l.y === frog.y);
  if (!lane && s.drownTimer !== 0) s = { ...s, drownTimer: 0 };
  if (lane) {
    const center = frog.x + 0.5;
    const onLog = lane.xs.some((x) => center >= x && center < x + lane.len);
    if (onLog) {
      s = { ...s, frog: { ...frog, x: frog.x + lane.dir * lane.speed * speedScale }, drownTimer: 0 };
    } else {
      const t = s.drownTimer + 1;
      if (t >= 20) return die();
      s = { ...s, drownTimer: t };
    }
  }

  // cars kill instantly
  for (const c of s.cars) {
    if (c.y !== frog.y) continue;
    const center = frog.x + 0.5;
    if (c.xs.some((x) => center >= x - 0.3 && center < x + c.len + 0.3)) return die();
  }
  if (s.frog.x < -1 || s.frog.x > RIVER_W) return die();
  return s;
};

/** attract-mode bot: wait for a gap, hop forward, sidestep on car rows */
function demoRiver(state: RiverState, tick: number): PlayerInput {
  const frog = state.frog;
  const seq = Math.floor(tick / 10);
  const laneDanger = (rowY: number, x: number): boolean => {
    for (const c of state.cars) {
      if (c.y !== rowY) continue;
      for (const cx of c.xs) {
        if (x + 1.5 > cx - 1.2 && x - 0.5 < cx + c.len + 1.2) return true;
      }
    }
    return false;
  };
  const rowAbove = frog.y - 1;
  if (laneDanger(frog.y, frog.x) && state.moveCooldown === 0 && seq !== state.lastSeq) {
    const away = state.cars.find((c) => c.y === frog.y)?.dir ?? 1;
    return { dir: { dx: away > 0 ? -1 : 1, dy: 0 }, button: false, seq };
  }
  const waterLane = state.river.find((l) => l.y === rowAbove);
  if (waterLane) {
    const onLog = waterLane.xs.some((x) => frog.x + 0.5 >= x && frog.x + 0.5 < x + waterLane.len);
    if (!onLog) return { dir: null, button: false, seq: -1 };
  }
  if (laneDanger(rowAbove, frog.x)) return { dir: null, button: false, seq: -1 };
  return { dir: { dx: 0, dy: -1 }, button: false, seq };
}

export const riverSpec: GameSpec<RiverState> = {
  id: 'river',
  supportsVersus: false,
  capacity: 2,
  turnBased: false,
  create: createRiver,
  step,
  demo: demoRiver,
};
