/**
 * TypeSafe Jev self-play for every attract cabinet (eight since Circuit d'Or).
 * Lives on the server (fetch/I/O). Core stays pure: missing key, low
 * confidence, or HTTP failure (one retry on flaky network) fail-closed
 * to spec.demo. No images — compact JSON state only.
 *
 * Local key file: repo-root `.env.typesafe` (gitignored). Never log the value.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BLOCK_H,
  BLOCK_W,
  DIRS,
  MAZE,
  MAZE_H,
  MAZE_W,
  MYRIAD_H,
  MYRIAD_W,
  RIVER_W,
  SNAKE_GRID,
  snakeSpec,
  type BlockState,
  type CircuitState,
  type CoastState,
  circuitSteer,
  type GalaxyState,
  type GameId,
  type GameStateBase,
  type MyriadState,
  type PlayerInput,
  type PuckState,
  type RiverState,
  type SnakeState,
} from '@arkad/core';

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-latest';
/** 8 Hz sits in the requested 5–10 Hz band; the 60 Hz tick reuses the last stick. */
export const JEV_MIN_INTERVAL_MS = 125;
export const JEV_CONFIDENCE_MIN = 0.35;
export const JEV_CONFIDENCE_MAX = 1;
export const JEV_TIMEOUT_MS = 1500;
export const JEV_GAME = 'snake';
/** Drop Block stay when |predicted land − paddle| exceeds this (cells). */
export const BLOCK_STAY_ALIGN = 0.7;
/** Coast hit-box used by the sim (`abs(playerX − o.x) < 0.45`). */
export const COAST_LINE_SLOP = 0.45;
export const COAST_LOOKAHEAD = 40;

export type SnakeAction = 'up' | 'down' | 'left' | 'right';

export const ACTION_DIRS: Record<SnakeAction, { dx: number; dy: number }> = {
  up: DIRS.up,
  down: DIRS.down,
  left: DIRS.left,
  right: DIRS.right,
};

const ACTION_ORDER: readonly SnakeAction[] = ['up', 'down', 'left', 'right'];

const ACTION_RUBRIC: Record<SnakeAction, string> = {
  up: 'Move up (y-1). Prefer when food is above or to escape downward trouble.',
  down: 'Move down (y+1). Prefer when food is below or to escape upward trouble.',
  left: 'Move left (x-1). Prefer when food is to the left.',
  right: 'Move right (x+1). Prefer when food is to the right.',
};

export interface CompactSnakeState {
  game: 'snake';
  grid: { w: number; h: number };
  mode: SnakeState['mode'];
  head: { x: number; y: number };
  dir: SnakeAction;
  length: number;
  body: { x: number; y: number }[];
  food: { x: number; y: number } | null;
  legal: SnakeAction[];
  score: number;
  lives: number;
  level: number;
}

export type JevQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
  | { type: 'score'; instructions: string; criteria: string[] };

export interface DemoInputPolicy {
  covers(game: string): boolean;
  inputFor(game: string, state: GameStateBase, tick: number, fallback: PlayerInput): PlayerInput;
}

export function dirToAction(d: { dx: number; dy: number }): SnakeAction | null {
  if (d.dx === 0 && d.dy === -1) return 'up';
  if (d.dx === 0 && d.dy === 1) return 'down';
  if (d.dx === -1 && d.dy === 0) return 'left';
  if (d.dx === 1 && d.dy === 0) return 'right';
  return null;
}

export function rateLimitAllows(
  lastCallMs: number | null,
  nowMs: number,
  minIntervalMs = JEV_MIN_INTERVAL_MS,
): boolean {
  if (lastCallMs === null) return true;
  return nowMs - lastCallMs >= minIntervalMs;
}

/** Finite confidence in [floor, 1]. NaN / inf / >1 fail-closed. */
export function confidenceAcceptable(confidence: number, floor = JEV_CONFIDENCE_MIN): boolean {
  return Number.isFinite(confidence) && confidence >= floor && confidence <= JEV_CONFIDENCE_MAX;
}

/** 408/429/5xx and transport errors retry once; 4xx auth/validation does not. */
export function jevReasonRetryable(reason: string): boolean {
  if (reason === 'network') return true;
  const m = /^http_(\d+)$/.exec(reason);
  if (!m) return false;
  const status = Number(m[1]);
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

/** Strip Bearer tokens, TYPESAFE_API_KEY= assignments, and known secret strings. */
export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  let out = String(text);
  for (const s of secrets) {
    if (s.trim().length >= 8) out = out.split(s).join('[redacted]');
  }
  out = out.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  out = out.replace(/TYPESAFE_API_KEY\s*[=:]\s*\S+/gi, 'TYPESAFE_API_KEY=[redacted]');
  return out;
}

