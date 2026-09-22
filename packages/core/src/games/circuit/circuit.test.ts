import { describe, it, expect } from 'vitest';
import { EN, JA } from '../../i18n/i18n';
import { DIRS } from '../../engine/vec';
import { NO_INPUT, type GameConfig, type PlayerInput } from '../../engine/types';
import {
  CIRCUIT_CAMERA,
  CIRCUIT_LAPS,
  CIRCUIT_LIVES,
  CIRCUIT_MARKS,
  HALF_WIDTH,
  MAX_SPEED,
  TRACK_LENGTH,
  WALL,
  circuitSpec,
  circuitSteer,
  createCircuit,
  poseAt,
  projectCar,
  type CircuitState,
} from './circuit';

const cfg: GameConfig = { mode: 'solo', playerIds: ['p1'], seed: 1976 };
const play = (s: CircuitState): CircuitState => ({ ...s, phase: 'playing' });
const gas: PlayerInput = { dir: null, button: true, seq: 1 };
const run = (s: CircuitState, input: PlayerInput, n: number): CircuitState => {
  let cur = s;
  for (let i = 0; i < n && cur.phase === 'playing'; i++) cur = circuitSpec.step(cur, { p1: input });
  return cur;
};

const place = (u: number, lat: number, speed = 0): CircuitState => {
  const pose = poseAt(u);
  const nx = Math.sin(pose.heading);
  const ny = -Math.cos(pose.heading);
  return play({
    ...createCircuit(cfg),
    x: pose.x + nx * lat,
    y: pose.y + ny * lat,
    heading: pose.heading,
    speed,
    u: pose.u,
    lat,
  });
};

describe('circuit d’Or title (R55.1)', () => {
  it('the player-facing name is Circuit d\'Or in EN and JA, never Le Mans or Coast', () => {
    expect(EN['game.circuit']).toBe("CIRCUIT D'OR");
    expect(JA['game.circuit']).toBe('サーキット・ドール');
    expect(EN['game.circuit.tag'].length).toBeGreaterThan(2);
    expect(JA['game.circuit.tag'].length).toBeGreaterThan(2);
    const visible = [
      EN['game.circuit'],
      EN['game.circuit.tag'],
      EN['circuit.lap'],
      EN['circuit.time'],
      EN['circuit.kmh'],
      JA['game.circuit'],
      JA['game.circuit.tag'],
      JA['circuit.lap'],
      JA['circuit.time'],
      JA['circuit.kmh'],
    ];
    for (const s of visible) {
      expect(s.toLowerCase()).not.toContain('le mans');
      expect(s).not.toContain('ル・マン');
      expect(s).not.toContain('ルマン');
      expect(s.toLowerCase()).not.toContain('arkad');
      expect(s.toLowerCase()).not.toContain('coast');
    }
    expect(EN['circuit.kmh']).toMatch(/KM\/H/i);
    expect(EN['circuit.kmh']).not.toMatch(/MPH/i);
    expect(JA['circuit.kmh']).toMatch(/キロ/);
  });
});

