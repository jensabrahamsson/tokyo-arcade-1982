import {
  type GameConfig,
  type GameStateBase,
  type GameSpec,
  type GameMode,
  type PlayerInput,
  withSfx,
} from '../../engine/types';
import { enterPhase, tickPhase } from '../../engine/phase';

export const BLOCK_W = 30;
export const BLOCK_H = 24;
export const WIN_SCORE = 7;
const PADDLE_SPAN = 5;
const PADDLE_SPEED = 0.45;
const BALL_BASE = 0.3;

interface Paddle {
  x: number;
  span: number;
  y: number;
}

export interface BlockState extends GameStateBase {
  mode: GameMode;
  paddles: Record<string, Paddle>;
  ball: { x: number; y: number; dx: number; dy: number };
  bricks: Record<string, number>;
  serveTimer: number;
  serveDir: number;
  deaths: number;
  clears: number;
}

const key = (x: number, y: number) => `${x},${y}`;

function makeBricks(level: number): Record<string, number> {
  const bricks: Record<string, number> = {};
  const rows = Math.min(6, 3 + Math.floor(level / 2));
  for (let r = 0; r < rows; r++) {
    const hits = r === 0 ? 2 : 1;
    for (let x = 1; x < BLOCK_W - 1; x++) bricks[key(x, 2 + r)] = hits;
  }
  return bricks;
}

export function createBlock(config: GameConfig): BlockState {
  const paddles: Record<string, Paddle> = {};
  const lives: Record<string, number> = {};
  const scores: Record<string, number> = {};
  config.playerIds.forEach((id, i) => {
    paddles[id] = { x: BLOCK_W / 2 - PADDLE_SPAN / 2, span: PADDLE_SPAN, y: i === 0 ? BLOCK_H - 2 : 1 };
    lives[id] = config.mode === 'solo' ? 3 : 0;
    scores[id] = 0;
  });
  const turn = config.playerIds[0];
  return {
    phase: 'ready',
    phaseTimer: 0,
    level: 1,
    scores,
    lives,
    sfx: [],
    mode: config.mode,
    paddles,
    ball: { x: BLOCK_W / 2, y: BLOCK_H / 2, dx: 0.09, dy: BALL_BASE },
    bricks: config.mode === 'solo' ? makeBricks(1) : {},
    serveTimer: 30,
    serveDir: -1,
    deaths: 0,
    clears: 0,
    turn,
  };
}

function serve(s: BlockState): BlockState {
  const speed = BALL_BASE + (s.level - 1) * 0.02;
  return {
    ...s,
    ball: { x: BLOCK_W / 2, y: BLOCK_H / 2, dx: 0.07 * s.serveDir, dy: speed * s.serveDir },
  };
}

function scored(s: BlockState, scorer: string, concededDir: number): BlockState {
  const scores = { ...s.scores, [scorer]: s.scores[scorer]! + 1 };
  let next = withSfx(
    { ...s, scores, serveTimer: 45, serveDir: -concededDir, ball: { x: BLOCK_W / 2, y: BLOCK_H / 2, dx: 0, dy: 0 } },
    { name: 'goal', player: scorer },
  );
  if (scores[scorer]! >= WIN_SCORE) next = enterPhase({ ...next, winner: scorer }, 'gameOver');
  return next;
}

