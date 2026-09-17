import {
  REGISTRY,
  GAME_IDS,
  type AnyGameSpec,
  type ClientMessage,
  type GameId,
  type GameMode,
  type Lang,
  type ServerMessage,
  type GameStateBase,
  type TableView,
  type SfxEvent,
} from '@arkad/core';
import { Session } from './session';
import type { HighScoreStore } from './highscores';

export interface Conn {
  id: string;
  name: string;
  lang: Lang;
}

interface Seating {
  connId: string;
  spectator: boolean;
}

interface Table {
  id: string;
  game: GameId;
  mode: GameMode;
  session: Session | null;
  seats: Seating[];
  seed: number;
  openTick: number;
  lastSnap: number;
  pendingEvents: SfxEvent[];
}

const SNAPSHOT_EVERY = 2;
/** ticks a half-filled versus table waits for extra players before dealing (2 s at 60 Hz) */
export const START_GRACE = 120;

export interface ArcadeOptions {
  send: (connId: string, msg: ServerMessage) => void;
  store: HighScoreStore;
}

const GAME_LIST = GAME_IDS.map((id) => ({
  id,
  solo: REGISTRY[id] !== undefined,
  versus: REGISTRY[id]?.supportsVersus ?? false,
}));

export class Arcade {
  private conns = new Map<string, Conn>();
  private tables = new Map<string, Table>();
  private tableSeq = 0;
  private tickCount = 0;
  private interval: NodeJS.Timeout | null = null;

  constructor(private readonly opts: ArcadeOptions) {}

  addConnection(conn: Conn): void {
    this.conns.set(conn.id, conn);
    this.broadcastRoster();
  }

  removeConnection(connId: string): void {
    this.conns.delete(connId);
    for (const table of this.tables.values()) {
      table.seats = table.seats.filter((s) => s.connId !== connId);
      if (!table.seats.some((s) => !s.spectator)) this.closeTable(table);
    }
    this.broadcastRoster();
  }

  handleMessage(connId: string, msg: ClientMessage): void {
    const conn = this.conns.get(connId);
    if (!conn) return;
    switch (msg.type) {
      case 'join':
        conn.name = msg.name.trim() || '???';
        conn.lang = msg.lang;
        this.send(connId, { type: 'welcome', playerId: connId, serverName: 'ARKAD', games: GAME_LIST });
        this.broadcastRoster();
        break;
      case 'setName':
        conn.name = msg.name.trim() || conn.name;
        this.broadcastRoster();
        break;
      case 'start':
        this.seat(connId, msg.game, msg.mode);
        break;
      case 'input': {
        const table = this.tableOf(connId);
        const seat = table?.seats.find((s) => s.connId === connId && !s.spectator);
        if (table?.session && seat) table.session.setInput(connId, { dir: msg.dir, button: msg.button });
        break;
      }
      case 'scores':
        this.send(connId, {
          type: 'scoreList',
          game: msg.game,
          mode: msg.mode,
          entries: this.opts.store.top(msg.game, msg.mode),
        });
        break;
      case 'back': {
        const table = this.tableOf(connId);
        if (table) {
          table.seats = table.seats.filter((s) => s.connId !== connId);
          if (!table.seats.some((s) => !s.spectator)) this.closeTable(table);
          this.broadcastRoster();
        }
        break;
      }
    }
  }

  private seat(connId: string, game: GameId, mode: GameMode): void {
    const spec = REGISTRY[game] as AnyGameSpec | undefined;
    if (!spec) {
      this.send(connId, { type: 'error', code: 'unknown-game' });
      return;
    }
    if (mode === 'versus' && !spec.supportsVersus) {
      this.send(connId, { type: 'error', code: 'solo-only' });
      return;
    }
    const current = this.tableOf(connId);
    if (current) this.leave(current, connId);

    // one cabinet per game+mode in the hall: seat if free, otherwise spectate
    let table = [...this.tables.values()].find((t) => t.game === game && t.mode === mode);
    if (!table) table = this.openTable(game, mode);
    const seated = table.seats.filter((s) => !s.spectator).length;
    const capacity = mode === 'versus' ? (spec.capacity ?? 2) : 1;
    table.seats.push({ connId, spectator: seated >= capacity });
    const nowSeated = table.seats.filter((s) => !s.spectator).length;
    if (!table.session && nowSeated >= capacity) this.beginTable(table);
    this.broadcastRoster();
  }

