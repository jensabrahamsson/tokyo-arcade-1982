import { describe, it, expect } from 'vitest';
import {
  puckSpec, create, MAZE, MAZE_W, MAZE_H, PLAYER_SPAWN, PEN_CELLS,
  type PuckState, type Cell,
} from './puck';
import { DIRS } from '../../engine/vec';
import { NO_INPUT, type GameConfig, type PlayerInput } from '../../engine/types';

const soloCfg: GameConfig = { mode: 'solo', playerIds: ['p1'], seed: 42 };
const vsCfg: GameConfig = { mode: 'versus', playerIds: ['p1', 'p2'], seed: 42 };

const play = (s: PuckState): PuckState => ({ ...s, phase: 'playing' });
const run = (s: PuckState, inputs: Record<string, PlayerInput>, ticks: number): PuckState => {
  let cur = s;
  for (let i = 0; i < ticks; i++) cur = puckSpec.step(cur, inputs);
  return cur;
};

describe('maze data', () => {
  it('is 19x21 with all rows full width and symmetric', () => {
    expect(MAZE.length).toBe(MAZE_H);
    for (const row of MAZE) {
      expect(row.length).toBe(MAZE_W);
      expect(row).toBe(row.split('').reverse().join(''));
    }
  });

  it('has no unreachable dots from player spawn', () => {
    const seen = new Set<string>([`${PLAYER_SPAWN.x},${PLAYER_SPAWN.y}`]);
    const queue = [PLAYER_SPAWN];
    while (queue.length) {
      const { x, y } = queue.pop()!;
      for (const d of Object.values(DIRS)) {
        const key = `${x + d.dx},${y + d.dy}`;
        const c = MAZE[y + d.dy]?.[x + d.dx];
        if (c && c !== '#' && c !== '=' && c !== 'G' && !seen.has(key)) {
          seen.add(key);
          queue.push({ x: x + d.dx, y: y + d.dy });
        }
      }
    }
    const dots: string[] = [];
    MAZE.forEach((row, y) => row.split('').forEach((c, x) => {
      if (c === '.' || c === 'o') dots.push(`${x},${y}`);
    }));
    expect(dots.every((d) => seen.has(d))).toBe(true);
  });
});

describe('puck create', () => {
  it('starts with player at spawn, 4 ghosts, dots and 3 lives', () => {
    const s = create(soloCfg);
    expect(s.phase).toBe('ready');
    expect(s.player.x).toBe(PLAYER_SPAWN.x);
    expect(s.ghosts).toHaveLength(4);
    expect(Object.keys(s.dots).length).toBeGreaterThan(100);
    expect(s.lives['p1']).toBe(3);
    expect(s.turn).toBe('p1');
  });

  it('ghosts start in or just above the pen', () => {
    const s = create(soloCfg);
    for (const g of s.ghosts) {
      const inPen = PEN_CELLS.some((c) => c.x === g.x && c.y === g.y);
      const abovePen = MAZE[g.y]?.[g.x] === '.';
      expect(inPen || abovePen).toBe(true);
    }
  });
});

