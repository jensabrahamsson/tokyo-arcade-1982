import {
  type GameConfig,
  type GameStateBase,
  type GameSpec,
  type PlayerInput,
  withSfx,
} from '../../engine/types';
import { enterPhase, tickPhase } from '../../engine/phase';

const COL_OFFS = [-5, -3, -1, 1, 3, 5];
const ROWS = 4;
const PLAYER_Y = 21;
const DIVE_INTERVAL = 150;

export interface Alien {
  id: number;
  row: number;
  col: number;
  x: number;
  y: number;
  mode: 'grid' | 'dive';
  dvx: number;
  dvy: number;
}

export interface Bullet {
  x: number;
  y: number;
  dy: number;
}

export interface GalaxyState extends GameStateBase {
  player: { x: number; y: number };
  aliens: Alien[];
  bullets: Bullet[];
  formationDir: 1 | -1;
  formationOffset: number;
  dropOffset: number;
  diveTimer: number;
  diveInterval: number;
  fireCooldown: number;
  deaths: number;
  clears: number;
}

const baseY = (row: number): number => 2 + row * 1.4;

function makeAliens(): Alien[] {
  const aliens: Alien[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COL_OFFS.length; col++) {
      aliens.push({
        id: row * COL_OFFS.length + col,
        row,
        col,
        x: 12 + COL_OFFS[col]!,
        y: baseY(row),
        mode: 'grid',
        dvx: 0,
        dvy: 0,
      });
    }
  }
  return aliens;
}

export function createGalaxy(config: GameConfig): GalaxyState {
  const lives: Record<string, number> = {};
  const scores: Record<string, number> = {};
  for (const id of config.playerIds) {
    lives[id] = 3;
    scores[id] = 0;
  }
  return {
    phase: 'ready',
    phaseTimer: 0,
    level: 1,
    scores,
    lives,
    sfx: [],
    player: { x: 12, y: PLAYER_Y },
    aliens: makeAliens(),
    bullets: [],
    formationDir: 1,
    formationOffset: 0,
    dropOffset: 0,
    diveTimer: DIVE_INTERVAL,
    diveInterval: DIVE_INTERVAL,
    fireCooldown: 0,
    deaths: 0,
    clears: 0,
  };
}

const resetWave = (s: GalaxyState): GalaxyState => ({
  ...s,
  aliens: makeAliens(),
  bullets: [],
  formationOffset: 0,
  dropOffset: 0,
  diveTimer: s.diveInterval,
});

function loseLife(s: GalaxyState): GalaxyState {
  const id = Object.keys(s.lives)[0]!;
  const lives = { ...s.lives, [id]: s.lives[id]! - 1 };
  let next = withSfx({ ...s, lives, deaths: s.deaths + 1 }, { name: 'die', player: id });
  if (lives[id]! > 0) next = resetWave(next);
  else next = enterPhase(next, 'gameOver');
  return next;
}