export function legalSnakeActions(state: SnakeState, playerId?: string): SnakeAction[] {
  const id = playerId ?? Object.keys(state.snakes)[0];
  if (!id) return [];
  const sn = state.snakes[id];
  if (!sn?.alive) return [];
  const head = sn.body[0];
  if (!head) return [];
  const blocked = new Set<string>();
  for (const [oid, o] of Object.entries(state.snakes)) {
    const body = o.body;
    const last = oid === id ? Math.max(0, body.length - 1) : body.length;
    for (let i = 0; i < last; i++) {
      const c = body[i]!;
      blocked.add(`${c.x},${c.y}`);
    }
  }
  const { w, h } = SNAKE_GRID;
  const out: SnakeAction[] = [];
  for (const a of ACTION_ORDER) {
    const d = ACTION_DIRS[a];
    if (d.dx === -sn.dir.dx && d.dy === -sn.dir.dy) continue;
    let nx = head.x + d.dx;
    let ny = head.y + d.dy;
    if (state.mode === 'versus') {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    } else {
      nx = ((nx % w) + w) % w;
      ny = ((ny % h) + h) % h;
    }
    if (blocked.has(`${nx},${ny}`)) continue;
    out.push(a);
  }
  return out;
}

export function compactSnakeState(state: SnakeState, playerId?: string): CompactSnakeState | null {
  const id = playerId ?? Object.keys(state.snakes)[0];
  if (!id) return null;
  const sn = state.snakes[id];
  if (!sn?.alive) return null;
  const head = sn.body[0];
  if (!head) return null;
  const dir = dirToAction(sn.dir);
  if (!dir) return null;
  return {
    game: 'snake',
    grid: { w: SNAKE_GRID.w, h: SNAKE_GRID.h },
    mode: state.mode,
    head: { x: head.x, y: head.y },
    dir,
    length: sn.body.length,
    body: sn.body.map((c) => ({ x: c.x, y: c.y })),
    food: state.food ? { x: state.food.x, y: state.food.y } : null,
    legal: legalSnakeActions(state, id),
    score: state.scores[id] ?? 0,
    lives: state.lives[id] ?? 0,
    level: state.level,
  };
}

export function snakeJevQuestions(compact: CompactSnakeState): Record<string, JevQuestion> {
  const criteria: Record<string, string> = {};
  for (const a of compact.legal) criteria[a] = ACTION_RUBRIC[a];
  return {
    action: {
      type: 'choice',
      instructions:
        'Pick the next heading for this snake. Survive first (do not hit body or walls). Then chase food. Never reverse into the neck.',
      criteria,
    },
    danger: {
      type: 'noul',
      instructions: 'Is the snake in immediate danger of dying if it keeps its current heading for a few cells?',
      criteria: {
        true: 'Collision, trap, or no escape on the current heading',
        false: 'Current heading is clear enough to continue',
      },
    },
    aggression: {
      type: 'score',
      instructions: 'How aggressively should the snake chase food versus playing safe?',
      criteria: ['Play safe, avoid body and tight corridors', 'Balanced chase', 'Greedy: go straight at food'],
    },
  };
}

function readChoice(
  answers: unknown,
  key: string,
): { choice: string; confidence: number; probabilities: Record<string, number> } | null {
  if (typeof answers !== 'object' || answers === null) return null;
  const raw = (answers as Record<string, unknown>)[key];
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.choice !== 'string') return null;
  if (o.type !== undefined && o.type !== 'choice') return null;
  const confidence = typeof o.confidence === 'number' ? o.confidence : Number.NaN;
  const probabilities: Record<string, number> = {};
  if (typeof o.probabilities === 'object' && o.probabilities !== null) {
    for (const [k, v] of Object.entries(o.probabilities as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) probabilities[k] = v;
    }
  }
  return { choice: o.choice, confidence, probabilities };
}

export function mapJevToInput(
  answers: unknown,
  legal: readonly SnakeAction[],
  fallback: PlayerInput,
  tick: number,
  confidenceMin = JEV_CONFIDENCE_MIN,
): PlayerInput {
  const action = readChoice(answers, 'action');
  if (!action) return fallback;
  if (!(legal as readonly string[]).includes(action.choice)) return fallback;
  if (!confidenceAcceptable(action.confidence, confidenceMin)) return fallback;
  const dir = ACTION_DIRS[action.choice as SnakeAction];
  if (!dir) return fallback;
  return { dir: { dx: dir.dx, dy: dir.dy }, button: false, seq: tick };
}

export type AskJevResult =
  | { ok: true; body: { model: string; answers: Record<string, unknown> }; attempts: number }
  | { ok: false; reason: string; attempts: number };

function isJevBody(raw: unknown): raw is { model: string; answers: Record<string, unknown> } {
  if (typeof raw !== 'object' || raw === null) return false;
  const o = raw as Record<string, unknown>;
  return typeof o.model === 'string' && typeof o.answers === 'object' && o.answers !== null;
}

