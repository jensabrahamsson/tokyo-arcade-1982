import {
  type GameConfig,
  type GameStateBase,
  type GameSpec,
  type PlayerInput,
  withSfx,
} from '../../engine/types';
import type { GameMode } from '../../engine/types';
import { DIRS, opposite, eq, wrap, type Dir } from '../../engine/vec';
import { enterPhase, tickPhase } from '../../engine/phase';
import { createRng } from '../../engine/rng';

export const GRID = { w: 28, h: 20 };

export interface Cell {
  x: number;
  y: number;
}

export interface Snake {
  body: Cell[];
  dir: Dir;
  pendingDir: Dir | null;
  queuedDir?: Dir | null;
  alive: boolean;
  respawnTimer: number;
}

export interface SnakeState extends GameStateBase {
  mode: GameMode;
  snakes: Record<string, Snake>;
  food: Cell | null;
  foodsEaten: Record<string, number>;
  moveInterval: number;
  moveCounter: number;
  deaths: number;
  clears: number;
  rngSeed: number;
}

const START_LEN = 4;
const RESPAWN_TICKS = 45;
const SPAWNS: { pos: Cell; dir: Dir }[] = [
  { pos: { x: 4, y: GRID.h >> 1 }, dir: DIRS.right },
  { pos: { x: GRID.w - 5, y: GRID.h >> 1 }, dir: DIRS.left },
  { pos: { x: GRID.w >> 1, y: 4 }, dir: DIRS.down },
  { pos: { x: GRID.w >> 1, y: GRID.h - 5 }, dir: DIRS.up },
];

const intervalFor = (level: number): number => Math.max(4, 11 - level);

const makeSnake = (index: number): Snake => {
  const spawn = SPAWNS[index % SPAWNS.length]!;
  const body = Array.from({ length: START_LEN }, (_, i) => ({
    x: spawn.pos.x - spawn.dir.dx * i,
    y: spawn.pos.y - spawn.dir.dy * i,
  }));
  return { body, dir: spawn.dir, pendingDir: null, queuedDir: null, alive: true, respawnTimer: 0 };
};

const spawnFood = (state: SnakeState): { food: Cell | null; rngSeed: number } => {
  const seed = (state.rngSeed * 1664525 + 1013904223) >>> 0;
  const rng = createRng(seed);
  const occupied = new Set<string>();
  for (const s of Object.values(state.snakes))
    for (const c of s.body) occupied.add(`${c.x},${c.y}`);
  for (let tries = 0; tries < 200; tries++) {
    const cell = { x: rng.int(GRID.w), y: rng.int(GRID.h) };
    if (!occupied.has(`${cell.x},${cell.y}`)) return { food: cell, rngSeed: seed };
  }
  const freeCells: Cell[] = [];
  for (let y = 0; y < GRID.h; y++) {
    for (let x = 0; x < GRID.w; x++) {
      if (!occupied.has(`${x},${y}`)) freeCells.push({ x, y });
    }
  }
  if (freeCells.length > 0) {
    return { food: freeCells[rng.int(freeCells.length)]!, rngSeed: seed };
  }
  return { food: null, rngSeed: seed };
};

export function create(config: GameConfig): SnakeState {
  const snakes: Record<string, Snake> = {};
  const lives: Record<string, number> = {};
  const scores: Record<string, number> = {};
  const foodsEaten: Record<string, number> = {};
  config.playerIds.forEach((id, i) => {
    snakes[id] = makeSnake(i);
    lives[id] = config.mode === 'solo' ? 3 : 1;
    scores[id] = 0;
    foodsEaten[id] = 0;
  });
  let state: SnakeState = {
    phase: 'ready',
    phaseTimer: 0,
    level: 1,
    scores,
    lives,
    sfx: [],
    mode: config.mode,
    snakes,
    food: null,
    foodsEaten,
    moveInterval: intervalFor(1),
    moveCounter: 0,
    deaths: 0,
    clears: 0,
    rngSeed: config.seed >>> 0,
  };
  if (config.mode === 'solo') state = { ...state, ...spawnFood(state) };
  return state;
}

