/**
 * Wave 5 — Wi-Fi / multiplayer honesty soak.
 *
 * Gaps vs main (P1-B FakeNet in arcade.test.ts, pause-credits in
 * arcade.test.ts P2-1 + http.test.ts P2-H):
 *   1. abortive socket kill mid-solo Coast over a real ws
 *   2. lapsed grace then a normal insert-coin start (new table, not the held one)
 *   3. name|lang wallet key: same tag, other lang, does not steal
 *
 * Pause-over-ws credits already live in http.test.ts (P2-H) — not repeated.
 * Hall mini-cache / Mac fullscreen: out of scope.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Arcade, CREDIT_RECONNECT_GRACE, reconnectKey } from './arcade';
import { HighScoreStore } from './highscores';
import { ServiceStore } from './service';
import { createGameServer, type GameServerHandle } from './http';
import type { ServerMessage, SnapshotMsg } from '@arkad/core';

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

describe('Wave 5 reconnect key (name|lang wallet)', () => {
  it('keys wallets by lowercase name plus lang — same tag, other lang, is another pocket', () => {
    expect(reconnectKey('AKIRA', 'en')).toBe('akira|en');
    expect(reconnectKey('akira', 'en')).toBe(reconnectKey('AKIRA', 'en'));
    expect(reconnectKey('AKIRA', 'ja')).toBe('akira|ja');
    expect(reconnectKey('AKIRA', 'ja')).not.toBe(reconnectKey('AKIRA', 'en'));
  });
});

describe('Wave 5 FakeNet soak', () => {
  let dir: string;
  let net: FakeNet;
  let arcade: Arcade;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-wave5-'));
    net = new FakeNet();
    arcade = new Arcade({
      send: net.send,
      store: new HighScoreStore(join(dir, 'scores.json')),
      service: new ServiceStore(join(dir, 'service.json')),
    });
    arcade.addConnection({ id: 'c1', name: 'AKIRA', lang: 'en' });
  });
  afterEach(() => {
    arcade.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('same name other lang does not claim the parked coin-mode wallet', () => {
    arcade.handleMessage('c1', { type: 'freePlay', on: false });
    arcade.handleMessage('c1', { type: 'coin', game: 'coast' });
    arcade.handleMessage('c1', { type: 'coin', game: 'coast' });
    arcade.removeConnection('c1');

    arcade.addConnection({ id: 'c-ja', name: '???', lang: 'en' });
    arcade.handleMessage('c-ja', { type: 'join', name: 'AKIRA', lang: 'ja' });
    arcade.handleMessage('c-ja', { type: 'hall', watch: true });
    for (let i = 0; i < 8; i++) arcade.tick();
    const hall = net.take('c-ja').filter((m) => m.type === 'hallTables').at(-1) as
      | { credits?: number }
      | undefined;
    expect(hall?.credits).toBe(0);

    net.take('c-ja');
    arcade.handleMessage('c-ja', { type: 'start', game: 'coast', mode: 'solo' });
    expect(net.last<{ code: string }>('c-ja', 'error')?.code).toBe('insert-coin');
  });

  it('lapsed grace is a normal start: insert-coin, then a new Coast table (not the held one)', () => {
    arcade.handleMessage('c1', { type: 'freePlay', on: false });
    arcade.handleMessage('c1', { type: 'coin', game: 'coast' });
    arcade.handleMessage('c1', { type: 'coin', game: 'coast' });
    arcade.handleMessage('c1', { type: 'start', game: 'coast', mode: 'solo' });
    // burn clock on the held run so a resumed session would be obvious
    for (let i = 0; i < 90; i++) arcade.tick();
    const snap0 = net.last<SnapshotMsg>('c1', 'snapshot');
    expect(snap0?.table.game).toBe('coast');
    expect(snap0?.credits).toBe(1);
    const time0 = (snap0?.data as { timeLeft?: number } | null)?.timeLeft ?? 0;
    expect(time0).toBeGreaterThan(0);
    expect(time0).toBeLessThan(3600 - 40);

    arcade.removeConnection('c1');
    for (let i = 0; i < CREDIT_RECONNECT_GRACE + 1; i++) arcade.tick();

    arcade.addConnection({ id: 'c9', name: '???', lang: 'en' });
    arcade.handleMessage('c9', { type: 'join', name: 'AKIRA', lang: 'en' });
    net.take('c9');
    arcade.handleMessage('c9', { type: 'start', game: 'coast', mode: 'solo' });
    expect(net.last<{ code: string }>('c9', 'error')?.code).toBe('insert-coin');

    arcade.handleMessage('c9', { type: 'coin', game: 'coast' });
    arcade.handleMessage('c9', { type: 'start', game: 'coast', mode: 'solo' });
    for (let i = 0; i < 8; i++) arcade.tick();
    const snap1 = net.last<SnapshotMsg>('c9', 'snapshot');
    expect(snap1?.table.game).toBe('coast');
    expect(snap1?.table.mode).toBe('solo');
    expect(snap1?.credits).toBe(0);
    // cabinet id stays `demo-coast` (the floor row); honesty is a fresh deal,
    // not a resume of the held clock
    const time1 = (snap1?.data as { timeLeft?: number } | null)?.timeLeft ?? 0;
    expect(time1).toBeGreaterThan(time0);
    expect(time1).toBeGreaterThan(3600 - 20);
  });
});

interface Peer {
  ws: WebSocket;
  queue: ServerMessage[];
  waitFor<T>(type: string, timeoutMs?: number): Promise<T>;
}

interface SnapMsg {
  type: 'snapshot';
  credits?: number;
  table: { id: string; game: string; mode: string; phase: string; players: { id: string }[] };
  data: { dist?: number } | null;
}

function peer(url: string): Promise<Peer> {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    const queue: ServerMessage[] = [];
    ws.on('open', () =>
      res({
        ws,
        queue,
        waitFor: <T>(type: string, timeoutMs = 15000) =>
          new Promise<T>((resolve, reject) => {
            const started = Date.now();
            const poll = setInterval(() => {
              const i = queue.findIndex((m) => m.type === type);
              if (i >= 0) {
                clearInterval(poll);
                resolve(queue.splice(i, 1)[0] as T);
              } else if (Date.now() - started > timeoutMs) {
                clearInterval(poll);
                reject(new Error(`no "${type}" within ${timeoutMs}ms`));
              }
            }, 5);
          }),
      }),
    );
    ws.on('message', (raw: Buffer) => queue.push(JSON.parse(raw.toString()) as ServerMessage));
    ws.on('error', () => {
      /* terminate() races the handshake; close is the signal we wait on */
    });
  });
}

