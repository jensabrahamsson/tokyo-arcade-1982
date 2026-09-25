import {
  type GameConfig,
  type GameMode,
  type GameSpec,
  type GameStateBase,
  type PlayerInput,
  type SfxEvent,
  withSfx,
} from '../../engine/types';
import { enterPhase, tickPhase } from '../../engine/phase';

/**
 * Circuit d'Or — eighth cabinet (R55).
 * Fixed overview of a 1976 Sarthe loop: pit straight, arch bridge, a long
 * uninterrupted straight, a hairpin, return curves, and a late chicane.
 * The player-facing title is Circuit d'Or; this file does not use another
 * race's name as a title, id, or string the hall can show.
 * Not Coast's behind-car view.
 */

export const CIRCUIT_CAMERA = 'overview' as const;
export const CIRCUIT_LAPS = 2;
export const CIRCUIT_LIVES = 3;
export const CIRCUIT_TIME = 50 * 60;
export const CIRCUIT_MAX_SPEED = 1.55;
export const MAX_SPEED = CIRCUIT_MAX_SPEED;
export const HALF_WIDTH = 20;
export const WALL = 32;
export const LAP_BONUS = 1000;
export const FINISH_BONUS = 1500;
const STEER = 0.055;
const LOOK = 0.04;

export interface TrackSample {
  x: number;
  y: number;
  heading: number;
  s: number;
  u: number;
}

export interface CircuitMark {
  readonly u: number;
  readonly kind: 'gantry' | 'bridge' | 'pits';
}

/** One car on the shared overview. Versus keeps two; solo still reads the top-level pose. */
export interface CircuitCar {
  x: number;
  y: number;
  heading: number;
  speed: number;
  u: number;
  lat: number;
  lap: number;
  onTrack: boolean;
  invuln: number;
  /** completed the scheduled laps */
  finished: boolean;
  /** parked: laps done or out of lives */
  retired: boolean;
}

export interface CircuitState extends GameStateBase {
  mode: GameMode;
  x: number;
  y: number;
  heading: number;
  speed: number;
  /** progress 0..1 along the closed loop */
  u: number;
  lat: number;
  lap: number;
  timeLeft: number;
  onTrack: boolean;
  invuln: number;
  finished: boolean;
  deaths: number;
  clears: number;
  rngSeed: number;
  cars: Record<string, CircuitCar>;
}

/** Side-by-side grid so both cars read on the overview. Inside the asphalt. */
const GRID_LAT = 12;
const BUMP = 16;

const wrapAngle = (a: number): number => {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
};

interface Pt {
  x: number;
  y: number;
}

/** Corner-cutting keeps the long straight straight and rounds the hairpin. */
function chaikin(pts: readonly Pt[], iters: number): Pt[] {
  let cur = pts.slice();
  for (let n = 0; n < iters; n++) {
    const next: Pt[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i]!;
      const b = cur[(i + 1) % cur.length]!;
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    cur = next;
  }
  return cur;
}

/**
 * 1976 overview on the 320×240 glass. One chaikin pass keeps the long
 * straight straight and leaves the west hook tight. The return wave is
 * the esses, then the late chicane, back onto the pit straight.
 */
function sarthePlan(): Pt[] {
  const straight = (t: number): Pt => ({
    x: 268 + (100 - 268) * t,
    y: 148 + (186 - 148) * t,
  });
  const hook: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = 1.15 + (4.4 - 1.15) * (i / 8);
    hook.push({ x: 62 + Math.cos(a) * 18, y: 164 + Math.sin(a) * 18 });
  }
  const wave: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    wave.push({ x: 100 + Math.sin(t * Math.PI * 2) * 16, y: 146 - t * 98 });
  }
  const keys: Pt[] = [
    { x: 108, y: 48 },
    { x: 148, y: 46 },
    { x: 190, y: 48 },
    { x: 222, y: 58 },
    { x: 248, y: 82 },
    { x: 264, y: 114 },
    straight(0),
    straight(0.2),
    straight(0.4),
    straight(0.6),
    straight(0.8),
    straight(1),
    ...hook,
    ...wave,
  ];
  return chaikin(keys, 1);
}

