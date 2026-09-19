import type { Dir } from '../engine/vec';
import type { Lang } from '../i18n/i18n';
import type { GameMode, SfxEvent } from '../engine/types';

export const GAME_IDS = ['snake', 'puck', 'block', 'galaxy', 'river', 'myriad', 'coast'] as const;
export type GameId = (typeof GAME_IDS)[number];

export interface JoinMsg {
  type: 'join';
  name: string;
  lang: Lang;
}
export interface SetNameMsg {
  type: 'setName';
  name: string;
}
export interface StartMsg {
  type: 'start';
  game: GameId;
  mode: GameMode;
}
export interface InputMsg {
  type: 'input';
  dir: Dir | null;
  button: boolean;
  seq?: number;
}
export interface ScoresMsg {
  type: 'scores';
  game: GameId;
  mode: GameMode;
}
export interface BackMsg {
  type: 'back';
}
/** insert one credit into the cabinet (R17/R18) */
export interface CoinMsg {
  type: 'coin';
  /** which cabinet the credit is aimed at (R24: reject at out-of-order cabinets) */
  game?: GameId;
}
/** operator bookkeeping request (R16) */
export interface StatsMsg {
  type: 'stats';
}
/** operator free-play toggle (R17) */
export interface FreePlayMsg {
  type: 'freePlay';
  on: boolean;
}
/** seated player toggles the table pause (R26); strictly payload-free */
export interface PauseMsg {
  type: 'pause';
}
/** operator marks a cabinet out-of-order (R24) */
export interface OooMsg {
  type: 'ooo';
  game: GameId;
  out: boolean;
}
/** operator sets the hall sticker, max 24 chars, trimmed (R42) */
export interface NoteMsg {
  type: 'note';
  text: string;
}
/** subscribe/unsubscribe to the hall's live cabinet board (R8) */
export interface HallMsg {
  type: 'hall';
  watch: boolean;
}
export type ClientMessage =
  | JoinMsg
  | SetNameMsg
  | StartMsg
  | InputMsg
  | ScoresMsg
  | BackMsg
  | HallMsg
  | CoinMsg
  | StatsMsg
  | FreePlayMsg
  | OooMsg
  | PauseMsg
  | NoteMsg;

export interface TablePlayerView {
  id: string;
  name: string;
  score: number;
  lives: number;
  active: boolean;
}
export interface TableView {
  id: string;
  game: GameId;
  mode: GameMode;
  phase: string;
  players: TablePlayerView[];
  turn?: string;
  winner?: string;
  /** absolute server tick when the join window closes; null = no window (R25) */
  joinDeadline?: number | null;
  /** operator-visible frozen flag while the seated player holds the pause (R26) */
  paused?: boolean;
  /** server-counted spectators; badges only, seating rules untouched (R29) */
  spectators?: number;
  /** absolute server tick when a full versus table deals; null = no window (R50) */
  readyAt?: number | null;
}
export interface WelcomeMsg {
  type: 'welcome';
  playerId: string;
  serverName: string;
  games: { id: GameId; solo: boolean; versus: boolean }[];
}
export interface RosterMsg {
  type: 'roster';
  players: { id: string; name: string }[];
  tables: TableView[];
}
export interface SnapshotMsg {
  type: 'snapshot';
  table: TableView;
  /** opaque per-game render state */
  data: unknown;
  /** sound events produced during this tick */
  events?: SfxEvent[];
  /** authoritative server tick, for deriving join-window countdowns (R25) */
  tick?: number;
  /** recipient's remaining credits in coin mode (R33) */
  credits?: number;
}
export interface ScoreEntry {
  name: string;
  score: number;
  date: string;
}
export interface ScoreListMsg {
  type: 'scoreList';
  game: GameId;
  mode: GameMode;
  entries: ScoreEntry[];
}
export interface ErrorMsg {
  type: 'error';
  code: string;
}
/** one cabinet's live screen for the hall view: demo or match, plus its board */
export interface HallCabinet {
  game: GameId;
  mode: GameMode;
  demo: boolean;
  phase: string;
  data: unknown;
  scores: { name: string; score: number }[];
  /** absolute server tick when the join window closes; null = no window (R25) */
  joinDeadline: number | null;
  /** server-counted occupied seats and onlookers (R28/R29) */
  players: number;
  spectators: number;
}
export interface HallTablesMsg {
  type: 'hallTables';
  cabinets: HallCabinet[];
  /** coin mode badge for the hall (R17.3) */
  freePlay: boolean;
  /** cabinets marked out-of-order by the operator (R24) */
  ooo: GameId[];
  /** authoritative server tick, for join-window countdowns (R25) */
  tick: number;
  /** recipient's remaining credits in coin mode (R33) */
  credits: number;
  /** operator hall sticker, '' when unset (R42) */
  note: string;
}
export interface StatsReplyMsg {
  type: 'statsReply';
  plays: number;
  coins: number;
  freePlay: boolean;
  uptimeSec: number;
  /** calendar-day bucket (Europe/Stockholm) and its counters (R31) */
  day: string;
  playsToday: number;
  coinsToday: number;
}
export type ServerMessage =
  | WelcomeMsg
  | RosterMsg
  | SnapshotMsg
  | ScoreListMsg
  | ErrorMsg
  | HallTablesMsg
  | StatsReplyMsg;

