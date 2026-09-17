import {
  type GameConfig,
  type GameStateBase,
  type GameSpec,
  type GameMode,
  type PlayerInput,
  withSfx,
} from '../../engine/types';
import { DIRS, opposite, DIR_LIST, type Dir } from '../../engine/vec';
import { enterPhase, tickPhase } from '../../engine/phase';
import { computeDifficulty } from '../../difficulty/difficulty';

export const MAZE = [
  '###################',
  '#........#........#',
  '#.##.##..#..##.##.#',
  '#o##.##.###.##.##o#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.###.#.###.####',
  '####.#.......#.####',
  '####.#.##=##.#.####',
  '#......#GGG#......#',
  '####.#.#####.#.####',
  '####.#.......#.####',
  '####.###.#.###.####',
  '#....#...#...#....#',
  '#.##.#.#####.#.##.#',
  '#.................#',
  '#o##.##.###.##.##o#',
  '#.##.##..#..##.##.#',
  '#........#........#',
  '###################',
];

export const MAZE_W = 19;
export const MAZE_H = 21;
export interface Cell {
  x: number;
  y: number;
}

export const PLAYER_SPAWN: Cell = { x: 9, y: 16 };
export const PEN_CELLS: Cell[] = [
  { x: 8, y: 10 },
  { x: 9, y: 10 },
  { x: 10, y: 10 },
];
const GHOST_SPAWNS: Cell[] = [{ x: 9, y: 8 }, { x: 8, y: 10 }, { x: 9, y: 10 }, { x: 10, y: 10 }];
const PEN_DOOR = { x: 9, y: 9 };
const PERSONALITIES = ['chaser', 'ambusher', 'thief', 'feinter'] as const;
const CORNERS: Cell[] = [{ x: 1, y: 1 }, { x: 17, y: 1 }, { x: 1, y: 19 }, { x: 17, y: 19 }];

type GhostMode = 'chase' | 'scatter' | 'frightened' | 'eaten';

export interface Ghost {
  id: number;
  x: number;
  y: number;
  dir: Dir;
  progress: number;
  mode: GhostMode;
}

export interface PuckPlayer {
  x: number;
  y: number;
  dir: Dir;
  pendingDir: Dir;
  progress: number;
}

export interface PuckState extends GameStateBase {
  mode: GameMode;
  dots: Record<string, true>;
  powers: Record<string, true>;
  player: PuckPlayer;
  ghosts: Ghost[];
  frightTimer: number;
  deathTimer: number;
  tickCount: number;
  ghostCombo: number;
  deaths: number;
  clears: number;
}

const key = (x: number, y: number) => `${x},${y}`;
const at = (x: number, y: number) => MAZE[y]?.[x] ?? '#';

const passable = (x: number, y: number, isGhost: boolean): boolean => {
  const c = at(x, y);
  if (c === '#') return false;
  if (c === '=' && !isGhost) return false;
  return true;
};

const dist = (a: Cell, b: Cell): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

const scatterNow = (s: PuckState): boolean => s.tickCount % 600 < 100;

const effectiveMode = (g: Ghost, s: PuckState): GhostMode =>
  g.mode === 'eaten' ? 'eaten' : g.mode === 'frightened' ? 'frightened' : scatterNow(s) ? 'scatter' : 'chase';

function readDots(): { dots: Record<string, true>; powers: Record<string, true> } {
  const dots: Record<string, true> = {};
  const powers: Record<string, true> = {};
  MAZE.forEach((row, y) =>
    row.split('').forEach((c, x) => {
      if (c === '.') dots[key(x, y)] = true;
      if (c === 'o') powers[key(x, y)] = true;
    }),
  );
  return { dots, powers };
}

const freshGhost = (id: number): Ghost => ({
  id,
  x: GHOST_SPAWNS[id]!.x,
  y: GHOST_SPAWNS[id]!.y,
  dir: id % 2 === 0 ? DIRS.up : DIRS.down,
  progress: 0,
  mode: 'chase',
});

const resetPositions = (s: PuckState): PuckState => ({
  ...s,
  player: { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y, dir: DIRS.left, pendingDir: DIRS.left, progress: 0 },
  ghosts: GHOST_SPAWNS.map((_, i) => freshGhost(i)),
  frightTimer: 0,
  ghostCombo: 0,
  deathTimer: 0,
});