async function askJevOnce(opts: {
  apiKey: string;
  state: unknown;
  questions: Record<string, unknown>;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}): Promise<AskJevResult> {
  const key = opts.apiKey.trim();
  if (!key) return { ok: false, reason: 'missing_key', attempts: 1 };
  try {
    const timeoutMs = opts.timeoutMs ?? JEV_TIMEOUT_MS;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    let res: Response;
    try {
      res = await opts.fetchImpl(JEV_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state: opts.state,
          model: JEV_MODEL,
          questions: opts.questions,
        }),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return { ok: false, reason: `http_${res.status}`, attempts: 1 };
    const body: unknown = await res.json();
    if (!isJevBody(body)) return { ok: false, reason: 'bad_body', attempts: 1 };
    return { ok: true, body, attempts: 1 };
  } catch {
    return { ok: false, reason: 'network', attempts: 1 };
  }
}

export async function askJev(opts: {
  apiKey: string;
  state: unknown;
  questions: Record<string, unknown>;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}): Promise<AskJevResult> {
  const first = await askJevOnce(opts);
  if (first.ok || !jevReasonRetryable(first.reason)) return first;
  const retry = await askJevOnce(opts);
  return { ...retry, attempts: first.attempts + retry.attempts };
}


/**
 * Per-cabinet adapters (eight games; Circuit d'Or joined the 2026-09-20 pack):
 * compact state + typed questions + action -> PlayerInput, fail-closed.
 */
export interface JevedGame {
  game: GameId;
  payload: Record<string, unknown>;
  legal: string[];
  questions: (payload: Record<string, unknown>) => Record<string, JevQuestion>;
  toInput: (choice: string, tick: number) => PlayerInput | null;
  /**
   * Optional per-game confidence floor. Jev caps reported confidence near
   * the argmax probability, so a 5-choice question (e.g. myriad) rarely
   * reaches the global 0.35 even with a clear winner. Floor stays above
   * the uniform-distribution noise level (1/legal).
   */
  confidenceMin?: number;
}

export type GameJevAdapter = (state: GameStateBase) => JevedGame | null;

const DIR_ACTION: Record<string, { dx: number; dy: number }> = {
  up: DIRS.up,
  down: DIRS.down,
  left: DIRS.left,
  right: DIRS.right,
};

const dirInput = (choice: string, tick: number, button = false): PlayerInput | null => {
  const d = DIR_ACTION[choice];
  return d ? { dir: { dx: d.dx, dy: d.dy }, button, seq: tick } : null;
};

const DANGER = (subject: string, dangerIf: string, safeIf: string) =>
  ({
    danger: {
      type: 'noul' as const,
      instructions: `Is ${subject} in immediate danger right now?`,
      criteria: { true: dangerIf, false: safeIf },
    },
    aggression: {
      type: 'score' as const,
      instructions: 'How aggressively should the player chase reward versus playing safe?',
      criteria: ['Play safe, survival first', 'Balanced', 'Greedy: go straight at the reward'],
    },
  }) as Record<string, JevQuestion>;

const choiceQ = (instructions: string, legal: string[], rubric: Record<string, string>): Record<string, JevQuestion> => ({
  action: { type: 'choice', instructions, criteria: Object.fromEntries(legal.map((a) => [a, rubric[a] ?? `Choose ${a}`])) },
});

export const snakeAdapter: GameJevAdapter = (raw) => {
  const state = raw as SnakeState;
  const compact = compactSnakeState(state);
  if (!compact) return null;
  return {
    game: 'snake',
    payload: compact as unknown as Record<string, unknown>,
    legal: [...compact.legal],
    questions: () => ({ ...snakeJevQuestions(compact) }),
    toInput: (c, t) => dirInput(c, t),
  };
};

const puckLegal = (p: PuckState): string[] => {
  const out: string[] = [];
  for (const [a, d] of Object.entries(DIR_ACTION)) {
    let nx = p.player.x + d.dx;
    const ny = p.player.y + d.dy;
    if (nx < 0 || nx >= MAZE_W) nx = (nx + MAZE_W) % MAZE_W;
    if (ny < 0 || ny >= MAZE_H) continue;
    if (MAZE[ny]?.[nx] !== '#') out.push(a);
  }
  return out;
};

export const puckAdapter: GameJevAdapter = (raw) => {
  const s = raw as PuckState;
  const legal = puckLegal(s);
  if (legal.length === 0) return null;
  const payload = {
    game: 'puck',
    player: { x: s.player.x, y: s.player.y, dir: dirToAction(s.player.dir) ?? 'right' },
    ghosts: s.ghosts.map((g) => ({ x: g.x, y: g.y })),
    frightTimer: s.frightTimer,
    dotsLeft: Object.keys(s.dots).length,
    score: s.scores[Object.keys(s.scores)[0] ?? ''] ?? 0,
  };
  return {
    game: 'puck',
    payload,
    legal,
    questions: () => ({
      ...choiceQ(
        'Pick the next maze heading for Puck. Eat dots, avoid ghosts (chase them only while frightened).',
        legal,
        { up: 'Head up.', down: 'Head down.', left: 'Head left.', right: 'Head right.' },
      ),
      ...DANGER('Puck', 'A ghost is one cell away on any heading or a dead end is near', 'Open corridors around Puck'),
    }),
    toInput: (c, t) => dirInput(c, t),
  };
};