function step(state: BlockState, inputs: Record<string, PlayerInput>): BlockState {
  if (state.phase !== 'playing') return tickPhase(state, 1 / 60).state;
  let s: BlockState = { ...state, sfx: [] as BlockState['sfx'], paddles: { ...state.paddles } };

  // paddles
  for (const [id, p] of Object.entries(s.paddles)) {
    const d = inputs[id]?.dir;
    let x = p.x;
    if (d?.dx) x += d.dx * PADDLE_SPEED;
    x = Math.min(BLOCK_W - 1 - p.span, Math.max(1, x));
    if (x !== p.x) s.paddles[id] = { ...p, x };
  }

  if (s.serveTimer > 0) {
    s.serveTimer -= 1;
    if (s.serveTimer === 0) s = serve(s);
    return s;
  }

  const ball = { ...s.ball };
  const prevY = ball.y;
  ball.x += ball.dx;
  ball.y += ball.dy;

  if (ball.x < 0.5) {
    ball.x = 0.5;
    ball.dx = Math.abs(ball.dx);
  } else if (ball.x > BLOCK_W - 0.5) {
    ball.x = BLOCK_W - 0.5;
    ball.dx = -Math.abs(ball.dx);
  }
  if (s.mode === 'solo' && ball.y < 0.5 && ball.dy < 0) {
    ball.y = 0.5;
    ball.dy = Math.abs(ball.dy);
  }

  // paddles deflect
  for (const [id, p] of Object.entries(s.paddles)) {
    const toward = p.y > BLOCK_H / 2 ? 1 : -1;
    const moving = toward > 0 ? ball.dy > 0 : ball.dy < 0;
    const hitRow = p.y + 0.4 * toward;
    if (moving && (prevY - hitRow) * (ball.y - hitRow) <= 0 && Math.abs(ball.y - hitRow) < 1) {
      if (ball.x >= p.x - 0.5 && ball.x <= p.x + p.span + 0.5) {
        const offset = Math.max(-1, Math.min(1, (ball.x - (p.x + p.span / 2)) / (p.span / 2)));
        const paddleDir = inputs[id]?.dir?.dx ?? 0;
        ball.dy = -toward * Math.abs(ball.dy);
        ball.dx = Math.max(-0.24, Math.min(0.24, offset * 0.18 + paddleDir * 0.05 + ball.dx * 0.25));
        ball.y = hitRow + 0.42 * toward;
        s = withSfx(s, { name: 'bounce', player: id });
      }
    }
  }

  // bricks (solo)
  let destroyed = false;
  if (s.mode === 'solo') {
    const cx = Math.floor(ball.x);
    const cy = Math.floor(ball.y);
    const k = key(cx, cy);
    if (s.bricks[k]) {
      const hits = s.bricks[k]! - 1;
      const bricks = { ...s.bricks };
      if (hits <= 0) delete bricks[k];
      else bricks[k] = hits;
      s = withSfx(
        { ...s, bricks, scores: { ...s.scores, [s.turn!]: s.scores[s.turn!]! + 3 * s.level } },
        { name: 'hit', player: s.turn! },
      );
      destroyed = true;
      const prevCellX = Math.floor(ball.x - ball.dx);
      const prevCellY = Math.floor(ball.y - ball.dy);
      if (prevCellX !== cx && prevCellY === cy) {
        ball.dx = -ball.dx;
      } else {
        const sign = ball.dy > 0 ? 1 : -1;
        const speed = Math.min(0.48, Math.abs(ball.dy) + 0.005);
        ball.dy = -sign * speed;
      }
    }
  }

  // goals
  const bottom = Object.keys(s.paddles).find((id) => s.paddles[id]!.y > BLOCK_H / 2) ?? Object.keys(s.paddles)[0]!;
  if (ball.y < 0) {
    if (s.mode === 'versus') {
      s = scored(s, bottom, -1);
      s.ball = ball;
      return s;
    }
    ball.dy = Math.abs(ball.dy);
    ball.y = 0.5;
  } else if (ball.y > BLOCK_H) {
    if (s.mode === 'versus') {
      const top = Object.keys(s.paddles).find((id) => s.paddles[id]!.y <= BLOCK_H / 2) ?? Object.keys(s.paddles)[1] ?? bottom;
      s = scored(s, top, 1);
      s.ball = ball;
      return s;
    }
    const solo = bottom;
    const lives = { ...s.lives, [solo]: s.lives[solo]! - 1 };
    s = withSfx({ ...s, lives, deaths: s.deaths + 1 }, { name: 'die', player: solo });
    s.serveTimer = 45;
    s.serveDir = -1;
    if (lives[solo]! <= 0) s = enterPhase(s, 'gameOver');
    s.ball = ball;
    return s;
  }

  s.ball = ball;

  if (s.mode === 'solo' && destroyed && Object.keys(s.bricks).length === 0) {
    s = withSfx({ ...s, level: s.level + 1, clears: s.clears + 1 }, { name: 'goal', player: s.turn! });
    s = { ...s, bricks: makeBricks(s.level), serveTimer: 45, serveDir: 1 };
    s = enterPhase(s, 'roundOver');
  }
  return s;
}

/** attract-mode bot: paddle follows the ball */
function demoBlock(state: BlockState, tick: number): PlayerInput {
  const id = Object.keys(state.paddles)[0]!;
  const p = state.paddles[id]!;
  const center = p.x + p.span / 2;
  const dx = state.ball.x - center;
  if (Math.abs(dx) < 0.35) return { dir: null, button: false, seq: tick };
  return { dir: dx > 0 ? { dx: 1, dy: 0 } : { dx: -1, dy: 0 }, button: false, seq: tick };
}

export const blockSpec: GameSpec<BlockState> = {
  id: 'block',
  supportsVersus: true,
  capacity: 2,
  turnBased: false,
  create: createBlock,
  step,
  demo: demoBlock,
};
