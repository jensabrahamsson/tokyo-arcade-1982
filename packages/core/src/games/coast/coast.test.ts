import { describe, it, expect } from 'vitest';
import { coastSpec, createCoast, curveAt, TRACK_LEN, CHECKPOINTS, type CoastState } from './coast';
import { NO_INPUT, type GameConfig, type PlayerInput } from '../../engine/types';

const cfg: GameConfig = { mode: 'solo', playerIds: ['p1'], seed: 7 };
const play = (s: CoastState): CoastState => ({ ...s, phase: 'playing' });
const pedal = { dir: null, button: true };
const brake = { dir: { dx: 0, dy: 1 }, button: true };
const left = { dir: { dx: -1, dy: 0 }, button: true };
const run = (s: CoastState, input: PlayerInput, n: number): CoastState => {
  let cur = s;
  for (let i = 0; i < n && cur.phase === 'playing'; i++) cur = coastSpec.step(cur, { p1: input });
  return cur;
};

describe('coast create', () => {
  it('starts ready with time on the clock and a seeded obstacle field', () => {
    const s = createCoast(cfg);
    expect(s.phase).toBe('ready');
    expect(s.timeLeft).toBeGreaterThan(1200);
    expect(s.obstacles.length).toBeGreaterThan(8);
    expect(s.dist).toBe(0);
    expect(CHECKPOINTS.length).toBeGreaterThanOrEqual(3);
  });

  it('obstacles are deterministic per seed and differ across seeds', () => {
    const a = JSON.stringify(createCoast({ ...cfg, seed: 11 }).obstacles);
    const b = JSON.stringify(createCoast({ ...cfg, seed: 11 }).obstacles);
    const c = JSON.stringify(createCoast({ ...cfg, seed: 12 }).obstacles);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('curveAt is pure, bounded and follows the segment pattern', () => {
    expect(curveAt(0)).toBe(curveAt(0));
    for (let d = 0; d < 200; d++) {
      const c = curveAt(d * 20);
      expect(c).toBeGreaterThanOrEqual(-1);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

describe('coast physics', () => {
  it('throttle accelerates and coasting decays; brake stops fast', () => {
    let s = run(play(createCoast(cfg)), pedal, 60);
    expect(s.speed).toBeGreaterThan(10);
    const coasted = run({ ...s, speed: 100 }, NO_INPUT, 30);
    expect(coasted.speed).toBeLessThan(100);
    const braked = run({ ...s, speed: 100 }, brake, 30);
    expect(braked.speed).toBeLessThan(coasted.speed);
  });

  it('steering moves the car and clamps to the verge', () => {
    let s = run(play(createCoast(cfg)), { dir: { dx: -1, dy: 0 }, button: true }, 1);
    expect(s.playerX).toBeLessThan(0);
    s = run({ ...s, speed: 60 }, left, 400);
    expect(s.playerX).toBeGreaterThanOrEqual(-2);
    expect(s.playerX).toBeLessThanOrEqual(-1);
  });

  it('curves push the car outward', () => {
    const curved = { ...play(createCoast(cfg)), dist: 0 };
    // find a right-hand curve segment and sit inside it
    let d = 0;
    while (curveAt(d) <= 0.2 && d < 4000) d += 20;
    const s = coastSpec.step({ ...curved, dist: d, speed: 120, playerX: 0 }, { p1: NO_INPUT });
    expect(s.playerX).not.toBe(0);
  });

  it('off-road bleeds speed toward the off-road cap', () => {
    let s = { ...play(createCoast(cfg)), speed: 140, playerX: 1.6 };
    s = run(s, pedal, 60);
    expect(s.speed).toBeLessThan(90);
    expect(s.speed).toBeGreaterThan(0);
  });

  it('obstacles hit once, slow the car hard and emit a hit sfx', () => {
    const s0 = play(createCoast(cfg));
    const obs = s0.obstacles[0]!;
    let s: CoastState = { ...s0, dist: obs.d - 1, playerX: obs.x, speed: 120 };
    let hit = false;
    for (let i = 0; i < 4 && s.phase === 'playing'; i++) {
      s = coastSpec.step(s, { p1: pedal });
      if (s.sfx.some((e) => e.name === 'hit')) hit = true;
    }
    expect(hit).toBe(true);
    expect(s.speed).toBeLessThan(80);
    expect(s.obstacles[0]!.hit).toBe(true);
    const after = run(s, pedal, 3);
    expect(after.obstacles[0]!.hit).toBe(true);
  });

  it('checkpoints extend time and score, each only once', () => {
    const cp = CHECKPOINTS[0]!;
    let s = run({ ...play(createCoast(cfg)), dist: cp - 4, speed: 100, timeLeft: 2000 }, pedal, 12);
    expect(s.checkpoints).toBe(1);
    expect(s.scores['p1']).toBeGreaterThanOrEqual(300);
    expect(s.timeLeft).toBeGreaterThan(2000 - 12);
    const before = s.scores['p1']!;
    s = run(s, pedal, 60);
    expect(s.scores['p1']).toBe(before);
  });

  it('reaching LO castle ends the run with a goal bonus', () => {
    let s = run({ ...play(createCoast(cfg)), dist: TRACK_LEN - 3, speed: 100 }, pedal, 8);
    expect(s.phase).toBe('gameOver');
    expect(s.scores['p1']).toBeGreaterThanOrEqual(1000);
    expect(s.sfx.some((e) => e.name === 'goal')).toBe(true);
  });

  it('running out of time ends the run', () => {
    const s = run({ ...play(createCoast(cfg)), timeLeft: 3 }, pedal, 10);
    expect(s.phase).toBe('gameOver');
  });

  it('step never mutates the state it was handed', () => {
    let s = play(createCoast(cfg));
    for (let i = 0; i < 60; i++) {
      const before = JSON.stringify(s);
      const next = coastSpec.step(s, { p1: i % 7 === 0 ? brake : pedal });
      expect(JSON.stringify(s)).toBe(before);
      s = next;
    }
  });
});