describe('puck movement', () => {
  it('player advances one cell per 8 ticks', () => {
    let s = play(create(soloCfg));
    s = { ...s, player: { ...s.player, x: 9, y: 16, dir: DIRS.left, pendingDir: DIRS.left, progress: 0 } };
    const moved = run(s, { p1: NO_INPUT }, 8);
    expect(moved.player.x).toBe(8);
  });

  it('walls stop the player', () => {
    let s = play(create(soloCfg));
    s = { ...s, player: { ...s.player, x: 9, y: 16, dir: DIRS.up, pendingDir: DIRS.up, progress: 0 } };
    const moved = run(s, { p1: NO_INPUT }, 24);
    expect(moved.player.y).toBe(16);
  });

  it('player turns at junctions', () => {
    let s = play(create(soloCfg));
    s = { ...s, player: { ...s.player, x: 4, y: 16, dir: DIRS.right, pendingDir: DIRS.right, progress: 0 } };
    const moved = run(s, { p1: { dir: DIRS.down, button: false } }, 8);
    expect(moved.player.y).toBe(17);
  });

  it('pre-buffers turn approaching an upcoming junction', () => {
    let s = play(create(soloCfg));
    s = { ...s, player: { ...s.player, x: 5, y: 16, dir: DIRS.left, pendingDir: DIRS.left, progress: 0 } };
    const moved = run(s, { p1: { dir: DIRS.down, button: false } }, 16);
    expect(moved.player.x).toBe(4);
    expect(moved.player.y).toBe(17);
    expect(moved.player.dir).toEqual(DIRS.down);
  });

  it('instantly reverses direction when opposite direction is pressed without stepping into danger', () => {
    let s = play(create(soloCfg));
    s = {
      ...s,
      player: { x: 9, y: 16, dir: DIRS.left, pendingDir: DIRS.left, progress: 0.5 },
      ghosts: [{ ...s.ghosts[0]!, x: 8, y: 16, dir: DIRS.right, mode: 'chase', progress: 0 }, s.ghosts[1]!, s.ghosts[2]!, s.ghosts[3]!],
    };
    const moved = puckSpec.step(s, { p1: { dir: DIRS.right, button: false } });
    expect(moved.player.dir).toEqual(DIRS.right);
    expect(moved.player.x).toBe(9);
    expect(moved.lives['p1']).toBe(3);
  });

  it('player eats a dot', () => {
    let s = play(create(soloCfg));
    const cellKey = '8,16';
    expect(s.dots[cellKey]).toBe(true);
    s = { ...s, player: { ...s.player, x: 9, y: 16, dir: DIRS.left, pendingDir: DIRS.left, progress: 0 } };
    const moved = run(s, { p1: NO_INPUT }, 8);
    expect(moved.scores['p1']).toBe(10);
    expect(moved.dots[cellKey]).toBeUndefined();
    expect(moved.sfx.some((e) => e.name === 'eat')).toBe(true);
  });
});

const putPlayer = (s: PuckState, x: number, y: number, dir: (typeof DIRS)[keyof typeof DIRS] = DIRS.right): PuckState => ({
  ...s,
  player: { x, y, dir, pendingDir: dir, progress: 0 },
});

describe('puck power & ghosts', () => {
  const powerCell = '2,3';

  it('eating a power pellet frightens ghosts', () => {
    let s = play(create(soloCfg));
    s = putPlayer(s, 1, 4, DIRS.up);
    const moved = run(s, { p1: NO_INPUT }, 8);
    expect(moved.frightTimer).toBeGreaterThan(0);
    expect(moved.sfx.some((e) => e.name === 'power')).toBe(true);
    const chased = moved.ghosts.filter((g) => g.mode === 'frightened');
    expect(chased.length).toBeGreaterThan(0);
  });

  it('a frightened ghost can be eaten for points and respawns', () => {
    let s = play(create(soloCfg));
    s = { ...s, frightTimer: 200 };
    s = putPlayer(s, 9, 8, DIRS.right);
    s = { ...s, ghosts: [{ ...s.ghosts[0]!, x: 10, y: 8, dir: DIRS.left, mode: 'frightened' as const, progress: 0 }] };
    const moved = run(s, { p1: NO_INPUT }, 8);
    expect(moved.scores['p1']).toBeGreaterThanOrEqual(200);
    expect(moved.ghosts[0]!.mode).toBe('eaten');
    const revived = run(moved, { p1: NO_INPUT }, 200);
    expect(revived.ghosts[0]!.mode).not.toBe('eaten');
  });

  it('an angry ghost catches the player and costs a life', () => {
    let s = play(create(soloCfg));
    s = putPlayer(s, 9, 8, DIRS.right);
    s = { ...s, frightTimer: 0, ghosts: [{ ...s.ghosts[0]!, x: 10, y: 8, dir: DIRS.left, mode: 'chase' as const, progress: 0 }] };
    const moved = run(s, { p1: NO_INPUT }, 8);
    expect(moved.lives['p1']).toBe(2);
    expect(moved.sfx.some((e) => e.name === 'die')).toBe(true);
  });

  it('ghosts never occupy walls', () => {
    let s = play(create(soloCfg));
    s = run(s, { p1: NO_INPUT }, 600);
    for (const g of s.ghosts) {
      expect(MAZE[g.y]?.[g.x]).not.toBe('#');
    }
  });
});

