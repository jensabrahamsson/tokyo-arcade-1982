import {
  attractDemoTier,
  demoRuns,
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
  NO_INPUT,
} from '@arkad/core';
import { Session } from './session';
import type { HighScoreStore } from './highscores';
import type { ServiceStore } from './service';
import type { DemoInputPolicy } from './jevPolicy';

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
  /** tick the versus table became full; -1 = no ready window (R50) */
  readyTick: number;
  lastSnap: number;
  pendingEvents: SfxEvent[];
}

const SNAPSHOT_EVERY = 2;
const HALL_EVERY = 6;
const DEMO_PLAYER = 'demo';

/** P1-5: coin slot debounce — a human can not out-coin a curl */
export const COIN_RATE_LIMIT = 4;
export const COIN_WINDOW_TICKS = 60;

/**
 * P2-2: a dropped LAN socket is not a dropped coin. Inserted credits wait
 * this many ticks (60 s at 60 Hz) for a reconnect that joins with the same
 * name+lang, then are lost with it. In-memory only and bounded — the wallet
 * is never persisted to disk.
 */
export const CREDIT_RECONNECT_GRACE = 3600;
export const MAX_PARKED_WALLETS = 32;

/** P2-D: a live (!demo) table of the same game pauses that cabinet's attract
 *  bot so we don't pay CPU for a demo the hall already hid. */
export function liveTablePausesDemo(
  game: GameId,
  tables: Iterable<{ game: GameId; demo: boolean }>,
): boolean {
  for (const t of tables) {
    if (t.game === game && !t.demo) return true;
  }
  return false;
}

export interface CoinRateWindow {
  sinceTick: number;
  count: number;
}

/** pure coin-rate state machine: rolls the one-second window, allows N per window */
export function coinRateAllows(
  win: CoinRateWindow | null,
  nowTick: number,
  limit = COIN_RATE_LIMIT,
  windowTicks = COIN_WINDOW_TICKS,
): { win: CoinRateWindow; allow: boolean } {
  if (!win || nowTick - win.sinceTick >= windowTicks) {
    return { win: { sinceTick: nowTick, count: 1 }, allow: true };
  }
  const count = win.count + 1;
  return { win: { sinceTick: win.sinceTick, count }, allow: count <= limit };
}
/** ticks a half-filled versus table waits for extra players before dealing (2 s at 60 Hz) */
export const START_GRACE = 120;
/** ticks a full versus table waits with READY 3-2-1 before dealing (R50) */
export const READY_WINDOW = 180;

export interface ArcadeOptions {
  send: (connId: string, msg: ServerMessage) => void;
  store: HighScoreStore;
  service: ServiceStore;
  /** optional attract self-play (Jev); missing/throwing policy fail-closed to spec.demo */
  jev?: DemoInputPolicy;
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
  /** P2-2: wallets parked at disconnect, keyed `name|lang`, in memory only */
  private parked = new Map<string, { credits: number; expiresTick: number }>();
  private coinRate = new Map<string, CoinRateWindow>();
  /** last tick a human sat at each cabinet, for attract energy tiers (R39) */
  private lastHuman = new Map<GameId, number>();
  private readonly bootMs = Date.now();

  constructor(private readonly opts: ArcadeOptions) {
    this.openDemoTables();
  }

  /** every idle cabinet plays itself, 1982 style (R8) */
  private openDemoTables(): void {
    for (const game of GAME_IDS) this.openDemoTable(game);
  }

