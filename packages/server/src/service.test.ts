import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServiceStore } from './service';
import { Arcade } from './arcade';
import { HighScoreStore } from './highscores';
import type { ServerMessage, RosterMsg } from '@arkad/core';

describe('ServiceStore (R16)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-svc-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('defaults to coin mode with zero counters', () => {
    const s = new ServiceStore(join(dir, 'service.json'));
    // R24 added outOfOrder, R31 the day bucket, R42 the sticker to the shape
    expect(s.snapshot()).toEqual({
      plays: 0, coins: 0, freePlay: false, outOfOrder: [], day: '', playsToday: 0, coinsToday: 0, note: '',
    });
  });

  it('persists counters and mode across reloads', () => {
    const s = new ServiceStore(join(dir, 'service.json'));
    s.addCoin();
    s.addCoin();
    s.addPlay();
    s.setFreePlay(true);
    const t = new ServiceStore(join(dir, 'service.json'));
    // R24 added outOfOrder, R31 the day counters to the persisted shape;
    // day is the live Stockholm bucket, asserted by shape not value
    const snap = t.snapshot();
    expect({ ...snap, day: 'today' }).toEqual({
      plays: 1, coins: 2, freePlay: true, outOfOrder: [], day: 'today', playsToday: 1, coinsToday: 2, note: '',
    });
  });

  it('survives corrupt files without throwing', () => {
    writeFileSync(join(dir, 'service.json'), 'not json {{{');
    const s = new ServiceStore(join(dir, 'service.json'));
    expect(s.snapshot().plays).toBe(0);
    s.addCoin();
    expect(new ServiceStore(join(dir, 'service.json')).snapshot().coins).toBe(1);
  });

  it('ignores garbage field types', () => {
    writeFileSync(join(dir, 'service.json'), JSON.stringify({ plays: 'many', coins: -5, freePlay: 'yes' }));
    const s = new ServiceStore(join(dir, 'service.json'));
    const snap = s.snapshot();
    expect(typeof snap.plays).toBe('number');
    expect(typeof snap.coins).toBe('number');
    expect(typeof snap.freePlay).toBe('boolean');
  });
});

