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
  TRACK_SAMPLES,
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

/** Signed heading delta in (-π, π]. */
const wrapDelta = (d: number): number => {
  let x = d;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
};

/**
 * Greedy chord runs. A 1976 Mulsanne is one long uninterrupted straight;
 * the 1990 chicanes would kick the chord deviation over `maxDev`.
 */
function straightRuns(
  maxDev: number,
): { i0: number; i1: number; len: number; u0: number; u1: number }[] {
  const n = TRACK_SAMPLES.length;
  const runs: { i0: number; i1: number; len: number; u0: number; u1: number }[] = [];
  let i = 0;
  while (i < n - 1) {
    let j = i + 1;
    while (j < n) {
      const a = TRACK_SAMPLES[i]!;
      const b = TRACK_SAMPLES[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1;
      let ok = true;
      for (let k = i + 1; k < j; k++) {
        const p = TRACK_SAMPLES[k]!;
        const dev = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / L;
        if (dev > maxDev) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
      j++;
    }
    const end = Math.max(i, j - 1);
    const len = TRACK_SAMPLES[end]!.s - TRACK_SAMPLES[i]!.s;
    if (len >= 24) {
      runs.push({
        i0: i,
        i1: end,
        len,
        u0: TRACK_SAMPLES[i]!.u,
        u1: TRACK_SAMPLES[end]!.u,
      });
    }
    i = end === i ? i + 1 : end;
  }
  return runs.sort((a, b) => b.len - a.len);
}

/** Absolute heading change over an arc of about `windowPx`. */
function sharpestBend(windowPx: number): { turn: number; u: number } {
  let best = { turn: 0, u: 0 };
  const n = TRACK_SAMPLES.length;
  for (let i = 0; i < n; i++) {
    let j = i;
    while (j + 1 < n && TRACK_SAMPLES[j + 1]!.s - TRACK_SAMPLES[i]!.s <= windowPx) j++;
    if (TRACK_SAMPLES[j]!.s - TRACK_SAMPLES[i]!.s < windowPx * 0.75) continue;
    let turn = 0;
    for (let k = i; k < j; k++) {
      turn += Math.abs(wrapDelta(TRACK_SAMPLES[k + 1]!.heading - TRACK_SAMPLES[k]!.heading));
    }
    if (turn > best.turn) best = { turn, u: TRACK_SAMPLES[Math.floor((i + j) / 2)]!.u };
  }
  return best;
}

/** Two opposite bends late in the lap: the ford chicane, not a constant-radius bowl. */
function lateChicaneBends(): number {
  let sign = 0;
  let acc = 0;
  let bends = 0;
  const flush = () => {
    if (Math.abs(acc) > 0.4) bends += 1;
    acc = 0;
    sign = 0;
  };
  for (let i = 0; i + 1 < TRACK_SAMPLES.length; i++) {
    const a = TRACK_SAMPLES[i]!;
    const b = TRACK_SAMPLES[i + 1]!;
    if (a.u < 0.78 || a.u > 0.97) continue;
    const d = wrapDelta(b.heading - a.heading);
    if (Math.abs(d) < 0.004) continue;
    const s = Math.sign(d);
    if (sign === 0) sign = s;
    if (s === sign) acc += d;
    else {
      flush();
      sign = s;
      acc = d;
    }
  }
  flush();
  return bends;
}

describe('circuit 1976 sarthe plan', () => {
  it('is a fixed overview of the 1976 loop: long straight, hairpin, late chicane', () => {
    const gantry = CIRCUIT_MARKS.find((m) => m.kind === 'gantry')!;
    const bridge = CIRCUIT_MARKS.find((m) => m.kind === 'bridge')!;
    const pits = CIRCUIT_MARKS.find((m) => m.kind === 'pits')!;
    expect(gantry.u).toBeLessThan(0.06);
    expect(bridge.u).toBeGreaterThan(gantry.u + 0.02);
    expect(bridge.u).toBeLessThan(0.16);
    const pitGap = Math.min(Math.abs(pits.u - gantry.u), 1 - Math.abs(pits.u - gantry.u));
    expect(pitGap).toBeLessThan(0.12);

    const runs = straightRuns(4);
    const mulsanne = runs[0]!;
    const next = runs.find((r) => r.i0 > mulsanne.i1 || r.i1 < mulsanne.i0);
    expect(mulsanne.len).toBeGreaterThan(100);
    expect(next).toBeTruthy();
    expect(mulsanne.len).toBeGreaterThan(next!.len * 1.35);
    // The long straight begins after the bridge. A stadium's straight is the start itself.
    expect(mulsanne.u0).toBeGreaterThan(bridge.u);
    expect(mulsanne.u1).toBeGreaterThan(mulsanne.u0);
    expect(mulsanne.u1 - mulsanne.u0).toBeGreaterThan(0.18);

    const hairpin = sharpestBend(52);
    // A radius-46 bowl turns ~1.1 rad in 52 px. The hairpin is sharper.
    expect(hairpin.turn).toBeGreaterThan(1.65);
    expect(hairpin.u).toBeGreaterThan(mulsanne.u1 - 0.04);
    // The schematic's sharpest kink sat on the late return, away from the
    // western tip, so the hook read as part of a rounded blob. The hairpin
    // is the west end of the loop.
    let west = TRACK_SAMPLES[0]!;
    for (const p of TRACK_SAMPLES) if (p.x < west.x) west = p;
    expect(Math.abs(west.u - hairpin.u)).toBeLessThan(0.08);
    expect(west.x).toBeLessThan(70);

    expect(lateChicaneBends()).toBeGreaterThanOrEqual(2);

    for (const mark of CIRCUIT_MARKS) {
      expect(mark.kind).not.toMatch(/dunlop|porsche|martini|renault|elf|gulf/i);
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

  it('speed-dependent steering: steering response is sharper at low speed than at max speed', () => {
    const s = play(createCircuit(cfg));
    const slow = play({ ...s, speed: 0.2 });
    const fast = play({ ...s, speed: MAX_SPEED });
    const leftSlow = circuitSpec.step(slow, { p1: { dir: DIRS.left, button: true, seq: 1 } });
    const leftFast = circuitSpec.step(fast, { p1: { dir: DIRS.left, button: true, seq: 1 } });
    const dSlow = Math.abs(leftSlow.heading - slow.heading);
    const dFast = Math.abs(leftFast.heading - fast.heading);
    expect(dSlow).toBeGreaterThan(dFast);
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

  it('car bump in versus emits a bounce sfx', () => {
    const vs: GameConfig = { mode: 'versus', playerIds: ['a', 'b'], seed: 1976 };
    let s = play(createCircuit(vs));
    s = {
      ...s,
      cars: {
        a: { ...s.cars.a!, x: 100, y: 100 },
        b: { ...s.cars.b!, x: 105, y: 100 },
      },
    };
    const moved = circuitSpec.step(s, { a: NO_INPUT, b: NO_INPUT });
    expect(moved.sfx.some((e) => e.name === 'bounce')).toBe(true);
  });
});