describe('circuit create (R55)', () => {
  it('is the overview endurance cabinet, id circuit', () => {
    expect(circuitSpec.id).toBe('circuit');
    // R55.2 shipped solo-only (supportsVersus false, versus out of scope).
    // R61 seats a second human on this same overview, so the flag is now true.
    expect(circuitSpec.supportsVersus).toBe(true);
    expect(circuitSpec.capacity).toBe(2);
    expect(CIRCUIT_CAMERA).toBe('overview');
    expect(CIRCUIT_LAPS).toBeGreaterThanOrEqual(2);
    expect(CIRCUIT_LIVES).toBeGreaterThanOrEqual(1);
  });

  it('starts ready on the grid with a clock and a closed bright loop', () => {
    const s = createCircuit(cfg);
    expect(s.phase).toBe('ready');
    expect(s.speed).toBe(0);
    expect(s.lap).toBe(0);
    expect(s.timeLeft).toBeGreaterThan(60 * 20);
    expect(s.lives['p1']).toBe(CIRCUIT_LIVES);
    expect(Math.abs(projectCar(s.x, s.y).lat)).toBeLessThan(1);
    expect(TRACK_LENGTH).toBeGreaterThan(500);
    const a = poseAt(0);
    const b = poseAt(0.999);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(24);
  });

  it('landmarks are the gantry, the bridge and the pits — not Coast boards', () => {
    expect(CIRCUIT_MARKS.map((m) => m.kind)).toEqual(['gantry', 'bridge', 'pits']);
    const blob = JSON.stringify(CIRCUIT_MARKS);
    expect(blob).not.toMatch(/PALME|HARPSUND|BOMMERSVIK|CENTERPARTIET|VALDEBATT|CASTRO|LO CASTLE/i);
    expect(blob.toLowerCase()).not.toContain('le mans');
  });

  it('round-trips through JSON and does not mutate on step or demo', () => {
    let s = play(createCircuit(cfg));
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    for (let i = 0; i < 20; i++) {
      const before = JSON.stringify(s);
      circuitSpec.demo!(s, i);
      circuitSpec.step(s, { p1: { dir: DIRS.left, button: true, seq: i } });
      expect(JSON.stringify(s)).toBe(before);
      s = circuitSpec.step(s, { p1: circuitSpec.demo!(s, i) });
    }
  });
});

