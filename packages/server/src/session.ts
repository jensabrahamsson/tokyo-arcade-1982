import {
  type AnyGameSpec,
  type GameConfig,
  type GameStateBase,
  type PlayerInput,
  type SfxEvent,
  NO_INPUT,
  enterPhase,
} from '@arkad/core';

export class Session {
  state: GameStateBase;
  inputs: Record<string, PlayerInput> = {};
  private pendingSfx: SfxEvent[] = [];
  onGameOver?: (state: GameStateBase) => void;
  private started = false;
  private gameOverReported = false;
  private readonly demo: boolean;

  constructor(
    public readonly id: string,
    public readonly spec: AnyGameSpec,
    config: GameConfig,
  ) {
    this.demo = config.demo === true;
    this.state = spec.create(config);
    if (this.demo) this.state = { ...this.state, demo: true };
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
    if (this.demo || this.state.demo) return;
    this.onGameOver?.(this.state);
  }
}