const isDir = (d: unknown): d is Dir => {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  const unit = (n: unknown) => n === -1 || n === 0 || n === 1;
  if (!unit(o.dx) || !unit(o.dy)) return false;
  // exactly one axis may move: no diagonals, no zero vector
  return (o.dx === 0) !== (o.dy === 0);
};

const isMode = (m: unknown): m is GameMode => m === 'solo' || m === 'versus';
const isGameId = (g: unknown): g is GameId => GAME_IDS.includes(g as GameId);
const isLang = (l: unknown): l is Lang => l === 'en' || l === 'ja';

/**
 * P2-5: the exact alphabet the in-canvas namepad keyboard can produce
 * (client/namepad.ts VALID — kept as a local copy because core must never
 * import from the client). Upper-cased first, so names read like 1982
 * high-score boards and control bytes, markup or emoji never reach the
 * roster, the boards or scores.json.
 */
const sanitizeName = (raw: string): string =>
  raw.toUpperCase().replace(/[^A-Z0-9 .'!?-]/g, '').slice(0, 12);

/**
 * Edge validator: every client frame passes through here.
 *
 * Unknown *fields* are intentionally ignored on every frame type except
 * `pause`, which must arrive as the bare `{"type":"pause"}` (P2-5,
 * documented fail-open): forward-compatible frames are harmless, and only
 * the pause toggle is held to a strict shape because it gates table state.
 * Field *values* are never trusted — enums, finiteness, directions and
 * lengths are all validated or clamped below.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let o: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    o = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  switch (o.type) {
    case 'join':
      return typeof o.name === 'string' && isLang(o.lang)
        ? { type: 'join', name: sanitizeName(o.name), lang: o.lang }
        : null;
    case 'setName':
      return typeof o.name === 'string' ? { type: 'setName', name: sanitizeName(o.name) } : null;
    case 'start':
      return isGameId(o.game) && isMode(o.mode) ? { type: 'start', game: o.game, mode: o.mode } : null;
    case 'input': {
      if (o.dir !== null && !isDir(o.dir)) return null;
      const msg: InputMsg = {
        type: 'input',
        dir: (o.dir as Dir | null) ?? null,
        button: o.button === true,
      };
      if (typeof o.seq === 'number' && Number.isFinite(o.seq)) msg.seq = Math.trunc(o.seq);
      return msg;
    }
    case 'scores':
      return isGameId(o.game) && isMode(o.mode) ? { type: 'scores', game: o.game, mode: o.mode } : null;
    case 'back':
      return { type: 'back' };
    case 'hall':
      return typeof o.watch === 'boolean' ? { type: 'hall', watch: o.watch } : null;
    case 'coin': {
      if (o.game === undefined) return { type: 'coin' };
      return isGameId(o.game) ? { type: 'coin', game: o.game } : null;
    }
    case 'note':
      return typeof o.text === 'string'
        ? { type: 'note', text: o.text.trim().replace(/\s+/g, ' ').slice(0, 24) }
        : null;
    case 'pause':
      // strictly the bare frame: any extra field is a malformed toggle (R26.3)
      return Object.keys(o).length === 1 ? { type: 'pause' } : null;
    case 'ooo':
      return isGameId(o.game) && typeof o.out === 'boolean'
        ? { type: 'ooo', game: o.game, out: o.out }
        : null;
    case 'stats':
      return { type: 'stats' };
    case 'freePlay':
      return typeof o.on === 'boolean' ? { type: 'freePlay', on: o.on } : null;
    default:
      return null;
  }
}

export const serialize = (msg: ClientMessage | ServerMessage): string => JSON.stringify(msg);
