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

export class Session {
  state: GameStateBase;
  inputs: Record<string, PlayerInput> = {};
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
    this.state = withSfx(enterPhase(this.state, 'playing'), { name: 'start' });
  }

  setInput(playerId: string, input: PlayerInput): void {
    if (playerId in this.inputs) this.inputs[playerId] = input;
  }

  tick(): SfxEvent[] {
    const prev = this.state.phase;
    this.state = this.spec.step(this.state, this.inputs);
    const sfx = this.state.sfx;
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
