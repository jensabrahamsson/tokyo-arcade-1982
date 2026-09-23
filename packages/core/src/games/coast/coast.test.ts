import { describe, it, expect } from 'vitest';
import {
  coastSpec,
  createCoast,
  curveAt,
  dogSlide,
  TRACK_LEN,
  BONUS_LEN,
  CHECKPOINTS,
  COAST_BILLBOARDS,
  OBSTACLE_KINDS,
  TRAFFIC_KINDS,
  type CoastState,
} from './coast';
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

describe('coast roadside billboards (R54.7 data)', () => {
  it('carries a fixed, ordered set of drive-past boards with copy', () => {
    expect(COAST_BILLBOARDS.length).toBeGreaterThanOrEqual(5);
    let d = -1;
    for (const b of COAST_BILLBOARDS) {
      expect(b.d).toBeGreaterThan(d); // strictly ordered along the track
      d = b.d;
      expect(b.d).toBeGreaterThan(0);
      expect(b.d).toBeLessThan(TRACK_LEN);
      expect(Math.abs(b.side)).toBe(1);
      expect(b.text.length).toBeGreaterThan(3);
      expect(b.text.length).toBeLessThanOrEqual(24);
    }
    // the LO-borgen beat stays the last landmark, never a billboard at the gate
    expect(COAST_BILLBOARDS[COAST_BILLBOARDS.length - 1]!.d).toBeLessThan(TRACK_LEN - 100);
  });

  it('Havana board is spelled HAVANNA, not HABANNA (P2-F)', () => {
    const texts = COAST_BILLBOARDS.map((b) => b.text).join('\n');
    expect(texts).toContain('HAVANNA');
    expect(texts).not.toContain('HABANNA');
  });
});

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

  it('obstacles carry a readable prop kind (data only — client draws the sprite)', () => {
    const s = createCoast(cfg);
    expect(OBSTACLE_KINDS.length).toBeGreaterThanOrEqual(4);
    for (const o of s.obstacles) {
      expect(OBSTACLE_KINDS.includes(o.kind)).toBe(true);
    }
    const kindsUsed = new Set(s.obstacles.map((o) => o.kind));
    expect(kindsUsed.size).toBeGreaterThan(1);
    const clone = JSON.parse(JSON.stringify(s)) as CoastState;
    expect(clone.obstacles[0]!.kind).toBe(s.obstacles[0]!.kind);
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

  it('reaching LO castle pays the goal bonus and opens the bonus stage', () => {
    // The castle used to freeze the run (phase gameOver, goal sting left on
    // that frame). The gate still pays the same bonus and fires the same
    // sting, then the car continues onto the 1984 bonus stage. Later ticks
    // replace `sfx`, so the sting is collected on the way through.
    let s = { ...play(createCoast(cfg)), dist: TRACK_LEN - 3, speed: 100 };
    let sawGoal = false;
    for (let i = 0; i < 8 && s.phase === 'playing' && s.stage !== 'bonus'; i++) {
      s = coastSpec.step(s, { p1: pedal });
      if (s.sfx.some((e) => e.name === 'goal')) sawGoal = true;
    }
    expect(sawGoal).toBe(true);
    expect(s.phase).toBe('playing');
    expect(s.stage).toBe('bonus');
    expect(s.dist).toBeLessThan(50);
    expect(s.scores['p1']).toBeGreaterThanOrEqual(1000);
    expect(s.timeLeft).toBeGreaterThan(3600);
    expect(s.traffic.map((c) => c.kind).sort()).toEqual(['bmw', 'bmw', 'bmw', 'mercedes', 'mercedes', 'mercedes']);
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

describe('coast two-player split (R61)', () => {
  const vsCfg: GameConfig = { mode: 'versus', playerIds: ['p1', 'p2'], seed: 7 };

  it('seats a second runner on the same seeded road without changing solo', () => {
    expect(coastSpec.supportsVersus).toBe(true);
    expect(coastSpec.capacity).toBe(2);
    const solo = createCoast(cfg);
    expect(solo.mode).toBe('solo');
    expect(Object.keys(solo.runners)).toEqual(['p1']);
    const vs = createCoast(vsCfg);
    expect(vs.mode).toBe('versus');
    expect(Object.keys(vs.runners)).toEqual(['p1', 'p2']);
    expect(vs.runners.p1!.dist).toBe(0);
    expect(vs.runners.p2!.dist).toBe(0);
    expect(vs.runners.p1!.obstacles.map((o) => o.d)).toEqual(vs.runners.p2!.obstacles.map((o) => o.d));
    expect(vs.runners.p1!.obstacles).not.toBe(vs.runners.p2!.obstacles);
  });

  it('each driver steers only their own view', () => {
    let s = play(createCoast(vsCfg));
    s = coastSpec.step(s, {
      p1: { dir: { dx: -1, dy: 0 }, button: true },
      p2: NO_INPUT,
    });
    expect(s.runners.p1!.playerX).toBeLessThan(0);
    expect(s.runners.p1!.speed).toBeGreaterThan(0);
    expect(s.runners.p2!.playerX).toBe(0);
    expect(s.runners.p2!.speed).toBe(0);
    expect(s.phase).toBe('playing');
  });

  it('a hit on one runner leaves the other obstacle standing', () => {
    const s0 = play(createCoast(vsCfg));
    const obs = s0.runners.p1!.obstacles[0]!;
    let s: CoastState = {
      ...s0,
      runners: {
        p1: { ...s0.runners.p1!, dist: obs.d - 1, playerX: obs.x, speed: 120 },
        p2: { ...s0.runners.p2!, dist: obs.d - 1, playerX: obs.x, speed: 0 },
      },
    };
    s = coastSpec.step(s, { p1: pedal, p2: NO_INPUT });
    expect(s.runners.p1!.obstacles[0]!.hit).toBe(true);
    expect(s.runners.p2!.obstacles[0]!.hit).toBe(false);
  });

  it('one driver at the castle does not end the other runner', () => {
    let s = play(createCoast(vsCfg));
    s = {
      ...s,
      runners: {
        ...s.runners,
        p1: { ...s.runners.p1!, dist: TRACK_LEN - 3, speed: 100 },
      },
    };
    for (let i = 0; i < 8 && s.phase === 'playing'; i++) {
      s = coastSpec.step(s, { p1: pedal, p2: pedal });
    }
    expect(s.phase).toBe('playing');
    // Castle used to retire the runner (done). It now opens that driver's
    // bonus stage; the other human is still on the coast road.
    expect(s.runners.p1!.done).toBe(false);
    expect(s.runners.p1!.stage).toBe('bonus');
    expect(s.runners.p2!.stage).toBe('coast');
    expect(s.runners.p2!.done).toBe(false);
    expect(s.scores.p1).toBeGreaterThanOrEqual(1000);
    expect(s.scores.p2).toBe(0);
  });

  it('the table ends when both runners are done and names the higher score', () => {
    // Castle arrival used to set done. A finished runner is now one who has
    // cleared the bonus stage (or run out of time). p2 still times out on
    // the coast; p1 is placed at the end of the bonus road.
    let s = play(createCoast(vsCfg));
    s = {
      ...s,
      runners: {
        p1: { ...s.runners.p1!, stage: 'bonus', dist: BONUS_LEN - 3, speed: 100, timeLeft: 4000, traffic: [] },
        p2: { ...s.runners.p2!, timeLeft: 1, speed: 0 },
      },
    };
    for (let i = 0; i < 12 && s.phase === 'playing'; i++) {
      s = coastSpec.step(s, { p1: pedal, p2: NO_INPUT });
    }
    expect(s.phase).toBe('gameOver');
    expect(s.runners.p1!.done).toBe(true);
    expect(s.runners.p2!.done).toBe(true);
    expect(s.winner).toBe('p1');
    const before = JSON.stringify(s);
    coastSpec.step(s, { p1: pedal, p2: pedal });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('coast bonus stage (1984 sosse-container)', () => {
  it('the back-seat dog slides outward in a bend and sits still on a straight', () => {
    expect(dogSlide(0, 120)).toBe(0);
    expect(dogSlide(0.8, 0)).toBe(0);
    // +curve is a right-hand bend, so the dog slides left.
    expect(dogSlide(0.8, 120)).toBeLessThan(-0.7);
    expect(dogSlide(-0.8, 120)).toBeGreaterThan(0.7);
    expect(Math.abs(dogSlide(0.8, 30))).toBeLessThan(Math.abs(dogSlide(0.8, 120)));
    expect(dogSlide(4, 200)).toBe(-1);
    expect(dogSlide(-4, 200)).toBe(1);
  });

  it('the bonus road carries a BMW and a Mercedes from the same seed', () => {
    expect(TRAFFIC_KINDS).toEqual(['bmw', 'mercedes']);
    const a = createCoast(cfg);
    const b = createCoast(cfg);
    const c = createCoast({ ...cfg, seed: 99 });
    const enter = (s: CoastState): CoastState => {
      let cur = { ...play(s), dist: TRACK_LEN - 3, speed: 100 };
      for (let i = 0; i < 8 && cur.stage !== 'bonus'; i++) cur = coastSpec.step(cur, { p1: pedal });
      return cur;
    };
    const left = enter(a);
    const right = enter(b);
    const other = enter(c);
    expect(left.traffic.map((car) => car.kind)).toEqual(right.traffic.map((car) => car.kind));
    expect(left.traffic.map((car) => car.x)).toEqual(right.traffic.map((car) => car.x));
    expect(JSON.stringify(left.traffic.map((car) => ({ d: car.d, x: car.x, speed: car.speed })))).not.toBe(
      JSON.stringify(other.traffic.map((car) => ({ d: car.d, x: car.x, speed: car.speed }))),
    );
    expect(left.stage).toBe('bonus');
    expect(a.stage).toBe('coast');
    expect(a.traffic).toEqual([]);
  });

  it('era traffic drives ahead and a catch slows the Volvo once', () => {
    let s = play(createCoast(cfg));
    s = {
      ...s,
      stage: 'bonus',
      dist: 40,
      speed: 100,
      playerX: 0.7,
      traffic: [
        { d: 40, x: 0.7, speed: 30, kind: 'bmw', hit: false },
        { d: 80, x: -0.7, speed: 30, kind: 'mercedes', hit: false },
      ],
    };
    const before = JSON.stringify(s);
    const next = coastSpec.step(s, { p1: pedal });
    expect(JSON.stringify(s)).toBe(before);
    expect(next.speed).toBeLessThan(50);
    expect(next.traffic.find((c) => c.kind === 'bmw')!.hit).toBe(true);
    expect(next.traffic.find((c) => c.kind === 'mercedes')!.hit).toBe(false);
    expect(next.sfx.some((e) => e.name === 'hit')).toBe(true);
    const rolling = coastSpec.step(
      { ...play(createCoast(cfg)), stage: 'bonus', dist: 10, speed: 80, playerX: 0, traffic: [{ d: 60, x: 0.7, speed: 40, kind: 'mercedes', hit: false }] },
      { p1: pedal },
    );
    expect(rolling.traffic[0]!.d).toBeGreaterThan(60);
    expect(rolling.traffic[0]!.hit).toBe(false);
  });

  it('a coast-stage car does not collide with bonus traffic', () => {
    const s = coastSpec.step(
      {
        ...play(createCoast(cfg)),
        stage: 'coast',
        dist: 40,
        speed: 100,
        playerX: 0,
        traffic: [{ d: 40, x: 0, speed: 10, kind: 'bmw', hit: false }],
      },
      { p1: pedal },
    );
    expect(s.stage).toBe('coast');
    expect(s.traffic[0]!.hit).toBe(false);
    expect(s.speed).toBeGreaterThan(90);
  });

  it('clearing the bonus stage ends the run, and so does the clock', () => {
    const won = run(
      { ...play(createCoast(cfg)), stage: 'bonus', dist: BONUS_LEN - 3, speed: 100, traffic: [], timeLeft: 4000 },
      pedal,
      8,
    );
    expect(won.phase).toBe('gameOver');
    expect(won.scores['p1']).toBeGreaterThanOrEqual(1000);
    expect(won.sfx.some((e) => e.name === 'goal')).toBe(true);
    const timed = run(
      { ...play(createCoast(cfg)), stage: 'bonus', dist: 10, speed: 40, traffic: [], timeLeft: 3 },
      pedal,
      10,
    );
    expect(timed.phase).toBe('gameOver');
    expect(timed.scores['p1']).toBe(0);
  });
});