  private openTable(game: GameId, mode: GameMode): Table {
    const table: Table = {
      id: `t${++this.tableSeq}`,
      game,
      mode,
      session: null,
      seats: [],
      seed: (Math.random() * 2 ** 31) >>> 0,
      openTick: this.tickCount,
      lastSnap: -999,
      pendingEvents: [],
    };
    this.tables.set(table.id, table);
    return table;
  }

  private beginTable(table: Table): void {
    const spec = REGISTRY[table.game]!;
    const seated = table.seats.filter((s) => !s.spectator).map((s) => s.connId);
    const session = new Session(table.id, spec, {
      mode: table.mode,
      playerIds: seated,
      seed: table.seed,
    });
    session.onGameOver = (state) => this.recordScores(table.id, state);
    table.session = session;
    session.begin();
  }

  private recordScores(tableId: string, state: GameStateBase): void {
    const table = this.tables.get(tableId);
    if (!table) return;
    for (const seat of table.seats) {
      if (seat.spectator) continue;
      const conn = this.conns.get(seat.connId);
      if (!conn) continue;
      this.opts.store.add(table.game, table.mode, conn.name, state.scores[seat.connId] ?? 0);
    }
  }

  private tableOf(connId: string): Table | undefined {
    for (const t of this.tables.values()) if (t.seats.some((s) => s.connId === connId)) return t;
    return undefined;
  }

  private leave(table: Table, connId: string): void {
    table.seats = table.seats.filter((s) => s.connId !== connId);
    if (!table.seats.some((s) => !s.spectator)) this.closeTable(table);
  }

  private closeTable(table: Table): void {
    if (this.tables.delete(table.id)) this.broadcastRoster();
  }

  start(intervalMs = 1000 / 60): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  tick(): void {
    this.tickCount++;
    for (const table of [...this.tables.values()]) {
      const session = table.session;
      const dueSnap = this.tickCount - table.lastSnap >= SNAPSHOT_EVERY;
      if (!session) {
        const seated = table.seats.filter((s) => !s.spectator).length;
        const spec = REGISTRY[table.game]!;
        const cap = table.mode === 'versus' ? (spec.capacity ?? 2) : 1;
        if (seated >= 2 && seated < cap && this.tickCount - table.openTick >= START_GRACE) this.beginTable(table);
        if (dueSnap) {
          table.lastSnap = this.tickCount;
          const view = this.tableView(table);
          for (const seat of table.seats) {
            this.send(seat.connId, { type: 'snapshot', table: view, data: null });
          }
        }
        continue;
      }
      for (const e of session.tick()) table.pendingEvents.push(e);
      const events = table.pendingEvents;
      table.pendingEvents = [];
      if (dueSnap) {
        table.lastSnap = this.tickCount;
        const view = this.tableView(table);
        for (const seat of table.seats) {
          this.send(seat.connId, { type: 'snapshot', table: view, data: session.state, events });
        }
      }
      if (session.state.phase === 'attract') this.closeTable(table);
    }
  }

  private tableView(table: Table): TableView {
    const state = table.session?.state;
    return {
      id: table.id,
      game: table.game,
      mode: table.mode,
      phase: state?.phase ?? 'ready',
      turn: state?.turn,
      winner: state?.winner,
      players: table.seats
        .filter((s) => !s.spectator)
        .map((s) => ({
          id: s.connId,
          name: this.conns.get(s.connId)?.name ?? '???',
          score: state?.scores[s.connId] ?? 0,
          lives: state?.lives[s.connId] ?? 0,
          active: (state?.lives[s.connId] ?? 1) > 0,
        })),
    };
  }

  private broadcastRoster(): void {
    const players = [...this.conns.values()].map((c) => ({ id: c.id, name: c.name }));
    const tables = [...this.tables.values()].map((t) => this.tableView(t));
    for (const conn of this.conns.values()) {
      this.send(conn.id, { type: 'roster', players, tables });
    }
  }

  private send(connId: string, msg: ServerMessage): void {
    this.opts.send(connId, msg);
  }
}
