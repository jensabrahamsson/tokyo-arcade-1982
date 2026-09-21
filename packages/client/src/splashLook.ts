import { PAL } from './ui';

/**
 * R54.1 splash wordmark — the look is already on main (P2): two lines,
 * white body, one deep-magenta shadow, amber year. This helper is the
 * unit-testable contract. main.ts still draws it inline (Wave 0 / Wave 1
 * own that file); wire `splashWordmark()` there after those merge.
 */
export const SPLASH_LOOK = {
  lanterns: 7,
  colorBar: false,
  rainbow: false,
  glitchOffset: false,
  /** BIOS / cartridge status lines read as a README. The attract does not paint them. */
  bootLog: false,
  /** L: LANGUAGE / C: CREDITS stays off this face. The keys still work. */
  instructionWall: false,
  marquee: true,
  neon: true,
  pressStart: true,
} as const;

export const ATTRACT_BULB_COUNT = 16;

/** Boot-log and key-legend phrases. A face that contains one is a document. */
export const ATTRACT_README_MARKERS = ['BIOS', 'CARTRIDGE', '...... OK', 'LANGUAGE', 'CREDITS'] as const;

export type AttractFace = 'splash' | 'title';

/**
 * R12.1 / R54.1 — the only player-facing lines on the attract.
 * Splash is the press-start invite. Title adds one cabinet, then either
 * insert-coin or press-start. Never a boot log, never a key legend.
 */
export function attractFaceLines(
  face: AttractFace,
  copy: {
    pressStart: string;
    insertCoin: string;
    gameTitle: string;
    gameTag: string;
    coinPhase: boolean;
  },
): readonly string[] {
  if (face === 'splash') return [copy.pressStart];
  return [copy.gameTitle, copy.gameTag, copy.coinPhase ? copy.insertCoin : copy.pressStart];
}

export function attractFaceInvitesPlay(lines: readonly string[], invites: readonly string[]): boolean {
  const blob = lines.join('\n');
  if (ATTRACT_README_MARKERS.some((m) => blob.includes(m))) return false;
  if (lines.length > 3) return false;
  return invites.some((s) => lines.includes(s));
}

export function attractBulbXs(canvasW = 320, count = ATTRACT_BULB_COUNT, inset = 10): number[] {
  if (count <= 0) return [];
  if (count === 1) return [canvasW / 2];
  const span = canvasW - inset * 2;
  return Array.from({ length: count }, (_, i) => inset + (span * i) / (count - 1));
}

/** A short chase window is hot; the rest of the marquee stays dim. */
export function attractBulbHot(index: number, step: number, count = ATTRACT_BULB_COUNT): boolean {
  if (count <= 0) return false;
  const head = ((step % count) + count) % count;
  const d = Math.min(Math.abs(index - head), count - Math.abs(index - head));
  return d <= 1;
}

export function attractMarqueeBand(canvasW = 320): { x: number; y: number; w: number; h: number } {
  return { x: 0, y: 0, w: canvasW, h: 28 };
}

export function attractPromptPlate(canvasW = 320, canvasH = 240): { x: number; y: number; w: number; h: number } {
  const w = 176;
  const h = 24;
  return { x: Math.round((canvasW - w) / 2), y: canvasH - 36, w, h };
}

/** Fullwidth kana needs a smaller body than the Latin wordmark or it clips. */
export function attractWordmarkSize(title: string, canvasW = 320, max = 26): number {
  const units = Array.from(title).reduce((sum, ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return sum + (cp > 0xff ? 1.05 : 0.62);
  }, 0);
  const fit = Math.floor((canvasW - 36) / Math.max(1, units));
  return Math.max(11, Math.min(max, fit));
}

export function splashWordmark(title: string, year: string): {
  line1: string;
  line2: string;
  bodyColor: string;
  shadowColor: string;
  yearColor: string;
} {
  return {
    line1: title,
    line2: `— ${year} —`,
    bodyColor: PAL.white,
    shadowColor: '#5e1740',
    yearColor: PAL.orange,
  };
}
