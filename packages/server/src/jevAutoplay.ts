/**
 * One-minute automatic play harness (Jens lab 2026-09-20): drives every
 * cabinet's attract self-play through JevSelfPlay for N seconds per game
 * and prints an action/confidence summary. Missing key / HTTP failures
 * fail closed to spec.demo, exactly like the live hall.
 */
import { GAME_IDS, NO_INPUT, REGISTRY, type GameId } from '@arkad/core';
import { JevSelfPlay } from './jevPolicy';

export interface AutoplaySummary {
  game: string;
  skipped: boolean;
  reason?: string;
  ticks: number;
  jevCalls: number;
  ok: number;
  failed: number;
  avgConfidence: number | null;
  topChoices: [string, number][];
}

export interface AutoplayOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  secondsPerGame?: number;
  minIntervalMs?: number;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const sleepReal = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function runAutoplayForGame(
  game: GameId,
  opts: AutoplayOptions,
): Promise<AutoplaySummary> {
  const seconds = opts.secondsPerGame ?? 60;
  const log = opts.log ?? ((l: string) => console.log(l));
  const sleep = opts.sleep ?? sleepReal;
  const now = opts.now ?? (() => Date.now());
  const spec = REGISTRY[game];
  const policy = new JevSelfPlay({
    apiKey: opts.apiKey,
    fetchImpl: opts.fetchImpl,
    minIntervalMs: opts.minIntervalMs ?? 125,
    now,
  });
  const base = { game, ticks: 0, jevCalls: 0, ok: 0, failed: 0, avgConfidence: null as number | null, topChoices: [] as [string, number][] };
  if (!spec) return { ...base, skipped: true, reason: 'unknown game' };

  const fresh = (seed: number) => spec.create({ mode: 'solo', playerIds: ['demo'], seed });
  let state = fresh(1982);
  let tick = 0;
  const endAt = now() + seconds * 1000;
  while (now() < endAt) {
    const fallback = spec.demo ? spec.demo(state, tick) : NO_INPUT;
    const input = policy.inputFor(game, state, tick, fallback);
    let next: typeof state;
    try {
      next = spec.step(state, { demo: input });
    } catch {
      next = fresh(1982 + tick);
    }
    if (next.phase === 'gameOver' || next.phase === 'attract') {
      // keep the cabinet playing: re-deal like the hall does
      next = fresh(1982 + ((tick * 7) >>> 3));
    }
    state = next;
    tick++;
    await sleep(4);
  }
  const s = policy.stats;
  const summary: AutoplaySummary = {
    game,
    skipped: false,
    ticks: tick,
    jevCalls: s.calls,
    ok: s.ok,
    failed: s.failed,
    avgConfidence: s.confN > 0 ? Math.round((s.confSum / s.confN) * 100) / 100 : null,
    topChoices: Object.entries(s.choices).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
  log(
    `autoplay ${game}: ticks=${summary.ticks} calls=${summary.jevCalls} ok=${summary.ok} failed=${summary.failed}` +
      ` avgConfidence=${summary.avgConfidence ?? 'n/a'} top=${summary.topChoices.map(([c, n]) => `${c}x${n}`).join(',') || 'none'}`,
  );
  return summary;
}

export async function runAutoplayForAll(opts: AutoplayOptions): Promise<AutoplaySummary[]> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const key = (opts.apiKey ?? '').trim();
  if (!key) {
    const skipped = GAME_IDS.map(
      (game): AutoplaySummary => ({
        game,
        skipped: true,
        reason: 'TYPESAFE_API_KEY unset',
        ticks: 0,
        jevCalls: 0,
        ok: 0,
        failed: 0,
        avgConfidence: null,
        topChoices: [],
      }),
    );
    for (const g of GAME_IDS) log(`autoplay ${g}: skip (TYPESAFE_API_KEY unset)`);
    return skipped;
  }
  const out: AutoplaySummary[] = [];
  for (const game of GAME_IDS) out.push(await runAutoplayForGame(game, opts));
  return out;
}
