import {
  REGISTRY,
  GAME_IDS,
  type GameSpec,
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
import type { ServiceStore } from './service';

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
  /** attract-mode cabinet: seatless, bot-driven, never scores */
  demo: boolean;
  session: Session | null;
  seats: Seating[];
  seed: number;
  openTick: number;
  graceTick: number;
  /** frozen by a seated player: step is skipped, snapshots keep flowing (R26) */
  paused: boolean;
  lastSnap: number;
  pendingEvents: SfxEvent[];
}

const SNAPSHOT_EVERY = 2;
const HALL_EVERY = 6;
const DEMO_PLAYER = 'demo';
/** ticks a half-filled versus table waits for extra players before dealing (2 s at 60 Hz) */
export const START_GRACE = 120;

export interface ArcadeOptions {
  send: (connId: string, msg: ServerMessage) => void;
  store: HighScoreStore;
  service: ServiceStore;
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
  private hallWatchers = new Set<string>();
  private credits = new Map<string, number>();
  private readonly bootMs = Date.now();

  constructor(private readonly opts: ArcadeOptions) {
    this.openDemoTables();
  }

  /** every idle cabinet plays itself, 1982 style (R8) */
  private openDemoTables(): void {
    for (const game of GAME_IDS) {
      const table: Table = {
        id: `demo-${game}`,
        game,
        mode: 'solo',
        demo: true,
        session: null,
        seats: [],
        seed: (Math.random() * 2 ** 31) >>> 0,
        openTick: 0,
        graceTick: -1,
        paused: false,
        lastSnap: -999,
        pendingEvents: [],
      };
      table.session = this.demoSession(table);
      this.tables.set(table.id, table);
    }
  }

  private demoSession(table: Table): Session {
    const spec = REGISTRY[table.game] as AnyGameSpec;
    const session = new Session(table.id, spec, {
      mode: 'solo',
      playerIds: [DEMO_PLAYER],
      seed: (Math.random() * 2 ** 31) >>> 0,
    });
    session.begin();
    return session;
  }

  addConnection(conn: Conn): void {
    this.conns.set(conn.id, conn);
    this.broadcastRoster();
  }