describe('circuit drive', () => {
  it('stays put until the table is playing', () => {
    const s = createCircuit(cfg);
    const next = circuitSpec.step(s, { p1: gas });
    expect(next.x).toBe(s.x);
    expect(next.y).toBe(s.y);
    expect(next.phase).toBe('ready');
  });

  it('throttle builds speed and the stick steers', () => {
    const s = play(createCircuit(cfg));
    const faster = circuitSpec.step(s, { p1: gas });
    expect(faster.speed).toBeGreaterThan(s.speed);
    const moving = play({ ...s, speed: 1 });
    const left = circuitSpec.step(moving, { p1: { dir: DIRS.left, button: true, seq: 2 } });
    const right = circuitSpec.step(moving, { p1: { dir: DIRS.right, button: true, seq: 3 } });
    expect(left.heading).toBeLessThan(moving.heading);
    expect(right.heading).toBeGreaterThan(moving.heading);
  });

  it('scores while the car is on the asphalt', () => {
    const scored = run(play(createCircuit(cfg)), gas, 40);
    expect(scored.scores['p1']).toBeGreaterThan(0);
    expect(scored.onTrack).toBe(true);
  });

  it('gravel inside the wall bleeds speed without a crash', () => {
    const s = place(0.1, HALF_WIDTH + 6, MAX_SPEED);
    const next = circuitSpec.step(s, { p1: gas });
    expect(next.speed).toBeLessThan(s.speed);
    expect(next.lives['p1']).toBe(CIRCUIT_LIVES);
    expect(next.phase).toBe('playing');
  });

  it('a wall hit costs a life and puts the car back on the line', () => {
    const s = place(0.1, WALL + 8, 1);
    const next = circuitSpec.step(s, { p1: NO_INPUT });
    expect(next.lives['p1']).toBe(CIRCUIT_LIVES - 1);
    expect(next.sfx.some((e) => e.name === 'hit')).toBe(true);
    expect(Math.abs(next.lat)).toBeLessThan(1);
    expect(next.phase).toBe('playing');
  });

  it('the clock running out is game over', () => {
    const s = place(0.1, 0, 0);
    s.timeLeft = 1;
    const next = circuitSpec.step(s, { p1: NO_INPUT });
    expect(next.phase).toBe('gameOver');
    expect(next.finished).toBe(false);
  });

  it('finishing the scheduled laps is game over with a score', () => {
    let s = place(0.9, 0, MAX_SPEED * 0.8);
    s = { ...s, lap: CIRCUIT_LAPS - 1 };
    for (let i = 0; i < 500 && s.phase === 'playing'; i++) {
      const steer = circuitSteer(s);
      s = circuitSpec.step(s, {
        p1: { dir: steer === 0 ? null : { dx: steer, dy: 0 }, button: true, seq: i },
      });
    }
    expect(s.phase).toBe('gameOver');
    expect(s.finished).toBe(true);
    expect(s.lap).toBeGreaterThanOrEqual(CIRCUIT_LAPS);
    expect(s.scores['p1']!).toBeGreaterThan(0);
  });

  it('versus keeps both cars on one loop and lets the other finish the race', () => {
    const vs: GameConfig = { mode: 'versus', playerIds: ['a', 'b'], seed: 1976 };
    const grid = createCircuit(vs);
    expect(grid.mode).toBe('versus');
    expect(Object.keys(grid.cars)).toEqual(['a', 'b']);
    expect(Math.hypot(grid.cars.a!.x - grid.cars.b!.x, grid.cars.a!.y - grid.cars.b!.y)).toBeGreaterThan(8);
    expect(grid.cars.a!.u).toBeLessThan(0.05);
    expect(grid.cars.b!.u).toBeLessThan(0.05);

    const started = play(grid);
    const steered = circuitSpec.step(started, {
      a: { dir: DIRS.left, button: true, seq: 1 },
      b: { dir: DIRS.right, button: true, seq: 1 },
    });
    expect(steered.cars.a!.heading).toBeLessThan(started.cars.a!.heading);
    expect(steered.cars.b!.heading).toBeGreaterThan(started.cars.b!.heading);
    expect(steered.phase).toBe('playing');

    const pose = poseAt(0.9);
    let s: CircuitState = {
      ...started,
      cars: {
        ...started.cars,
        a: {
          ...started.cars.a!,
          x: pose.x,
          y: pose.y,
          heading: pose.heading,
          speed: MAX_SPEED * 0.8,
          u: pose.u,
          lat: 0,
          lap: CIRCUIT_LAPS - 1,
        },
      },
    };
    for (let i = 0; i < 500 && s.phase === 'playing' && !s.cars.a!.finished; i++) {
      const view = {
        ...s,
        x: s.cars.a!.x,
        y: s.cars.a!.y,
        heading: s.cars.a!.heading,
        u: s.cars.a!.u,
        lat: s.cars.a!.lat,
        speed: s.cars.a!.speed,
      };
      const steer = circuitSteer(view);
      s = circuitSpec.step(s, {
        a: { dir: steer === 0 ? null : { dx: steer, dy: 0 }, button: true, seq: i },
        b: NO_INPUT,
      });
    }
    expect(s.cars.a!.finished).toBe(true);
    expect(s.phase).toBe('playing');
    expect(s.cars.b!.retired).toBe(false);
    expect(s.cars.b!.lap).toBe(0);
    const parked = s.cars.b!;
    s = circuitSpec.step({ ...s, timeLeft: 1 }, { a: NO_INPUT, b: NO_INPUT });
    expect(s.phase).toBe('gameOver');
    expect(s.winner).toBe('a');
    expect(s.cars.b!.x).toBe(parked.x);
    expect(s.cars.b!.y).toBe(parked.y);
  });

  it('the attract bot completes a lap without wrecking', () => {
    let s = play(createCircuit(cfg));
    for (let i = 0; i < 2400 && s.phase === 'playing' && s.lap < 1; i++) {
      s = circuitSpec.step(s, { p1: circuitSpec.demo!(s, i) });
    }
    expect(s.lap).toBeGreaterThanOrEqual(1);
    expect(s.lives['p1']).toBe(CIRCUIT_LIVES);
    expect(s.deaths).toBe(0);
  });
});
