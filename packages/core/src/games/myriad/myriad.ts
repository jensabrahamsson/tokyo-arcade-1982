import {
  type GameConfig,
  type GameStateBase,
  type GameSpec,
  type PlayerInput,
  withSfx,
} from '../../engine/types';
import { enterPhase, tickPhase } from '../../engine/phase';
import { createRng } from '../../engine/rng';

export const MYRIAD_W = 30;
export const MYRIAD_H = 24;
const SEGMENTS = 10;
const MOVE_EVERY = 8;
/** the bug speeds up every level: 8 ticks per step at level 1, 4 at level 5+ */
const moveEvery = (level: number): number => Math.max(4, MOVE_EVERY - (level - 1));
const SPAWN_X = 2;

interface Point {
  x: number;
  y: number;
}

export interface MyriadState extends GameStateBase {
  segments: Point[];
  mushrooms: Record<string, number>;
  player: { x: number; y: number };
  bullets: { x: number; y: number; dy: number }[];
  dir: 1 | -1;
  moveTimer: number;
  fireCooldown: number;
  deaths: number;
  clears: number;
}

const key = (x: number, y: number) => `${x},${y}`;

function makeMushrooms(seed: number): Record<string, number> {
  const rng = createRng(seed);
  const m: Record<string, number> = {};
  for (let i = 0; i < 42; i++) {
    const x = rng.int(MYRIAD_W);
    const y = 1 + rng.int(16);
    m[key(x, y)] = 4;
  }
  return m;
}

export function createMyriad(config: GameConfig): MyriadState {
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
    segments: Array.from({ length: SEGMENTS }, (_, i) => ({ x: SPAWN_X, y: -(i + 1) })),
    mushrooms: makeMushrooms(config.seed),
    player: { x: 15, y: 22 },
    bullets: [],
    dir: 1,
    moveTimer: MOVE_EVERY,
    fireCooldown: 0,
    deaths: 0,
    clears: 0,
  };
}

const resetBug = (s: MyriadState): MyriadState => ({
  ...s,
  segments: Array.from({ length: SEGMENTS }, (_, i) => ({ x: SPAWN_X, y: -(i + 1) })),
  dir: 1,
  moveTimer: moveEvery(s.level),
  bullets: [],
});

function step(state: MyriadState, inputs: Record<string, PlayerInput>): MyriadState {
  if (state.phase !== 'playing') return tickPhase(state, 1 / 60).state;
  let s: MyriadState = { ...state, sfx: [] as MyriadState['sfx'] };
  const id = Object.keys(s.lives)[0]!;
  const input = inputs[id];

  // player
  const player = { ...s.player };
  if (input?.dir) {
    player.x = Math.min(MYRIAD_W - 1, Math.max(0, player.x + input.dir.dx * 0.45));
    player.y = Math.min(MYRIAD_H - 1, Math.max(19, player.y + input.dir.dy * 0.45));
  }
  s.fireCooldown = Math.max(0, s.fireCooldown - 1);
  let bullets = s.bullets.map((b) => ({ ...b, y: b.y + b.dy })).filter((b) => b.y > -1);
  if (input?.button && s.fireCooldown === 0 && bullets.length < 2) {
    bullets = [...bullets, { x: player.x + 0.5, y: player.y - 0.5, dy: -1.1 }];
    s.fireCooldown = 10;
    s = withSfx(s, { name: 'shoot', player: id });
  }
  s = { ...s, player, bullets };

  // shots hit segments, then mushrooms
  for (const b of bullets) {
    const ci = s.segments.findIndex((seg) => Math.abs(seg.x + 0.5 - b.x) < 0.8 && Math.abs(seg.y + 0.5 - b.y) < 0.8);
    if (ci >= 0) {
      const seg = s.segments[ci]!;
      b.y = -99;
      s = {
        ...s,
        segments: s.segments.filter((_, i) => i !== ci),
        scores: { ...s.scores, [id]: s.scores[id]! + 10 },
        mushrooms: seg.y >= 0 ? { ...s.mushrooms, [key(Math.floor(seg.x), Math.floor(seg.y))]: 2 } : s.mushrooms,
      };
      s = withSfx(s, { name: 'hit', player: id });
      continue;
    }
    const mk = key(Math.floor(b.x), Math.floor(b.y));
    if (s.mushrooms[mk]) {
      b.y = -99;
      const hp = s.mushrooms[mk]! - 1;
      const mushrooms = { ...s.mushrooms };
      if (hp <= 0) delete mushrooms[mk];
      else mushrooms[mk] = hp;
      s = { ...s, mushrooms, scores: { ...s.scores, [id]: s.scores[id]! + 4 } };
      s = withSfx(s, { name: 'hit', player: id });
    }
  }
  s = { ...s, bullets: s.bullets.filter((b) => b.y > -10) };

  // bug movement
  s.moveTimer = Math.max(0, s.moveTimer - 1);
  if (s.moveTimer === 0) {
    s.moveTimer = moveEvery(s.level);
    if (s.segments.length > 0) {
      const head = s.segments[0]!;
      let dir = s.dir;
      let next: Point;
      if (head.y < 0) {
        next = { x: head.x, y: head.y + 1 };
      } else {
        const ax = head.x + dir;
        const blocked = ax < 0 || ax >= MYRIAD_W || s.mushrooms[key(ax, head.y)] !== undefined;
        if (blocked) {
          dir = (dir * -1) as 1 | -1;
          next = { x: head.x, y: head.y + 1 };
        } else {
          next = { x: ax, y: head.y };
        }
      }
      s = { ...s, dir, segments: [next, ...s.segments.slice(0, -1)] };
    }
  }

  // head reached the player line
  const reachedHead = s.segments.find((p) => p.y >= 20);
  if (reachedHead) {
    const lives = { ...s.lives, [id]: s.lives[id]! - 1 };
    let next = withSfx({ ...s, lives, deaths: s.deaths + 1 }, { name: 'die', player: id });
    if (lives[id]! <= 0) return enterPhase(next, 'gameOver');
    next = resetBug(next);
    return next;
  }

  // wave cleared
  if (s.segments.length === 0) {
    s = withSfx({ ...s, level: s.level + 1, clears: s.clears + 1 }, { name: 'goal', player: id });
    s = resetBug(s);
    s = enterPhase(s, 'roundOver');
  }
  return s;
}

export const myriadSpec: GameSpec<MyriadState> = {
  id: 'myriad',
  supportsVersus: false,
  capacity: 2,
  turnBased: false,
  create: createMyriad,
  step,
};