export function create(config: GameConfig): PuckState {
  const { dots, powers } = readDots();
  const lives: Record<string, number> = {};
  const scores: Record<string, number> = {};
  for (const id of config.playerIds) {
    lives[id] = 3;
    scores[id] = 0;
  }
  const base: PuckState = {
    phase: 'ready',
    phaseTimer: 0,
    level: 1,
    scores,
    lives,
    sfx: [],
    mode: config.mode,
    dots,
    powers,
    player: { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y, dir: DIRS.left, pendingDir: DIRS.left, progress: 0 },
    ghosts: GHOST_SPAWNS.map((_, i) => freshGhost(i)),
    frightTimer: 0,
    deathTimer: 0,
    tickCount: 0,
    ghostCombo: 0,
    deaths: 0,
    clears: 0,
  };
  return { ...base, turn: config.playerIds[0] };
}

function ghostTarget(g: Ghost, s: PuckState, mode: GhostMode): Cell {
  if (mode === 'scatter') return CORNERS[g.id % CORNERS.length]!;
  const p = s.player;
  switch (PERSONALITIES[g.id]) {
    case 'chaser':
      return p;
    case 'ambusher':
      return { x: p.x + p.dir.dx * 4, y: p.y + p.dir.dy * 4 };
    case 'thief':
      return { x: p.x + p.dir.dx * 2, y: p.y + p.dir.dy * 2 };
    case 'feinter':
      return dist(p, g) > 49 ? p : CORNERS[g.id % CORNERS.length]!;
    default:
      return p;
  }
}

/** Direction choice at a cell: the classic 1982 personality AI. Exported for tests. */
export function chooseGhostDir(g: Ghost, s: PuckState, from?: Cell): Dir {
  const mode = effectiveMode(g, s);
  const origin = from ?? g;
  const candidates = DIR_LIST.filter(
    (d) => !oppositeIs(d, g.dir) && passable(origin.x + d.dx, origin.y + d.dy, true),
  );
  const options = candidates.length > 0 ? candidates : DIR_LIST.filter((d) => passable(origin.x + d.dx, origin.y + d.dy, true));
  if (options.length === 0) return opposite(g.dir);
  if (mode === 'frightened') {
    const hash = (origin.x * 31 + origin.y * 17 + s.tickCount * 7 + g.id * 3) % options.length;
    return options[hash]!;
  }
  const target = mode === 'eaten' ? { x: PEN_DOOR.x, y: PEN_DOOR.y + 1 } : ghostTarget(g, s, mode);
  return options.reduce((best, d) =>
    dist({ x: origin.x + d.dx, y: origin.y + d.dy }, target) < dist({ x: origin.x + best.dx, y: origin.y + best.dy }, target) ? d : best,
  );
}

const oppositeIs = (d: Dir, dir: Dir): boolean => d.dx === -dir.dx && d.dy === -dir.dy;

function endOfTurn(s: PuckState): PuckState {
  const order = Object.keys(s.scores);
  const idx = order.indexOf(s.turn!);
  if (idx < order.length - 1) {
    const next = order[idx + 1]!;
    let s2: PuckState = { ...s, lives: { ...s.lives, [next]: 3 } };
    s2 = { ...s2, ...readDots() };
    s2 = resetPositions(s2);
    s2.turn = next;
    return enterPhase(s2, 'roundOver');
  }
  const ranked = order.sort((a, b) => s.scores[b]! - s.scores[a]!);
  return enterPhase({ ...s, winner: ranked[0] }, 'gameOver');
}

function playerCaught(s: PuckState): PuckState {
  const turn = s.turn!;
  const lives = { ...s.lives, [turn]: s.lives[turn]! - 1 };
  const next: PuckState = withSfx({ ...s, lives, deaths: s.deaths + 1 }, { name: 'die', player: turn });
  if (lives[turn]! > 0) return { ...next, deathTimer: 60 };
  return endOfTurn(next);
}

function handleGhostHit(s: PuckState, g: Ghost): PuckState {
  if (g.mode === 'eaten') return s;
  const mode = effectiveMode(g, s);
  if (mode === 'frightened') {
    const points = 200 * 2 ** Math.min(s.ghostCombo, 3);
    let s2: PuckState = {
      ...s,
      scores: { ...s.scores, [s.turn!]: s.scores[s.turn!]! + points },
      ghosts: s.ghosts.map((x) => (x.id === g.id ? { ...x, mode: 'eaten' as GhostMode } : x)),
      ghostCombo: s.ghostCombo + 1,
    };
    s2 = withSfx(s2, { name: 'hit', player: s.turn! });
    return s2;
  }
  return playerCaught(s);
}