  private openDemoTable(game: GameId): void {
    const id = `demo-${game}`;
    if (this.tables.has(id)) return;
    const table: Table = {
      id,
      game,
      mode: 'solo',
      demo: true,
      session: null,
      seats: [],
      seed: (Math.random() * 2 ** 31) >>> 0,
      openTick: 0,
      graceTick: -1,
      paused: false,
      readyTick: -1,
      lastSnap: -999,
      pendingEvents: [],
    };
    table.session = this.demoSession(table);
    this.tables.set(id, table);
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
    const conn = this.conns.get(connId);
    this.conns.delete(connId);
    this.hallWatchers.delete(connId);
    const credits = this.credits.get(connId) ?? 0;
    this.credits.delete(connId);
    this.coinRate.delete(connId);
    // P2-2: park the wallet (never an anonymous '???') so the same player
    // reconnecting by name+lang within the grace window picks it right up
    if (conn && credits > 0 && conn.name !== '???') this.parkCredits(conn.name, conn.lang, credits);
    for (const table of this.tables.values()) {
      table.seats = table.seats.filter((s) => s.connId !== connId);
      this.clearReadyIfUnderstaffed(table);
      // a disconnected player must never leave others holding a frozen table (R26.3)
      if (table.paused) table.paused = false;
      // demos are seatless by design (P0-1): never tear one down for having no seats
      if (!table.demo && !table.seats.some((s) => !s.spectator)) this.closeTable(table);
    }
    this.broadcastRoster();
  }

