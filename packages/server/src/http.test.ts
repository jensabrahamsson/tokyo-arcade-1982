import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameServer, type GameServerHandle } from './http';
import type { ServerMessage } from '@arkad/core';

interface Peer {
  ws: WebSocket;
  queue: ServerMessage[];
  waitFor<T>(type: string, timeoutMs?: number): Promise<T>;
}

interface SnapMsg {
  type: 'snapshot';
  table: { phase: string; players: unknown[]; winner?: string };
}

async function waitPhase(p: Peer, phase: string, timeoutMs = 15000): Promise<SnapMsg> {
  const started = Date.now();
  for (;;) {
    const snap = await p.waitFor<SnapMsg>('snapshot', timeoutMs);
    if (snap.table.phase === phase) return snap;
    if (Date.now() - started > timeoutMs) throw new Error(`no snapshot phase "${phase}" within ${timeoutMs}ms`);
  }
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
    ws.on('error', rej);
  });
}

describe('game server (real websockets)', () => {
  let dir: string;
  let handle: GameServerHandle;
  const peers: Peer[] = [];

  afterEach(async () => {
    for (const p of peers) p.ws.close();
    peers.length = 0;
    if (handle) await handle.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('two players can play snake versus over real sockets', async () => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-ws-'));
    handle = await createGameServer({ port: 0, dataDir: dir });
    const url = `ws://127.0.0.1:${handle.port}/ws`;

    const a = await peer(url);
    const b = await peer(url);
    peers.push(a, b);

    a.ws.send(JSON.stringify({ type: 'join', name: 'AKIRA', lang: 'en' }));
    b.ws.send(JSON.stringify({ type: 'join', name: 'MIO', lang: 'ja' }));
    const wa = await a.waitFor<{ type: 'welcome'; playerId: string }>('welcome');
    const wb = await b.waitFor<{ type: 'welcome'; playerId: string }>('welcome');
    expect(wa.playerId).not.toBe(wb.playerId);

    a.ws.send(JSON.stringify({ type: 'start', game: 'snake', mode: 'versus' }));
    b.ws.send(JSON.stringify({ type: 'start', game: 'snake', mode: 'versus' }));

    const snap = await waitPhase(a, 'playing');
    expect(snap.table.players).toHaveLength(2);

    b.ws.send(JSON.stringify({ type: 'input', dir: { dx: 0, dy: 1 }, button: false }));

    let phase = '';
    let winner: string | undefined;
    const deadline = Date.now() + 20000;
    while (phase !== 'gameOver' && Date.now() < deadline) {
      const m = await a.waitFor<SnapMsg>('snapshot', 5000);
      phase = m.table.phase;
      winner = m.table.winner;
    }
    expect(phase).toBe('gameOver');
    expect(winner).toBe(wa.playerId);

    await new Promise((r) => setTimeout(r, 300));
    expect(existsSync(join(dir, 'scores.json'))).toBe(true);
  }, 30000);

  it('four players can play snake versus over real sockets', async () => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-ws4-'));
    handle = await createGameServer({ port: 0, dataDir: dir });
    const url = `ws://127.0.0.1:${handle.port}/ws`;
    const ps = [];
    for (let i = 0; i < 4; i++) ps.push(await peer(url));
    peers.push(...ps);

    const names = ['AKIRA', 'MIO', 'BEN', 'RIO'];
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      ps[i]!.ws.send(JSON.stringify({ type: 'join', name: names[i], lang: 'en' }));
      const w = await ps[i]!.waitFor<{ type: 'welcome'; playerId: string }>('welcome');
      ids.push(w.playerId);
    }
    for (const p of ps) p.ws.send(JSON.stringify({ type: 'start', game: 'snake', mode: 'versus' }));

    const snap = await waitPhase(ps[0]!, 'playing');
    expect(snap.table.players).toHaveLength(4);

    // steer three players into walls; AKIRA (going right from left edge) survives
    const dirs = [undefined, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }];
    let phase = '';
    let winner: string | undefined;
    const deadline = Date.now() + 20000;
    const t0 = Date.now();
    while (phase !== 'gameOver' && Date.now() < deadline) {
      if (Date.now() - t0 > 500) {
        for (let i = 1; i < 4; i++) if (dirs[i]) ps[i]!.ws.send(JSON.stringify({ type: 'input', dir: dirs[i], button: false }));
      }
      const m = await ps[0]!.waitFor<SnapMsg>('snapshot', 5000);
      phase = m.table.phase;
      winner = m.table.winner;
    }
    expect(phase).toBe('gameOver');
    expect(ids).toContain(winner);
  }, 30000);

  it('joining the hall without start sees an empty roster of tables (no demo seats)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-ws-demo-'));
    handle = await createGameServer({ port: 0, dataDir: dir });
    const url = `ws://127.0.0.1:${handle.port}/ws`;
    const a = await peer(url);
    peers.push(a);
    a.ws.send(JSON.stringify({ type: 'join', name: 'AKIRA', lang: 'en' }));
    await a.waitFor('welcome');
    const roster = await a.waitFor<{
      type: 'roster';
      players: { id: string; name: string }[];
      tables: { players: { id: string }[] }[];
    }>('roster');
    expect(roster.tables).toEqual([]);
    expect(roster.players.every((p) => p.id !== 'DEMO')).toBe(true);

    a.ws.send(JSON.stringify({ type: 'start', game: 'snake', mode: 'solo' }));
    const snap = await waitPhase(a, 'playing');
    expect(snap.table.players).toHaveLength(1);
    expect((snap.table.players[0] as { id: string }).id).not.toBe('DEMO');
  }, 15000);
});