describe('puck rounds & versus', () => {
  it('clearing all dots advances the level', () => {
    let s = play(create(soloCfg));
    s = { ...s, dots: { '8,16': true } };
    s = putPlayer(s, 9, 16, DIRS.left);
    const moved = run(s, { p1: NO_INPUT }, 8);
    expect(moved.level).toBe(2);
    expect(moved.phase).toBe('roundOver');
    const resumed = run(moved, { p1: NO_INPUT }, 200);
    expect(resumed.phase).toBe('playing');
    expect(Object.keys(resumed.dots).length).toBeGreaterThan(100);
  });

  it('solo last life lost -> gameOver', () => {
    let s = play(create(soloCfg));
    s = { ...s, lives: { p1: 1 }, frightTimer: 0 };
    s = putPlayer(s, 9, 8, DIRS.right);
    s = { ...s, ghosts: [{ ...s.ghosts[0]!, x: 10, y: 8, dir: DIRS.left, mode: 'chase' as const, progress: 0 }] };
    const moved = run(s, { p1: NO_INPUT }, 8);
    expect(moved.phase).toBe('gameOver');
  });

  it('versus: first player dying hands over to the next with dots reset', () => {
    let s = play(create(vsCfg));
    s = { ...s, lives: { p1: 1, p2: 3 }, scores: { p1: 420, p2: 0 }, frightTimer: 0 };
    s = putPlayer(s, 9, 8, DIRS.right);
    s = { ...s, ghosts: [{ ...s.ghosts[0]!, x: 10, y: 8, dir: DIRS.left, mode: 'chase' as const, progress: 0 }] };
    const moved = run(s, { p1: NO_INPUT }, 9);
    expect(moved.turn).toBe('p2');
    expect(moved.scores['p1']).toBeGreaterThanOrEqual(420);
    expect(Object.keys(moved.dots).length).toBeGreaterThan(100);
    expect(moved.phase).toBe('roundOver');
  });

  it('versus: last player dying ends game with top scorer as winner', () => {
    let s = play(create(vsCfg));
    s = { ...s, lives: { p1: 0, p2: 1 }, scores: { p1: 999, p2: 100 }, turn: 'p2', frightTimer: 0 };
    s = putPlayer(s, 9, 8, DIRS.right);
    s = { ...s, ghosts: [{ ...s.ghosts[0]!, x: 10, y: 8, dir: DIRS.left, mode: 'chase' as const, progress: 0 }] };
    const moved = run(s, { p1: NO_INPUT }, 9);
    expect(moved.phase).toBe('gameOver');
    expect(moved.winner).toBe('p1');
  });
});

describe('ghost AI', () => {
  it('a chaser heads toward the player in an open corridor', () => {
    let s = play(create(soloCfg));
    s = putPlayer(s, 5, 4, DIRS.right);
    s = { ...s, ghosts: [{ ...s.ghosts[0]!, x: 1, y: 4, dir: DIRS.right, mode: 'chase' as const, progress: 0 }] };
    const moved = run(s, { p1: NO_INPUT }, 8 * 20);
    expect(moved.ghosts[0]!.x).toBeGreaterThan(1);
    expect(Math.abs(moved.ghosts[0]!.x - 5)).toBeLessThanOrEqual(4);
  });
});

describe('puck versus fairness', () => {
  it('the next turn starts a fresh maze at level 1', () => {
    let s = play(create(vsCfg));
    s = { ...s, level: 3, deaths: 5, lives: { ...s.lives, p1: 1 } };
    // walk p1 into a ghost until the last life is gone
    for (let i = 0; i < 400 && s.turn === 'p1'; i++) {
      s = puckSpec.step({ ...s, player: { ...s.player, x: s.ghosts[0]!.x, y: s.ghosts[0]!.y } }, { p1: NO_INPUT, p2: NO_INPUT });
      if (s.deathTimer > 0 || s.phase !== 'playing') s = { ...s, player: { ...s.player, x: s.ghosts[0]!.x, y: s.ghosts[0]!.y } };
    }
    expect(s.turn).toBe('p2');
    expect(s.level).toBe(1);
    expect(s.deaths).toBe(0);
    expect(s.lives['p2']).toBe(3);
    expect(Object.keys(s.dots).length).toBeGreaterThan(100);
  });

  it('a head-on swap with a ghost is a hit', () => {
    let s = play(create(soloCfg));
    s = {
      ...s,
      player: { x: 9, y: 16, dir: DIRS.left, pendingDir: DIRS.left, progress: 0.9 },
      ghosts: [{ id: 0, x: 8, y: 16, dir: DIRS.right, progress: 0.99, mode: 'chase' }, s.ghosts[1]!, s.ghosts[2]!, s.ghosts[3]!],
    };
    const n = puckSpec.step(s, { p1: NO_INPUT });
    expect(n.deaths + (s.deaths ?? 0)).toBe(1);
    expect(n.lives['p1']).toBeLessThan(3);
  });
});
