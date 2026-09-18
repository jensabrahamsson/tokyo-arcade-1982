import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServiceStore } from './service';
import { stockholmDate, rollDay } from './dayclock';

describe('stockholm day bucket (R31)', () => {
  it('midnight in Stockholm rolls the bucket', () => {
    // 2026-09-17 23:30 UTC = 2026-09-18 01:30 local (CEST, UTC+2)
    expect(stockholmDate(Date.UTC(2026, 8, 17, 23, 30))).toBe('2026-09-18');
    // 2026-09-18 21:30 UTC = 2026-09-18 23:30 local (CEST)
    expect(stockholmDate(Date.UTC(2026, 8, 18, 21, 30))).toBe('2026-09-18');
    // 2026-01-04 23:30 UTC = 2026-01-05 00:30 local (CET, UTC+1)
    expect(stockholmDate(Date.UTC(2026, 0, 4, 23, 30))).toBe('2026-01-05');
  });

  it('rollDay keeps same-day counters and zeroes them on rollover', () => {
    expect(rollDay('2026-09-18', 4, 9, '2026-09-18')).toEqual({ day: '2026-09-18', playsToday: 4, coinsToday: 9 });
    expect(rollDay('2026-09-18', 4, 9, '2026-09-19')).toEqual({ day: '2026-09-19', playsToday: 0, coinsToday: 0 });
    expect(rollDay('', 4, 9, '2026-09-19')).toEqual({ day: '2026-09-19', playsToday: 0, coinsToday: 0 });
  });
});

describe('service day counters (R31.2)', () => {
  it('round-trips through disk and keeps lifetime totals on rollover', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arkad-day-'));
    const p = join(dir, 'service.json');
    const s = new ServiceStore(p);
    s.addCoin();
    s.addCoin();
    s.addPlay();
    const snap = s.snapshot();
    expect(snap.coins).toBe(2);
    expect(snap.coinsToday).toBe(2);
    expect(snap.plays).toBe(1);
    expect(snap.playsToday).toBe(1);
    expect(snap.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // force a rollover: rewrite the persisted day into the past
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
    raw.day = '1999-12-31';
    writeFileSync(p, JSON.stringify(raw));
    const s2 = new ServiceStore(p);
    s2.addCoin();
    const after = s2.snapshot();
    expect(after.coins).toBe(3); // lifetime kept
    expect(after.coinsToday).toBe(1); // day bucket fresh
    rmSync(dir, { recursive: true, force: true });
  });

  it('junk or missing day fields fall back safely', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arkad-day2-'));
    const p = join(dir, 'service.json');
    writeFileSync(p, JSON.stringify({ coins: 5, day: 'not-a-date', playsToday: 'lots', coinsToday: -3 }));
    const s = new ServiceStore(p);
    const snap = s.snapshot();
    expect(snap.coins).toBe(5);
    expect(snap.playsToday).toBe(0);
    expect(snap.coinsToday).toBe(0);
    s.addCoin();
    expect(s.snapshot().coinsToday).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
});
