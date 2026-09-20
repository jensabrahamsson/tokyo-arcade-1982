/**
 * TypeSafe Jev self-play for the snake attract cabinet.
 * Lives on the server (fetch/I/O). Core stays pure: missing key or HTTP
 * failure fail-closed to spec.demo. No images — compact JSON state only.
 *
 * Local key file: repo-root `.env.typesafe` (gitignored). Never log the value.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIRS,
  MAZE,
  MAZE_H,
  MAZE_W,
  NO_INPUT,
  RIVER_W,
  SNAKE_GRID,
  coastSpec,
  snakeSpec,
  type BlockState,
  type CoastState,
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
export const JEV_TIMEOUT_MS = 1500;
export const JEV_GAME = 'snake';

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
  if (!Number.isFinite(action.confidence) || action.confidence < confidenceMin) return fallback;
  const dir = ACTION_DIRS[action.choice as SnakeAction];
  if (!dir) return fallback;
  return { dir: { dx: dir.dx, dy: dir.dy }, button: false, seq: tick };
}

export type AskJevResult =
  | { ok: true; body: { model: string; answers: Record<string, unknown> } }
  | { ok: false; reason: string };

function isJevBody(raw: unknown): raw is { model: string; answers: Record<string, unknown> } {
  if (typeof raw !== 'object' || raw === null) return false;
  const o = raw as Record<string, unknown>;
  return typeof o.model === 'string' && typeof o.answers === 'object' && o.answers !== null;
}

export async function askJev(opts: {
  apiKey: string;
  state: unknown;
  questions: Record<string, unknown>;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}): Promise<AskJevResult> {
  const key = opts.apiKey.trim();
  if (!key) return { ok: false, reason: 'missing_key' };
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
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const body: unknown = await res.json();
    if (!isJevBody(body)) return { ok: false, reason: 'bad_body' };
    return { ok: true, body };
  } catch {
    return { ok: false, reason: 'network' };
  }
}


/**
 * Per-cabinet adapters (all seven games, Jens lab pack 2026-09-20):
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

export const blockAdapter: GameJevAdapter = (raw) => {
  const s = raw as BlockState;
  const id = Object.keys(s.paddles)[0];
  if (!id) return null;
  const pad = s.paddles[id]!;
  const center = pad.x + pad.span / 2;
  const legal = center <= 0.5 ? ['stay', 'right'] : center >= 29.5 ? ['stay', 'left'] : ['stay', 'left', 'right'];
  const payload = {
    game: 'block',
    paddleCenter: Math.round(center * 10) / 10,
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
        'Move the paddle to keep the ball in play; line up angled hits when safe.',
        legal,
        { left: 'Move paddle left.', right: 'Move paddle right.', stay: 'Hold position; the ball is aligned.' },
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
  const legal = ['stay', 'left', 'right', 'fire'];
  const payload = {
    game: 'galaxy',
    player: { x: Math.round(s.player.x * 10) / 10 },
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
        'Defend the sky: line up with the lowest alien and shoot; dodge descending aliens.',
        legal,
        { left: 'Move left.', right: 'Move right.', stay: 'Hold course.', fire: 'Fire now (aligned with a target).' },
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
  const legal = ['up', 'down', 'left', 'right', 'fire'];
  const payload = {
    game: 'myriad',
    player: { x: Math.round(s.player.x), y: Math.round(s.player.y) },
    segments: s.segments.slice(0, 8).map((p) => ({ x: p.x, y: p.y })),
    mushrooms: Object.keys(s.mushrooms).length,
    score: s.scores[Object.keys(s.scores)[0] ?? ''] ?? 0,
  };
  return {
    game: 'myriad',
    payload,
    legal,
    // 5-choice questions cap Jev confidence near 0.4; 0.25 stays well above uniform (0.2)
    confidenceMin: 0.25,
    questions: () => ({
      ...choiceQ('Blast the bug chain bottom-up; dodge segments, shoot mushrooms in the way.', legal, {
        up: 'Move up.',
        down: 'Move down.',
        left: 'Move left.',
        right: 'Move right.',
        fire: 'Shoot straight up.',
      }),
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
  const legal = ['left', 'straight', 'right'];
  const payload = {
    game: 'coast',
    playerX: Math.round(s.playerX * 100) / 100,
    speed: Math.round(s.speed),
    dist: Math.round(s.dist),
    timeLeft: s.timeLeft,
    checkpoints: s.checkpoints,
    nextObstacles: s.obstacles
      .filter((o) => !o.hit && o.d > s.dist && o.d - s.dist < 40)
      .map((o) => ({ ahead: Math.round(o.d - s.dist), x: Math.round(o.x * 10) / 10 })),
  };
  return {
    game: 'coast',
    payload,
    legal,
    questions: () => ({
      ...choiceQ('Coast toward LO Castle on full throttle; steer around roadside obstacles and stay on the road.', legal, {
        left: 'Steer left.',
        straight: 'Hold the line (full throttle).',
        right: 'Steer right.',
      }),
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

export const JEV_ADAPTERS: Partial<Record<GameId, GameJevAdapter>> = {
  snake: snakeAdapter,
  puck: puckAdapter,
  block: blockAdapter,
  galaxy: galaxyAdapter,
  river: riverAdapter,
  myriad: myriadAdapter,
  coast: coastAdapter,
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
  if (!Number.isFinite(action.confidence) || action.confidence < floor) return fallback;
  return jev.toInput(action.choice, tick) ?? fallback;
}

export interface JevSelfPlayOpts {
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  minIntervalMs?: number;
  confidenceMin?: number;
  timeoutMs?: number;
}

export class JevSelfPlay implements DemoInputPolicy {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly now: () => number;
  private readonly minIntervalMs: number;
  private readonly confidenceMin: number;
  private readonly timeoutMs: number;
  private cached = new Map<string, PlayerInput>();
  private lastCallMs: number | null = null;
  private inflight = false;
  /** observability for the autoplay harness: counters since construction */
  readonly stats = { calls: 0, ok: 0, failed: 0, confSum: 0, confN: 0, choices: {} as Record<string, number> };

  constructor(opts: JevSelfPlayOpts) {
    this.apiKey = opts.apiKey.trim();
    this.fetchImpl = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
    this.now = opts.now ?? (() => Date.now());
    this.minIntervalMs = opts.minIntervalMs ?? JEV_MIN_INTERVAL_MS;
    this.confidenceMin = opts.confidenceMin ?? JEV_CONFIDENCE_MIN;
    this.timeoutMs = opts.timeoutMs ?? JEV_TIMEOUT_MS;
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
      const cached = this.cached.get(game);
      if (cached) {
        const choice = choiceFromInput(cached);
        if (choice && jev.legal.includes(choice)) {
          const fresh = jev.toInput(choice, tick);
          if (fresh) return fresh;
        }
      }
      return fallback;
    } catch {
      return fallback;
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
    if (!got.ok) {
      this.stats.failed += 1;
      this.cached.delete(jev.game);
      return;
    }
    const action = readChoice(got.body.answers, 'action');
    const floor = jev.confidenceMin ?? this.confidenceMin;
    if (
      action &&
      Number.isFinite(action.confidence) &&
      action.confidence >= floor &&
      jev.legal.includes(action.choice)
    ) {
      const mapped = jev.toInput(action.choice, 0);
      this.stats.ok += 1;
      this.stats.confSum += action.confidence;
      this.stats.confN += 1;
      this.stats.choices[`${jev.game}:${action.choice}`] = (this.stats.choices[`${jev.game}:${action.choice}`] ?? 0) + 1;
      if (mapped) this.cached.set(jev.game, mapped);
    } else {
      this.stats.failed += 1;
      this.cached.delete(jev.game);
    }
  }
}

/** coarse action word for a mapped input, used to re-validate cached sticks */
function choiceFromInput(input: PlayerInput): string | null {
  if (input.button && !input.dir) return 'fire';
  if (!input.dir) return input.button ? 'straight' : null;
  if (input.dir.dx === -1) return 'left';
  if (input.dir.dx === 1) return 'right';
  if (input.dir.dy === -1) return 'up';
  if (input.dir.dy === 1) return 'down';
  return null;
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
  const log = opts.log ?? ((line: string) => console.log(line));
  const key = (env.TYPESAFE_API_KEY ?? '').trim();
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