describe('coin mode and the operator (Arcade, R16-R18)', () => {
  let dir: string;
  let inbox: Map<string, ServerMessage[]>;
  let arcade: Arcade;
  let service: ServiceStore;
  const send = (id: string, msg: ServerMessage): void => {
    const list = inbox.get(id) ?? [];
    list.push(msg);
    inbox.set(id, list);
  };
  const take = (id: string) => {
    const m = inbox.get(id) ?? [];
    inbox.set(id, []);
    return m;
  };
  const errorsFor = (id: string) => take(id).filter((m) => m.type === 'error') as { code: string }[];
  const drain = <T>(id: string, type: string): T[] =>
    take(id).filter((m) => m.type === type) as T[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-coin-'));
    inbox = new Map();
    service = new ServiceStore(join(dir, 'service.json'));
    arcade = new Arcade({
      send,
      store: new HighScoreStore(join(dir, 'scores.json')),
      service,
    });
    arcade.addConnection({ id: 'c1', name: 'AKIRA', lang: 'en' });
    arcade.addConnection({ id: 'c2', name: 'MIO', lang: 'en' });
  });
  afterEach(() => {
    arcade.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('coin mode is the default: start without credit is rejected and seats nobody', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    arcade.tick();
    const msgs = take('c1');
    const errors = msgs.filter((m) => m.type === 'error') as { code: string }[];
    expect(errors.map((e) => e.code)).toContain('insert-coin');
    const roster = msgs.filter((m) => m.type === 'roster').pop() as RosterMsg | undefined;
    expect(roster?.tables.filter((t) => t.players.length > 0)).toHaveLength(0);
  });

  it('coin then start works, and the credit is spent', () => {
    arcade.handleMessage('c1', { type: 'coin' });
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    for (let i = 0; i < 3; i++) arcade.tick();
    expect(errorsFor('c1')).toHaveLength(0);
    arcade.handleMessage('c1', { type: 'back' });
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    expect(errorsFor('c1').map((e) => e.code)).toContain('insert-coin');
  });

  it('spectators never pay', () => {
    // both duelists pay (R17.2: one coin per player), filling the capacity-2 table
    arcade.handleMessage('c1', { type: 'coin' });
    arcade.handleMessage('c1', { type: 'start', game: 'block', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'coin' });
    arcade.handleMessage('c2', { type: 'start', game: 'block', mode: 'versus' });
    for (let i = 0; i < 3; i++) arcade.tick();
    // the table is now full and dealing: BEN joins as a spectator, free of charge
    arcade.addConnection({ id: 'c3', name: 'BEN', lang: 'en' });
    arcade.handleMessage('c3', { type: 'start', game: 'block', mode: 'versus' });
    for (let i = 0; i < 3; i++) arcade.tick();
    const msgs = take('c3');
    expect(msgs.filter((m) => m.type === 'error').map((m) => (m as { code: string }).code)).not.toContain('insert-coin');
    const snap = msgs.filter((m) => m.type === 'snapshot').at(-1) as { table: { players: unknown[] } } | undefined;
    expect(snap?.table.players).toHaveLength(2);
  });

  it('free play toggle lifts the gate and shows on the hall badge', () => {
    arcade.handleMessage('c1', { type: 'freePlay', on: true });
    arcade.handleMessage('c1', { type: 'hall', watch: true });
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    for (let i = 0; i < 8; i++) arcade.tick();
    const halls = drain<{ freePlay: boolean }>('c1', 'hallTables');
    expect(halls.length).toBeGreaterThan(0);
    expect(halls.at(-1)!.freePlay).toBe(true);
    // no insert-coin error was sent at any point
    expect(drain<{ code: string }>('c1', 'error').map((e) => e.code)).not.toContain('insert-coin');
    arcade.handleMessage('c1', { type: 'freePlay', on: false });
    const halls2 = drain<{ freePlay: boolean }>('c1', 'hallTables');
    expect(halls2.at(-1)?.freePlay).toBe(false);
  });

  it('stats report plays, coins and uptime, and persist', () => {
    arcade.handleMessage('c1', { type: 'freePlay', on: true });
    arcade.handleMessage('c1', { type: 'coin' });
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    for (let i = 0; i < 3; i++) arcade.tick();
    arcade.handleMessage('c1', { type: 'stats' });
    const reply = take('c1').find((m) => m.type === 'statsReply') as {
      plays: number;
      coins: number;
      freePlay: boolean;
      uptimeSec: number;
    };
    expect(reply.plays).toBeGreaterThanOrEqual(1);
    expect(reply.coins).toBe(1);
    expect(reply.freePlay).toBe(true);
    expect(reply.uptimeSec).toBeGreaterThanOrEqual(0);
    const reloaded = new ServiceStore(join(dir, 'service.json'));
    expect(reloaded.snapshot().coins).toBe(1);
    expect(reloaded.snapshot().plays).toBeGreaterThanOrEqual(1);
  });

  it('service toggles never disturb a live table', () => {
    arcade.handleMessage('c1', { type: 'freePlay', on: true });
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'versus' });
    for (let i = 0; i < 130; i++) arcade.tick();
    for (let i = 0; i < 20; i++) {
      arcade.handleMessage('c1', { type: 'freePlay', on: i % 2 === 0 });
      arcade.handleMessage('c1', { type: 'stats' });
      arcade.tick();
    }
    arcade.handleMessage('c1', { type: 'input', dir: { dx: 0, dy: -1 }, button: false, seq: 1 });
    for (let i = 0; i < 12; i++) arcade.tick();
    const snap = take('c1').filter((m) => m.type === 'snapshot').pop() as {
      table: { phase: string; players: unknown[] };
    };
    expect(snap.table.phase).toBe('playing');
    expect(snap.table.players).toHaveLength(2);
  });
});

describe('out-of-order flags (R24)', () => {
  it('round-trips through disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arkad-ooo-'));
    const p = join(dir, 'service.json');
    new ServiceStore(p).setOutOfOrder('coast', true);
    expect(new ServiceStore(p).snapshot().outOfOrder).toEqual(['coast']);
    new ServiceStore(p).setOutOfOrder('coast', false);
    expect(new ServiceStore(p).snapshot().outOfOrder).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('drops unknown ids and junk on load', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arkad-ooo2-'));
    const p = join(dir, 'service.json');
    writeFileSync(p, JSON.stringify({ outOfOrder: ['coast', 'flappy', 5, null, 'snake'] }));
    expect(new ServiceStore(p).snapshot().outOfOrder).toEqual(['coast', 'snake']);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('sticker note (R42)', () => {
  it('persists and clears through the store', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arkad-note-'));
    const p = join(dir, 'service.json');
    const s = new ServiceStore(p);
    expect(s.snapshot().note).toBe('');
    s.setNote('FREE DROPS TUESDAY');
    expect(new ServiceStore(p).snapshot().note).toBe('FREE DROPS TUESDAY');
    s.setNote('');
    expect(new ServiceStore(p).snapshot().note).toBe('');
    rmSync(dir, { recursive: true, force: true });
  });

  it('drops junk and oversized notes on load', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arkad-note2-'));
    const p = join(dir, 'service.json');
    writeFileSync(p, JSON.stringify({ note: 'x'.repeat(40) }));
    expect(new ServiceStore(p).snapshot().note).toBe('');
    writeFileSync(p, JSON.stringify({ note: 99 }));
    expect(new ServiceStore(p).snapshot().note).toBe('');
    rmSync(dir, { recursive: true, force: true });
  });
});