  removeConnection(connId: string): void {
    this.conns.delete(connId);
    this.hallWatchers.delete(connId);
    this.credits.delete(connId);
    for (const table of this.tables.values()) {
      table.seats = table.seats.filter((s) => s.connId !== connId);
      // a disconnected player must never leave others holding a frozen table (R26.3)
      if (table.paused) table.paused = false;
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
        if (table?.session && seat) table.session.setInput(connId, { dir: msg.dir, button: msg.button, seq: msg.seq });
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
      case 'hall':
        if (msg.watch) this.hallWatchers.add(connId);
        else this.hallWatchers.delete(connId);
        break;
      case 'coin': {
        // one credit into this cabinet (R18.2)
        if (msg.game && this.opts.service.snapshot().outOfOrder.includes(msg.game)) {
          this.send(connId, { type: 'error', code: 'out-of-order' });
          break;
        }
        this.credits.set(connId, (this.credits.get(connId) ?? 0) + 1);
        this.opts.service.addCoin();
        break;
      }
      case 'pause': {
        // only a seated player of a live (non-demo) table can hold the pause (R26.1)
        const table = this.tableOf(connId);
        const seated = table?.seats.some((s) => s.connId === connId && !s.spectator);
        if (table && seated && table.session && !table.demo) {
          table.paused = !table.paused;
          if (table.paused) {
            table.pendingEvents.push({ name: 'pause', player: connId });
          }
        }
        break;
      }
      case 'ooo': {
        // operator switch (R24.1): flag it, persist it, tell the hall
        this.opts.service.setOutOfOrder(msg.game, msg.out);
        this.broadcastHall();
        this.broadcastRoster();
        break;
      }
      case 'stats': {
        const snap = this.opts.service.snapshot();
        this.send(connId, {
          type: 'statsReply',
          plays: snap.plays,
          coins: snap.coins,
          freePlay: snap.freePlay,
          uptimeSec: Math.floor((Date.now() - this.bootMs) / 1000),
          day: snap.day,
          playsToday: snap.playsToday,
          coinsToday: snap.coinsToday,
        });
        break;
      }
      case 'freePlay':
        this.opts.service.setFreePlay(msg.on);
        if (this.hallWatchers.size > 0) this.broadcastHall();
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
    if (this.opts.service.snapshot().outOfOrder.includes(game)) {
      this.send(connId, { type: 'error', code: 'out-of-order' });
      return;
    }
    if (mode === 'versus' && !spec.supportsVersus) {
      this.send(connId, { type: 'error', code: 'solo-only' });
      return;
    }
    const current = this.tableOf(connId);
    if (current) {
      // sitting at this exact cabinet already: pressing start again is a no-op
      if (current.game === game && current.mode === mode) return;
    }

    // one cabinet per game+mode in the hall: seat if free, otherwise spectate
    let table = [...this.tables.values()].find((t) => t.game === game && t.mode === mode);
    const capacity = mode === 'versus' ? (spec.capacity ?? 2) : 1;
    const seated = table?.seats.filter((s) => !s.spectator).length ?? 0;
    // once the simulation has dealt, late arrivals can only watch;
    // a demo session is not a dealing — the coin will take the cabinet over
    const spectator = table
      ? seated >= capacity || (!!table.session && !table.demo)
      : false;

    if (!spectator && !this.opts.service.snapshot().freePlay) {
      // R17.2: playing costs one credit; watching is always free.
      // Rejection changes nothing: no leave, no demo takeover, no seat.
      if ((this.credits.get(connId) ?? 0) < 1) {
        this.send(connId, { type: 'error', code: 'insert-coin' });
        return;
      }
      this.credits.set(connId, (this.credits.get(connId) ?? 0) - 1);
    }

    if (current) this.leave(current, connId);
    if (!table) table = this.openTable(game, mode);
    if (table.demo) {
      // coin drop: the attract bot steps aside for a real game (R8.4)
      table.demo = false;
      table.session = null;
      table.graceTick = -1;
      table.openTick = this.tickCount;
    }
    table.seats.push({ connId, spectator });
    const nowSeated = table.seats.filter((s) => !s.spectator).length;
    if (table.session === null && table.graceTick < 0 && nowSeated >= 2 && nowSeated < capacity) {
      table.graceTick = this.tickCount;
    }
    if (!table.session && nowSeated >= capacity) this.beginTable(table);
    this.broadcastRoster();
  }

  private openTable(game: GameId, mode: GameMode): Table {
    const table: Table = {
      id: `t${++this.tableSeq}`,
      game,
      mode,
      demo: false,
      session: null,
      seats: [],
      seed: (Math.random() * 2 ** 31) >>> 0,
      openTick: this.tickCount,
      graceTick: -1,
      paused: false,
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
    if (seated.length > 0) this.opts.service.addPlay();
    session.begin();
  }

  private recordScores(tableId: string, state: GameStateBase): void {
    const table = this.tables.get(tableId);
    if (!table || table.demo) return;
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
      if (table.demo) {
        if (!this.opts.service.snapshot().outOfOrder.includes(table.game)) this.tickDemo(table);
        continue;
      }
      const session = table.session;
      const dueSnap = this.tickCount - table.lastSnap >= SNAPSHOT_EVERY;
      if (!session) {
        const seated = table.seats.filter((s) => !s.spectator).length;
        const cap = table.mode === 'versus' ? (REGISTRY[table.game]?.capacity ?? 2) : 1;
        if (seated >= 2 && seated < cap && table.graceTick >= 0 && this.tickCount - table.graceTick >= START_GRACE) {
          this.beginTable(table);
          continue;
        }
        if (dueSnap) {
          table.lastSnap = this.tickCount;
          const view = this.tableView(table);
          for (const seat of table.seats) {
            this.send(seat.connId, { type: 'snapshot', table: view, data: null, tick: this.tickCount, credits: this.credits.get(seat.connId) ?? 0 });
          }
        }
        continue;
      }
      if (table.paused) {
        if (dueSnap) {
          table.lastSnap = this.tickCount;
          const view = this.tableView(table);
          const events = table.pendingEvents;
          table.pendingEvents = [];
          for (const seat of table.seats) {
            this.send(seat.connId, { type: 'snapshot', table: view, data: session.state, events, tick: this.tickCount });
          }
        }
        continue;
      }
      try {
        const evs = session.tick();
        if (evs.length > 0) table.pendingEvents.push(...evs);
      } catch (err) {
        // one bad table must never take down the whole hall
        console.error(`[arkad] table ${table.id} (${table.game}) tick failed; closing table`, err);
        this.closeTable(table);
        continue;
      }
      if (dueSnap) {
        table.lastSnap = this.tickCount;
        const events = table.pendingEvents;
        table.pendingEvents = [];
        const view = this.tableView(table);
        for (const seat of table.seats) {
          this.send(seat.connId, { type: 'snapshot', table: view, data: session.state, events, tick: this.tickCount, credits: this.credits.get(seat.connId) ?? 0 });
        }
      }
      if (session.state.phase === 'attract') this.closeTable(table);
    }
    if (this.tickCount % HALL_EVERY === 0 && this.hallWatchers.size > 0) this.broadcastHall();
  }

  private tickDemo(table: Table): void {
    const session = table.session ?? (table.session = this.demoSession(table));
    if (session.state.phase !== 'playing' && session.state.phase !== 'ready') {
      // demo runs out: flip the cabinet back to attract and re-deal (never scores)
      table.session = this.demoSession(table);
      return;
    }
    const spec = REGISTRY[table.game] as AnyGameSpec;
    if (spec.demo) session.setInput(DEMO_PLAYER, spec.demo(session.state, this.tickCount));
    try {
      session.tick();
    } catch (err) {
      console.error(`[arkad] demo ${table.game} tick failed; re-dealing`, err);
      table.session = this.demoSession(table);
    }
  }

  private broadcastHall(): void {
    const cabinets = [...this.tables.values()].map((t) => ({
      game: t.game,
      mode: t.mode,
      demo: t.demo,
      phase: t.session?.state.phase ?? 'ready',
      data: t.session?.state ?? null,
      scores: this.opts.store.top(t.game, t.mode, 3).map((e) => ({ name: e.name, score: e.score })),
      joinDeadline: this.joinDeadlineOf(t),
      players: t.seats.filter((x) => !x.spectator).length,
      spectators: t.seats.filter((x) => x.spectator).length,
    }));
    const svc = this.opts.service.snapshot();
    for (const connId of this.hallWatchers) {
      if (this.conns.has(connId)) {
        // credits are per connection: every watcher gets its own digit (R33)
        const credits = this.credits.get(connId) ?? 0;
        this.send(connId, { type: 'hallTables', cabinets, freePlay: svc.freePlay, ooo: svc.outOfOrder, tick: this.tickCount, credits });
      }
    }
  }

  private joinDeadlineOf(table: Table): number | null {
    if (table.session || table.mode !== 'versus' || table.graceTick < 0) return null;
    const deadline = table.graceTick + START_GRACE;
    return this.tickCount < deadline ? deadline : null;
  }

  private tableView(table: Table): TableView {
    const state = table.session?.state;
    return {
      spectators: table.seats.filter((x) => x.spectator).length,
      id: table.id,
      game: table.game,
      mode: table.mode,
      joinDeadline: this.joinDeadlineOf(table),
      paused: table.paused,
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
    const tables = [...this.tables.values()].filter((t) => !t.demo).map((t) => this.tableView(t));
    for (const conn of this.conns.values()) {
      this.send(conn.id, { type: 'roster', players, tables });
    }
  }

  private send(connId: string, msg: ServerMessage): void {
    this.opts.send(connId, msg);
  }
}
