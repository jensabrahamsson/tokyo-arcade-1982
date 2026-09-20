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
  NO_INPUT,
  SNAKE_GRID,
  snakeSpec,
  type GameStateBase,
  type PlayerInput,
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
  private cached: PlayerInput | null = null;
  private lastCallMs: number | null = null;
  private inflight = false;

  constructor(opts: JevSelfPlayOpts) {
    this.apiKey = opts.apiKey.trim();
    this.fetchImpl = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
    this.now = opts.now ?? (() => Date.now());
    this.minIntervalMs = opts.minIntervalMs ?? JEV_MIN_INTERVAL_MS;
    this.confidenceMin = opts.confidenceMin ?? JEV_CONFIDENCE_MIN;
    this.timeoutMs = opts.timeoutMs ?? JEV_TIMEOUT_MS;
  }

  covers(game: string): boolean {
    return game === JEV_GAME;
  }

  inputFor(game: string, state: GameStateBase, tick: number, fallback: PlayerInput): PlayerInput {
    if (game !== JEV_GAME) return fallback;
    try {
      const compact = compactSnakeState(state as SnakeState);
      if (!compact) return fallback;
      if (compact.legal.length === 0) return fallback;
      if (compact.legal.length === 1) {
        const dir = ACTION_DIRS[compact.legal[0]!];
        return { dir: { dx: dir.dx, dy: dir.dy }, button: false, seq: tick };
      }
      this.maybeRefresh(compact);
      const cached = this.cached;
      if (cached?.dir) {
        const a = dirToAction(cached.dir);
        if (a && compact.legal.includes(a)) return { dir: cached.dir, button: false, seq: tick };
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  private maybeRefresh(compact: CompactSnakeState): void {
    if (this.inflight) return;
    if (!this.apiKey || !this.fetchImpl) return;
    if (!rateLimitAllows(this.lastCallMs, this.now(), this.minIntervalMs)) return;
    this.inflight = true;
    this.lastCallMs = this.now();
    void this.refresh(compact).catch(() => {
      this.cached = null;
    }).finally(() => {
      this.inflight = false;
    });
  }

  private async refresh(compact: CompactSnakeState): Promise<void> {
    const fetchImpl = this.fetchImpl;
    if (!fetchImpl) return;
    const got = await askJev({
      apiKey: this.apiKey,
      state: compact,
      questions: snakeJevQuestions(compact),
      fetchImpl,
      timeoutMs: this.timeoutMs,
    });
    if (!got.ok) {
      this.cached = null;
      return;
    }
    const mapped = mapJevToInput(got.body.answers, compact.legal, NO_INPUT, 0, this.confidenceMin);
    this.cached = mapped.dir ? mapped : null;
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