const isOpposite = (a: Dir, b: Dir): boolean => eq(a, opposite(b));
const isPerpendicular = (a: Dir, b: Dir): boolean => a.dx * b.dx + a.dy * b.dy === 0;

function bufferSnakeInput(snake: Snake, inputDir: Dir): Snake {
  if (!snake.pendingDir) {
    if (!isOpposite(inputDir, snake.dir)) {
      return { ...snake, pendingDir: inputDir, queuedDir: null };
    }
    return snake;
  }
  if (eq(inputDir, snake.pendingDir)) {
    return snake;
  }
  if (isOpposite(inputDir, snake.pendingDir)) {
    if (!isOpposite(inputDir, snake.dir)) {
      return { ...snake, pendingDir: inputDir, queuedDir: null };
    }
    return snake;
  }
  if (isPerpendicular(inputDir, snake.pendingDir)) {
    return { ...snake, queuedDir: inputDir };
  }
  return snake;
}

const advanceSnake = (snake: Snake, state: SnakeState): { head: Cell; dir: Dir } => {
  const dir =
    snake.pendingDir && !isOpposite(snake.pendingDir, snake.dir) ? snake.pendingDir : snake.dir;
  const head = snake.body[0]!;
  const raw = { x: head.x + dir.dx, y: head.y + dir.dy };
  return {
    dir,
    head: state.mode === 'solo' ? { x: wrap(raw.x, GRID.w), y: wrap(raw.y, GRID.h) } : raw,
  };
};

function step(state: SnakeState, inputs: Record<string, PlayerInput>): SnakeState {
  if (state.phase !== 'playing') return tickPhase(state, 1 / 60).state;

  let s = { ...state, sfx: [] as SnakeState['sfx'], snakes: { ...state.snakes } };

  // buffer latest input per snake
  for (const [id, input] of Object.entries(inputs)) {
    const snake = s.snakes[id];
    if (snake && input.dir) s.snakes[id] = bufferSnakeInput(snake, input.dir);
  }

  // respawn countdown runs every tick
  for (const [id, snake] of Object.entries(s.snakes)) {
    if (!snake.alive && snake.respawnTimer > 0) {
      const t = snake.respawnTimer - 1;
      s.snakes[id] = t === 0 ? makeSnake(Object.keys(s.snakes).indexOf(id)) : { ...snake, respawnTimer: t };
    }
  }

  s.moveCounter += 1;
  if (s.moveCounter < s.moveInterval) return s;
  s = { ...s, moveCounter: 0 };

  // plan moves
  const ids = Object.keys(s.snakes);
  const planned = new Map<string, { head: Cell; dir: Dir }>();
  for (const id of ids) {
    const snake = s.snakes[id]!;
    if (snake.alive) planned.set(id, advanceSnake(snake, s));
  }

  // collision detection
  const bodies = new Set<string>();
  for (const id of ids) {
    const body = s.snakes[id]!.body;
    for (let i = 0; i < body.length - 1; i++) bodies.add(`${body[i]!.x},${body[i]!.y}`);
  }
  const deadNow: string[] = [];
  for (const [id, { head }] of planned) {
    const offBoard = head.x < 0 || head.x >= GRID.w || head.y < 0 || head.y >= GRID.h;
    const inBody = bodies.has(`${head.x},${head.y}`);
    const headOn = ids.some((other) => {
      if (other === id) return false;
      const p = planned.get(other);
      return p !== undefined && p.head.x === head.x && p.head.y === head.y;
    });
    if (offBoard || inBody || headOn) deadNow.push(id);
  }

  // apply
  for (const id of ids) {
    const snake = s.snakes[id]!;
    if (!snake.alive) continue;
    const move = planned.get(id)!;
    if (deadNow.includes(id)) {
      const lives = { ...s.lives, [id]: s.lives[id]! - 1 };
      const diedSnake: Snake =
        s.mode === 'solo' && lives[id]! > 0
          ? { ...snake, alive: false, respawnTimer: RESPAWN_TICKS }
          : { ...snake, alive: false };
      s = { ...s, lives, snakes: { ...s.snakes, [id]: diedSnake }, deaths: s.deaths + 1 };
      s = withSfx(s, { name: 'die', player: id });
      continue;
    }
    const ate = s.mode === 'solo' && s.food !== null && move.head.x === s.food.x && move.head.y === s.food.y;
    const body = [move.head, ...snake.body];
    if (!ate) body.pop();
    let next: SnakeState = {
      ...s,
      snakes: {
        ...s.snakes,
        [id]: {
          body,
          dir: move.dir,
          pendingDir: snake.queuedDir ?? null,
          queuedDir: null,
          alive: true,
          respawnTimer: 0,
        },
      },
    };
    if (ate) {
      next.scores = { ...next.scores, [id]: next.scores[id]! + 10 };
      const eaten = { ...next.foodsEaten, [id]: next.foodsEaten[id]! + 1 };
      const level = 1 + Math.floor(eaten[id]! / 5);
      const leveled = level > next.level;
      next = {
        ...next,
        foodsEaten: eaten,
        level,
        moveInterval: leveled ? intervalFor(level) : next.moveInterval,
        ...spawnFood(next),
      };
      next = withSfx(next, { name: 'eat', player: id });
      if (leveled) next = withSfx(next, { name: 'levelUp', player: id });
    }
    s = next;
  }

  // versus survival ticks
  if (s.mode === 'versus') {
    const scores = { ...s.scores };
    for (const id of ids) if (s.snakes[id]!.alive) scores[id] = scores[id]! + 1;
    s = { ...s, scores };
  }

  // end of round checks
  const alive = ids.filter((id) => s.snakes[id]!.alive);
  if (s.mode === 'versus' && alive.length <= 1) {
    const winner = alive[0];
    s = enterPhase(s, 'gameOver');
    if (winner) {
      s = { ...s, winner, scores: { ...s.scores, [winner]: s.scores[winner]! + 100 } };
    }
  } else if (s.mode === 'solo' && alive.length === 0) {
    const allDead = ids.every((id) => s.lives[id]! <= 0);
    if (allDead) s = enterPhase(s, 'gameOver');
  }
  return s;
}

