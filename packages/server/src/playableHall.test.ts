import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GAME_IDS, type HallTablesMsg, type RosterMsg, type ServerMessage, type SnapshotMsg } from '@arkad/core';
import { Arcade, type Conn } from './arcade';
import { HighScoreStore } from './highscores';
import { ServiceStore } from './service';

/**
 * Sit, pay, leave. Drives the real Arcade the way a cabinet does:
 * coin mode is the default, free play is an explicit operator switch,
 * and attract demos are the tables the constructor already opened.
 */
class Inbox {
  messages: ServerMessage[] = [];
  send = (_connId: string, msg: ServerMessage): void => {
    this.messages.push(msg);
  };
  of<T extends ServerMessage>(type: T['type']): T[] {
    return this.messages.filter((m): m is T => m.type === type);
  }
  clear(): void {
    this.messages = [];
  }
}

const conn = (id: string, name: string): Conn => ({ id, name, lang: 'en' });

describe('a stranger can sit at the shipped hall', () => {
  let dir: string;
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  const hall = (): { arcade: Arcade; net: Inbox } => {
    dir = mkdtempSync(join(tmpdir(), 'arkad-playable-'));
    dirs.push(dir);
    const net = new Inbox();
    const arcade = new Arcade({
      send: net.send,
      store: new HighScoreStore(join(dir, 'scores.json')),
      service: new ServiceStore(join(dir, 'service.json')),
    });
    return { arcade, net };
  };

  const watch = (arcade: Arcade, net: Inbox, id = 'c1'): HallTablesMsg => {
    net.clear();
    arcade.handleMessage(id, { type: 'hall', watch: true });
    for (let i = 0; i < 6; i++) arcade.tick();
    const boards = net.of<HallTablesMsg>('hallTables');
    expect(boards.length).toBeGreaterThan(0);
    return boards[boards.length - 1]!;
  };

  it('rejects a credit-less start, then a coin and start reach playing', () => {
    const { arcade, net } = hall();
    arcade.addConnection(conn('c1', 'AKIRA'));
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    expect(net.of('error').map((m) => (m as { code: string }).code)).toContain('insert-coin');
    const denied = watch(arcade, net);
    expect(denied.cabinets.map((c) => c.game).sort()).toEqual([...GAME_IDS].sort());
    expect(denied.cabinets.every((c) => c.demo)).toBe(true);
    expect(net.of('snapshot')).toHaveLength(0);

    net.clear();
    arcade.handleMessage('c1', { type: 'coin', game: 'snake' });
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    expect(net.of('error')).toHaveLength(0);
    arcade.tick();
    const snap = net.of<SnapshotMsg>('snapshot').at(-1);
    expect(snap?.table.game).toBe('snake');
    expect(snap?.table.phase).toBe('playing');
    expect(snap?.table.players).toHaveLength(1);
    expect(snap?.credits).toBe(0);

    const board = watch(arcade, net);
    expect(board.cabinets).toHaveLength(GAME_IDS.length);
    const live = board.cabinets.find((c) => c.game === 'snake');
    expect(live?.demo).toBe(false);
    expect(live?.phase).toBe('playing');
    for (const cab of board.cabinets) {
      if (cab.game === 'snake') continue;
      expect(cab.demo).toBe(true);
      expect(cab.data).not.toBeNull();
    }
    arcade.stop();
  });

  it('free play starts a solo cabinet with no coin', () => {
    const { arcade, net } = hall();
    arcade.addConnection(conn('c1', 'AKIRA'));
    arcade.handleMessage('c1', { type: 'freePlay', on: true });
    arcade.handleMessage('c1', { type: 'start', game: 'coast', mode: 'solo' });
    expect(net.of('error')).toHaveLength(0);
    arcade.tick();
    const snap = net.of<SnapshotMsg>('snapshot').at(-1);
    expect(snap?.table.game).toBe('coast');
    expect(snap?.table.phase).toBe('playing');
    expect(snap?.table.players).toHaveLength(1);
    expect(snap?.credits).toBe(0);
    arcade.stop();
  });

  it('back restores that cabinet attract demo and the hall still seats someone', () => {
    const { arcade, net } = hall();
    arcade.addConnection(conn('c1', 'AKIRA'));
    arcade.handleMessage('c1', { type: 'freePlay', on: true });
    arcade.handleMessage('c1', { type: 'start', game: 'snake', mode: 'solo' });
    arcade.tick();
    arcade.handleMessage('c1', { type: 'back' });
    const board = watch(arcade, net);
    expect(board.cabinets.find((c) => c.game === 'snake')?.demo).toBe(true);
    expect(board.cabinets.every((c) => c.demo && c.data !== null)).toBe(true);

    net.clear();
    arcade.handleMessage('c1', { type: 'start', game: 'circuit', mode: 'solo' });
    arcade.tick();
    const snap = net.of<SnapshotMsg>('snapshot').at(-1);
    expect(snap?.table.game).toBe('circuit');
    expect(snap?.table.phase).toBe('playing');
    const again = watch(arcade, net);
    expect(again.cabinets.find((c) => c.game === 'snake')?.demo).toBe(true);
    expect(again.cabinets.find((c) => c.game === 'circuit')?.demo).toBe(false);
    arcade.stop();
  });

  it('a dropped seat puts attract back and does not take the hall down', () => {
    const { arcade, net } = hall();
    arcade.addConnection(conn('c1', 'AKIRA'));
    arcade.addConnection(conn('c2', 'MIO'));
    arcade.handleMessage('c1', { type: 'freePlay', on: true });
    arcade.handleMessage('c1', { type: 'start', game: 'puck', mode: 'solo' });
    arcade.tick();
    arcade.removeConnection('c1');
    for (let i = 0; i < 12; i++) arcade.tick();
    const board = watch(arcade, net, 'c2');
    expect(board.cabinets).toHaveLength(GAME_IDS.length);
    expect(board.cabinets.find((c) => c.game === 'puck')?.demo).toBe(true);
    expect(board.cabinets.every((c) => c.data !== null)).toBe(true);

    net.clear();
    arcade.handleMessage('c2', { type: 'start', game: 'block', mode: 'solo' });
    arcade.tick();
    const snap = net.of<SnapshotMsg>('snapshot').at(-1);
    expect(snap?.table.game).toBe('block');
    expect(snap?.table.phase).toBe('playing');
    arcade.stop();
  });

  for (const game of GAME_IDS) {
    it(`${game}: seated snapshot carries score and lives or time; the other cabinets stay demos`, () => {
      const { arcade, net } = hall();
      arcade.addConnection(conn('c1', 'AKIRA'));
      arcade.handleMessage('c1', { type: 'coin', game });
      arcade.handleMessage('c1', { type: 'start', game, mode: 'solo' });
      expect(net.of('error')).toHaveLength(0);
      arcade.tick();
      const snap = net.of<SnapshotMsg>('snapshot').at(-1);
      expect(snap?.table.phase).toBe('playing');
      const player = snap?.table.players[0];
      expect(player?.id).toBe('c1');
      const data = snap?.data as {
        scores?: Record<string, number>;
        lives?: Record<string, number>;
        timeLeft?: number;
      };
      expect(typeof player?.score).toBe('number');
      expect(Number.isFinite(player?.score)).toBe(true);
      expect(player?.score).toBe(data?.scores?.[player!.id]);
      expect(player?.lives).toBe(data?.lives?.[player!.id]);
      const livesOk = typeof player?.lives === 'number' && player.lives > 0;
      const timeOk = typeof data?.timeLeft === 'number' && Number.isFinite(data.timeLeft) && data.timeLeft > 0;
      expect(livesOk || timeOk).toBe(true);
      const seated = net.of<RosterMsg>('roster').at(-1);
      expect(seated?.tables).toHaveLength(1);
      expect(seated?.tables[0]?.game).toBe(game);

      const board = watch(arcade, net);
      expect(board.cabinets.map((c) => c.game).sort()).toEqual([...GAME_IDS].sort());
      for (const cab of board.cabinets) {
        if (cab.game === game) {
          expect(cab.demo).toBe(false);
        } else {
          expect(cab.demo).toBe(true);
          expect(cab.data).not.toBeNull();
        }
      }
      arcade.stop();
    });
  }
});
