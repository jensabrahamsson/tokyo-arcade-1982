import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {createGameServer, type GameServerHandle, isFatalNetError, contentTypeFor} from './http';
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

    // R17: the hall defaults to coin mode, so players insert credits first
    a.ws.send(JSON.stringify({ type: 'coin' }));
    b.ws.send(JSON.stringify({ type: 'coin' }));
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

  it('free play seats a second coast and circuit racer over real sockets (R61)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-race-'));
    handle = await createGameServer({ port: 0, dataDir: dir });
    const url = `ws://127.0.0.1:${handle.port}/ws`;
    const a = await peer(url);
    const b = await peer(url);
    peers.push(a, b);
    a.ws.send(JSON.stringify({ type: 'join', name: 'AKIRA', lang: 'en' }));
    b.ws.send(JSON.stringify({ type: 'join', name: 'MIO', lang: 'ja' }));
    await a.waitFor('welcome');
    await b.waitFor('welcome');
    a.ws.send(JSON.stringify({ type: 'freePlay', on: true }));

    for (const game of ['coast', 'circuit'] as const) {
      a.ws.send(JSON.stringify({ type: 'start', game, mode: 'versus' }));
      b.ws.send(JSON.stringify({ type: 'start', game, mode: 'versus' }));
      const started = Date.now();
      let snap: SnapMsg & {
        credits?: number;
        table: { phase: string; game?: string; players: unknown[] };
        data: { mode?: string; runners?: Record<string, unknown>; cars?: Record<string, unknown> };
      };
      for (;;) {
        snap = await a.waitFor('snapshot', 15000);
        if (snap.table.phase === 'playing' && snap.table.game === game) break;
        if (Date.now() - started > 15000) throw new Error(`no playing ${game} snapshot`);
      }
      expect(snap.table.players).toHaveLength(2);
      expect(snap.credits ?? 0).toBe(0);
      expect(snap.data.mode).toBe('versus');
      if (game === 'coast') expect(Object.keys(snap.data.runners ?? {})).toHaveLength(2);
      else expect(Object.keys(snap.data.cars ?? {})).toHaveLength(2);
      a.ws.send(JSON.stringify({ type: 'back' }));
      b.ws.send(JSON.stringify({ type: 'back' }));
      await new Promise((r) => setTimeout(r, 50));
    }
  }, 20000);

  it('hall subscription streams live demo cabinets over real sockets (R8)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-hall-'));
    handle = await createGameServer({ port: 0, dataDir: dir });
    const a = await peer(`ws://127.0.0.1:${handle.port}/ws`);
    peers.push(a);
    a.ws.send(JSON.stringify({ type: 'join', name: 'WALKER', lang: 'en' }));
    await a.waitFor('welcome');
    a.ws.send(JSON.stringify({ type: 'hall', watch: true }));
    const hall = await a.waitFor<{
      type: 'hallTables';
      cabinets: { game: string; demo: boolean; data: unknown }[];
    }>('hallTables');
    // R55: eight cabinets. The old assert was 7, from before Circuit d'Or opened.
    expect(hall.cabinets).toHaveLength(8);
    expect(hall.cabinets.every((c) => c.demo && c.data !== null)).toBe(true);
    const snake = hall.cabinets.find((c) => c.game === 'snake')!;
    await new Promise((r) => setTimeout(r, 150));
    const hall2 = await a.waitFor<{ cabinets: { game: string; data: Record<string, unknown> }[] }>('hallTables');
    const snake2 = hall2.cabinets.find((c) => c.game === 'snake')!;
    expect(JSON.stringify(snake.data)).not.toBe(JSON.stringify(snake2.data));
  }, 15000);

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
    for (const p of ps) {
      p.ws.send(JSON.stringify({ type: 'coin' }));
      p.ws.send(JSON.stringify({ type: 'start', game: 'snake', mode: 'versus' }));
    }

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

  it('after a solo game ends the cabinet runs the attract demo again (P0-1, real sockets)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-ws-'));
    handle = await createGameServer({ port: 0, dataDir: dir });
    const url = `ws://127.0.0.1:${handle.port}/ws`;

    const a = await peer(url);
    peers.push(a);
    a.ws.send(JSON.stringify({ type: 'join', name: 'AKIRA', lang: 'en' }));
    await a.waitFor('welcome');
    a.ws.send(JSON.stringify({ type: 'hall', watch: true }));
    a.ws.send(JSON.stringify({ type: 'coin', game: 'snake' }));
    a.ws.send(JSON.stringify({ type: 'start', game: 'snake', mode: 'solo' }));
    await waitPhase(a, 'playing');

    a.ws.send(JSON.stringify({ type: 'back' }));
    const started = Date.now();
    for (;;) {
      const hall = await a.waitFor<{ type: 'hallTables'; cabinets: { game: string; demo: boolean; data: unknown }[] }>('hallTables', 15000);
      const snake = hall.cabinets.filter((c) => c.game === 'snake');
      if (snake.length === 1 && snake[0]!.demo === true && snake[0]!.data !== null) break;
      if (Date.now() - started > 10000) throw new Error('attract demo never reopened the snake cabinet');
    }
  }, 30000);

  it('solo start -> back hands the cabinet back to the live demo (P1-7a, real sockets)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-ws-'));
    handle = await createGameServer({ port: 0, dataDir: dir });
    const url = `ws://127.0.0.1:${handle.port}/ws`;
    const a = await peer(url);
    peers.push(a);
    a.ws.send(JSON.stringify({ type: 'join', name: 'AKIRA', lang: 'en' }));
    await a.waitFor('welcome');
    a.ws.send(JSON.stringify({ type: 'hall', watch: true }));
    a.ws.send(JSON.stringify({ type: 'coin', game: 'snake' }));
    a.ws.send(JSON.stringify({ type: 'start', game: 'snake', mode: 'solo' }));
    await waitPhase(a, 'playing');

    a.ws.send(JSON.stringify({ type: 'back' }));
    const started = Date.now();
    for (;;) {
      const hall = await a.waitFor<{ type: 'hallTables'; cabinets: { game: string; demo: boolean; data: unknown; players: number }[] }>('hallTables', 15000);
      const rows = hall.cabinets.filter((c) => c.game === 'snake');
      if (rows.length === 1 && rows[0]!.demo === true && rows[0]!.data !== null && rows[0]!.players === 0) break;
      if (Date.now() - started > 10000) throw new Error('back-out never reopened the snake attract demo');
    }
  }, 30000);

  it('a live versus match wins over the demo in every hall watcher (P1-7b, real sockets)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-ws-'));
    handle = await createGameServer({ port: 0, dataDir: dir });
    const url = `ws://127.0.0.1:${handle.port}/ws`;
    const a = await peer(url);
    const b = await peer(url);
    const w = await peer(url);
    peers.push(a, b, w);
    a.ws.send(JSON.stringify({ type: 'join', name: 'AKIRA', lang: 'en' }));
    b.ws.send(JSON.stringify({ type: 'join', name: 'MIO', lang: 'ja' }));
    w.ws.send(JSON.stringify({ type: 'join', name: 'WALKER', lang: 'en' }));
    await a.waitFor('welcome');
    await b.waitFor('welcome');
    const ww = await w.waitFor<{ type: 'welcome'; playerId: string }>('welcome');
    void ww;
    w.ws.send(JSON.stringify({ type: 'hall', watch: true }));

    a.ws.send(JSON.stringify({ type: 'coin', game: 'snake' }));
    b.ws.send(JSON.stringify({ type: 'coin', game: 'snake' }));
    a.ws.send(JSON.stringify({ type: 'start', game: 'snake', mode: 'versus' }));
    b.ws.send(JSON.stringify({ type: 'start', game: 'snake', mode: 'versus' }));

    const started = Date.now();
    for (;;) {
      const hall = await w.waitFor<{ type: 'hallTables'; cabinets: { game: string; demo: boolean; players: number }[] }>('hallTables', 15000);
      const rows = hall.cabinets.filter((c) => c.game === 'snake');
      const live = rows.find((c) => c.demo === false);
      if (rows.length === 1 && live && live.players === 2) break;
      if (Date.now() - started > 12000) throw new Error('the hall watcher never saw the live versus row');
    }
  }, 40000);

  it('pause over a real socket keeps snapshots flowing (P2-H)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-ws-'));
    handle = await createGameServer({ port: 0, dataDir: dir });
    const url = `ws://127.0.0.1:${handle.port}/ws`;
    const a = await peer(url);
    peers.push(a);
    a.ws.send(JSON.stringify({ type: 'join', name: 'AKIRA', lang: 'en' }));
    await a.waitFor('welcome');
    a.ws.send(JSON.stringify({ type: 'coin', game: 'snake' }));
    a.ws.send(JSON.stringify({ type: 'start', game: 'snake', mode: 'solo' }));
    await waitPhase(a, 'playing');
    a.ws.send(JSON.stringify({ type: 'pause' }));
    const frozen: Array<{ paused?: boolean; credits?: number }> = [];
    const deadline = Date.now() + 4000;
    while (frozen.length < 3 && Date.now() < deadline) {
      const m = await a.waitFor<SnapMsg & { credits?: number; table: { paused?: boolean } }>('snapshot', 4000);
      if (m.table.paused) frozen.push({ paused: m.table.paused, credits: m.credits });
    }
    expect(frozen.length).toBeGreaterThanOrEqual(2);
    expect(frozen.every((s) => s.paused === true)).toBe(true);
    expect(typeof frozen[0]!.credits).toBe('number');
  }, 20000);

  it('free-play smoke: 8-cab hall, Coast, back, snake versus on the hall, pause, lang (wave 0)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-w0-'));
    handle = await createGameServer({ port: 0, dataDir: dir });
    const url = `ws://127.0.0.1:${handle.port}/ws`;
    const a = await peer(url);
    const b = await peer(url);
    const w = await peer(url);
    peers.push(a, b, w);

    a.ws.send(JSON.stringify({ type: 'freePlay', on: true }));
    a.ws.send(JSON.stringify({ type: 'join', name: 'AKIRA', lang: 'en' }));
    b.ws.send(JSON.stringify({ type: 'join', name: 'MIO', lang: 'ja' }));
    w.ws.send(JSON.stringify({ type: 'join', name: 'WALKER', lang: 'en' }));
    await a.waitFor('welcome');
    await b.waitFor('welcome');
    await w.waitFor('welcome');
    a.ws.send(JSON.stringify({ type: 'hall', watch: true }));
    w.ws.send(JSON.stringify({ type: 'hall', watch: true }));

    const hall0 = await a.waitFor<{
      type: 'hallTables';
      cabinets: { game: string }[];
      freePlay: boolean;
    }>('hallTables');
    expect(hall0.freePlay).toBe(true);
    // R55: the wave-0 hall was 7 (R22). Circuit d'Or sits beside the other seven.
    expect(hall0.cabinets).toHaveLength(8);

    a.ws.send(JSON.stringify({ type: 'start', game: 'coast', mode: 'solo' }));
    const coast = await waitPhase(a, 'playing');
    expect((coast as SnapMsg & { table: { game: string } }).table.game).toBe('coast');

    a.ws.send(JSON.stringify({ type: 'back' }));
    const backAt = Date.now();
    for (;;) {
      const hall = await a.waitFor<{ cabinets: { game: string; demo: boolean; data: unknown }[] }>('hallTables', 15000);
      const row = hall.cabinets.find((c) => c.game === 'coast');
      if (row?.demo === true && row.data !== null) break;
      if (Date.now() - backAt > 10000) throw new Error('Coast never returned to attract after back');
    }

    a.ws.send(JSON.stringify({ type: 'start', game: 'snake', mode: 'versus' }));
    b.ws.send(JSON.stringify({ type: 'start', game: 'snake', mode: 'versus' }));
    const vsAt = Date.now();
    for (;;) {
      const hall = await w.waitFor<{
        cabinets: { game: string; demo: boolean; players: number; data: unknown }[];
      }>('hallTables', 15000);
      const snake = hall.cabinets.find((c) => c.game === 'snake');
      if (snake && snake.demo === false && snake.players === 2 && snake.data !== null) break;
      if (Date.now() - vsAt > 12000) throw new Error('hall mini never showed live snake versus');
    }

    a.ws.send(JSON.stringify({ type: 'pause' }));
    const frozen: Array<{ paused?: boolean; credits?: number }> = [];
    const deadline = Date.now() + 4000;
    while (frozen.length < 2 && Date.now() < deadline) {
      const m = await a.waitFor<SnapMsg & { credits?: number; table: { paused?: boolean } }>('snapshot', 4000);
      if (m.table.paused) frozen.push({ paused: m.table.paused, credits: m.credits });
    }
    expect(frozen.length).toBeGreaterThanOrEqual(2);
    expect(frozen.every((s) => s.paused === true)).toBe(true);
    expect(frozen[0]!.credits).toBe(frozen[1]!.credits);

    a.ws.send(JSON.stringify({ type: 'join', name: 'AKIRA', lang: 'ja' }));
    await a.waitFor('welcome');
  }, 40000);
});