/** attract-mode bot: chase the food, never step into a body, never into a wall */
function demoSnake(state: SnakeState, tick: number): PlayerInput {
  const id = Object.keys(state.snakes)[0]!;
  const sn = state.snakes[id]!;
  if (!sn.alive) return { dir: null, button: false };
  const head = sn.body[0]!;
  const blocked = new Set<string>();
  for (const [oid, o] of Object.entries(state.snakes)) {
    for (let i = oid === id ? 3 : 0; i < o.body.length; i++) {
      blocked.add(`${o.body[i]!.x},${o.body[i]!.y}`);
    }
  }
  const { w, h } = GRID;
  const turns: Dir[] = [sn.dir, { dx: -sn.dir.dy, dy: sn.dir.dx }, { dx: sn.dir.dy, dy: -sn.dir.dx }];
  const food = state.food;
  let best: Dir | null = null;
  let bestDist = Infinity;
  for (const d of turns) {
    if (d.dx === -sn.dir.dx && d.dy === -sn.dir.dy) continue;
    let nx = head.x + d.dx;
    let ny = head.y + d.dy;
    if (state.mode === 'versus') {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    } else {
      nx = (nx + w) % w;
      ny = (ny + h) % h;
    }
    if (blocked.has(`${nx},${ny}`)) continue;
    const dist = food ? Math.abs(food.x - nx) + Math.abs(food.y - ny) : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return { dir: best ?? sn.dir, button: false, seq: tick };
}

export const snakeSpec: GameSpec<SnakeState> = {
  id: 'snake',
  supportsVersus: true,
  capacity: 4,
  turnBased: false,
  create,
  step,
  demo: demoSnake,
};
