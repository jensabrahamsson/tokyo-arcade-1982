import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { parseClientMessage, serialize } from '@arkad/core';
import { Arcade, type Conn } from './arcade';
import { HighScoreStore } from './highscores';
import { ServiceStore } from './service';

export interface GameServerHandle {
  port: number;
  close: () => Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
};

export function createArcade(dataDir: string, send: (id: string, msg: unknown) => void): Arcade {
  return new Arcade({
    send: send as never,
    store: new HighScoreStore(join(dataDir, 'scores.json')),
    service: new ServiceStore(join(dataDir, 'service.json')),
  });
}

/** bind-level failures the hall cannot survive; everything else is survivable noise */
export function isFatalNetError(err: unknown): boolean {
  const code = (err as { code?: unknown } | undefined)?.code;
  return code === 'EADDRINUSE' || code === 'EACCES' || code === 'EADDRNOTAVAIL';
}

/** never let a closed stdout/stderr pipe take the hall down with it */
export function safeLog(...args: unknown[]): void {
  try {
    console.log(...args);
  } catch {
    /* pipe closed */
  }
}

export async function createGameServer(opts: { port: number; dataDir: string; publicDir?: string }): Promise<GameServerHandle> {
  const publicDir = resolve(opts.publicDir ?? join(__dirname, '..', 'public'));
  const sockets = new Map<string, WebSocket>();
  let seq = 0;
  const arcade = new Arcade({
    send: (connId, msg) => {
      const ws = sockets.get(connId);
      if (ws && ws.readyState === ws.OPEN) ws.send(serialize(msg));
    },
    store: new HighScoreStore(join(opts.dataDir, 'scores.json')),
    service: new ServiceStore(join(opts.dataDir, 'service.json')),
  });
  arcade.start();

  const http: Server = createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
    let decoded: string;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const path = normalize(decoded);
    if (path.includes('..')) {
      res.writeHead(400).end();
      return;
    }
    const rel = path === '/' || path === '\\' ? '/index.html' : path;
    const file = join(publicDir, rel);
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 8 * 1024 });
  wss.on('error', (err: Error) => safeLog('[arkad] ws server error:', err.message));
  http.on('error', (err: Error) => safeLog('[arkad] http server error:', err.message));
  wss.on('connection', (ws: WebSocket) => {
    const id = `u${++seq}`;
    sockets.set(id, ws);
    const conn: Conn = { id, name: '???', lang: 'en' };
    arcade.addConnection(conn);
    ws.on('error', () => {
      sockets.delete(id);
      arcade.removeConnection(id);
    });
    ws.on('message', (raw: Buffer) => {
      const msg = parseClientMessage(raw.toString());
      if (msg) arcade.handleMessage(id, msg);
    });
    ws.on('close', (code: number, reason: Buffer) => {
      safeLog(`[arkad] ws ${id} closed: ${code} ${reason?.toString() ?? ''}`.trimEnd());
      sockets.delete(id);
      arcade.removeConnection(id);
    });
  });

  await new Promise<void>((r) => http.listen(opts.port, '0.0.0.0', r));
  const port = (http.address() as { port: number }).port;

  return {
    port,
    close: async () => {
      arcade.stop();
      for (const ws of sockets.values()) ws.close(1001, 'server shutdown');
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => http.close(() => r()));
    },
  };
}
