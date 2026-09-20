import { describe, it, expect, vi } from 'vitest';
import { DIRS, snakeSpec, type SnakeState, type PlayerInput } from '@arkad/core';
import {
  ACTION_DIRS,
  JEV_CONFIDENCE_MIN,
  JEV_ENDPOINT,
  JEV_MIN_INTERVAL_MS,
  JEV_MODEL,
  JevSelfPlay,
  askJev,
  compactSnakeState,
  dirToAction,
  jevSelfPlayFromEnv,
  legalSnakeActions,
  mapJevToInput,
  rateLimitAllows,
  runJevSmoke,
  snakeJevQuestions,
} from './jevPolicy';

const cfg = { mode: 'solo' as const, playerIds: ['demo'], seed: 1982 };
const fallback: PlayerInput = { dir: DIRS.right, button: false, seq: 0 };

const liveSnake = (): SnakeState => {
  const s = snakeSpec.create(cfg);
  return { ...s, phase: 'playing' };
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const jevOk = {
  model: 'jev-1.13.0',
  answers: {
    action: {
      type: 'choice' as const,
      choice: 'up',
      confidence: 0.82,
      probabilities: { up: 0.7, down: 0.2, right: 0.1 },
    },
    danger: { type: 'noul' as const, noul: 0.12 },
    aggression: {
      type: 'score' as const,
      score: 1.1,
      confidence: 0.6,
      legend: { '0': 'safe', '1': 'balanced', '2': 'greedy' },
      probabilities: { '0': 0.1, '1': 0.7, '2': 0.2 },
    },
  },
  usage: { input_tokens: 40, output_tokens: 12 },
};

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('compactSnakeState', () => {
  it('is JSON-serializable, has no images, and does not mutate the snapshot', () => {
    const s = liveSnake();
    const before = JSON.stringify(s);
    const compact = compactSnakeState(s);
    expect(compact).not.toBeNull();
    expect(compact!.game).toBe('snake');
    expect(compact!.head).toEqual(s.snakes['demo']!.body[0]);
    expect(compact!.dir).toBe('right');
    expect(compact!.legal).toEqual(['up', 'down', 'right']);
    const round = JSON.parse(JSON.stringify(compact)) as typeof compact;
    expect(round).toEqual(compact);
    expect(JSON.stringify(compact)).not.toMatch(/data:image|\.png|jpeg|webp/i);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('returns null when the snake is dead or missing', () => {
    const s = liveSnake();
    const dead: SnakeState = {
      ...s,
      snakes: { demo: { ...s.snakes['demo']!, alive: false } },
    };
    expect(compactSnakeState(dead)).toBeNull();
    expect(compactSnakeState({ ...s, snakes: {} })).toBeNull();
  });
});

describe('legalSnakeActions', () => {
  it('never includes a 180 reverse', () => {
    const s = liveSnake();
    expect(s.snakes['demo']!.dir).toEqual(DIRS.right);
    expect(legalSnakeActions(s)).not.toContain('left');
    expect(legalSnakeActions(s)).toEqual(['up', 'down', 'right']);
  });

  it('excludes an immediate body cell', () => {
    const s = liveSnake();
    const sn = s.snakes['demo']!;
    const blocked: SnakeState = {
      ...s,
      snakes: {
        demo: {
          ...sn,
          dir: DIRS.right,
          body: [
            { x: 5, y: 5 },
            { x: 4, y: 5 },
            { x: 3, y: 5 },
            { x: 5, y: 4 },
            { x: 5, y: 3 },
          ],
        },
      },
    };
    expect(legalSnakeActions(blocked)).not.toContain('up');
    expect(legalSnakeActions(blocked)).not.toContain('left');
    expect(legalSnakeActions(blocked)).toContain('down');
    expect(legalSnakeActions(blocked)).toContain('right');
  });

  it('wraps in solo and rejects walls in versus', () => {
    const s = liveSnake();
    const sn = s.snakes['demo']!;
    const atTop = (mode: 'solo' | 'versus'): SnakeState => ({
      ...s,
      mode,
      snakes: {
        demo: {
          ...sn,
          dir: DIRS.right,
          body: [
            { x: 5, y: 0 },
            { x: 4, y: 0 },
            { x: 3, y: 0 },
            { x: 2, y: 0 },
          ],
        },
      },
    });
    expect(legalSnakeActions(atTop('solo'))).toContain('up');
    expect(legalSnakeActions(atTop('versus'))).not.toContain('up');
  });
});

describe('snakeJevQuestions', () => {
  it('asks choice + noul danger + score aggression in one map, only over legal actions', () => {
    const compact = compactSnakeState(liveSnake())!;
    const q = snakeJevQuestions(compact);
    expect(q.action?.type).toBe('choice');
    expect(q.danger?.type).toBe('noul');
    expect(q.aggression?.type).toBe('score');
    expect(Object.keys(q.action && q.action.type === 'choice' ? q.action.criteria : {})).toEqual(compact.legal);
    expect(q.action && q.action.type === 'choice' ? q.action.criteria : {}).not.toHaveProperty('left');
  });
});

describe('mapJevToInput', () => {
  const legal = ['up', 'down', 'right'] as const;

  it('maps a confident legal choice to a stick dir', () => {
    const got = mapJevToInput(jevOk.answers, legal, fallback, 9);
    expect(got.dir).toEqual(ACTION_DIRS.up);
    expect(got.button).toBe(false);
    expect(got.seq).toBe(9);
  });

  it('falls back below the confidence threshold', () => {
    const answers = {
      action: { type: 'choice', choice: 'up', confidence: JEV_CONFIDENCE_MIN - 0.01, probabilities: { up: 0.4 } },
    };
    expect(mapJevToInput(answers, legal, fallback, 1)).toEqual(fallback);
  });

  it('falls back on an illegal or reverse choice', () => {
    const answers = {
      action: { type: 'choice', choice: 'left', confidence: 0.99, probabilities: { left: 1 } },
    };
    expect(mapJevToInput(answers, legal, fallback, 1)).toEqual(fallback);
  });

  it('falls back on garbage answers', () => {
    expect(mapJevToInput(null, legal, fallback, 1)).toEqual(fallback);
    expect(mapJevToInput({ action: { type: 'noul', noul: 1 } }, legal, fallback, 1)).toEqual(fallback);
    expect(mapJevToInput({ action: { type: 'choice', choice: 'up', confidence: Number.NaN } }, legal, fallback, 1)).toEqual(
      fallback,
    );
  });
});

describe('rateLimitAllows', () => {
  it('allows the first call and then enforces the interval', () => {
    expect(rateLimitAllows(null, 0)).toBe(true);
    expect(rateLimitAllows(0, JEV_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(rateLimitAllows(0, JEV_MIN_INTERVAL_MS)).toBe(true);
  });
});

describe('jevSelfPlayFromEnv', () => {
  it('is off unless ARKAD_JEV_SELFPLAY is exactly 1', () => {
    expect(jevSelfPlayFromEnv({})).toBeUndefined();
    expect(jevSelfPlayFromEnv({ ARKAD_JEV_SELFPLAY: '0' })).toBeUndefined();
    expect(jevSelfPlayFromEnv({ ARKAD_JEV_SELFPLAY: 'true' })).toBeUndefined();
    const on = jevSelfPlayFromEnv({ ARKAD_JEV_SELFPLAY: '1' });
    expect(on).toBeInstanceOf(JevSelfPlay);
    expect(on!.covers('snake')).toBe(true);
    expect(on!.covers('puck')).toBe(false);
  });
});

describe('askJev', () => {
  it('does not fetch when the key is missing (fail-closed)', async () => {
    const fetchImpl = vi.fn();
    const got = await askJev({ apiKey: '  ', state: { game: 'snake' }, questions: {}, fetchImpl });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.reason).toBe('missing_key');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('POSTs jev-latest with bearer auth and compact JSON state', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(JEV_ENDPOINT);
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer test-key');
      expect(headers.get('Content-Type')).toBe('application/json');
      const body = JSON.parse(String(init?.body)) as { model: string; state: unknown; questions: unknown };
      expect(body.model).toBe(JEV_MODEL);
      expect(body.state).toEqual({ game: 'snake' });
      expect(body.questions).toEqual({ action: { type: 'choice' } });
      return jsonResponse(jevOk);
    });
    const got = await askJev({
      apiKey: 'test-key',
      state: { game: 'snake' },
      questions: { action: { type: 'choice' } },
      fetchImpl,
    });
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.body.answers.action).toMatchObject({ choice: 'up', confidence: 0.82 });
  });

  it('fail-closes on HTTP and network errors', async () => {
    const http = await askJev({
      apiKey: 'k',
      state: {},
      questions: {},
      fetchImpl: async () => jsonResponse({ error: 'nope' }, 401),
    });
    expect(http.ok).toBe(false);
    if (!http.ok) expect(http.reason).toBe('http_401');
    const net = await askJev({
      apiKey: 'k',
      state: {},
      questions: {},
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    expect(net.ok).toBe(false);
    if (!net.ok) expect(net.reason).toBe('network');
  });
});

describe('JevSelfPlay', () => {
  it('uses the existing demo bot when the API key is missing (no fetch)', () => {
    const fetchImpl = vi.fn();
    const bot = new JevSelfPlay({ apiKey: '', fetchImpl, now: () => 0 });
    const got = bot.inputFor('snake', liveSnake(), 3, fallback);
    expect(got).toEqual(fallback);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a mock classifier onto cached stick input and rate-limits refetch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(jevOk));
    let now = 0;
    const bot = new JevSelfPlay({ apiKey: 'k', fetchImpl, now: () => now, minIntervalMs: 100 });
    const s = liveSnake();
    expect(bot.inputFor('snake', s, 1, fallback).dir).toEqual(fallback.dir);
    await flush();
    const held = bot.inputFor('snake', s, 2, fallback);
    expect(held.dir).toEqual(DIRS.up);
    expect(held.seq).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now = 50;
    bot.inputFor('snake', s, 3, fallback);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now = 100;
    bot.inputFor('snake', s, 4, fallback);
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const posted = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]?.body)) as {
      state: { game: string };
      questions: Record<string, { type: string }>;
    };
    expect(posted.state.game).toBe('snake');
    expect(posted.questions.action?.type).toBe('choice');
    expect(posted.questions.danger?.type).toBe('noul');
    expect(posted.questions.aggression?.type).toBe('score');
  });

  it('does not call Jev when only one legal action remains', () => {
    const fetchImpl = vi.fn();
    const bot = new JevSelfPlay({ apiKey: 'k', fetchImpl, now: () => 0 });
    const s = liveSnake();
    const sn = s.snakes['demo']!;
    // wall of body on up/down, heading right — only right is legal
    // (tail is extra so the down cell is not the vacating tail)
    const tight: SnakeState = {
      ...s,
      snakes: {
        demo: {
          ...sn,
          dir: DIRS.right,
          body: [
            { x: 5, y: 5 },
            { x: 4, y: 5 },
            { x: 5, y: 4 },
            { x: 5, y: 6 },
            { x: 6, y: 6 },
          ],
        },
      },
    };
    expect(legalSnakeActions(tight)).toEqual(['right']);
    const got = bot.inputFor('snake', tight, 8, fallback);
    expect(got.dir).toEqual(DIRS.right);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('drops a stale cache that would reverse, and fails closed after HTTP errors', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(jevOk))
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
    let now = 0;
    const bot = new JevSelfPlay({ apiKey: 'k', fetchImpl, now: () => now, minIntervalMs: 10 });
    const s = liveSnake();
    bot.inputFor('snake', s, 1, fallback);
    await flush();
    expect(bot.inputFor('snake', s, 2, fallback).dir).toEqual(DIRS.up);
    // cached 'up' is illegal once the snake is heading down (would reverse)
    const goingDown: SnakeState = {
      ...s,
      snakes: { demo: { ...s.snakes['demo']!, dir: DIRS.down } },
    };
    expect(dirToAction(DIRS.up)).toBe('up');
    expect(legalSnakeActions(goingDown)).not.toContain('up');
    expect(bot.inputFor('snake', goingDown, 3, fallback)).toEqual(fallback);
    now = 50;
    bot.inputFor('snake', s, 4, fallback);
    await flush();
    expect(bot.inputFor('snake', s, 5, fallback)).toEqual(fallback);
  });

  it('never throws into the tick loop', () => {
    const fetchImpl = vi.fn(() => {
      throw new Error('sync fetch boom');
    });
    const bot = new JevSelfPlay({ apiKey: 'k', fetchImpl, now: () => 0 });
    expect(() => bot.inputFor('snake', liveSnake(), 1, fallback)).not.toThrow();
    expect(bot.inputFor('puck', liveSnake(), 1, fallback)).toEqual(fallback);
  });
});

describe('runJevSmoke', () => {
  it('skips when TYPESAFE_API_KEY is unset (no live API in CI)', async () => {
    const fetchImpl = vi.fn();
    const lines: string[] = [];
    const got = await runJevSmoke({ env: {}, fetchImpl, log: (l) => lines.push(l) });
    expect(got.skipped).toBe(true);
    if (got.skipped) expect(got.reason).toMatch(/TYPESAFE_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lines.join('\n')).toMatch(/skip/i);
  });

  it('prints action probabilities from a mock classifier', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(jevOk));
    const lines: string[] = [];
    const got = await runJevSmoke({
      env: { TYPESAFE_API_KEY: 'k' },
      fetchImpl,
      log: (l) => lines.push(l),
    });
    expect(got.skipped).toBe(false);
    if (!got.skipped) {
      expect(got.choice).toBe('up');
      expect(got.probabilities.up).toBe(0.7);
      expect(got.danger).toBe(0.12);
    }
    expect(lines.join('\n')).toMatch(/up/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
