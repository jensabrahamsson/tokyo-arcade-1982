import {
  type GameConfig,
  type GameSpec,
  type GameStateBase,
  type PlayerInput,
  type SfxEvent,
  withSfx,
} from '../../engine/types';
import { enterPhase, tickPhase } from '../../engine/phase';

/**
 * Circuit d'Or — eighth cabinet (R55).
 * Overview of a short 1976-flavored endurance loop (long straight, chicane,
 * hairpin, gantry). The player-facing title is Circuit d'Or; this file does
 * not use that race's name as a title, id, or string the hall can show.
 * Fixed camera: the whole circuit is on screen. Not Coast's behind-car view.
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

/** World-space center of the right-hand hairpin and the long straight. */
const LEFT = 78;
const RIGHT = 242;
const CY = 128;
const RADIUS = 46;

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

/** Fixed scenery. No Coast billboards, no title text. */
export const CIRCUIT_MARKS: readonly CircuitMark[] = [
  { u: 0.02, kind: 'gantry' },
  { u: 0.2, kind: 'bridge' },
  { u: 0.58, kind: 'pits' },
];

export interface CircuitState extends GameStateBase {
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
}

const wrapAngle = (a: number): number => {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
};

/** Nominal point on the endurance plan. t is 0..1 before arc-length resample. */
function rawPoint(t: number): { x: number; y: number } {
  const straight = RIGHT - LEFT;
  const arc = Math.PI * RADIUS;
  const per = 2 * straight + 2 * arc;
  let d = (((t % 1) + 1) % 1) * per;
  const yb = CY + RADIUS;
  const yt = CY - RADIUS;
  if (d <= straight) return { x: LEFT + d, y: yb };
  d -= straight;
  if (d <= arc) {
    const theta = Math.PI / 2 - (d / arc) * Math.PI;
    return { x: RIGHT + RADIUS * Math.cos(theta), y: CY + RADIUS * Math.sin(theta) };
  }
  d -= arc;
  if (d <= straight) {
    const along = d / straight;
    const chicane = Math.sin(along * Math.PI * 2) * 12;
    return { x: RIGHT - d, y: yt + chicane };
  }
  d -= straight;
  const theta = -Math.PI / 2 - (d / arc) * Math.PI;
  return { x: LEFT + RADIUS * Math.cos(theta), y: CY + RADIUS * Math.sin(theta) };
}

function buildTrack(): TrackSample[] {
  const n = 480;
  const raw: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) raw.push(rawPoint(i / n));
  const cum: number[] = [0];
  for (let i = 1; i <= n; i++) {
    const a = raw[i - 1]!;
    const b = raw[i]!;
    cum.push(cum[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[n]!;
  const samples: TrackSample[] = [];
  for (let s = 0; s < total - 1.5; s += 3) {
    let i = 1;
    while (i < n && cum[i]! < s) i++;
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

export const TRACK_SAMPLES: readonly TrackSample[] = buildTrack();
export const TRACK_LENGTH = TRACK_SAMPLES.length === 0 ? 0 : TRACK_SAMPLES[TRACK_SAMPLES.length - 1]!.s + 3;

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

export function createCircuit(config: GameConfig): CircuitState {
  const pose = poseAt(0);
  const lives: Record<string, number> = {};
  const scores: Record<string, number> = {};
  for (const id of config.playerIds) {
    lives[id] = CIRCUIT_LIVES;
    scores[id] = 0;
  }
  return {
    phase: 'ready',
    phaseTimer: 0,
    level: 1,
    scores,
    lives,
    sfx: [],
    x: pose.x,
    y: pose.y,
    heading: pose.heading,
    speed: 0,
    u: pose.u,
    lat: 0,
    lap: 0,
    timeLeft: CIRCUIT_TIME,
    onTrack: true,
    invuln: 0,
    finished: false,
    deaths: 0,
    clears: 0,
    rngSeed: config.seed >>> 0,
  };
}

const step = (state: CircuitState, inputs: Record<string, PlayerInput>): CircuitState => {
  if (state.phase !== 'playing') return tickPhase(state, 1 / 60).state;
  const id = Object.keys(state.scores)[0];
  if (!id) return { ...state, sfx: [] };

  const input = inputs[id];
  const dy = input?.dir?.dy ?? 0;
  let speed = state.speed;
  if (input?.button || dy < 0) speed += 0.032;
  else if (dy > 0) speed -= 0.06;
  else speed -= 0.012;
  speed = Math.min(MAX_SPEED, Math.max(0, speed));

  let heading = state.heading + (input?.dir?.dx ?? 0) * STEER;
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
  supportsVersus: false,
  capacity: 1,
  turnBased: false,
  create: createCircuit,
  step,
  demo: demoCircuit,
};
