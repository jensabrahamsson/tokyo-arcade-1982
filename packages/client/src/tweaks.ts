/** Presentation-only operator knobs (R19/R21). Pure; persisted in localStorage. */

export interface CrtKnobs {
  brightness: 0 | 1 | 2;
  contrast: 0 | 1 | 2;
  scanlines: 0 | 1 | 2;
}

export type AccessMode = 'normal' | 'hi' | 'cb';

export const DEFAULT_KNOBS: CrtKnobs = { brightness: 1, contrast: 1, scanlines: 1 };
export const ACCESS_MODES: AccessMode[] = ['normal', 'hi', 'cb'];

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const cycle = (n: 0 | 1 | 2): 0 | 1 | 2 => (((n + 1) % 3) as 0 | 1 | 2);

export function cycleKnob(knobs: CrtKnobs, key: string): CrtKnobs {
  if (key === 'KeyQ') return { ...knobs, brightness: cycle(knobs.brightness) };
  if (key === 'KeyW') return { ...knobs, contrast: cycle(knobs.contrast) };
  if (key === 'KeyE') return { ...knobs, scanlines: cycle(knobs.scanlines) };
  return knobs;
}

const BRIGHT = [1, 1.12, 1.25];
const CONTRAST = [1, 1.15, 1.32];

/** one CSS filter string for the whole canvas: knobs first, palette assist second (R19.2) */
export function crtFilterCss(knobs: CrtKnobs, access: AccessMode): string {
  const base = `brightness(${BRIGHT[knobs.brightness]}) contrast(${CONTRAST[knobs.contrast]})`;
  const assist = accessFilterCss(access);
  return assist ? `${base} ${assist}` : base;
}

export function accessFilterCss(mode: AccessMode): string {
  if (mode === 'hi') return 'contrast(1.45) brightness(1.1) saturate(0.7)';
  if (mode === 'cb') return 'hue-rotate(160deg) saturate(1.3)';
  return '';
}

export function scanlineOpacity(knobs: CrtKnobs, access: AccessMode): number {
  const base = [0, 0.25, 0.45][knobs.scanlines]!;
  return access === 'hi' ? base * 0.4 : base;
}

export function nextAccess(mode: AccessMode): AccessMode {
  return ACCESS_MODES[(ACCESS_MODES.indexOf(mode) + 1) % ACCESS_MODES.length]!;
}

const KNOB_KEY = 'arkad-crt';
const ACCESS_KEY = 'arkad-access';

const isDetent = (v: unknown): v is 0 | 1 | 2 => v === 0 || v === 1 || v === 2;

export function loadKnobs(store: StorageLike, fallback: CrtKnobs): CrtKnobs {
  try {
    const raw = store.getItem(KNOB_KEY);
    if (!raw) return fallback;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (isDetent(o.brightness) && isDetent(o.contrast) && isDetent(o.scanlines)) {
      return { brightness: o.brightness, contrast: o.contrast, scanlines: o.scanlines };
    }
  } catch {
    /* fall through */
  }
  return fallback;
}

export function saveKnobs(store: StorageLike, knobs: CrtKnobs): void {
  store.setItem(KNOB_KEY, JSON.stringify(knobs));
}

export function loadAccess(store: StorageLike, fallback: AccessMode): AccessMode {
  const v = store.getItem(ACCESS_KEY);
  return ACCESS_MODES.includes(v as AccessMode) ? (v as AccessMode) : fallback;
}

export function saveAccess(store: StorageLike, mode: AccessMode): void {
  store.setItem(ACCESS_KEY, mode);
}

/** attract flavor: hall signage alternates EN and JA on a fixed period (R20) */
export function attractLang(ms: number, period = 4000): 'en' | 'ja' {
  return Math.floor(Math.max(0, ms) / period) % 2 === 0 ? 'en' : 'ja';
}

export interface BannerCabinet {
  scores: { name: string; score: number }[];
}

const BANNER_COLORS = 6;

/** the hall's tournament banner, derived from the live boards (R21.1) */
export function tournamentBanner(
  cabinets: BannerCabinet[],
  ms: number,
): { text: string; colorIdx: number } {
  let best: { name: string; score: number } | null = null;
  for (const c of cabinets) {
    for (const e of c.scores) {
      if (!best || e.score > best.score) best = e;
    }
  }
  const text = best
    ? `ARKAD OPEN: ${best.name.slice(0, 12)} ${best.score}`
    : 'TOKYO ARCADE OPEN HALL';
  return { text, colorIdx: Math.floor(ms / 1600) % BANNER_COLORS };
}

/** 4-step master volume detent + mute (R23). Web Audio gain only. */
export type VolumeDetent = 0 | 1 | 2 | 3;
export const DEFAULT_VOLUME: VolumeDetent = 2;
const VOLUME_GAIN: readonly number[] = [0, 0.35, 0.7, 1];

export const volumeGain = (v: VolumeDetent): number => VOLUME_GAIN[v]!;

export function cycleVolume(v: VolumeDetent): VolumeDetent {
  return ((v + 1) % 4) as VolumeDetent;
}

export function effectiveGain(v: VolumeDetent, muted: boolean): number {
  return muted ? 0 : volumeGain(v);
}

const VOLUME_KEY = 'arkad-volume';
const MUTE_KEY = 'arkad-mute';

const isDetent4 = (v: unknown): v is VolumeDetent => v === 0 || v === 1 || v === 2 || v === 3;

export function loadVolume(store: StorageLike, fallback: VolumeDetent): VolumeDetent {
  try {
    const raw = store.getItem(VOLUME_KEY);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return isDetent4(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function saveVolume(store: StorageLike, v: VolumeDetent): void {
  store.setItem(VOLUME_KEY, JSON.stringify(v));
}

export function loadMuted(store: StorageLike, fallback: boolean): boolean {
  const v = store.getItem(MUTE_KEY);
  return v === 'true' ? true : v === 'false' ? false : fallback;
}

export function saveMuted(store: StorageLike, muted: boolean): void {
  store.setItem(MUTE_KEY, String(muted));
}

/** whole seconds left in a join window, derived from server ticks (R25); null = no window */
export function joinCountdown(deadlineTick: number | null, nowTick: number): number | null {
  if (deadlineTick === null || deadlineTick === undefined) return null;
  const left = deadlineTick - nowTick;
  if (left <= 0) return null;
  return Math.ceil(left / 60);
}

/** x-offset from the marquee center for a right-to-left scroll; pure clock math (R27) */
export function marqueeOffset(ms: number, width: number, period: number): number {
  if (width <= 0 || period <= 0) return 0;
  const p = (Math.max(0, ms) % period) / period;
  return width - p * (width * 2);
}
