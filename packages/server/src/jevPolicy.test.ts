import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DIRS, GAME_IDS, REGISTRY, coastSpec, snakeSpec, type GameId, type GameStateBase, type SnakeState, type PlayerInput } from '@arkad/core';
import {
  ACTION_DIRS,
  JEV_CONFIDENCE_MIN,
  JEV_ENDPOINT,
  JEV_MIN_INTERVAL_MS,
  JEV_MODEL,
  JevSelfPlay,
  applyTypesafeEnv,
  askJev,
  compactSnakeState,
  dirToAction,
  jevSelfPlayFromEnv,
  legalSnakeActions,
  loadTypesafeEnvFile,
  mapJevToInput,
  parseDotEnv,
  rateLimitAllows,
  runJevSmoke,
  snakeJevQuestions,
  JEV_ADAPTERS,
  mapChoiceToInput,
} from './jevPolicy';
import { runAutoplayForAll } from './jevAutoplay';

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
    // lab pack 2026-09-20: Jev now covers every cabinet, not just snake
    expect(on!.covers('puck')).toBe(true);
    expect(on!.covers('coast')).toBe(true);
    expect(on!.covers('ping-pong')).toBe(false);
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

describe('parseDotEnv / .env.typesafe', () => {
  it('parses KEY=value, comments, export, quotes and CRLF', () => {
    const got = parseDotEnv(
      '\uFEFF# secret file\r\nexport TYPESAFE_API_KEY="abc def"\nARKAD_JEV_SELFPLAY=1\nnot a line\n=novalue\n',
    );
    expect(got).toEqual({ TYPESAFE_API_KEY: 'abc def', ARKAD_JEV_SELFPLAY: '1' });
  });

  it('fills blank env keys from file text and never overwrites a set key', () => {
    const env: Record<string, string | undefined> = { TYPESAFE_API_KEY: '', OTHER: 'keep' };
    applyTypesafeEnv(env, 'TYPESAFE_API_KEY=from-file\nOTHER=nope\n');
    expect(env.TYPESAFE_API_KEY).toBe('from-file');
    expect(env.OTHER).toBe('keep');
    applyTypesafeEnv(env, 'TYPESAFE_API_KEY=second\n');
    expect(env.TYPESAFE_API_KEY).toBe('from-file');
  });

  it('loadTypesafeEnvFile reads a temp .env.typesafe and no-ops when missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arkad-typesafe-'));
    try {
      writeFileSync(join(dir, '.env.typesafe'), 'TYPESAFE_API_KEY=file-key\n');
      const env: Record<string, string | undefined> = {};
      loadTypesafeEnvFile(env, [dir]);
      expect(env.TYPESAFE_API_KEY).toBe('file-key');
      const missing: Record<string, string | undefined> = {};
      loadTypesafeEnvFile(missing, [join(dir, 'no-such-dir')]);
      expect(missing.TYPESAFE_API_KEY).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runJevSmoke with an explicit empty env never fetches even if a key file exists on disk', async () => {
    const fetchImpl = vi.fn();
    const got = await runJevSmoke({ env: {}, fetchImpl, log: () => undefined });
    expect(got.skipped).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('gitignore lists .env.typesafe so the key file is never committed', () => {
    const gi = readFileSync(join(process.cwd(), '.gitignore'), 'utf8');
    expect(gi.split(/\r?\n/).map((l) => l.trim())).toContain('.env.typesafe');
  });
});