export function predictBlockLandX(
  ball: { x: number; y: number; dx: number; dy: number },
  paddleY: number,
  maxTicks = 800,
): number | null {
  if (!Number.isFinite(ball.x + ball.y + ball.dx + ball.dy)) return null;
  if (ball.dx === 0 && ball.dy === 0) return null;
  let x = ball.x;
  let y = ball.y;
  let dx = ball.dx;
  let dy = ball.dy;
  for (let i = 0; i < maxTicks; i++) {
    x += dx;
    y += dy;
    if (x < 0.5) {
      x = 0.5;
      dx = Math.abs(dx);
    } else if (x > BLOCK_W - 0.5) {
      x = BLOCK_W - 0.5;
      dx = -Math.abs(dx);
    }
    if (y < 0.5 && dy < 0) {
      y = 0.5;
      dy = Math.abs(dy);
    }
    if (y > BLOCK_H + 2 && dy > 0) return null;
    if (dy > 0 && y >= paddleY) return Math.max(0.5, Math.min(BLOCK_W - 0.5, x));
  }
  return null;
}

export interface BlockIntercept {
  paddleCenter: number;
  landX: number | null;
  error: number | null;
  dySign: -1 | 0 | 1;
  canLeft: boolean;
  canRight: boolean;
}

export function blockIntercept(s: BlockState): BlockIntercept | null {
  const id = Object.keys(s.paddles)[0];
  if (!id) return null;
  const pad = s.paddles[id]!;
  const paddleCenter = Math.round((pad.x + pad.span / 2) * 10) / 10;
  const landRaw = predictBlockLandX(s.ball, pad.y);
  const landX = landRaw === null ? null : Math.round(landRaw * 10) / 10;
  const error = landX === null ? null : Math.round((landX - paddleCenter) * 10) / 10;
  const dySign: -1 | 0 | 1 = s.ball.dy > 0 ? 1 : s.ball.dy < 0 ? -1 : 0;
  return {
    paddleCenter,
    landX,
    error,
    dySign,
    canLeft: pad.x > 1,
    canRight: pad.x + pad.span < BLOCK_W - 1,
  };
}

export function blockLegal(i: BlockIntercept): string[] {
  const legal: string[] = [];
  if (i.canLeft) legal.push('left');
  if (i.canRight) legal.push('right');
  const aligned = i.error === null || Math.abs(i.error) <= BLOCK_STAY_ALIGN;
  if (aligned) legal.push('stay');
  return legal;
}

export function galaxyAlienAbove(s: GalaxyState, slop = 0.9): boolean {
  return s.aliens.some((a) => a.y < s.player.y && Math.abs(a.x - s.player.x) < slop);
}

export interface MyriadGeometry {
  nearest: { dx: number; dy: number; manhattan: number } | null;
  inColumn: boolean;
  mushroomInColumn: boolean;
  fireWouldHit: boolean;
}

export function myriadGeometry(s: MyriadState): MyriadGeometry {
  let nearest: MyriadGeometry['nearest'] = null;
  let fireWouldHit = false;
  for (const seg of s.segments) {
    const dx = seg.x - s.player.x;
    const dy = seg.y - s.player.y;
    const manhattan = Math.abs(dx) + Math.abs(dy);
    if (nearest === null || manhattan < nearest.manhattan) nearest = { dx, dy, manhattan };
    if (seg.y >= 0 && seg.y < s.player.y && Math.abs(dx) < 0.8) fireWouldHit = true;
  }
  const col = Math.floor(s.player.x + 0.5);
  let mushroomInColumn = false;
  for (const k of Object.keys(s.mushrooms)) {
    const comma = k.indexOf(',');
    if (comma <= 0) continue;
    const x = Number(k.slice(0, comma));
    const y = Number(k.slice(comma + 1));
    if (x === col && y >= 0 && y < s.player.y) {
      mushroomInColumn = true;
      break;
    }
  }
  if (mushroomInColumn) fireWouldHit = true;
  const inColumn = nearest !== null && Math.abs(nearest.dx) < 0.8;
  return { nearest, inColumn, mushroomInColumn, fireWouldHit };
}

export function myriadLegal(s: MyriadState, geom: MyriadGeometry): string[] {
  const legal: string[] = [];
  if (s.player.x > 0) legal.push('left');
  if (s.player.x < MYRIAD_W - 1) legal.push('right');
  const rowDanger = geom.nearest !== null && Math.abs(geom.nearest.dy) < 2;
  if (rowDanger) {
    if (s.player.y > 19) legal.push('up');
    if (s.player.y < MYRIAD_H - 1) legal.push('down');
  }
  if (geom.fireWouldHit || geom.inColumn || geom.mushroomInColumn) legal.unshift('fire');
  return legal;
}

