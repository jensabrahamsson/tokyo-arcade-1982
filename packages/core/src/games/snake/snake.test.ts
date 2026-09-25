import { describe, it, expect } from 'vitest';
import { snakeSpec, type SnakeState, GRID } from './snake';
import { DIRS } from '../../engine/vec';
import { NO_INPUT, type GameConfig, type PlayerInput } from '../../engine/types';

const soloCfg: GameConfig = { mode: 'solo', playerIds: ['p1'], seed: 42 };
const vsCfg: GameConfig = { mode: 'versus', playerIds: ['p1', 'p2'], seed: 42 };

const input = (dir: (typeof DIRS)[keyof typeof DIRS] | null, button = false): PlayerInput => ({
  dir,
  button,
});

const play = (s: SnakeState): SnakeState => ({ ...s, phase: 'playing' });

const advance = (s: SnakeState, inputs: Record<string, PlayerInput>, ticks: number): SnakeState => {
  let cur = s;
  for (let i = 0; i < ticks; i++) cur = snakeSpec.step(cur, inputs);
  return cur;
};

const headOf = (s: SnakeState, pid: string) => s.snakes[pid]?.body[0];
const moveTicks = (s: SnakeState) => s.moveInterval;

describe('snake create', () => {
  it('starts in ready phase with 3 lives (solo)', () => {
    const s = snakeSpec.create(soloCfg);
    expect(s.phase).toBe('ready');
    expect(s.lives['p1']).toBe(3);
    expect(s.snakes['p1']!.body).toHaveLength(4);
  });

  it('two snakes spawn in versus facing each other', () => {
    const s = snakeSpec.create(vsCfg);
    const h1 = headOf(s, 'p1')!;
    const h2 = headOf(s, 'p2')!;
    expect(s.snakes['p1']!.dir).toEqual(DIRS.right);
    expect(s.snakes['p2']!.dir).toEqual(DIRS.left);
    expect(h1.y).toBe(h2.y);
    expect(h1.x).toBeLessThan(h2.x);
  });

  it('places food somewhere free in solo mode', () => {
    const s = snakeSpec.create(soloCfg);
    expect(s.food).not.toBeNull();
  });

  it('has no food in versus mode', () => {
    expect(snakeSpec.create(vsCfg).food).toBeNull();
  });
});

describe('snake movement', () => {
  it('advances one cell every moveInterval ticks', () => {
    const s = play(snakeSpec.create(soloCfg));
    const h0 = headOf(s, 'p1')!;
    const after = advance(s, { p1: NO_INPUT }, moveTicks(s) - 1);
    expect(headOf(after, 'p1')).toEqual(h0);
    const moved = advance(s, { p1: NO_INPUT }, moveTicks(s));
    expect(headOf(moved, 'p1')!.x).toBe(h0.x + 1);
  });

  it('turns with input', () => {
    const s = play(snakeSpec.create(soloCfg));
    const moved = advance(s, { p1: input(DIRS.up) }, moveTicks(s));
    expect(moved.snakes['p1']!.dir).toEqual(DIRS.up);
  });

  it('rejects instant 180 reversal', () => {
    const s = play(snakeSpec.create(soloCfg));
    const moved = advance(s, { p1: input(DIRS.left) }, moveTicks(s));
    expect(moved.snakes['p1']!.dir).toEqual(DIRS.right);
  });

  it('buffers rapid cornering (right -> up -> left) across moves', () => {
    let s = play(snakeSpec.create(soloCfg));
    expect(s.snakes['p1']!.dir).toEqual(DIRS.right);
    s = snakeSpec.step(s, { p1: input(DIRS.up) });
    s = snakeSpec.step(s, { p1: input(DIRS.left) });
    s = advance(s, { p1: NO_INPUT }, moveTicks(s) - 2);
    expect(s.snakes['p1']!.dir).toEqual(DIRS.up);
    s = advance(s, { p1: NO_INPUT }, moveTicks(s));
    expect(s.snakes['p1']!.dir).toEqual(DIRS.left);
  });

  it('wraps around in solo mode', () => {
    const s = play(snakeSpec.create(soloCfg));
    const w = GRID.w;
    const near = { ...s, snakes: { p1: { ...s.snakes['p1']!, body: [{ x: w - 1, y: 5 }, { x: w - 2, y: 5 }, { x: w - 3, y: 5 }, { x: w - 4, y: 5 }] } } };
    const moved = advance(near, { p1: NO_INPUT }, moveTicks(s));
    expect(headOf(moved, 'p1')!.x).toBe(0);
  });
});