describe('jev adapters for all seven cabinets', () => {
  const playing = (id: string): GameStateBase => {
    const spec = REGISTRY[id as GameId]!;
    return { ...spec.create({ mode: 'solo', playerIds: ['demo'], seed: 1982 }), phase: 'playing' } as GameStateBase;
  };

  for (const id of GAME_IDS) {
    it(`${id}: adapter compacts to a payload with legal actions and a choice question`, () => {
      const adapter = JEV_ADAPTERS[id]!;
      expect(adapter).toBeDefined();
      const jev = adapter(playing(id));
      expect(jev).not.toBeNull();
      expect(jev!.legal.length).toBeGreaterThan(0);
      expect(jev!.payload).toBeTruthy();
      const q = jev!.questions(jev!.payload);
      const first = Object.values(q)[0]!;
      expect(first.type).toBe('choice');
      expect((first as { criteria: Record<string, string> }).criteria).toBeTruthy();
    });

    it(`${id}: toInput maps each legal action to a PlayerInput`, () => {
      const jev = JEV_ADAPTERS[id]!(playing(id));
      for (const a of jev!.legal) {
        const input = jev!.toInput(a, 42);
        expect(input).not.toBeNull();
        expect(typeof input!.button).toBe('boolean');
        expect(input!.seq).toBe(42);
      }
      expect(jev!.toInput('moon-walk', 1)).toBeNull();
    });
  }

  it('JevSelfPlay covers every cabinet and fails closed without a key', () => {
    const p = new JevSelfPlay({ apiKey: '' });
    for (const id of GAME_IDS) {
      expect(p.covers(id)).toBe(true);
      const fb: PlayerInput = { dir: DIRS.right, button: false, seq: 0 };
      const out = p.inputFor(id, playing(id), 10, fb);
      expect(out).toBeTruthy();
      expect(typeof out.button).toBe('boolean');
    }
  });

  it('a mocked Jev answer drives the coast cabinet and is remembered', async () => {
    let calls = 0;
    const fetchImpl = (async (_url: unknown, init: { body: string }) => {
      calls++;
      const sent = JSON.parse(init.body as string) as { questions: Record<string, { type: string }> };
      const actionKey = Object.keys(sent.questions)[0]!;
      const answers: Record<string, unknown> = {};
      for (const [k, q] of Object.entries(sent.questions)) {
        if (q.type === 'choice') answers[k] = { type: 'choice', choice: 'left', confidence: 0.9 };
        else if (q.type === 'noul') answers[k] = { type: 'noul', noul: 0.8 };
        else answers[k] = { type: 'score', score: 2 };
      }
      return jsonResponse({ model: 'jev-1.13.0', answers });
    }) as unknown as typeof fetch;
    const p = new JevSelfPlay({ apiKey: 'k', fetchImpl, minIntervalMs: 0 });
    let sawJevLeft = false;
    const state0 = { ...coastSpec.create({ mode: 'solo', playerIds: ['demo'], seed: 7 }), phase: 'playing' } as GameStateBase;
    let s = state0;
    for (let i = 0; i < 40 && !sawJevLeft; i++) {
      const input = p.inputFor('coast', s, i, { dir: null, button: true, seq: i });
      if (input.dir?.dx === -1) sawJevLeft = true;
      s = coastSpec.step(s as never, { demo: input }) as GameStateBase;
      await Promise.resolve();
    }
    expect(calls).toBeGreaterThan(0);
    expect(p.stats.ok).toBeGreaterThan(0);
    expect(sawJevLeft).toBe(true);
  });

  it('myriad carries a per-game confidence floor below the global one (5-choice cap)', () => {
    const jev = JEV_ADAPTERS.myriad!(playing('myriad'))!;
    expect(jev.confidenceMin).toBeDefined();
    expect(jev.confidenceMin!).toBeLessThan(JEV_CONFIDENCE_MIN);
    expect(jev.confidenceMin!).toBeGreaterThanOrEqual(0.25);
    const fb: PlayerInput = { dir: DIRS.right, button: false, seq: 0 };
    const conf = jev.confidenceMin! + 0.02;
    const got = mapChoiceToInput({ action: { choice: 'fire', confidence: conf } }, jev, fb, 5);
    expect(got.button).toBe(true);
    expect(got.seq).toBe(5);
    const noise = mapChoiceToInput({ action: { choice: 'fire', confidence: 0.2 } }, jev, fb, 6);
    expect(noise).toEqual(fb);
  });

  it('JevSelfPlay honours the per-game floor for myriad but keeps the global floor for snake', async () => {
    const fetchImpl = (async (_url: unknown, init: { body: string }) => {
      const sent = JSON.parse(init.body as string) as { state: { game: string } };
      const choice = sent.state.game === 'myriad' ? 'fire' : 'up';
      return jsonResponse({
        model: 'jev-1.13.0',
        answers: { action: { type: 'choice', choice, confidence: 0.3 } },
      });
    }) as unknown as typeof fetch;
    const myriadBot = new JevSelfPlay({ apiKey: 'k', fetchImpl, minIntervalMs: 0 });
    const ms = playing('myriad');
    myriadBot.inputFor('myriad', ms, 1, { dir: null, button: false, seq: 1 });
    await flush();
    const held = myriadBot.inputFor('myriad', ms, 2, { dir: null, button: false, seq: 2 });
    expect(held.button).toBe(true);
    expect(myriadBot.stats.ok).toBe(1);
    const snakeBot = new JevSelfPlay({ apiKey: 'k', fetchImpl, minIntervalMs: 0 });
    const out = snakeBot.inputFor('snake', liveSnake(), 1, fallback);
    await flush();
    expect(out).toEqual(fallback);
    expect(snakeBot.stats.ok).toBe(0);
  });

  it('low-confidence and junk answers never override the fallback', () => {
    for (const conf of [0.1, Number.NaN]) {
      const input = mapChoiceToInput(
        { action: { choice: 'left', confidence: conf } },
        { legal: ['left', 'right'], toInput: (c, t) => (c === 'left' ? { dir: DIRS.left, button: false, seq: t } : null) },
        { dir: DIRS.right, button: false, seq: 0 },
        9,
      );
      expect(input.dir).toEqual(DIRS.right);
    }
  });
});

describe('one-minute autoplay harness', () => {
  it('runs ticks for every game with a fake fetch and reports summaries', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        model: 'jev-1.13.0',
        answers: { action: { type: 'choice', choice: 'stay', confidence: 0.9 } },
      })) as unknown as typeof fetch;
    const summaries = await runAutoplayForAll({
      apiKey: 'k',
      fetchImpl,
      secondsPerGame: 0.05,
      minIntervalMs: 0,
      sleep: async () => Promise.resolve(),
      now: () => Date.now(),
      log: () => undefined,
    });
    expect(summaries).toHaveLength(GAME_IDS.length);
    for (const s of summaries) {
      expect(s.ticks).toBeGreaterThan(0);
      expect(s.jevCalls).toBeGreaterThan(0);
    }
  });

  it('without a key the harness skips every game and reports skipped', async () => {
    const summaries = await runAutoplayForAll({ apiKey: '', secondsPerGame: 0.02, log: () => undefined });
    expect(summaries.every((s) => s.skipped)).toBe(true);
  });
});