const hitCheck = (s: PuckState): PuckState => {
  const g = s.ghosts.find((gh) => gh.x === s.player.x && gh.y === s.player.y && gh.mode !== 'eaten');
  return g ? handleGhostHit(s, g) : s;
};

function step(state: PuckState, inputs: Record<string, PlayerInput>): PuckState {
  if (state.phase !== 'playing') return tickPhase(state, 1 / 60).state;
  let s = { ...state, sfx: [] as PuckState['sfx'], tickCount: state.tickCount + 1 };
  const turn = s.turn!;

  if (s.deathTimer > 0) {
    s = { ...s, deathTimer: s.deathTimer - 1 };
    if (s.deathTimer === 0 && s.lives[turn]! > 0) s = resetPositions(s);
    return tickPhase(s, 1 / 60).state;
  }

  if (s.frightTimer > 0) {
    s = { ...s, frightTimer: s.frightTimer - 1 };
    if (s.frightTimer === 0) {
      s = { ...s, ghosts: s.ghosts.map((g) => (g.mode === 'frightened' ? { ...g, mode: 'chase' as GhostMode } : g)) };
    }
  }

  // player
  const input = inputs[turn];
  const player = { ...s.player };
  if (input?.dir) player.pendingDir = input.dir;
  player.progress += 1 / 8;
  s = { ...s, player };
  while (player.progress >= 1) {
    const want = passable(player.x + player.pendingDir.dx, player.y + player.pendingDir.dy, false)
      ? player.pendingDir
      : player.dir;
    player.dir = want;
    if (!passable(player.x + want.dx, player.y + want.dy, false)) {
      player.progress = 0;
      break;
    }
    player.x += want.dx;
    player.y += want.dy;
    player.progress -= 1;
    const k = key(player.x, player.y);
    if (s.dots[k]) {
      const dots = { ...s.dots };
      delete dots[k];
      s = { ...s, dots, scores: { ...s.scores, [turn]: s.scores[turn]! + 10 } };
      s = withSfx(s, { name: 'eat', player: turn });
    }
    if (s.powers[k]) {
      const powers = { ...s.powers };
      delete powers[k];
      s = {
        ...s,
        powers,
        frightTimer: 300 - Math.min(150, (s.level - 1) * 20),
        ghostCombo: 0,
        ghosts: s.ghosts.map((g) => (g.mode === 'eaten' ? g : { ...g, mode: 'frightened' as GhostMode })),
      };
      s = withSfx(s, { name: 'power', player: turn });
    }
    s = { ...s, player };
    s = hitCheck(s);
    if (s.phase !== 'playing' || s.deathTimer > 0) return tickPhase(s, 1 / 60).state;
  }

  // ghosts: level ramp + adaptive difficulty (dying too much eases off, cruising pushes harder)
  const diff = computeDifficulty({ level: s.level, deaths: s.deaths, clears: s.clears });
  const speed = 0.045 + 0.08 * diff.speed;
  const ghosts = s.ghosts.map((g) => ({ ...g }));
  s = { ...s, ghosts };
  for (const g of ghosts) {
    const mode = effectiveMode(g, s);
    const sp = mode === 'frightened' ? 0.05 : mode === 'eaten' ? 0.25 : speed;
    g.progress += sp;
    while (g.progress >= 1) {
      g.dir = chooseGhostDir(g, s);
      g.x += g.dir.dx;
      g.y += g.dir.dy;
      g.progress -= 1;
      if (g.mode === 'eaten' && dist(g, PEN_CELLS[1]!) === 0) {
        g.mode = 'chase';
        g.progress = 0;
        break;
      }
    }
  }
  s = { ...s, ghosts };
  s = hitCheck(s);
  if (s.phase !== 'playing') return tickPhase(s, 1 / 60).state;

  // cleared the board
  if (Object.keys(s.dots).length === 0 && s.deathTimer === 0) {
    s = withSfx({ ...s, level: s.level + 1, clears: s.clears + 1 }, { name: 'goal', player: turn });
    s = { ...resetPositions(s), ...readDots() };
    s = enterPhase(s, 'roundOver');
  }
  return tickPhase(s, 1 / 60).state;
}

export const puckSpec: GameSpec<PuckState> = {
  id: 'puck',
  supportsVersus: true,
  capacity: 2,
  turnBased: true,
  create,
  step,
};
