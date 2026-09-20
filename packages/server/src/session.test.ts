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

  it('rebindPlayer moves scores, lives and snake onto the new conn id (P1-B)', () => {
    const s = mk();
    s.begin();
    s.setInput('p1', { dir: DIRS.up, button: false });
    for (let i = 0; i < 4; i++) s.tick();
    const before = JSON.parse(JSON.stringify(s.state)) as {
      scores: Record<string, number>;
      lives: Record<string, number>;
      snakes: Record<string, unknown>;
    };
    s.rebindPlayer('p1', 'c9');
    expect(s.state.scores['c9']).toBe(before.scores['p1']);
    expect(s.state.lives['c9']).toBe(before.lives['p1']);
    expect(s.state.scores['p1']).toBeUndefined();
    expect((s.state as unknown as { snakes: Record<string, unknown> }).snakes['c9']).toEqual(before.snakes['p1']);
    expect((s.state as unknown as { snakes: Record<string, unknown> }).snakes['p1']).toBeUndefined();
    s.setInput('c9', { dir: DIRS.down, button: false });
    for (let i = 0; i < 12; i++) s.tick();
    expect((s.state as unknown as { snakes: Record<string, { dir: { dy: number } }> }).snakes['c9']!.dir.dy).toBe(1);
  });
});