export function coastObstacleOnLine(s: CoastState): { x: number; ahead: number } | null {
  let best: { x: number; ahead: number } | null = null;
  for (const o of s.obstacles) {
    if (o.hit) continue;
    const ahead = o.d - s.dist;
    if (ahead <= 0 || ahead >= COAST_LOOKAHEAD) continue;
    if (Math.abs(o.x - s.playerX) >= COAST_LINE_SLOP) continue;
    if (!best || ahead < best.ahead) best = { x: o.x, ahead };
  }
  return best;
}

export function coastLegal(s: CoastState, on: { x: number; ahead: number } | null): string[] {
  if (!on) return ['left', 'straight', 'right'];
  const legal: string[] = [];
  if (s.playerX > -1.6) legal.push('left');
  if (s.playerX < 1.6) legal.push('right');
  return legal.length > 0 ? legal : ['straight'];
}

export const blockAdapter: GameJevAdapter = (raw) => {
  const s = raw as BlockState;
  const id = Object.keys(s.paddles)[0];
  if (!id) return null;
  const intercept = blockIntercept(s);
  if (!intercept) return null;
  const legal = blockLegal(intercept);
  if (legal.length === 0) return null;
  const payload = {
    game: 'block',
    paddleCenter: intercept.paddleCenter,
    landX: intercept.landX,
    error: intercept.error,
    dySign: intercept.dySign,
    ball: { x: Math.round(s.ball.x * 10) / 10, y: Math.round(s.ball.y * 10) / 10, dx: s.ball.dx, dy: s.ball.dy },
    bricksLeft: Object.keys(s.bricks).length,
    score: s.scores[id] ?? 0,
  };
  return {
    game: 'block',
    payload,
    legal,
    questions: () => ({
      ...choiceQ(
        'Line the paddle up under the predicted landing x. Survival first; angled hits only when aligned.',
        legal,
        {
          left: 'Slide left toward the predicted landing.',
          right: 'Slide right toward the predicted landing.',
          stay: 'Hold; the paddle is aligned with the predicted landing.',
        },
      ),
      ...DANGER('the ball', 'The ball is falling toward an edge the paddle cannot reach', 'The ball is catchable'),
    }),
    toInput: (c, t) =>
      c === 'left'
        ? { dir: { dx: -1, dy: 0 }, button: false, seq: t }
        : c === 'right'
          ? { dir: { dx: 1, dy: 0 }, button: false, seq: t }
          : c === 'stay'
            ? { dir: null, button: false, seq: t }
            : null,
  };
};

export const galaxyAdapter: GameJevAdapter = (raw) => {
  const s = raw as GalaxyState;
  const alienAbove = galaxyAlienAbove(s);
  const legal: string[] = ['stay'];
  if (s.player.x > 1) legal.push('left');
  if (s.player.x < 23) legal.push('right');
  if (alienAbove) legal.push('fire');
  const payload = {
    game: 'galaxy',
    player: { x: Math.round(s.player.x * 10) / 10 },
    alienAbove,
    aliens: s.aliens.slice(0, 8).map((a) => ({ x: Math.round(a.x), y: Math.round(a.y) })),
    aliensLeft: s.aliens.length,
    bullets: s.bullets.length,
    score: s.scores[Object.keys(s.scores)[0] ?? ''] ?? 0,
  };
  return {
    game: 'galaxy',
    payload,
    legal,
    questions: () => ({
      ...choiceQ(
        alienAbove
          ? 'An alien is in the gun column: line up and fire, or dodge a diver.'
          : 'Empty sky above the ship: slide under a target. Do not fire into empty space.',
        legal,
        { left: 'Move left.', right: 'Move right.', stay: 'Hold course.', fire: 'Fire now (alien in column).' },
      ),
      ...DANGER('the ship', 'An alien is close overhead or descending onto the player column', 'The column above is clear'),
    }),
    toInput: (c, t) => {
      if (c === 'fire') return { dir: null, button: true, seq: t };
      if (c === 'stay') return { dir: null, button: false, seq: t };
      return dirInput(c, t);
    },
  };
};

export const riverAdapter: GameJevAdapter = (raw) => {
  const s = raw as RiverState;
  const legal = ['up', 'down', 'left', 'right'].filter((a) => {
    const d = DIR_ACTION[a]!;
    const nx = s.frog.x + d.dx;
    return nx >= 0 && nx < RIVER_W;
  });
  const payload = {
    game: 'river',
    frog: { x: s.frog.x, y: s.frog.y },
    lanes: s.river.map((l) => ({ y: l.y, dir: l.dir, xs: l.xs.slice(0, 6) })),
    cars: s.cars.map((l) => ({ y: l.y, dir: l.dir, xs: l.xs.slice(0, 6) })),
    homesDone: s.homes.filter(Boolean).length,
    score: s.scores[Object.keys(s.scores)[0] ?? ''] ?? 0,
  };
  return {
    game: 'river',
    payload,
    legal,
    questions: () => ({
      ...choiceQ('Hop the frog toward the goal rows; wait for a safe gap in traffic.', legal, {
        up: 'Hop forward toward home.',
        down: 'Step back to dodge.',
        left: 'Sidestep left.',
        right: 'Sidestep right.',
      }),
      ...DANGER('the frog', 'The next row would hit the frog at its current column', 'A clear gap lines up ahead'),
    }),
    toInput: (c, t) => dirInput(c, t),
  };
};

