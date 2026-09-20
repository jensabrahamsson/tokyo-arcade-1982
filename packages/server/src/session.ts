import {
  type AnyGameSpec,
  type GameConfig,
  type GameStateBase,
  type PlayerInput,
  type SfxEvent,
  NO_INPUT,
  enterPhase,
  withSfx,
} from '@arkad/core';

const remapRecord = <T>(obj: Record<string, T>, from: string, to: string): Record<string, T> => {
  if (!(from in obj)) return obj;
  const next = { ...obj };
  next[to] = next[from]!;
  delete next[from];
  return next;
};

/** P1-B: a reconnecting socket gets a new conn id; move this state's player
 *  maps onto it so scores/snakes/inputs follow the seat. Pure. */
export function rebindPlayerIds<S extends GameStateBase>(state: S, from: string, to: string): S {
  if (from === to) return state;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(state)) {
    next[key] = (state as Record<string, unknown>)[key];
  }
  next.scores = remapRecord(state.scores, from, to);
  next.lives = remapRecord(state.lives, from, to);
  next.sfx = state.sfx.map((e) => (e.player === from ? { ...e, player: to } : e));
  if (state.winner === from) next.winner = to;
  if (state.turn === from) next.turn = to;
  for (const key of Object.keys(state)) {
    if (key === 'scores' || key === 'lives' || key === 'sfx') continue;
    const v = (state as Record<string, unknown>)[key];
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, from)) {
      next[key] = remapRecord(v as Record<string, unknown>, from, to);
    }
  }
  return next as S;
}

export class Session {
  state: GameStateBase;
  inputs: Record<string, PlayerInput> = {};
  private pendingSfx: SfxEvent[] = [];
  onGameOver?: (state: GameStateBase) => void;
  private started = false;
  private gameOverReported = false;

  constructor(
    public readonly id: string,
    public readonly spec: AnyGameSpec,
    config: GameConfig,
  ) {
    this.state = spec.create(config);
    for (const p of config.playerIds) this.inputs[p] = NO_INPUT;
  }

  begin(): void {
    if (this.started) return;
    this.started = true;
    this.state = enterPhase(this.state, 'playing');
    this.pendingSfx.push({ name: 'start' });
  }

  setInput(playerId: string, input: PlayerInput): void {
    if (playerId in this.inputs) this.inputs[playerId] = input;
  }

  /** P1-B: follow a reconnecting player onto their new conn id */
  rebindPlayer(from: string, to: string): void {
    if (from === to) return;
    if (from in this.inputs) {
      this.inputs[to] = this.inputs[from]!;
      delete this.inputs[from];
    }
    this.state = rebindPlayerIds(this.state, from, to);
  }

  tick(): SfxEvent[] {
    const prev = this.state.phase;
    this.state = this.spec.step(this.state, this.inputs);
    const sfx = this.pendingSfx.concat(this.state.sfx);
    this.pendingSfx = [];
    this.state = { ...this.state, sfx: [] };
    if (this.state.phase === 'gameOver' && prev !== 'gameOver') this.reportGameOver();
    return sfx;
  }

  private reportGameOver(): void {
    if (this.gameOverReported || this.state.phase !== 'gameOver') return;
    this.gameOverReported = true;
    this.onGameOver?.(this.state);
  }
}