async function waitPlaying(p: Peer, timeoutMs = 15000): Promise<SnapMsg> {
  const started = Date.now();
  for (;;) {
    const snap = await p.waitFor<SnapMsg>('snapshot', timeoutMs);
    if (snap.table.phase === 'playing') return snap;
    if (Date.now() - started > timeoutMs) throw new Error(`no playing snapshot within ${timeoutMs}ms`);
  }
}

async function killSocket(ws: WebSocket): Promise<void> {
  await new Promise<void>((resolve) => {
    if (ws.readyState === ws.CLOSED) {
      resolve();
      return;
    }
    ws.once('close', () => resolve());
    ws.terminate();
  });
  // let the hall's close handler park the wallet + hold the live table
  await new Promise((r) => setTimeout(r, 80));
}

describe('Wave 5 real-ws kill-connection soak', () => {
  let dir: string;
  let handle: GameServerHandle;
  const peers: Peer[] = [];

  afterEach(async () => {
    for (const p of peers) {
      try {
        p.ws.terminate();
      } catch {
        /* already dead */
      }
    }
    peers.length = 0;
    if (handle) await handle.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('kill mid-solo Coast: same name|lang within grace reseats without a new debit (coin mode)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-wave5-ws-'));
    handle = await createGameServer({ port: 0, dataDir: dir });
    const url = `ws://127.0.0.1:${handle.port}/ws`;

    const a = await peer(url);
    peers.push(a);
    a.ws.send(JSON.stringify({ type: 'join', name: 'AKIRA', lang: 'en' }));
    const welcome = await a.waitFor<{ type: 'welcome'; playerId: string }>('welcome');
    a.ws.send(JSON.stringify({ type: 'coin', game: 'coast' }));
    a.ws.send(JSON.stringify({ type: 'coin', game: 'coast' }));
    a.ws.send(JSON.stringify({ type: 'start', game: 'coast', mode: 'solo' }));
    const snap0 = await waitPlaying(a);
    expect(snap0.table.game).toBe('coast');
    expect(snap0.table.mode).toBe('solo');
    expect(snap0.credits).toBe(1);
    expect(snap0.table.players.map((p) => p.id)).toEqual([welcome.playerId]);
    const tableId = snap0.table.id;
    const dist0 = snap0.data?.dist ?? 0;

    await killSocket(a.ws);

    const b = await peer(url);
    peers.push(b);
    b.ws.send(JSON.stringify({ type: 'join', name: 'AKIRA', lang: 'en' }));
    const welcomeB = await b.waitFor<{ type: 'welcome'; playerId: string }>('welcome');
    expect(welcomeB.playerId).not.toBe(welcome.playerId);
    b.ws.send(JSON.stringify({ type: 'start', game: 'coast', mode: 'solo' }));
    const snap1 = await waitPlaying(b);
    expect(snap1.table.id).toBe(tableId);
    expect(snap1.table.game).toBe('coast');
    expect(snap1.table.mode).toBe('solo');
    expect(snap1.credits).toBe(1);
    expect(snap1.table.players.map((p) => p.id)).toEqual([welcomeB.playerId]);
    expect(snap1.data?.dist ?? 0).toBeGreaterThanOrEqual(dist0);
  }, 25000);
});