export const myriadAdapter: GameJevAdapter = (raw) => {
  const s = raw as MyriadState;
  const geom = myriadGeometry(s);
  const legal = myriadLegal(s, geom);
  if (legal.length === 0) return null;
  const payload = {
    game: 'myriad',
    player: { x: Math.round(s.player.x), y: Math.round(s.player.y) },
    nearest: geom.nearest,
    inColumn: geom.inColumn,
    mushroomInColumn: geom.mushroomInColumn,
    fireWouldHit: geom.fireWouldHit,
    segments: s.segments.slice(0, 8).map((p) => ({ x: p.x, y: p.y })),
    mushrooms: Object.keys(s.mushrooms).length,
    score: s.scores[Object.keys(s.scores)[0] ?? ''] ?? 0,
  };
  return {
    game: 'myriad',
    payload,
    legal,
    // 3–4 choices still cap Jev near argmax; 0.25 stays above uniform-of-five (0.2)
    confidenceMin: 0.25,
    questions: () => ({
      ...choiceQ(
        geom.fireWouldHit
          ? 'A bug is in-column: shoot. Sidestep only if a segment is about to hit you.'
          : 'Dodge toward the nearest segment, then line up a column shot. Do not spray into empty sky.',
        legal,
        {
          up: 'Move up.',
          down: 'Move down.',
          left: 'Move left toward/away from the bug.',
          right: 'Move right toward/away from the bug.',
          fire: 'Shoot straight up — the column is occupied.',
        },
      ),
      ...DANGER('the player', 'A bug segment is close in the current column or row', 'The neighbourhood is clear'),
    }),
    toInput: (c, t) => {
      if (c === 'fire') return { dir: null, button: true, seq: t };
      return dirInput(c, t);
    },
  };
};

export const coastAdapter: GameJevAdapter = (raw) => {
  const s = raw as CoastState;
  const on = coastObstacleOnLine(s);
  const legal = coastLegal(s, on);
  const payload = {
    game: 'coast',
    playerX: Math.round(s.playerX * 100) / 100,
    speed: Math.round(s.speed),
    dist: Math.round(s.dist),
    timeLeft: s.timeLeft,
    checkpoints: s.checkpoints,
    onLine: on !== null,
    dodge: on ? (on.x >= s.playerX ? 'left' : 'right') : null,
    nextObstacles: s.obstacles
      .filter((o) => !o.hit && o.d > s.dist && o.d - s.dist < COAST_LOOKAHEAD)
      .map((o) => ({ ahead: Math.round(o.d - s.dist), x: Math.round(o.x * 10) / 10 })),
  };
  return {
    game: 'coast',
    payload,
    legal,
    questions: () => ({
      ...choiceQ(
        on
          ? 'Obstacle on the current line — steer off it at full throttle. Do not hold straight.'
          : 'Coast toward LO Castle on full throttle; steer around roadside obstacles and stay on the road.',
        legal,
        {
          left: on ? 'Obstacle on the line — steer left to dodge.' : 'Steer left.',
          straight: 'Hold the line (full throttle); the lane ahead is clear.',
          right: on ? 'Obstacle on the line — steer right to dodge.' : 'Steer right.',
        },
      ),
      ...DANGER('the car', 'An obstacle or the road edge is right ahead on the current line', 'The lane ahead is clear'),
    }),
    toInput: (c, t) => {
      if (c === 'straight') return { dir: null, button: true, seq: t };
      if (c === 'left') return { dir: { dx: -1, dy: 0 }, button: true, seq: t };
      if (c === 'right') return { dir: { dx: 1, dy: 0 }, button: true, seq: t };
      return null;
    },
  };
};

export const circuitAdapter: GameJevAdapter = (raw) => {
  const s = raw as CircuitState;
  const hint = circuitSteer(s);
  const legal = ['left', 'straight', 'right'];
  return {
    game: 'circuit',
    payload: {
      game: 'circuit',
      speed: Math.round(s.speed * 100) / 100,
      lap: s.lap,
      u: Math.round(s.u * 1000) / 1000,
      lat: Math.round(s.lat * 10) / 10,
      timeLeft: s.timeLeft,
      hint: hint < 0 ? 'left' : hint > 0 ? 'right' : 'straight',
    },
    legal,
    questions: () => ({
      ...choiceQ(
        "Circuit d'Or: stay on the asphalt. Full throttle, steer with the hint. No gears, no traffic.",
        legal,
        {
          left: 'Steer left.',
          straight: 'Hold the wheel.',
          right: 'Steer right.',
        },
      ),
      ...DANGER('the car', 'The car is off the asphalt or headed at the wall', 'The car is on the racing line'),
    }),
    toInput: (c, t) => {
      if (c === 'straight') return { dir: null, button: true, seq: t };
      if (c === 'left') return { dir: { dx: -1, dy: 0 }, button: true, seq: t };
      if (c === 'right') return { dir: { dx: 1, dy: 0 }, button: true, seq: t };
      return null;
    },
  };
};

