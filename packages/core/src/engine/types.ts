import type { PhaseState } from './phase';
import type { Dir } from './vec';

export type GameMode = 'solo' | 'versus';

export interface PlayerInput {
  dir: Dir | null;
  button: boolean;
  /** increments with every keydown press; lets games detect repeated same-direction presses */
  seq?: number;
}

export const NO_INPUT: PlayerInput = { dir: null, button: false };

export interface GameConfig {
  mode: GameMode;
  playerIds: string[];
  seed: number;
}

export type SfxName =
  | 'eat'
  | 'die'
  | 'power'
  | 'shoot'
  | 'hit'
  | 'levelUp'
  | 'coin'
  | 'start'
  | 'extraLife'
  | 'goal'
  | 'hop'
  | 'bounce';

export interface SfxEvent {
  name: SfxName;
  player?: string;
}

/** Everything a running game needs. Must stay plain-JSON serializable. */
export interface GameStateBase extends PhaseState {
  level: number;
  scores: Record<string, number>;
  lives: Record<string, number>;
  sfx: SfxEvent[];
  winner?: string;
  /** current player id for turn-based versus (VS. System style) */
  turn?: string;
}

export interface GameSpec<S extends GameStateBase> {
  readonly id: string;
  readonly supportsVersus: boolean;
  /** max seated players in versus mode (2 = strict duel, 4 = free-for-all) */
  readonly capacity: number;
  /** Alternate players take turns (VS. System style). */
  readonly turnBased: boolean;
  create(config: GameConfig): S;
  /** Advance exactly one fixed tick. Pure and deterministic. */
  step(state: S, inputs: Record<string, PlayerInput>): S;
}

export type AnyGameSpec = GameSpec<GameStateBase>;

export function emptyInputs(playerIds: readonly string[]): Record<string, PlayerInput> {
  const out: Record<string, PlayerInput> = {};
  for (const id of playerIds) out[id] = NO_INPUT;
  return out;
}

export function withSfx<S extends GameStateBase>(state: S, ...events: SfxEvent[]): S {
  return { ...state, sfx: [...state.sfx, ...events] };
}
