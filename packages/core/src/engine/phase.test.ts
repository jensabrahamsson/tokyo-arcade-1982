import { describe, it, expect } from 'vitest';
import { enterPhase, tickPhase, canTransition, type Phase, type PhaseState } from './phase';

const ready = (): PhaseState => enterPhase({ phase: 'attract', phaseTimer: 0 }, 'ready');
const playing = (): PhaseState => enterPhase(ready(), 'playing');

describe('phase machine', () => {
  it('allows the documented arcade flow', () => {
    expect(canTransition('attract', 'ready')).toBe(true);
    expect(canTransition('ready', 'playing')).toBe(true);
    expect(canTransition('playing', 'roundOver')).toBe(true);
    expect(canTransition('playing', 'gameOver')).toBe(true);
    expect(canTransition('roundOver', 'playing')).toBe(true);
    expect(canTransition('gameOver', 'attract')).toBe(true);
  });

  it('rejects illegal transitions', () => {
    expect(canTransition('attract', 'playing')).toBe(false);
    expect(canTransition('playing', 'attract')).toBe(false);
    expect(canTransition('ready', 'gameOver')).toBe(false);
  });

  it('enterPhase sets a timer from defaults', () => {
    let s = playing();
    expect(s.phase).toBe('playing');
    expect(s.phaseTimer).toBe(0);
    s = enterPhase(s, 'roundOver');
    expect(s.phaseTimer).toBeGreaterThan(0);
  });

  it('throws on illegal enterPhase', () => {
    expect(() => enterPhase(ready(), 'roundOver')).toThrow();
  });

  it('tickPhase counts down and fires auto event at zero', () => {
    let s = enterPhase(playing(), 'roundOver');
    const t = s.phaseTimer;
    s = tickPhase(s, t - 0.1).state;
    expect(s.phase).toBe('roundOver');
    const res = tickPhase(s, 0.2);
    expect(res.event).toBe('countdownDone');
    expect(res.state.phase).toBe('playing');
  });

  it('gameOver auto-returns to attract', () => {
    const s = enterPhase(playing(), 'gameOver');
    const res = tickPhase(s, s.phaseTimer + 0.01);
    expect(res.state.phase).toBe('attract');
  });

  it('tickPhase does nothing on playing', () => {
    const s = playing();
    const res = tickPhase(s, 100);
    expect(res.state.phase).toBe('playing');
    expect(res.event).toBeUndefined();
  });
});
