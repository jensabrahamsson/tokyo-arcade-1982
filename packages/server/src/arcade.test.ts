import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Arcade, CREDIT_RECONNECT_GRACE, liveTablePausesDemo, type Conn } from './arcade';
import { HighScoreStore } from './highscores';
import { ServiceStore } from './service';
import type { ServerMessage, RosterMsg, SnapshotMsg } from '@arkad/core';
import { DIRS } from '@arkad/core';

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
    arcade = new Arcade({
      send: net.send,
      store: new HighScoreStore(join(dir, 'scores.json')),
      service: new ServiceStore(join(dir, 'service.json')),
    });
    for (const c of conns) arcade.addConnection(c);
    // this is a free-play test hall; coin mode itself is covered in service.test.ts
    arcade.handleMessage('c1', { type: 'freePlay', on: true });
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
    // R50: full versus tables deal after the READY window, so tick through it
    for (let i = 0; i < 195; i++) arcade.tick();
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
    // R50: deal after the READY window
    for (let i = 0; i < 190; i++) arcade.tick();
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

  it('rejects start and targeted coin at an out-of-order cabinet (R24)', () => {
    arcade.handleMessage('c1', { type: 'ooo', game: 'snake', out: true });
    arcade.handleMessage('c5', { type: 'start', game: 'snake', mode: 'solo' });
    const box = net.take('c5');
    const errs = box.filter((m) => m.type === 'error') as { code: string }[];
    expect(errs.map((e) => e.code)).toContain('out-of-order');
    const ros = box.filter((m) => m.type === 'roster') as RosterMsg[];
    expect(ros.at(-1)?.tables.find((t) => t.game === 'snake' && t.players.length > 0)).toBeUndefined();
    arcade.handleMessage('c5', { type: 'coin', game: 'snake' });
    expect(net.last<{ code: string }>('c5', 'error')?.code).toBe('out-of-order');
    // other cabinets are unaffected
    arcade.handleMessage('c2', { type: 'start', game: 'coast', mode: 'solo' });
    arcade.tick();
    expect(net.last<SnapshotMsg>('c2', 'snapshot')?.table.game).toBe('coast');
  });

  it('the hall channel carries the out-of-order flags (R24.1)', () => {
    arcade.handleMessage('c1', { type: 'hall', watch: true });
    arcade.tick();
    expect(hallMsgs().at(-1)?.ooo ?? []).toEqual([]);
    arcade.handleMessage('c1', { type: 'ooo', game: 'puck', out: true });
    const h = hallMsgs().at(-1)!;
    expect(h.ooo).toEqual(['puck']);
  });

  it('out-of-order freezes the attract demo; clearing restores it (R24.2/R24.3)', () => {
    arcade.handleMessage('c1', { type: 'hall', watch: true });
    arcade.handleMessage('c1', { type: 'ooo', game: 'puck', out: true });
    for (let i = 0; i < 8; i++) arcade.tick(); // first post-flag broadcast lands
    const frozen = JSON.stringify(hallMsgs().at(-1)!.cabinets.find((c) => c.game === 'puck')!.data);
    for (let i = 0; i < 30; i++) arcade.tick();
    const stillFrozen = JSON.stringify(hallMsgs().at(-1)!.cabinets.find((c) => c.game === 'puck')!.data);
    expect(stillFrozen).toBe(frozen);
    arcade.handleMessage('c1', { type: 'ooo', game: 'puck', out: false });
    for (let i = 0; i < 30; i++) arcade.tick();
    const resumed = JSON.stringify(hallMsgs().at(-1)!.cabinets.find((c) => c.game === 'puck')!.data);
    expect(resumed).not.toBe(frozen);
  });

  it('a versus table in its join window publishes the deadline; gone when dealt (R25)', () => {
    arcade.handleMessage('c3', { type: 'hall', watch: true });
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'versus' });
    for (let i = 0; i < 8; i++) arcade.tick();
    const snap = net.last<SnapshotMsg & { table: { joinDeadline?: number | null } }>('c1', 'snapshot');
    const deadline = snap?.table.joinDeadline;
    expect(deadline).not.toBeNull();
    const h = hallMsgs('c3').at(-1)!;
    const cab = h.cabinets.find((c) => c.game === 'snake' && c.demo === false) as { joinDeadline?: number | null };
    expect(cab.joinDeadline).toBe(deadline);
    expect((deadline as number) - h.tick).toBeLessThanOrEqual(120);
    expect((deadline as number) - h.tick).toBeGreaterThan(0);
    // let the grace run out: the table deals and the countdown is gone
    for (let i = 0; i < 130; i++) arcade.tick();
    const after = net.last<SnapshotMsg & { table: { joinDeadline?: number | null } }>('c1', 'snapshot');
    expect(after?.table.joinDeadline ?? null).toBeNull();
  });

  const playUntil = (connId: string, game = 'snake', max = 300): void => {
    arcade.handleMessage(connId, { type: 'start', game: game as never, mode: 'solo' });
    for (let i = 0; i < max; i++) {
      arcade.tick();
      const snap = net.last<SnapshotMsg>(connId, 'snapshot');
      if (snap?.table.phase === 'playing') return;
    }
    throw new Error('never reached playing');
  };

  it('seat-held pause freezes the sim; toggling again resumes it (R26.1)', () => {
    playUntil('c1');
    net.take('c1');
    arcade.handleMessage('c1', { type: 'pause' });
    for (let i = 0; i < 4; i++) arcade.tick();
    const a = net.last<SnapshotMsg & { table: { paused?: boolean } }>('c1', 'snapshot');
    expect(a?.table.paused).toBe(true);
    const frozen = JSON.stringify(a?.data);
    for (let i = 0; i < 20; i++) arcade.tick();
    const b = net.last<SnapshotMsg>('c1', 'snapshot');
    expect(JSON.stringify(b?.data)).toBe(frozen);
    // opening sting rode the batch (R26.2)
    const evs = net.take('c1').flatMap((m) => (m.type === 'snapshot' ? m.events ?? [] : []));
    arcade.handleMessage('c1', { type: 'pause' });
    for (let i = 0; i < 6; i++) arcade.tick();
    const c = net.last<SnapshotMsg & { table: { paused?: boolean } }>('c1', 'snapshot');
    expect(c?.table.paused).toBe(false);
    expect(JSON.stringify(c?.data)).not.toBe(frozen);
    void evs;
  });

  it('pause-open emits the pause sting once through the batch (R26.2)', () => {
    playUntil('c1');
    net.take('c1');
    arcade.handleMessage('c1', { type: 'pause' });
    let stings = 0;
    for (let i = 0; i < 10; i++) {
      arcade.tick();
      for (const m of net.take('c1')) {
        if (m.type === 'snapshot') stings += (m.events ?? []).filter((e) => e.name === 'pause').length;
      }
    }
    expect(stings).toBe(1);
  });

  it('spectators cannot pause, and teardown clears the flag (R26.1/R26.3)', () => {
    playUntil('c1');
    arcade.handleMessage('c2', { type: 'hall', watch: false });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'solo' });
    // c2 could not seat (snake solo table busy) and watches as spectator
    net.take('c1');
    net.take('c2');
    arcade.handleMessage('c2', { type: 'pause' });
    for (let i = 0; i < 4; i++) arcade.tick();
    expect((net.last<SnapshotMsg & { table: { paused?: boolean } }>('c1', 'snapshot'))?.table.paused).toBeFalsy();
    // teardown via disconnect removes the paused table entirely
    arcade.handleMessage('c1', { type: 'pause' });
    arcade.removeConnection('c1');
    const ros = net.last<RosterMsg>('c2', 'roster');
    expect(ros?.tables.find((t) => t.game === 'snake' && t.players.length > 0)).toBeUndefined();
  });

  it('hall cabinets and snapshots carry server-counted seats and spectators (R29)', () => {
    arcade.handleMessage('c3', { type: 'hall', watch: true });
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'solo' });
    for (let i = 0; i < 8; i++) arcade.tick();
    const h = hallMsgs('c3').at(-1)!;
    const cab = h.cabinets.find((c) => c.game === 'snake' && c.demo === false)!;
    expect(cab.players).toBe(1);
    expect(cab.spectators).toBe(1);
    const snap = net.last<SnapshotMsg & { table: { spectators?: number } }>('c2', 'snapshot');
    expect(snap?.table.spectators).toBe(1);
    // a live table reads NOW PLAYING; the torn-down fallback never double-lights
    expect((cab as unknown as { demo: boolean }).demo).toBe(false);
  });

  it('hall channel carries the authoritative per-connection credit count (R33)', () => {
    arcade.handleMessage('c1', { type: 'freePlay', on: false });
    arcade.handleMessage('c3', { type: 'hall', watch: true });
    for (let i = 0; i < 8; i++) arcade.tick();
    expect(hallMsgs('c3').at(-1)?.credits).toBe(0);
    arcade.handleMessage('c3', { type: 'coin' });
    for (let i = 0; i < 8; i++) arcade.tick();
    expect(hallMsgs('c3').at(-1)?.credits).toBe(1);
    // spending at the cabinet drops it again; free-play hides nothing server-side
    arcade.handleMessage('c3', { type: 'start', game: 'snake', mode: 'solo' });
    for (let i = 0; i < 8; i++) arcade.tick();
    expect(hallMsgs('c3').at(-1)?.credits).toBe(0);
  });

  it('an operator note rides the hall channel (R42)', () => {
    arcade.handleMessage('c3', { type: 'hall', watch: true });
    for (let i = 0; i < 8; i++) arcade.tick();
    expect(hallMsgs('c3').at(-1)?.note).toBe('');
    arcade.handleMessage('c1', { type: 'note', text: 'PIZZA HOUR 17:00' });
    for (let i = 0; i < 8; i++) arcade.tick();
    expect(hallMsgs('c3').at(-1)?.note).toBe('PIZZA HOUR 17:00');
  });

  it('a full versus table shows READY and deals after the window; leave cancels (R50)', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'puck', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'puck', mode: 'versus' });
    for (let i = 0; i < 4; i++) arcade.tick();
    const full = net.last<SnapshotMsg & { table: { readyAt?: number | null } }>('c2', 'snapshot');
    expect(full?.table.readyAt).not.toBeNull();
    expect((full!.table.readyAt as number)).toBeGreaterThan(0);
    // still waiting: session has not dealt
    expect(full?.data).toBeNull();
    // cancel: c2 leaves before the window closes
    arcade.handleMessage('c2', { type: 'back' });
    for (let i = 0; i < 4; i++) arcade.tick();
    const cancelled = net.last<SnapshotMsg & { table: { readyAt?: number | null } }>('c1', 'snapshot');
    expect(cancelled?.table.readyAt ?? null).toBeNull();
    // refill and let the window run out: the table deals
    arcade.handleMessage('c2', { type: 'start', game: 'puck', mode: 'versus' });
    for (let i = 0; i < 190; i++) arcade.tick();
    const dealt = net.last<SnapshotMsg & { table: { readyAt?: number | null; phase: string } }>('c2', 'snapshot');
    expect(dealt?.table.readyAt ?? null).toBeNull();
    expect(['ready', 'playing', 'roundOver', 'gameOver']).toContain(dealt?.table.phase);
  });

  const hallMsgs = (c = 'c1') =>
    net.take(c).filter((m) => m.type === 'hallTables') as unknown as {
      type: 'hallTables';
      cabinets: { game: string; demo: boolean; phase: string; data: unknown; players: number; spectators: number }[];
      ooo: string[];
      tick: number;
      credits: number;
      note: string;
      freePlay: boolean;
    }[];

  it('the hall runs attract demos for every cabinet (R8)', () => {
    arcade.handleMessage('c1', { type: 'hall', watch: true });
    for (let i = 0; i < 20; i++) arcade.tick();
    const halls = hallMsgs('c1');
    expect(halls.length).toBeGreaterThan(0);
    const latest = halls[halls.length - 1]!;
    expect(latest.cabinets.map((c) => c.game).sort()).toEqual(
      ['block', 'coast', 'galaxy', 'myriad', 'puck', 'river', 'snake'].sort(),
    );
    expect(latest.cabinets.every((c) => c.demo)).toBe(true);
    expect(latest.cabinets.every((c) => c.data !== null)).toBe(true);
  });

  it('demo tables never appear in the joinable roster', () => {
    const r = roster('c1');
    expect(r.tables).toHaveLength(0);
  });

  it('coin takes the cabinet over: start replaces the demo immediately', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    for (let i = 0; i < 5; i++) arcade.tick();
    const snap = net.last<{ table: { game: string; phase: string; players: unknown[] } }>('c1', 'snapshot');
    expect(snap?.table.game).toBe('snake');
    expect(snap?.table.phase).toBe('playing');
    expect(snap?.table.players).toHaveLength(1);
    arcade.handleMessage('c1', { type: 'hall', watch: true });
    for (let i = 0; i < 10; i++) arcade.tick();
    const snake = hallMsgs('c1').at(-1)?.cabinets.find((c) => c.game === 'snake');
    expect(snake?.demo).toBe(false);
  });

  it('demos never record high scores', () => {
    for (let i = 0; i < 40000; i++) arcade.tick();
    for (const g of ['snake', 'puck', 'block', 'galaxy', 'river', 'myriad'] as const) {
      const store = new HighScoreStore(join(dir, 'scores.json'));
      expect(store.top(g, 'solo')).toHaveLength(0);
    }
  });

  it('hall watchers get updates, unsubscribers stop', () => {
    arcade.handleMessage('c1', { type: 'hall', watch: true });
    for (let i = 0; i < 10; i++) arcade.tick();
    expect(hallMsgs('c1').length).toBeGreaterThan(0);
    arcade.handleMessage('c1', { type: 'hall', watch: false });
    for (let i = 0; i < 20; i++) arcade.tick();
    expect(hallMsgs('c1')).toHaveLength(0);
  });

  it('ignores messages from unknown connections', () => {
    expect(() => arcade.handleMessage('nobody', { type: 'back' })).not.toThrow();
  });

  it('a solo table closing reopens the attract demo for that cabinet (P0-1)', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    for (let i = 0; i < 10; i++) arcade.tick();
    arcade.handleMessage('c1', { type: 'back' });
    arcade.handleMessage('c1', { type: 'hall', watch: true });
    net.take('c1');
    for (let i = 0; i < 36; i++) arcade.tick();
    const halls = hallMsgs('c1');
    expect(halls.length).toBeGreaterThan(0);
    const rows = halls.at(-1)!.cabinets.filter((c) => c.game === 'snake');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.demo).toBe(true);
    expect(rows[0]!.data).not.toBeNull();
    // and it MOVES: the demo state changed across the watched window
    const first = JSON.stringify(halls[0]!.cabinets.find((c) => c.game === 'snake')!.data);
    const last = JSON.stringify(halls.at(-1)!.cabinets.find((c) => c.game === 'snake')!.data);
    expect(first).not.toBe(last);
  });

  it('gameOver -> attract closes the table and the demo takes the cabinet back (P0-1)', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'input', dir: { dx: 0, dy: 1 }, button: false });
    for (let i = 0; i < 3000; i++) arcade.tick(); // gameOver -> attract -> closed
    arcade.handleMessage('c1', { type: 'hall', watch: true });
    net.take('c1');
    for (let i = 0; i < 30; i++) arcade.tick();
    const snake = hallMsgs('c1').at(-1)!.cabinets.filter((c) => c.game === 'snake');
    expect(snake).toHaveLength(1);
    expect(snake[0]!.demo).toBe(true);
    expect(snake[0]!.data).not.toBeNull();
  });

  it('a player disconnect never kills the attract demos (P0-1)', () => {
    arcade.handleMessage('c2', { type: 'start', game: 'puck', mode: 'solo' });
    for (let i = 0; i < 10; i++) arcade.tick();
    arcade.removeConnection('c2');
    arcade.handleMessage('c1', { type: 'hall', watch: true });
    net.take('c1');
    for (let i = 0; i < 30; i++) arcade.tick();
    const latest = hallMsgs('c1').at(-1)!;
    expect(latest.cabinets.map((c) => c.game).sort()).toEqual(
      ['block', 'coast', 'galaxy', 'myriad', 'puck', 'river', 'snake'].sort(),
    );
    expect(latest.cabinets.every((c) => c.demo)).toBe(true);
    expect(latest.cabinets.every((c) => c.data !== null)).toBe(true);
  });

  it('the hall shows one row per cabinet and a live game wins over its demo (P1-1)', () => {
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'versus' });
    for (let i = 0; i < 4; i++) arcade.tick();
    arcade.handleMessage('c3', { type: 'hall', watch: true });
    for (let i = 0; i < 8; i++) arcade.tick();
    const rows = hallMsgs('c3').at(-1)!.cabinets.filter((c) => c.game === 'snake');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.demo).toBe(false);
    expect(rows[0]!.players).toBe(2);
  });

  it('coin spam is rate-limited per connection (P1-5)', () => {
    const errs = () => net.take('c1').filter((m) => m.type === 'error') as { code: string }[];
    for (let i = 0; i < 4; i++) arcade.handleMessage('c1', { type: 'coin', game: 'snake' });
    expect(errs()).toHaveLength(0);
    arcade.handleMessage('c1', { type: 'coin', game: 'snake' }); // 5th within the second
    expect(errs().some((e) => e.code === 'slow-down')).toBe(true);
    for (let i = 0; i < 60; i++) arcade.tick(); // the one-second window rolls on
    net.take('c1');
    arcade.handleMessage('c1', { type: 'coin', game: 'snake' });
    expect(errs()).toHaveLength(0);
  });

  it('pause snapshots keep reporting credits like live ones (P2-1)', () => {
    arcade.handleMessage('c1', { type: 'freePlay', on: false });
    arcade.handleMessage('c1', { type: 'coin', game: 'snake' });
    arcade.handleMessage('c1', { type: 'coin', game: 'snake' });
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    for (let i = 0; i < 5; i++) arcade.tick();
    arcade.handleMessage('c1', { type: 'pause' });
    net.take('c1');
    for (let i = 0; i < 4; i++) arcade.tick();
    const snap = net.last<SnapshotMsg & { table: { paused?: boolean } }>('c1', 'snapshot');
    expect(snap?.table.paused).toBe(true);
    // two coins in, one spent at the seat: the frozen frame shows the wallet
    expect(snap?.credits).toBe(1);
  });

  it('credits survive a socket drop and rejoin with the reconnect (P2-2)', () => {
    arcade.handleMessage('c1', { type: 'freePlay', on: false });
    arcade.handleMessage('c1', { type: 'coin', game: 'snake' });
    arcade.handleMessage('c1', { type: 'coin', game: 'snake' });
    arcade.removeConnection('c1'); // the LAN blinks; the wallet is parked, not burned
    arcade.addConnection({ id: 'c9', name: '???', lang: 'en' });
    arcade.handleMessage('c9', { type: 'join', name: 'AKIRA', lang: 'en' });
    arcade.handleMessage('c9', { type: 'hall', watch: true });
    for (let i = 0; i < 8; i++) arcade.tick();
    expect(hallMsgs('c9').at(-1)?.credits).toBe(2);
  });

  it('parked credits do not follow the name to a stranger (P2-2)', () => {
    arcade.handleMessage('c1', { type: 'freePlay', on: false });
    arcade.handleMessage('c1', { type: 'coin', game: 'snake' });
    arcade.removeConnection('c1');
    arcade.addConnection({ id: 'c9', name: '???', lang: 'en' });
    arcade.handleMessage('c9', { type: 'join', name: 'ZED', lang: 'en' });
    arcade.handleMessage('c9', { type: 'hall', watch: true });
    for (let i = 0; i < 8; i++) arcade.tick();
    expect(hallMsgs('c9').at(-1)?.credits).toBe(0);
  });

  it('parked credits expire with the reconnect grace (P2-2)', () => {
    arcade.handleMessage('c1', { type: 'freePlay', on: false });
    arcade.handleMessage('c1', { type: 'coin', game: 'snake' });
    arcade.removeConnection('c1');
    for (let i = 0; i < CREDIT_RECONNECT_GRACE + 1; i++) arcade.tick();
    arcade.addConnection({ id: 'c9', name: '???', lang: 'en' });
    arcade.handleMessage('c9', { type: 'join', name: 'AKIRA', lang: 'en' });
    arcade.handleMessage('c9', { type: 'hall', watch: true });
    for (let i = 0; i < 8; i++) arcade.tick();
    expect(hallMsgs('c9').at(-1)?.credits).toBe(0);
  });

  it('an untargeted coin is rejected while any cabinet is out of order (P2-6)', () => {
    arcade.handleMessage('c1', { type: 'freePlay', on: false });
    arcade.handleMessage('c1', { type: 'ooo', game: 'snake', out: true });
    net.take('c5');
    arcade.handleMessage('c5', { type: 'coin' });
    expect(net.last<{ code: string }>('c5', 'error')?.code).toBe('out-of-order');
    arcade.handleMessage('c5', { type: 'hall', watch: true });
    for (let i = 0; i < 8; i++) arcade.tick();
    expect(hallMsgs('c5').at(-1)?.credits).toBe(0);
    // a coin aimed at a healthy cabinet still earns its credit
    arcade.handleMessage('c5', { type: 'coin', game: 'coast' });
    for (let i = 0; i < 8; i++) arcade.tick();
    expect(hallMsgs('c5').at(-1)?.credits).toBe(1);
  });

  it('snake attract follows an injected Jev policy (ARKAD_JEV_SELFPLAY)', () => {
    arcade.stop();
    arcade = new Arcade({
      send: net.send,
      store: new HighScoreStore(join(dir, 'scores.json')),
      service: new ServiceStore(join(dir, 'service.json')),
      jev: {
        covers: (game) => game === 'snake',
        inputFor: (_game, _state, tick) => ({ dir: DIRS.up, button: false, seq: tick }),
      },
    });
    arcade.addConnection(conns[0]!);
    arcade.handleMessage('c1', { type: 'hall', watch: true });
    for (let i = 0; i < 40; i++) arcade.tick();
    const cab = hallMsgs('c1').at(-1)?.cabinets.find((c) => c.game === 'snake');
    const data = cab?.data as { snakes: { demo: { dir: { dx: number; dy: number } } } } | undefined;
    expect(data?.snakes.demo.dir).toEqual({ dx: 0, dy: -1 });
  });

  it('a throwing Jev policy fail-closes to the built-in snake demo', () => {
    arcade.stop();
    arcade = new Arcade({
      send: net.send,
      store: new HighScoreStore(join(dir, 'scores.json')),
      service: new ServiceStore(join(dir, 'service.json')),
      jev: {
        covers: () => true,
        inputFor: () => {
          throw new Error('jev down');
        },
      },
    });
    arcade.addConnection(conns[0]!);
    arcade.handleMessage('c1', { type: 'hall', watch: true });
    expect(() => {
      for (let i = 0; i < 20; i++) arcade.tick();
    }).not.toThrow();
    const cab = hallMsgs('c1').at(-1)?.cabinets.find((c) => c.game === 'snake');
    expect(cab?.demo).toBe(true);
    expect(cab?.data).not.toBeNull();
  });

  it('liveTablePausesDemo is true only when a live table of that game exists (P2-D)', () => {
    expect(liveTablePausesDemo('snake', [{ game: 'snake', demo: true }])).toBe(false);
    expect(liveTablePausesDemo('snake', [
      { game: 'snake', demo: true },
      { game: 'snake', demo: false },
    ])).toBe(true);
    expect(liveTablePausesDemo('snake', [
      { game: 'snake', demo: true },
      { game: 'coast', demo: false },
    ])).toBe(false);
  });

  it('a live versus table pauses that game attract demo tick (P2-D)', () => {
    arcade.handleMessage('c3', { type: 'hall', watch: true });
    for (let i = 0; i < 24; i++) arcade.tick();
    const beforeHall = hallMsgs('c3').at(-1)!;
    const snake0 = beforeHall.cabinets.find((c) => c.game === 'snake')!.data as {
      snakes: { demo: { body: { x: number; y: number }[] } };
    };
    const coast0 = JSON.stringify(beforeHall.cabinets.find((c) => c.game === 'coast')!.data);

    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'versus' });
    for (let i = 0; i < 90; i++) arcade.tick();
    const mid = hallMsgs('c3').at(-1)!;
    const coastMid = JSON.stringify(mid.cabinets.find((c) => c.game === 'coast')!.data);
    expect(coastMid).not.toBe(coast0); // other cabinets keep humming

    arcade.handleMessage('c1', { type: 'back' });
    arcade.handleMessage('c2', { type: 'back' });
    net.take('c3');
    let head1: { x: number; y: number } | null = null;
    for (let i = 0; i < 12; i++) {
      arcade.tick();
      const row = hallMsgs('c3').at(-1)?.cabinets.find((c) => c.game === 'snake');
      if (row?.demo && row.data) {
        head1 = (row.data as typeof snake0).snakes.demo.body[0]!;
        break;
      }
    }
    expect(head1).not.toBeNull();
    const head0 = snake0.snakes.demo.body[0]!;
    // at most one resume step (moveInterval 10, ≤12 ticks after back); 90 live
    // ticks would have walked ~9 cells if the demo had kept running
    expect(Math.abs(head1!.x - head0.x) + Math.abs(head1!.y - head0.y)).toBeLessThanOrEqual(1);
  });

  it('reconnect reseats a live solo Coast without a new debit (P1-B)', () => {
    arcade.handleMessage('c1', { type: 'freePlay', on: false });
    arcade.handleMessage('c1', { type: 'coin', game: 'coast' });
    arcade.handleMessage('c1', { type: 'coin', game: 'coast' });
    arcade.handleMessage('c1', { type: 'start', game: 'coast', mode: 'solo' });
    for (let i = 0; i < 10; i++) arcade.tick();
    const snap0 = net.last<SnapshotMsg>('c1', 'snapshot');
    expect(snap0?.table.game).toBe('coast');
    expect(snap0?.table.mode).toBe('solo');
    expect(snap0?.credits).toBe(1); // two coins, one spent at the seat
    const tableId = snap0?.table.id;
    const dist0 = (snap0?.data as { dist?: number } | null)?.dist ?? 0;

    arcade.removeConnection('c1');
    arcade.addConnection({ id: 'c9', name: '???', lang: 'en' });
    arcade.handleMessage('c9', { type: 'join', name: 'AKIRA', lang: 'en' });
    arcade.handleMessage('c9', { type: 'start', game: 'coast', mode: 'solo' });
    for (let i = 0; i < 8; i++) arcade.tick();
    const snap1 = net.last<SnapshotMsg>('c9', 'snapshot');
    expect(snap1?.table.id).toBe(tableId);
    expect(snap1?.table.mode).toBe('solo');
    expect(snap1?.table.game).toBe('coast');
    expect(snap1?.credits).toBe(1); // parked wallet restored, no second debit
    expect((snap1?.data as { dist?: number } | null)?.dist ?? 0).toBeGreaterThanOrEqual(dist0);
  });

  it('lapsed reconnect grace is a normal start: insert-coin when the wallet is gone (P1-B)', () => {
    arcade.handleMessage('c1', { type: 'freePlay', on: false });
    arcade.handleMessage('c1', { type: 'coin', game: 'snake' });
    arcade.handleMessage('c1', { type: 'coin', game: 'snake' });
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    for (let i = 0; i < 4; i++) arcade.tick();
    arcade.removeConnection('c1');
    for (let i = 0; i < CREDIT_RECONNECT_GRACE + 1; i++) arcade.tick();
    arcade.addConnection({ id: 'c9', name: '???', lang: 'en' });
    arcade.handleMessage('c9', { type: 'join', name: 'AKIRA', lang: 'en' });
    net.take('c9');
    arcade.handleMessage('c9', { type: 'start', game: 'snake', mode: 'solo' });
    expect(net.last<{ code: string }>('c9', 'error')?.code).toBe('insert-coin');
  });

  it('free-play smoke: 7-cab hall, Coast, back, snake versus in hall, pause keeps credits, lang (wave 0)', () => {
    arcade.handleMessage('c1', { type: 'join', name: 'AKIRA', lang: 'en' });
    arcade.handleMessage('c1', { type: 'hall', watch: true });
    arcade.handleMessage('c3', { type: 'hall', watch: true });
    for (let i = 0; i < 20; i++) arcade.tick();
    const hall = hallMsgs('c1').at(-1)!;
    expect(hall.freePlay).toBe(true);
    expect(hall.cabinets).toHaveLength(7);
    expect(hall.cabinets.map((c) => c.game).sort()).toEqual(
      ['block', 'coast', 'galaxy', 'myriad', 'puck', 'river', 'snake'].sort(),
    );
    net.take('c3');

    arcade.handleMessage('c1', { type: 'start', game: 'coast', mode: 'solo' });
    for (let i = 0; i < 12; i++) arcade.tick();
    const coast = net.last<SnapshotMsg>('c1', 'snapshot');
    expect(coast?.table.game).toBe('coast');
    expect(['ready', 'playing']).toContain(coast?.table.phase);
    const creditsAtSeat = coast?.credits ?? 0;

    arcade.handleMessage('c1', { type: 'back' });
    arcade.handleMessage('c1', { type: 'hall', watch: true });
    for (let i = 0; i < 16; i++) arcade.tick();
    expect(hallMsgs('c1').at(-1)!.cabinets.find((c) => c.game === 'coast')?.demo).toBe(true);

    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'versus' });
    arcade.handleMessage('c2', { type: 'start', game: 'snake', mode: 'versus' });
    // snake seats 2/4: the join window is START_GRACE (120 ticks) before beginTable
    for (let i = 0; i < 140; i++) arcade.tick();
    const snake = hallMsgs('c3').at(-1)!.cabinets.find((c) => c.game === 'snake')!;
    expect(snake.demo).toBe(false);
    expect(snake.players).toBe(2);
    expect(snake.data).not.toBeNull();

    const beforePause = net.last<SnapshotMsg>('c1', 'snapshot')?.credits ?? creditsAtSeat;
    arcade.handleMessage('c1', { type: 'pause' });
    for (let i = 0; i < 8; i++) arcade.tick();
    const paused = net.last<SnapshotMsg & { table: { paused?: boolean } }>('c1', 'snapshot');
    expect(paused?.table.paused).toBe(true);
    expect(paused?.credits).toBe(beforePause);

    net.take('c1');
    arcade.handleMessage('c1', { type: 'join', name: 'AKIRA', lang: 'ja' });
    expect(net.last<{ type: string }>('c1', 'welcome')?.type).toBe('welcome');
  });
});

describe('Arcade smoke (all cabinets)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-smoke-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  for (const game of ['snake', 'puck', 'block', 'galaxy', 'river', 'myriad', 'coast'] as const) {
    it(`${game}: runs 600 ticks without throwing and broadcasts snapshots`, () => {
      const net = new FakeNet();
      const arcade = new Arcade({
        send: net.send,
        store: new HighScoreStore(join(dir, 'scores.json')),
        service: new ServiceStore(join(dir, 'service.json')),
      });
      arcade.addConnection({ id: 'c1', name: 'AKIRA', lang: 'en' });
      arcade.handleMessage('c1', { type: 'freePlay', on: true });
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
