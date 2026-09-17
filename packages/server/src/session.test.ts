import { describe, it, expect } from 'vitest';
import { Session } from './session';
import { snakeSpec } from '@arkad/core';
import { DIRS } from '@arkad/core';

describe('Session', () => {
  const mk = (mode: 'solo' | 'versus' = 'solo') =>
    new Session('t1', snakeSpec, { mode, playerIds: mode === 'solo' ? ['p1'] : ['p1', 'p2'], seed: 1 });

  it('stays in ready phase until started', () => {
    const s = mk();
    for (let i = 0; i < 10; i++) s.tick();
    expect(s.state.phase).toBe('ready');
  });

  it('begin() moves to playing and ticks advance the snake', () => {
    const s = mk();
    s.begin();
    expect(s.state.phase).toBe('playing');
    const before = (s.state as never as { snakes: Record<string, { body: { x: number }[] }> }).snakes['p1']!.body[0]!.x;
    for (let i = 0; i < snakeSpec.create({ mode: 'solo', playerIds: ['p1'], seed: 1 }).moveInterval; i++) s.tick();
    const after = (s.state as never as { snakes: Record<string, { body: { x: number }[] }> }).snakes['p1']!.body[0]!.x;
    expect(after).toBe(before + 1);
  });

  it('applies player inputs', () => {
    const s = mk();
    s.begin();
    s.setInput('p1', { dir: DIRS.up, button: false });
    for (let i = 0; i < 10; i++) s.tick();
    expect((s.state as never as { snakes: Record<string, { dir: { dy: number } }> }).snakes['p1']!.dir.dy).toBe(-1);
  });

  it('reports gameOver exactly once via callback', () => {
    const s = mk('versus');
    s.begin();
    const ended: unknown[] = [];
    s.onGameOver = (state) => ended.push(state);
    let ticks = 0;
    while (s.state.phase !== 'gameOver' && ticks++ < 5000) {
      s.setInput('p2', { dir: DIRS.down, button: false });
      s.tick();
    }
    expect(s.state.phase).toBe('gameOver');
    for (let i = 0; i < 200; i++) s.tick();
    expect(ended).toHaveLength(1);
    expect((ended[0] as { winner?: string }).winner).toBe('p1');
  });

  it('ignores inputs from players not seated', () => {
    const s = mk('versus');
    s.begin();
    s.setInput('p99', { dir: DIRS.up, button: false });
    expect(Object.keys((s.state as unknown as { snakes?: Record<string, unknown> }).snakes ?? {})).toHaveLength(2);
  });

  it('never reports gameOver highscore hook for a demo session', () => {
    const s = new Session('t-demo', snakeSpec, {
      mode: 'solo',
      playerIds: ['p1'],
      seed: 1,
      demo: true,
    });
    s.begin();
    const st = s.state as unknown as {
      snakes: Record<string, { alive: boolean; respawnTimer: number; body: unknown; dir: unknown; pendingDir: unknown }>;
    };
    s.state = {
      ...s.state,
      demo: true,
      lives: { p1: 0 },
      snakes: { p1: { ...st.snakes['p1']!, alive: false, respawnTimer: 0 } },
    } as typeof s.state;
    const ended: unknown[] = [];
    s.onGameOver = (state) => ended.push(state);
    for (let i = 0; i < 40; i++) s.tick();
    expect(s.state.phase).toBe('gameOver');
    expect(ended).toHaveLength(0);
  });
});
