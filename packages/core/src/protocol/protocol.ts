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
  | FreePlayMsg;

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
}
export interface HallTablesMsg {
  type: 'hallTables';
  cabinets: HallCabinet[];
  /** coin mode badge for the hall (R17.3) */
  freePlay: boolean;
}
export interface StatsReplyMsg {
  type: 'statsReply';
  plays: number;
  coins: number;
  freePlay: boolean;
  uptimeSec: number;
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
        ? { type: 'join', name: String(o.name).slice(0, 12), lang: o.lang }
        : null;
    case 'setName':
      return typeof o.name === 'string' ? { type: 'setName', name: o.name.slice(0, 12) } : null;
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
    case 'coin':
      return { type: 'coin' };
    case 'stats':
      return { type: 'stats' };
    case 'freePlay':
      return typeof o.on === 'boolean' ? { type: 'freePlay', on: o.on } : null;
    default:
      return null;
  }
}

export const serialize = (msg: ClientMessage | ServerMessage): string => JSON.stringify(msg);