function buildTrack(): TrackSample[] {
  const raw = sarthePlan();
  const cum: number[] = [0];
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1]!;
    const b = raw[i]!;
    cum.push(cum[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[cum.length - 1]!;
  const samples: TrackSample[] = [];
  for (let s = 0; s < total - 1.5; s += 3) {
    let i = 1;
    while (i < raw.length && cum[i]! < s) i++;
    const c0 = cum[i - 1]!;
    const c1 = cum[i]!;
    const f = c1 === c0 ? 0 : (s - c0) / (c1 - c0);
    const a = raw[i - 1]!;
    const b = raw[i]!;
    samples.push({
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      heading: 0,
      s,
      u: total === 0 ? 0 : s / total,
    });
  }
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i]!;
    const nxt = samples[(i + 1) % samples.length]!;
    samples[i] = { ...p, heading: Math.atan2(nxt.y - p.y, nxt.x - p.x) };
  }
  return samples;
}

function nearestU(samples: readonly TrackSample[], x: number, y: number): number {
  let best = samples[0]!;
  let bestD = Infinity;
  for (const p of samples) {
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best.u;
}

export const TRACK_SAMPLES: readonly TrackSample[] = buildTrack();
export const TRACK_LENGTH = TRACK_SAMPLES.length === 0 ? 0 : TRACK_SAMPLES[TRACK_SAMPLES.length - 1]!.s + 3;

/** Fixed scenery on the pit straight. No Coast boards, no title text. */
export const CIRCUIT_MARKS: readonly CircuitMark[] = [
  { u: nearestU(TRACK_SAMPLES, 148, 46), kind: 'gantry' },
  { u: nearestU(TRACK_SAMPLES, 196, 50), kind: 'bridge' },
  { u: nearestU(TRACK_SAMPLES, 108, 48), kind: 'pits' },
];

export function poseAt(u: number): TrackSample {
  const uu = ((u % 1) + 1) % 1;
  let best = TRACK_SAMPLES[0]!;
  let bestD = Infinity;
  for (const p of TRACK_SAMPLES) {
    let d = Math.abs(p.u - uu);
    if (d > 0.5) d = 1 - d;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function projectCar(x: number, y: number): { u: number; lat: number; heading: number } {
  let best = TRACK_SAMPLES[0]!;
  let bestD = Infinity;
  for (const p of TRACK_SAMPLES) {
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  const nx = Math.sin(best.heading);
  const ny = -Math.cos(best.heading);
  return {
    u: best.u,
    lat: (x - best.x) * nx + (y - best.y) * ny,
    heading: best.heading,
  };
}

/** -1 left, +1 right, 0 hold. Pure; the attract bot and the server adapter share it. */
export function circuitSteer(state: CircuitState): -1 | 0 | 1 {
  const aim = poseAt(state.u + LOOK);
  let d = wrapAngle(Math.atan2(aim.y - state.y, aim.x - state.x) - state.heading);
  d += Math.max(-12, Math.min(12, state.lat)) * 0.03;
  if (d > 0.08) return 1;
  if (d < -0.08) return -1;
  return 0;
}

function carAt(u: number, lat: number): CircuitCar {
  const pose = poseAt(u);
  const nx = Math.sin(pose.heading);
  const ny = -Math.cos(pose.heading);
  return {
    x: pose.x + nx * lat,
    y: pose.y + ny * lat,
    heading: pose.heading,
    speed: 0,
    u: pose.u,
    lat,
    lap: 0,
    onTrack: Math.abs(lat) <= HALF_WIDTH,
    invuln: 0,
    finished: false,
    retired: false,
  };
}

export function createCircuit(config: GameConfig): CircuitState {
  const lives: Record<string, number> = {};
  const scores: Record<string, number> = {};
  const cars: Record<string, CircuitCar> = {};
  const duo = config.mode === 'versus' && config.playerIds.length > 1;
  config.playerIds.forEach((id, i) => {
    lives[id] = CIRCUIT_LIVES;
    scores[id] = 0;
    const lat = duo ? (i === 0 ? -GRID_LAT : GRID_LAT) : 0;
    cars[id] = carAt(0, lat);
  });
  const lead = cars[config.playerIds[0]!] ?? carAt(0, 0);
  return {
    phase: 'ready',
    phaseTimer: 0,
    level: 1,
    scores,
    lives,
    sfx: [],
    mode: config.mode,
    x: lead.x,
    y: lead.y,
    heading: lead.heading,
    speed: lead.speed,
    u: lead.u,
    lat: lead.lat,
    lap: lead.lap,
    timeLeft: CIRCUIT_TIME,
    onTrack: lead.onTrack,
    invuln: lead.invuln,
    finished: false,
    deaths: 0,
    clears: 0,
    rngSeed: config.seed >>> 0,
    cars,
  };
}

function driveCar(
  car: CircuitCar,
  id: string,
  input: PlayerInput | undefined,
  lives: number,
  score: number,
): { car: CircuitCar; lives: number; score: number; events: SfxEvent[]; died: boolean; cleared: boolean } {
  if (car.retired) return { car, lives, score, events: [], died: false, cleared: false };
  const dy = input?.dir?.dy ?? 0;
  let speed = car.speed;
  if (input?.button || dy < 0) speed += 0.032;
  else if (dy > 0) speed -= 0.06;
  else speed -= 0.012;
  speed = Math.min(MAX_SPEED, Math.max(0, speed));

  const steerRate = STEER * (0.85 + 0.3 * (1 - speed / MAX_SPEED));
  let heading = car.heading + (input?.dir?.dx ?? 0) * steerRate;
  let x = car.x + Math.cos(heading) * speed;
  let y = car.y + Math.sin(heading) * speed;
  let invuln = car.invuln > 0 ? car.invuln - 1 : 0;
  let proj = projectCar(x, y);
  let lat = proj.lat;
  let u = proj.u;
  let onTrack = Math.abs(lat) <= HALF_WIDTH;
  let lap = car.lap;
  const events: SfxEvent[] = [];

  if (Math.abs(lat) > WALL && car.invuln === 0) {
    const pose = poseAt(u);
    const left = lives - 1;
    events.push({ name: left <= 0 ? 'die' : 'hit', player: id });
    return {
      car: {
        x: pose.x,
        y: pose.y,
        heading: pose.heading,
        speed: 0.2,
        lat: 0,
        u: pose.u,
        onTrack: true,
        invuln: 40,
        lap,
        finished: false,
        retired: left <= 0,
      },
      lives: left,
      score,
      events,
      died: left <= 0,
      cleared: false,
    };
  }

  if (!onTrack) speed *= 0.9;
  else if (invuln === 0) score += 1 + Math.floor(speed * 2);

  let finished = false;
  let retired = false;
  let cleared = false;
  if (car.u > 0.8 && u < 0.2 && speed > 0.3 && Math.abs(lat) <= WALL) {
    lap += 1;
    score += LAP_BONUS;
    events.push({ name: 'levelUp', player: id });
    if (lap >= CIRCUIT_LAPS) {
      score += FINISH_BONUS;
      events.push({ name: 'goal', player: id });
      finished = true;
      retired = true;
      cleared = true;
      speed = 0;
    }
  }

  return {
    car: { x, y, heading, speed, lat, u, onTrack, invuln, lap, finished, retired },
    lives,
    score,
    events,
    died: false,
    cleared,
  };
}

function separateCars(cars: Record<string, CircuitCar>): Record<string, CircuitCar> {
  const ids = Object.keys(cars);
  if (ids.length < 2) return cars;
  const aId = ids[0]!;
  const bId = ids[1]!;
  const a = cars[aId]!;
  const b = cars[bId]!;
  if (a.retired || b.retired) return cars;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dist = Math.hypot(dx, dy);
  if (dist >= BUMP) return cars;
  if (dist < 0.001) {
    dx = Math.cos(a.heading + Math.PI / 2);
    dy = Math.sin(a.heading + Math.PI / 2);
    dist = 1;
  }
  const push = (BUMP - dist) / 2;
  const ux = dx / dist;
  const uy = dy / dist;
  const shift = (car: CircuitCar, sx: number, sy: number): CircuitCar => {
    const x = car.x + sx;
    const y = car.y + sy;
    const proj = projectCar(x, y);
    return { ...car, x, y, u: proj.u, lat: proj.lat, onTrack: Math.abs(proj.lat) <= HALF_WIDTH };
  };
  return {
    ...cars,
    [aId]: shift(a, -ux * push, -uy * push),
    [bId]: shift(b, ux * push, uy * push),
  };
}

function mirrorLead(state: CircuitState, id: string, car: CircuitCar): CircuitState {
  return {
    ...state,
    x: car.x,
    y: car.y,
    heading: car.heading,
    speed: car.speed,
    u: car.u,
    lat: car.lat,
    lap: car.lap,
    onTrack: car.onTrack,
    invuln: car.invuln,
    finished: car.finished,
    cars: { ...state.cars, [id]: car },
  };
}

const stepVersus = (state: CircuitState, inputs: Record<string, PlayerInput>): CircuitState => {
  const ids = Object.keys(state.scores);
  let cars = { ...state.cars };
  let lives = { ...state.lives };
  let scores = { ...state.scores };
  const events: SfxEvent[] = [];
  let deaths = state.deaths;
  let clears = state.clears;
  for (const id of ids) {
    const car = cars[id] ?? carAt(0, 0);
    const driven = driveCar(car, id, inputs[id], lives[id] ?? 0, scores[id] ?? 0);
    cars = { ...cars, [id]: driven.car };
    lives = { ...lives, [id]: driven.lives };
    scores = { ...scores, [id]: driven.score };
    events.push(...driven.events);
    if (driven.died) deaths += 1;
    if (driven.cleared) clears += 1;
  }
  cars = separateCars(cars);
  const timeLeft = state.timeLeft - 1;
  const leadId = ids[0];
  let next: CircuitState = {
    ...state,
    sfx: events,
    lives,
    scores,
    cars,
    deaths,
    clears,
    timeLeft,
  };
  if (leadId && cars[leadId]) next = mirrorLead(next, leadId, cars[leadId]);
  const allParked = ids.length > 0 && ids.every((id) => cars[id]?.retired);
  if (allParked || timeLeft <= 0) {
    let best = -Infinity;
    let winner: string | undefined;
    let ties = 0;
    for (const id of ids) {
      const sc = scores[id] ?? 0;
      if (sc > best) {
        best = sc;
        winner = id;
        ties = 1;
      } else if (sc === best) ties += 1;
    }
    if (ties !== 1) winner = undefined;
    const timed = timeLeft <= 0 && !allParked;
    const dying = timed ? withSfx({ ...next, timeLeft: 0, deaths: deaths + 1, winner }, { name: 'die' }) : { ...next, winner };
    return enterPhase(dying, 'gameOver');
  }
  return next;
};

const stepSolo = (state: CircuitState, inputs: Record<string, PlayerInput>): CircuitState => {
  const id = Object.keys(state.scores)[0];
  if (!id) return { ...state, sfx: [] };

  const input = inputs[id];
  const dy = input?.dir?.dy ?? 0;
  let speed = state.speed;
  if (input?.button || dy < 0) speed += 0.032;
  else if (dy > 0) speed -= 0.06;
  else speed -= 0.012;
  speed = Math.min(MAX_SPEED, Math.max(0, speed));

  const steerRate = STEER * (0.85 + 0.3 * (1 - speed / MAX_SPEED));
  let heading = state.heading + (input?.dir?.dx ?? 0) * steerRate;
  let x = state.x + Math.cos(heading) * speed;
  let y = state.y + Math.sin(heading) * speed;
  let invuln = state.invuln > 0 ? state.invuln - 1 : 0;

  let proj = projectCar(x, y);
  let lat = proj.lat;
  let u = proj.u;
  let onTrack = Math.abs(lat) <= HALF_WIDTH;
  let lives = state.lives;
  let scores = state.scores;
  let lap = state.lap;
  let deaths = state.deaths;
  let clears = state.clears;
  let finished = state.finished;
  const events: SfxEvent[] = [];

  if (Math.abs(lat) > WALL && state.invuln === 0) {
    const pose = poseAt(u);
    x = pose.x;
    y = pose.y;
    heading = pose.heading;
    speed = 0.2;
    lat = 0;
    u = pose.u;
    onTrack = true;
    invuln = 40;
    const left = (lives[id] ?? 0) - 1;
    lives = { ...lives, [id]: left };
    events.push({ name: left <= 0 ? 'die' : 'hit', player: id });
    const crashed: CircuitState = {
      ...state,
      sfx: events,
      x,
      y,
      heading,
      speed,
      lat,
      u,
      onTrack,
      invuln,
      lives,
      scores,
      lap,
      timeLeft: state.timeLeft - 1,
    };
    if (left <= 0) return enterPhase({ ...crashed, deaths: deaths + 1 }, 'gameOver');
    if (crashed.timeLeft <= 0) {
      return enterPhase(withSfx({ ...crashed, timeLeft: 0, deaths: deaths + 1 }, { name: 'die', player: id }), 'gameOver');
    }
    return crashed;
  }

  if (!onTrack) speed *= 0.9;
  else if (invuln === 0) scores = { ...scores, [id]: (scores[id] ?? 0) + 1 + Math.floor(speed * 2) };

  if (state.u > 0.8 && u < 0.2 && speed > 0.3 && Math.abs(lat) <= WALL) {
    lap += 1;
    scores = { ...scores, [id]: (scores[id] ?? 0) + LAP_BONUS };
    events.push({ name: 'levelUp', player: id });
    if (lap >= CIRCUIT_LAPS) {
      scores = { ...scores, [id]: (scores[id] ?? 0) + FINISH_BONUS };
      events.push({ name: 'goal', player: id });
      finished = true;
      clears += 1;
      const done: CircuitState = {
        ...state,
        sfx: events,
        x,
        y,
        heading,
        speed,
        lat,
        u,
        onTrack,
        invuln,
        lives,
        scores,
        lap,
        deaths,
        clears,
        finished,
        timeLeft: Math.max(0, state.timeLeft - 1),
      };
      return enterPhase(done, 'gameOver');
    }
  }

  const timeLeft = state.timeLeft - 1;
  const next: CircuitState = {
    ...state,
    sfx: events,
    x,
    y,
    heading,
    speed,
    lat,
    u,
    onTrack,
    invuln,
    lives,
    scores,
    lap,
    deaths,
    clears,
    finished,
    timeLeft,
  };
  if (timeLeft <= 0) {
    return enterPhase(withSfx({ ...next, timeLeft: 0, deaths: deaths + 1 }, { name: 'die', player: id }), 'gameOver');
  }
  return next;
};

const step = (state: CircuitState, inputs: Record<string, PlayerInput>): CircuitState => {
  if (state.phase !== 'playing') return tickPhase(state, 1 / 60).state;
  if (state.mode === 'versus') return stepVersus(state, inputs);
  return stepSolo(state, inputs);
};

function demoCircuit(state: CircuitState, tick: number): PlayerInput {
  const steer = circuitSteer(state);
  const aim = poseAt(state.u + LOOK);
  const d = Math.abs(wrapAngle(Math.atan2(aim.y - state.y, aim.x - state.x) - state.heading));
  const ease = d > 0.7 && state.speed > 1.2;
  return {
    dir: steer === 0 ? null : { dx: steer, dy: 0 },
    button: !ease,
    seq: tick,
  };
}

export const circuitSpec: GameSpec<CircuitState> = {
  id: 'circuit',
  supportsVersus: true,
  capacity: 2,
  turnBased: false,
  create: createCircuit,
  step,
  demo: demoCircuit,
};