  handleMessage(connId: string, msg: ClientMessage): void {
    const conn = this.conns.get(connId);
    if (!conn) return;
    switch (msg.type) {
      case 'join': {
        conn.name = msg.name.trim() || '???';
        conn.lang = msg.lang;
        // P2-2: a reconnecting player claims the wallet parked for this name+lang
        const key = `${conn.name.toLowerCase()}|${conn.lang}`;
        const parked = this.parked.get(key);
        if (parked) {
          this.parked.delete(key);
          if (parked.expiresTick > this.tickCount) {
            this.credits.set(connId, (this.credits.get(connId) ?? 0) + parked.credits);
          }
        }
        this.send(connId, { type: 'welcome', playerId: connId, serverName: 'TOKYO ARCADE', games: GAME_LIST });
        this.broadcastRoster();
        break;
      }
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
        // P2-6: an untargeted coin can land in any cabinet, so the moment
        // one cabinet is flagged the anonymous slot closes too — insert a
        // coin while the hall is fully healthy, or aim at a game that works
        if (!msg.game && this.opts.service.snapshot().outOfOrder.length > 0) {
          this.send(connId, { type: 'error', code: 'out-of-order' });
          break;
        }
        // P1-5: debounce the slot — 4 coins per second per connection
        const rate = coinRateAllows(this.coinRate.get(connId) ?? null, this.tickCount);
        this.coinRate.set(connId, rate.win);
        if (!rate.allow) {
          this.send(connId, { type: 'error', code: 'slow-down' });
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
      case 'note':
        this.opts.service.setNote(msg.text);
        this.broadcastHall();
        break;
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
          this.clearReadyIfUnderstaffed(table);
          if (!table.demo && !table.seats.some((s) => !s.spectator)) this.closeTable(table);
          this.broadcastRoster();
        }
        break;
      }
    }
  }

  private seat(connId: string, game: GameId, mode: GameMode): void {
    this.lastHuman.set(game, this.tickCount);
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
    if (!table.session && nowSeated >= capacity) {
      // versus tables get a READY 3-2-1 window; solo deals immediately (R50)
      if (mode === 'versus') {
        if (table.readyTick < 0) table.readyTick = this.tickCount;
      } else {
        this.beginTable(table);
      }
    }
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
      readyTick: -1,
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
    this.clearReadyIfUnderstaffed(table);
    if (!table.demo && !table.seats.some((s) => !s.spectator)) this.closeTable(table);
  }

  /** an emptied seat cancels the ready window before it deals (R50.2) */
  private clearReadyIfUnderstaffed(table: Table): void {
    if (table.readyTick < 0 || table.session) return;
    const cap = table.mode === 'versus' ? (REGISTRY[table.game]?.capacity ?? 2) : 1;
    const seated = table.seats.filter((s) => !s.spectator).length;
    if (seated < cap) table.readyTick = -1;
  }

  /** P2-2: park a disconnected player's credits under name+lang — expired
   * entries are swept on every write and the map is hard-capped, so a
   * flapping client can never grow it unboundedly. */
  private parkCredits(name: string, lang: Lang, credits: number): void {
    const now = this.tickCount;
    for (const [k, v] of this.parked) if (v.expiresTick <= now) this.parked.delete(k);
    while (this.parked.size >= MAX_PARKED_WALLETS) this.parked.delete(this.parked.keys().next().value as string);
    const key = `${name.toLowerCase()}|${lang}`;
    const prev = this.parked.get(key);
    this.parked.set(key, {
      credits: (prev?.credits ?? 0) + credits,
      expiresTick: now + CREDIT_RECONNECT_GRACE,
    });
  }

  private closeTable(table: Table): void {
    if (!this.tables.delete(table.id)) return;
    this.broadcastRoster();
    // P0-1 (R8): the cabinet an empty table just vacated goes straight back
    // to attract — the hall must never sit dark until the next coin
    if (!table.demo && ![...this.tables.values()].some((t) => t.game === table.game)) {
      this.openDemoTable(table.game);
    }
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
        const ooo = this.opts.service.snapshot().outOfOrder.includes(table.game);
        if (!ooo && !liveTablePausesDemo(table.game, this.tables.values())) this.tickDemo(table);
        continue;
      }
      const session = table.session;
      const dueSnap = this.tickCount - table.lastSnap >= SNAPSHOT_EVERY;
      if (!session) {
        if (table.readyTick >= 0 && this.tickCount - table.readyTick >= READY_WINDOW) {
          const capN = table.mode === 'versus' ? (REGISTRY[table.game]?.capacity ?? 2) : 1;
          const stillFull = table.seats.filter((s) => !s.spectator).length >= capN;
          if (stillFull) this.beginTable(table);
          else table.readyTick = -1;
          continue;
        }
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
            // P2-1: a frozen frame must not zero the HUD — credits ride like on live snapshots
            this.send(seat.connId, { type: 'snapshot', table: view, data: session.state, events, tick: this.tickCount, credits: this.credits.get(seat.connId) ?? 0 });
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
    // sleepy cabinets idle on their own clock; humans always wake them (R39.1)
    const idleMs = (this.tickCount - (this.lastHuman.get(table.game) ?? 0)) * (1000 / 60);
    if (!demoRuns(attractDemoTier(idleMs), this.tickCount)) return;
    const session = table.session ?? (table.session = this.demoSession(table));
    if (session.state.phase !== 'playing' && session.state.phase !== 'ready') {
      // demo runs out: flip the cabinet back to attract and re-deal (never scores)
      table.session = this.demoSession(table);
      return;
    }
    const spec = REGISTRY[table.game] as AnyGameSpec;
    const demoInput = spec.demo ? spec.demo(session.state, this.tickCount) : NO_INPUT;
    let input = demoInput;
    const jev = this.opts.jev;
    if (jev?.covers(table.game)) {
      try {
        input = jev.inputFor(table.game, session.state, this.tickCount, demoInput);
      } catch {
        input = demoInput;
      }
    }
    session.setInput(DEMO_PLAYER, input);
    try {
      session.tick();
    } catch (err) {
      console.error(`[arkad] demo ${table.game} tick failed; re-dealing`, err);
      table.session = this.demoSession(table);
    }
  }

  private broadcastHall(): void {
    // P1-1: one row per cabinet in the hall; a live table always wins over
    // the attract demo of the same game (the client renders find(game)).
    // Among live tables of one game (solo + versus), the more crowded wins.
    const byGame = new Map<GameId, Table>();
    for (const t of this.tables.values()) {
      const prev = byGame.get(t.game);
      if (!prev || (prev.demo && !t.demo)) {
        byGame.set(t.game, t);
      } else if (!prev.demo && !t.demo) {
        const crowd = (x: Table) => x.seats.filter((s) => !s.spectator).length;
        if (crowd(t) > crowd(prev)) byGame.set(t.game, t);
      }
    }
    const cabinets = [...byGame.values()].map((t) => ({
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
        this.send(connId, { type: 'hallTables', cabinets, freePlay: svc.freePlay, ooo: svc.outOfOrder, tick: this.tickCount, credits, note: svc.note });
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
      readyAt: table.readyTick >= 0 && !table.session ? table.readyTick + READY_WINDOW : null,
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