export const JEV_ADAPTERS: Partial<Record<GameId, GameJevAdapter>> = {
  snake: snakeAdapter,
  puck: puckAdapter,
  block: blockAdapter,
  galaxy: galaxyAdapter,
  river: riverAdapter,
  myriad: myriadAdapter,
  coast: coastAdapter,
  circuit: circuitAdapter,
};

/** apply a validated JeV choice; falls back on unknown choice or low confidence */
export function mapChoiceToInput(
  answers: Record<string, unknown>,
  jev: {
    legal: readonly string[];
    toInput: (choice: string, tick: number) => PlayerInput | null;
    confidenceMin?: number;
  },
  fallback: PlayerInput,
  tick: number,
  confidenceMin = JEV_CONFIDENCE_MIN,
): PlayerInput {
  const action = readChoice(answers, 'action');
  if (!action) return fallback;
  if (!jev.legal.includes(action.choice)) return fallback;
  const floor = jev.confidenceMin ?? confidenceMin;
  if (!confidenceAcceptable(action.confidence, floor)) return fallback;
  return jev.toInput(action.choice, tick) ?? fallback;
}

export interface JevSelfPlayOpts {
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  minIntervalMs?: number;
  confidenceMin?: number;
  timeoutMs?: number;
  log?: (line: string) => void;
}

export class JevSelfPlay implements DemoInputPolicy {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly now: () => number;
  private readonly minIntervalMs: number;
  private readonly confidenceMin: number;
  private readonly timeoutMs: number;
  private readonly logFn: ((line: string) => void) | undefined;
  /** cached Jev choice word per game (not a stick — fire vs coast-straight share button-only) */
  private cached = new Map<string, string>();
  private lastCallMs: number | null = null;
  private inflight = false;
  /** observability for the autoplay harness: counters since construction */
  readonly stats = {
    calls: 0,
    ok: 0,
    failed: 0,
    retries: 0,
    confSum: 0,
    confN: 0,
    choices: {} as Record<string, number>,
  };

  constructor(opts: JevSelfPlayOpts) {
    this.apiKey = opts.apiKey.trim();
    this.fetchImpl = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
    this.now = opts.now ?? (() => Date.now());
    this.minIntervalMs = opts.minIntervalMs ?? JEV_MIN_INTERVAL_MS;
    this.confidenceMin = opts.confidenceMin ?? JEV_CONFIDENCE_MIN;
    this.timeoutMs = opts.timeoutMs ?? JEV_TIMEOUT_MS;
    this.logFn = opts.log;
  }

  covers(game: string): boolean {
    return JEV_ADAPTERS[game as GameId] !== undefined;
  }

