import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HighScoreStore, MAX_ENTRIES } from './highscores';

describe('HighScoreStore', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-scores-'));
    path = join(dir, 'scores.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('returns empty list when there are no scores', () => {
    const store = new HighScoreStore(path);
    expect(store.top('snake', 'solo')).toEqual([]);
  });

  it('sorts descending by score', () => {
    const store = new HighScoreStore(path);
    store.add('snake', 'solo', 'BEN', 100);
    store.add('snake', 'solo', 'AKIRA', 900);
    store.add('snake', 'solo', 'MIO', 500);
    expect(store.top('snake', 'solo').map((e) => e.score)).toEqual([900, 500, 100]);
  });

  it('keeps games and modes separate', () => {
    const store = new HighScoreStore(path);
    store.add('snake', 'solo', 'A', 10);
    store.add('snake', 'versus', 'B', 20);
    store.add('puck', 'solo', 'C', 30);
    expect(store.top('snake', 'solo').map((e) => e.name)).toEqual(['A']);
    expect(store.top('puck', 'solo').map((e) => e.name)).toEqual(['C']);
    expect(store.top('snake', 'versus')).toHaveLength(1);
  });

  it('trims to the top N entries', () => {
    const store = new HighScoreStore(path);
    for (let i = 0; i < MAX_ENTRIES + 5; i++) store.add('river', 'solo', `P${i}`, i * 10);
    const top = store.top('river', 'solo');
    expect(top).toHaveLength(MAX_ENTRIES);
    expect(top[0]?.score).toBe((MAX_ENTRIES + 4) * 10);
  });

  it('persists across instances', () => {
    const a = new HighScoreStore(path);
    a.add('galaxy', 'versus', 'AKIRA', 1234);
    const b = new HighScoreStore(path);
    expect(b.top('galaxy', 'versus')[0]).toMatchObject({ name: 'AKIRA', score: 1234 });
  });

  it('top() returns a copy; mutating it does not corrupt the store', () => {
    const store = new HighScoreStore(path);
    store.add('snake', 'solo', 'AKIRA', 100);
    const top = store.top('snake', 'solo');
    top.push({ name: 'EVIL', score: 99999, date: '1982-05-05' });
    expect(store.top('snake', 'solo')).toHaveLength(1);
    expect(store.top('snake', 'solo')[0]?.name).toBe('AKIRA');
  });

  it('ignores zero scores (no junk entries)', () => {
    const store = new HighScoreStore(path);
    store.add('block', 'solo', 'ZERO', 0);
    expect(store.top('block', 'solo')).toEqual([]);
  });

  it('rejects non-finite scores (P2-5)', () => {
    const store = new HighScoreStore(path);
    store.add('block', 'solo', 'INF', Infinity);
    store.add('block', 'solo', 'NAN', NaN);
    store.add('block', 'solo', 'NEG', -1);
    expect(store.top('block', 'solo')).toEqual([]);
    store.add('block', 'solo', 'OK', 10);
    expect(store.top('block', 'solo').map((e) => e.name)).toEqual(['OK']);
  });

  it('drops non-finite scores from a hand-edited board file (P2-5)', () => {
    // JSON parses 1e999 as Infinity — the load filter is the edge that catches it
    writeFileSync(path, '{"snake:solo":[{"name":"A","score":1e999},{"name":"B","score":50}]}');
    const store = new HighScoreStore(path);
    expect(store.top('snake', 'solo').map((e) => e.name)).toEqual(['B']);
  });
});