describe('snake eating', () => {
  it('eats food: score +10, body grows, food respawns', () => {
    let s = play(snakeSpec.create(soloCfg));
    const h = headOf(s, 'p1')!;
    s = { ...s, food: { x: h.x + 1, y: h.y } };
    const moved = advance(s, { p1: NO_INPUT }, moveTicks(s));
    expect(moved.scores['p1']).toBe(10);
    expect(moved.snakes['p1']!.body).toHaveLength(5);
    expect(moved.food).not.toBeNull();
    expect(moved.food).not.toEqual({ x: h.x + 1, y: h.y });
    expect(moved.sfx.some((e) => e.name === 'eat')).toBe(true);
  });

  it('levels up every 5 foods and speeds up', () => {
    let s = play(snakeSpec.create(soloCfg));
    const startInterval = moveTicks(s);
    for (let i = 0; i < 5; i++) {
      const h = headOf(s, 'p1')!;
      s = { ...s, food: { x: h.x + 1, y: h.y } };
      s = advance(s, { p1: NO_INPUT }, moveTicks(s));
    }
    expect(s.level).toBe(2);
    expect(moveTicks(s)).toBeLessThan(startInterval);
  });

  it('guarantees food spawns on the remaining free cell even on a crowded board', () => {
    let s = play(snakeSpec.create(soloCfg));
    // Leave cell (2, 0) free, food at (0, 0), head at (1, 0) moving left
    const crowdedBody: { x: number; y: number }[] = [{ x: 1, y: 0 }];
    for (let y = 0; y < GRID.h; y++) {
      for (let x = 0; x < GRID.w; x++) {
        if (!((x === 0 && y === 0) || (x === 1 && y === 0) || (x === 2 && y === 0))) {
          crowdedBody.push({ x, y });
        }
      }
    }
    s = {
      ...s,
      snakes: {
        p1: {
          body: crowdedBody,
          dir: DIRS.left,
          pendingDir: null,
          queuedDir: null,
          alive: true,
          respawnTimer: 0,
        },
      },
      food: { x: 0, y: 0 },
      rngSeed: 42,
    };
    const moved = advance(s, { p1: NO_INPUT }, moveTicks(s));
    expect(moved.scores['p1']).toBe(10);
    expect(moved.food).toEqual({ x: 2, y: 0 });
  });

  it('eating food at higher levels awards level-scaled points', () => {
    let s = play(snakeSpec.create(soloCfg));
    s = { ...s, level: 3 };
    const h = headOf(s, 'p1')!;
    s = { ...s, food: { x: h.x + 1, y: h.y } };
    const moved = advance(s, { p1: NO_INPUT }, moveTicks(s));
    expect(moved.scores['p1']).toBe(30);
  });
});

describe('snake death (solo)', () => {
  const crashIntoOwnBody = (s: SnakeState): SnakeState => {
    // body cell (9,10) sits directly ahead of the head and is not the tail
    const body = [
      { x: 10, y: 10 },
      { x: 11, y: 10 },
      { x: 11, y: 9 },
      { x: 9, y: 10 },
      { x: 9, y: 9 },
    ];
    return { ...s, snakes: { ...s.snakes, p1: { ...s.snakes['p1']!, body, dir: DIRS.left, alive: true, respawnTimer: 0 } } };
  };

  it('biting own body costs a life and pauses respawn', () => {
    const s = crashIntoOwnBody(play(snakeSpec.create(soloCfg)));
    const moved = advance(s, { p1: NO_INPUT }, moveTicks(s));
    expect(moved.lives['p1']).toBe(2);
    expect(moved.snakes['p1']!.alive).toBe(false);
    expect(moved.snakes['p1']!.respawnTimer).toBeGreaterThan(0);
  });

  it('respawns after timer at spawn point', () => {
    let s = crashIntoOwnBody(play(snakeSpec.create(soloCfg)));
    s = advance(s, { p1: NO_INPUT }, moveTicks(s));
    s = advance(s, { p1: NO_INPUT }, (s.snakes['p1']!.respawnTimer ?? 0) + moveTicks(s));
    expect(s.snakes['p1']!.alive).toBe(true);
    expect(s.lives['p1']).toBe(2);
  });

  it('last life lost -> gameOver', () => {
    let s = play(snakeSpec.create(soloCfg));
    s = { ...s, lives: { ...s.lives, p1: 1 } };
    s = crashIntoOwnBody(s);
    s = advance(s, { p1: NO_INPUT }, moveTicks(s));
    expect(s.phase).toBe('gameOver');
  });
});