  inputFor(game: string, state: GameStateBase, tick: number, fallback: PlayerInput): PlayerInput {
    const adapter = JEV_ADAPTERS[game as GameId];
    if (!adapter) return fallback;
    try {
      const jev = adapter(state);
      if (!jev || jev.legal.length === 0) return fallback;
      if (jev.legal.length === 1) return jev.toInput(jev.legal[0]!, tick) ?? fallback;
      this.maybeRefresh(jev);
      const choice = this.cached.get(game);
      if (choice && jev.legal.includes(choice)) {
        const fresh = jev.toInput(choice, tick);
        if (fresh) return fresh;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  private logSafe(line: string): void {
    if (!this.logFn) return;
    try {
      this.logFn(redactSecrets(line, this.apiKey.length >= 8 ? [this.apiKey] : []));
    } catch {
      /* never throw into the tick */
    }
  }

  private maybeRefresh(jev: JevedGame): void {
    if (this.inflight) return;
    if (!this.apiKey || !this.fetchImpl) return;
    if (!rateLimitAllows(this.lastCallMs, this.now(), this.minIntervalMs)) return;
    this.inflight = true;
    this.lastCallMs = this.now();
    void this.refresh(jev)
      .catch(() => {
        this.cached.delete(jev.game);
      })
      .finally(() => {
        this.inflight = false;
      });
  }

  private async refresh(jev: JevedGame): Promise<void> {
    const fetchImpl = this.fetchImpl;
    if (!fetchImpl) return;
    this.stats.calls += 1;
    const got = await askJev({
      apiKey: this.apiKey,
      state: jev.payload,
      questions: jev.questions(jev.payload),
      fetchImpl,
      timeoutMs: this.timeoutMs,
    });
    this.stats.retries += Math.max(0, got.attempts - 1);
    if (!got.ok) {
      this.stats.failed += 1;
      this.cached.delete(jev.game);
      this.logSafe(`jev ${jev.game}: fail-closed (${got.reason})`);
      return;
    }
    const action = readChoice(got.body.answers, 'action');
    const floor = jev.confidenceMin ?? this.confidenceMin;
    if (action && confidenceAcceptable(action.confidence, floor) && jev.legal.includes(action.choice)) {
      this.stats.ok += 1;
      this.stats.confSum += action.confidence;
      this.stats.confN += 1;
      this.stats.choices[`${jev.game}:${action.choice}`] = (this.stats.choices[`${jev.game}:${action.choice}`] ?? 0) + 1;
      this.cached.set(jev.game, action.choice);
    } else {
      this.stats.failed += 1;
      this.cached.delete(jev.game);
      this.logSafe(`jev ${jev.game}: fail-closed (low_confidence)`);
    }
  }
}

export const TYPESAFE_ENV_FILENAME = '.env.typesafe';

/** Parse a tiny KEY=value file. Comments, optional `export`, quotes, CRLF. */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const src = text.replace(/^\uFEFF/, '');
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const body = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = body.indexOf('=');
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = body.slice(eq + 1).trim();
    if (
      val.length >= 2 &&
      ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Fill blank keys on `env` from dotenv text. Existing non-empty values win. */
export function applyTypesafeEnv(
  env: Record<string, string | undefined>,
  text: string | null | undefined,
): Record<string, string | undefined> {
  if (!text) return env;
  for (const [k, v] of Object.entries(parseDotEnv(text))) {
    if ((env[k] ?? '').trim() === '') env[k] = v;
  }
  return env;
}

function readTextFile(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

/**
 * Load gitignored `.env.typesafe` from the first search dir that has it.
 * Does not overwrite keys already set on `env` (CI / shell win).
 */
export function loadTypesafeEnvFile(
  env: Record<string, string | undefined> = process.env,
  searchDirs: string[] = [process.cwd()],
): Record<string, string | undefined> {
  for (const dir of searchDirs) {
    const text = readTextFile(join(dir, TYPESAFE_ENV_FILENAME));
    if (text !== null) {
      applyTypesafeEnv(env, text);
      break;
    }
  }
  return env;
}

export function jevSelfPlayFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: typeof fetch,
): JevSelfPlay | undefined {
  if (env.ARKAD_JEV_SELFPLAY !== '1') return undefined;
  return new JevSelfPlay({
    apiKey: env.TYPESAFE_API_KEY ?? '',
    fetchImpl,
  });
}

export type JevSmokeResult =
  | { skipped: true; reason: string }
  | {
      skipped: false;
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
      danger?: number;
      aggression?: number;
    };

export async function runJevSmoke(opts: {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}): Promise<JevSmokeResult> {
  const env = opts.env ?? process.env;
  const rawLog = opts.log ?? ((line: string) => console.log(line));
  const key = (env.TYPESAFE_API_KEY ?? '').trim();
  const log = (line: string): void => {
    rawLog(redactSecrets(line, key.length >= 8 ? [key] : []));
  };
  if (!key) {
    const reason = 'TYPESAFE_API_KEY unset';
    log(`jev-smoke: skip (${reason})`);
    return { skipped: true, reason };
  }
  const fetchImpl = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
  if (!fetchImpl) {
    const reason = 'fetch unavailable';
    log(`jev-smoke: skip (${reason})`);
    return { skipped: true, reason };
  }
  const state = snakeSpec.create({ mode: 'solo', playerIds: ['demo'], seed: 1982 });
  const compact = compactSnakeState(state);
  if (!compact) {
    const reason = 'could not compact snake state';
    log(`jev-smoke: skip (${reason})`);
    return { skipped: true, reason };
  }
  const got = await askJev({
    apiKey: key,
    state: compact,
    questions: snakeJevQuestions(compact),
    fetchImpl,
  });
  if (!got.ok) {
    log(`jev-smoke: fail-closed (${got.reason})`);
    return { skipped: true, reason: got.reason };
  }
  const action = readChoice(got.body.answers, 'action');
  const dangerRaw = (got.body.answers as Record<string, unknown>).danger;
  const aggressionRaw = (got.body.answers as Record<string, unknown>).aggression;
  const danger =
    typeof dangerRaw === 'object' && dangerRaw !== null && typeof (dangerRaw as { noul?: unknown }).noul === 'number'
      ? (dangerRaw as { noul: number }).noul
      : undefined;
  const aggression =
    typeof aggressionRaw === 'object' &&
    aggressionRaw !== null &&
    typeof (aggressionRaw as { score?: unknown }).score === 'number'
      ? (aggressionRaw as { score: number }).score
      : undefined;
  const result = {
    skipped: false as const,
    choice: action?.choice ?? '',
    confidence: action?.confidence ?? Number.NaN,
    probabilities: action?.probabilities ?? {},
    danger,
    aggression,
  };
  log(
    `jev-smoke action=${result.choice} confidence=${result.confidence} probs=${JSON.stringify(result.probabilities)} danger=${danger ?? 'n/a'} aggression=${aggression ?? 'n/a'}`,
  );
  return result;
}
