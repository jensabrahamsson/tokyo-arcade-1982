import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Arcade, type Conn } from './arcade';
import { HighScoreStore } from './highscores';
import type { ServerMessage, RosterMsg, SnapshotMsg } from '@arkad/core';

class FakeNet {
  inbox: Map<string, ServerMessage[]> = new Map();
  send = (connId: string, msg: ServerMessage): void => {
    const list = this.inbox.get(connId) ?? [];
    list.push(msg);
    this.inbox.set(connId, list);
  };
  take(connId: string): ServerMessage[] {
    const msgs = this.inbox.get(connId) ?? [];
    this.inbox.set(connId, []);
    return msgs;
  }
  last<T>(connId: string, type: string): T | undefined {
    return this.take(connId).filter((m) => m.type === type).pop() as T | undefined;
  }
}

describe('Arcade', () => {
  let dir: string;
  let net: FakeNet;
  let arcade: Arcade;
  const conns: Conn[] = [
    { id: 'c1', name: 'AKIRA', lang: 'en' },
    { id: 'c2', name: 'MIO', lang: 'ja' },
    { id: 'c3', name: 'BEN', lang: 'en' },
    { id: 'c4', name: 'RIO', lang: 'ja' },
    { id: 'c5', name: 'GHOST', lang: 'en' },
  ];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-arcade-'));
    net = new FakeNet();
    arcade = new Arcade({ send: net.send, store: new HighScoreStore(join(dir, 'scores.json')) });
    for (const c of conns) arcade.addConnection(c);
  });
  afterEach(() => {
    arcade.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  const roster = (c = 'c1'): RosterMsg => net.last<RosterMsg>(c, 'roster')!;

  it('broadcasts roster on join', () => {
    expect(roster('c1').players.map((p) => p.name)).toEqual(['AKIRA', 'MIO', 'BEN', 'RIO', 'GHOST']);
  });

  it('starts a solo table and broadcasts snapshots', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    arcade.tick();
    const snap = net.last<SnapshotMsg>('c1', 'snapshot');
    expect(snap?.table.game).toBe('snake');
    expect(['ready', 'playing']).toContain(snap?.table.phase);
  });

  it('seats two players at one versus table', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'versus' });
    for (let i = 0; i < 130; i++) arcade.tick();
    const snap = net.last<SnapshotMsg>('c1', 'snapshot');
    expect(snap?.table.players.map((p) => p.id).sort()).toEqual(['c1', 'c2']);
    expect(snap?.table.phase).toBe('playing');
  });

  it('third player becomes spectator and still receives snapshots', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'block', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'block', mode: 'versus' });
    arcade.handleMessage('c3', { type: 'start', game: 'block', mode: 'versus' });
    for (let i = 0; i < 3; i++) arcade.tick();
    const snap = net.last<SnapshotMsg>('c3', 'snapshot');
    expect(snap?.table.players).toHaveLength(2);
  });

  it('routes inputs to the session and game progresses', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'versus' });
    for (let i = 0; i < 130; i++) arcade.tick();
    arcade.handleMessage('c1', { type: 'input', dir: { dx: 0, dy: -1 }, button: false });
    for (let i = 0; i < 12; i++) arcade.tick();
    const snap = net.last<SnapshotMsg>('c1', 'snapshot');
    const data = snap?.data as { snakes: Record<string, { dir: { dy: number } }> };
    expect(data!.snakes['c1']!.dir.dy).toBe(-1);
  });

  it('records highscores when a versus round ends', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'input', dir: { dx: 0, dy: 1 }, button: false });
    for (let i = 0; i < 5000; i++) arcade.tick();
    const store = new HighScoreStore(join(dir, 'scores.json'));
    const top = store.top('snake', 'versus');
    expect(top.length).toBeGreaterThan(0);
    expect(top[0]?.name).toBe('AKIRA');
  });

  it('answers scores requests', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'input', dir: { dx: 0, dy: 1 }, button: false });
    for (let i = 0; i < 5000; i++) arcade.tick();
    arcade.handleMessage('c1', { type: 'scores', game: 'snake', mode: 'versus' });
    const list = net.last<{ type: string; entries: unknown[] }>('c1', 'scoreList');
    expect(list?.entries.length).toBeGreaterThan(0);
  });

  it('closes table when players leave', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    arcade.removeConnection('c1');
    const r = roster('c2');
    expect(r.tables).toHaveLength(0);
    expect(r.players).toHaveLength(4);
  });

  it('broadcasts an updated roster when a finished table closes', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'input', dir: { dx: 0, dy: 1 }, button: false });
    for (let i = 0; i < 3000; i++) arcade.tick(); // gameOver -> attract -> closed
    const r = roster('c2');
    expect(r.tables).toHaveLength(0);
  });

  it('snake versus seats up to 4 players', () => {
    for (const c of ['c1', 'c2', 'c3', 'c4']) arcade.handleMessage(c, { type: 'start', game: 'snake', mode: 'versus' });
    arcade.tick();
    const snap = net.last<{ table: { players: unknown[]; phase: string } }>('c1', 'snapshot');
    expect(snap?.table.players).toHaveLength(4);
    expect(snap?.table.phase).toBe('playing');
  });

  it('a 5th snake player spectates the 4-seat table', () => {
    for (const c of ['c1', 'c2', 'c3', 'c4']) arcade.handleMessage(c, { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c5', { type: 'start', game: 'snake', mode: 'versus' });
    for (let i = 0; i < 3; i++) arcade.tick();
    const snap = net.last<{ table: { players: unknown[] } }>('c5', 'snapshot');
    expect(snap?.table.players).toHaveLength(4);
  });

  it('block versus keeps a strict 2-seat duel capacity', () => {
    for (const c of ['c1', 'c2', 'c3']) arcade.handleMessage(c, { type: 'start', game: 'block', mode: 'versus' });
    for (let i = 0; i < 3; i++) arcade.tick();
    const snap = net.last<{ table: { players: unknown[] } }>('c3', 'snapshot');
    expect(snap?.table.players).toHaveLength(2);
  });

  it('puck versus: turn hands over when a player loses all lives (integration)', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'puck', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'puck', mode: 'versus' });
    arcade.tick();
    let snap = net.last<{ table: { turn?: string; players: { id: string; score: number; lives: number }[] } }>('c1', 'snapshot');
    expect(snap?.table.turn).toBe('c1');
    for (let i = 0; i < 60000; i++) {
      arcade.tick();
      snap = net.last<{ table: { turn?: string; players: { id: string; score: number; lives: number }[] } }>('c2', 'snapshot');
      if (snap?.table.turn === 'c2') break;
    }
    expect(snap?.table.turn).toBe('c2');
    const c2 = snap!.table.players.find((p) => p.id === 'c2')!;
    expect(c2.lives).toBe(3);
    const c1 = snap!.table.players.find((p) => p.id === 'c1')!;
    expect(c1.lives).toBe(0);
  });

  it('block versus: first to 7 goals ends the duel with a winner (integration)', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'block', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'block', mode: 'versus' });
    let snap = net.last<{ table: { phase: string; winner?: string; players: { id: string; score: number }[] } }>('c1', 'snapshot');
    for (let i = 0; i < 120000; i++) {
      arcade.tick();
      snap = net.last<{ table: { phase: string; winner?: string; players: { id: string; score: number }[] } }>('c1', 'snapshot');
      if (snap?.table.phase === 'gameOver') break;
    }
    expect(snap?.table.phase).toBe('gameOver');
    const winner = snap!.table.winner!;
    expect(['c1', 'c2']).toContain(winner);
    expect(snap!.table.players.find((p) => p.id === winner)!.score).toBe(7);
  });

  it('a player joining a live table spectates instead of becoming a phantom seat', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'versus' });
    for (let i = 0; i < 130; i++) arcade.tick(); // grace deals with 2 of 4
    arcade.handleMessage('c3', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.tick();
    const snap = net.last<{ table: { players: { id: string }[] } }>('c3', 'snapshot');
    expect(snap?.table.players.map((p) => p.id).sort()).toEqual(['c1', 'c2']);
  });

  it('pressing start again at your own cabinet does not restart the game', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'versus' });
    for (let i = 0; i < 130; i++) arcade.tick();
    const before = net.last<{ table: { phase: string; id: string } }>('c1', 'snapshot');
    expect(before?.table.phase).toBe('playing');
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'versus' });
    for (let i = 0; i < 5; i++) arcade.tick();
    const msgs = net.take('c1');
    const after = [...msgs].reverse().find((m) => m.type === 'snapshot') as
      { table: { phase: string; id: string } } | undefined;
    expect(after?.table.phase).toBe('playing');
    expect(after?.table.id).toBe(before?.table.id);
    // a no-op start must not even re-broadcast the roster
    expect(msgs.some((m) => m.type === 'roster')).toBe(false);
  });

  it('input seq reaches the game: a repeated stale seq does not re-trigger the river hop', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'river', mode: 'solo' });
    for (let i = 0; i < 3; i++) arcade.tick();
    arcade.handleMessage('c1', { type: 'input', dir: { dx: 0, dy: -1 }, button: false, seq: 7 });
    for (let i = 0; i < 20; i++) arcade.tick();
    let snap = net.last<{ data: { frog: { y: number } } }>('c1', 'snapshot');
    expect(snap?.data.frog.y).toBe(15);
    arcade.handleMessage('c1', { type: 'input', dir: { dx: 0, dy: -1 }, button: false, seq: 7 });
    for (let i = 0; i < 60; i++) arcade.tick();
    snap = net.last<{ data: { frog: { y: number } } }>('c1', 'snapshot');
    expect(snap?.data.frog.y).toBe(15);
  });

  it('releasing the stick (dir null) stops a block paddle', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'block', mode: 'solo' });
    for (let i = 0; i < 3; i++) arcade.tick();
    arcade.handleMessage('c1', { type: 'input', dir: { dx: -1, dy: 0 }, button: false, seq: 1 });
    for (let i = 0; i < 20; i++) arcade.tick();
    let snap = net.last<{ data: { paddles: Record<string, { x: number }> } }>('c1', 'snapshot');
    const moved = snap?.data.paddles['c1']!.x!;
    arcade.handleMessage('c1', { type: 'input', dir: null, button: false, seq: 2 });
    for (let i = 0; i < 40; i++) arcade.tick();
    snap = net.last<{ data: { paddles: Record<string, { x: number }> } }>('c1', 'snapshot');
    expect(snap?.data.paddles['c1']!.x).toBe(moved);
  });

  it('ignores messages from unknown connections', () => {
    expect(() => arcade.handleMessage('nobody', { type: 'back' })).not.toThrow();
  });
});

describe('Arcade smoke (all cabinets)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-smoke-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  for (const game of ['snake', 'puck', 'block', 'galaxy', 'river', 'myriad'] as const) {
    it(`${game}: runs 600 ticks without throwing and broadcasts snapshots`, () => {
      const net = new FakeNet();
      const arcade = new Arcade({ send: net.send, store: new HighScoreStore(join(dir, 'scores.json')) });
      arcade.addConnection({ id: 'c1', name: 'AKIRA', lang: 'en' });
      arcade.handleMessage('c1', { type: 'join', name: 'AKIRA', lang: 'en' });
      arcade.handleMessage('c1', { type: 'start', game, mode: 'solo' });
      for (let i = 0; i < 600; i++) {
        if (i % 7 === 0) arcade.handleMessage('c1', { type: 'input', dir: { dx: i % 2 === 0 ? 1 : -1, dy: 0 }, button: true, seq: i });
        arcade.tick();
      }
      const snaps = net.take('c1').filter((m) => m.type === 'snapshot');
      expect(snaps.length).toBeGreaterThan(100);
      expect(() => JSON.stringify(snaps)).not.toThrow();
      arcade.stop();
    });
  }
});