describe('snake four-player versus', () => {
  it('spawns four distinct snakes from the spawn corners', () => {
    const s = snakeSpec.create({ mode: 'versus', playerIds: ['p1', 'p2', 'p3', 'p4'], seed: 7 });
    expect(Object.keys(s.snakes)).toHaveLength(4);
    const heads = Object.values(s.snakes).map((sn) => `${sn.body[0]!.x},${sn.body[0]!.y}`);
    expect(new Set(heads).size).toBe(4);
    const dirs = Object.values(s.snakes).map((sn) => `${sn.dir.dx},${sn.dir.dy}`);
    expect(new Set(dirs).size).toBe(4);
  });

  it('last snake alive wins a four-way brawl', () => {
    let s = play(snakeSpec.create({ mode: 'versus', playerIds: ['p1', 'p2', 'p3', 'p4'], seed: 7 }));
    s = {
      ...s,
      snakes: {
        ...s.snakes,
        p2: { ...s.snakes['p2']!, body: [{ x: 27, y: 10 }, { x: 26, y: 10 }, { x: 25, y: 10 }, { x: 24, y: 10 }], dir: DIRS.right },
        p3: { ...s.snakes['p3']!, body: [{ x: 14, y: 4 }, { x: 14, y: 5 }, { x: 14, y: 6 }, { x: 14, y: 7 }], dir: DIRS.up },
        p4: { ...s.snakes['p4']!, body: [{ x: 14, y: 15 }, { x: 14, y: 14 }, { x: 14, y: 13 }, { x: 14, y: 12 }], dir: DIRS.down },
      },
    };
    const moved = advance(s, { p1: NO_INPUT, p2: NO_INPUT, p3: NO_INPUT, p4: NO_INPUT }, 60);
    expect(moved.phase).toBe('gameOver');
    expect(moved.winner).toBe('p1');
  });
});

describe('snake purity', () => {
  it('step() never mutates the state it receives', () => {
    const s1 = play(snakeSpec.create(vsCfg));
    const before = JSON.stringify(s1);
    snakeSpec.step(s1, { p1: input(DIRS.up), p2: input(DIRS.down) });
    expect(JSON.stringify(s1)).toBe(before);
  });
});

describe('snake versus (blockade duel)', () => {
  const vsPlay = () => play(snakeSpec.create(vsCfg));

  it('walls kill in versus mode', () => {
    let s = vsPlay();
    const h2 = headOf(s, 'p2')!;
    const body = Array.from({ length: 4 }, (_, i) => ({ x: GRID.w - 1 - 0, y: h2.y })).map((c, i) => ({
      x: GRID.w - 1 - 0,
      y: h2.y,
    }));
    // place p2 head at right wall moving right
    s = {
      ...s,
      snakes: {
        ...s.snakes,
        p2: { ...s.snakes['p2']!, dir: DIRS.right, body: [{ x: GRID.w - 1, y: h2.y }, ...body.slice(1)] },
      },
    };
    const moved = advance(s, { p1: input(DIRS.up), p2: NO_INPUT }, moveTicks(s));
    expect(moved.snakes['p2']!.alive).toBe(false);
    expect(moved.winner).toBe('p1');
    expect(moved.phase).toBe('gameOver');
  });

  it('crashing into opponent trail kills you', () => {
    let s = vsPlay();
    const h1 = headOf(s, 'p1')!;
    // p2 trail directly ahead of p1
    const trail = [
      { x: h1.x + 1, y: h1.y },
      { x: h1.x + 2, y: h1.y },
      { x: h1.x + 2, y: h1.y + 1 },
    ];
    s = {
      ...s,
      snakes: {
        p1: { ...s.snakes['p1']!, body: [h1, { x: h1.x - 1, y: h1.y }, { x: h1.x - 2, y: h1.y }, { x: h1.x - 3, y: h1.y }] },
        p2: { ...s.snakes['p2']!, dir: DIRS.right, body: trail },
      },
    };
    const moved = advance(s, { p1: NO_INPUT, p2: input(DIRS.down) }, moveTicks(s));
    expect(moved.snakes['p1']!.alive).toBe(false);
    expect(moved.snakes['p2']!.alive).toBe(true);
    expect(moved.winner).toBe('p2');
  });

  it('survival ticks add score in versus', () => {
    const s = vsPlay();
    const moved = advance(s, { p1: NO_INPUT, p2: NO_INPUT }, moveTicks(s) * 3);
    expect(moved.scores['p1']).toBe(3);
    expect(moved.scores['p2']).toBe(3);
  });
});