describe('static files (P2-4)', () => {
  let dir: string;
  let handle: GameServerHandle;

  afterEach(async () => {
    if (handle) await handle.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  async function serve(): Promise<string> {
    dir = mkdtempSync(join(tmpdir(), 'arkad-http-'));
    mkdirSync(join(dir, 'public'), { recursive: true });
    writeFileSync(join(dir, 'public', 'index.html'), '<html>hall</html>');
    writeFileSync(join(dir, 'public', 'ok.txt'), 'fine');
    writeFileSync(join(dir, 'secret.txt'), 'DO NOT SERVE ME');
    handle = await createGameServer({ port: 0, dataDir: join(dir, 'data'), publicDir: join(dir, 'public') });
    return `http://127.0.0.1:${handle.port}`;
  }

  it('serves files from under publicDir', async () => {
    const base = await serve();
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('hall');
    const txt = await fetch(`${base}/ok.txt`);
    expect(txt.status).toBe(200);
  }, 15000);

  it('serves .jpg as image/jpeg, never as image/png (P2-C)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-http-'));
    mkdirSync(join(dir, 'public'), { recursive: true });
    writeFileSync(join(dir, 'public', 'shot.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    writeFileSync(join(dir, 'public', 'shot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    handle = await createGameServer({ port: 0, dataDir: join(dir, 'data'), publicDir: join(dir, 'public') });
    const base = `http://127.0.0.1:${handle.port}`;
    const jpg = await fetch(`${base}/shot.jpg`);
    expect(jpg.status).toBe(200);
    expect(jpg.headers.get('content-type')).toBe('image/jpeg');
    const png = await fetch(`${base}/shot.png`);
    expect(png.status).toBe(200);
    expect(png.headers.get('content-type')).toBe('image/png');
  }, 15000);

  it('rejects encoded path traversal instead of escaping publicDir', async () => {
    const base = await serve();
    for (const probe of ['/%2e%2e/secret.txt', '/%2e%2e/%2e%2e/secret.txt', '/..%2fsecret.txt', '/%2e%2e/data/scores.json']) {
      const res = await fetch(base + probe);
      expect(res.status, probe).not.toBe(200);
      const body = await res.text();
      expect(body, probe).not.toContain('DO NOT SERVE ME');
    }
  }, 15000);

  it('answers 404 for missing files without revealing anything', async () => {
    const base = await serve();
    const res = await fetch(`${base}/nope/missing.png`);
    expect(res.status).toBe(404);
  }, 15000);
});

describe('fatal net error classification (stability)', () => {
  it('bind failures are fatal, everything else is survivable', () => {
    expect(isFatalNetError({ code: 'EADDRINUSE' })).toBe(true);
    expect(isFatalNetError({ code: 'EACCES' })).toBe(true);
    expect(isFatalNetError({ code: 'EADDRNOTAVAIL' })).toBe(true);
    expect(isFatalNetError({ code: 'ECONNRESET' })).toBe(false);
    expect(isFatalNetError({})).toBe(false);
    expect(isFatalNetError(undefined)).toBe(false);
  });
});

describe('static MIME (P2-C)', () => {
  it('maps jpg to image/jpeg and png to image/png — never guesses the other way', () => {
    expect(contentTypeFor('shot.jpg')).toBe('image/jpeg');
    expect(contentTypeFor('shot.jpeg')).toBe('image/jpeg');
    expect(contentTypeFor('shot.png')).toBe('image/png');
    expect(contentTypeFor('Late_Night_Cabinet.mp3')).toBe('audio/mpeg');
  });
});