function step(state: GalaxyState, inputs: Record<string, PlayerInput>): GalaxyState {
  if (state.phase !== 'playing') return tickPhase(state, 1 / 60).state;
  let s: GalaxyState = { ...state, sfx: [] as GalaxyState['sfx'] };
  const id = Object.keys(s.lives)[0]!;
  const input = inputs[id];

  // player
  const player = { ...s.player };
  if (input?.dir?.dx) {
    player.x = Math.min(23, Math.max(1, player.x + input.dir.dx * 0.45));
  }
  let bullets = s.bullets.map((b) => ({ ...b, y: b.y + b.dy })).filter((b) => b.y > -1 && b.y < 26);
  s.fireCooldown = Math.max(0, s.fireCooldown - 1);
  if (input?.button && s.fireCooldown === 0 && bullets.length < 2) {
    bullets = [...bullets, { x: player.x, y: player.y - 1, dy: -0.7 }];
    s.fireCooldown = 14;
    s = withSfx(s, { name: 'shoot', player: id });
  }
  s = { ...s, player, bullets };

  // formation march
  const speed = 0.018 + s.level * 0.003;
  let offset = s.formationOffset + s.formationDir * speed;
  let dir = s.formationDir;
  let drop = s.dropOffset;
  if (Math.abs(offset) > 2.5) {
    dir = (dir * -1) as 1 | -1;
    drop += 0.35;
  }
  s = { ...s, formationOffset: offset, formationDir: dir, dropOffset: drop };

  // aliens
  let aliens = s.aliens.map((a) => ({ ...a }));
  for (const a of aliens) {
    if (a.mode === 'grid') {
      a.x = 12 + COL_OFFS[a.col]! + s.formationOffset;
      a.y = baseY(a.row) + s.dropOffset;
    } else {
      a.dvx = Math.max(-0.25, Math.min(0.25, a.dvx + (s.player.x - a.x) * 0.002));
      a.x += a.dvx;
      a.y += a.dvy;
      if (a.y > 22.5) {
        a.mode = 'grid';
        a.dvx = 0;
        a.dvy = 0;
      }
    }
  }

  // launch divers
  s = { ...s, aliens };
  s.diveTimer -= 1;
  if (s.diveTimer <= 0) {
    const grid = aliens.filter((a) => a.mode === 'grid');
    if (grid.length > 0) {
      const pick = grid[(s.deaths + Math.floor(s.diveInterval) - s.diveTimer) % grid.length]!;
      pick.mode = 'dive';
      pick.dvx = Math.max(-0.2, Math.min(0.2, (s.player.x - pick.x) * 0.02));
      pick.dvy = 0.3 + Math.min(0.15, (s.level - 1) * 0.03);
      s.diveTimer = s.diveInterval;
    } else {
      s.diveTimer = 30;
    }
  }

  // bullet vs alien
  for (const b of bullets) {
    const hit = aliens.find((a) => Math.abs(a.x - b.x) < 0.8 && Math.abs(a.y - b.y) < 0.8);
    if (hit) {
      aliens = aliens.filter((a) => a.id !== hit.id);
      b.y = -99;
      const multiplier = hit.mode === 'dive' ? 2 : 1;
      s = { ...s, scores: { ...s.scores, [id]: s.scores[id]! + 10 * (hit.row + 1) * multiplier } };
      s = withSfx(s, { name: 'hit', player: id });
    }
  }
  s = { ...s, aliens, bullets: bullets.filter((b) => b.y > -10) };

  // divers hit player
  if (aliens.some((a) => a.mode === 'dive' && Math.abs(a.x - player.x) < 1 && Math.abs(a.y - player.y) < 1)) {
    return loseLife(s);
  }
  // formation reached the player line
  if (aliens.some((a) => a.mode === 'grid' && a.y >= 20)) {
    return loseLife(s);
  }

  // wave cleared
  if (s.aliens.length === 0) {
    const nextLevel = s.level + 1;
    const nextInterval = Math.max(60, DIVE_INTERVAL - (nextLevel - 1) * 15);
    s = withSfx({ ...s, level: nextLevel, diveInterval: nextInterval, clears: s.clears + 1 }, { name: 'goal', player: id });
    s = resetWave(s);
    s = enterPhase(s, 'roundOver');
  }
  return s;
}

/** attract-mode bot: chase the lowest alien, keep the cannon busy */
function demoGalaxy(state: GalaxyState, tick: number): PlayerInput {
  const target = state.aliens.reduce<{ x: number; y: number } | null>(
    (best, a) => (best === null || a.y > best.y ? a : best),
    null,
  );
  if (!target) return { dir: null, button: false, seq: tick };
  const dx = target.x - state.player.x;
  const dir = Math.abs(dx) < 0.4 ? null : { dx: dx > 0 ? 1 : -1, dy: 0 };
  return { dir, button: true, seq: tick };
}

export const galaxySpec: GameSpec<GalaxyState> = {
  id: 'galaxy',
  supportsVersus: false,
  capacity: 2,
  turnBased: false,
  create: createGalaxy,
  step,
  demo: demoGalaxy,
};
