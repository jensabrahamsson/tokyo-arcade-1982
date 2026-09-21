/** R38: pixel-art manifest + async loader. Presentation only; core never sees this. */

import type { GameId } from '@arkad/core';

export const ART_FILES = [
  'hall-floor.png',
  'cabinet-bezel.png',
  'coast-lo-castle.png',
  'splash-logo.png',
  // R12.1 / R57.3: attract backdrop for splash and title. No baked words.
  'splash-marquee.png',
  'marquee-neon.png',
  'coin-slot.png',
  'credit-panel.png',
  'wait-badge.png',
  // R54: Coast roadside landmarks (Swedish nostalgia billboards); missing
  // files fall back to procedural drawing, same contract as R38.4
  'coast-centerpartiet.png',
  'coast-harpsund.png',
  'coast-bommersvik.png',
  'coast-valdebatt76.png',
  'coast-castro-visit.png',
  // R57 Wave 3: seven-cabinet marquee + attract + hero plates
  'snake-marquee.png',
  'snake-attract.png',
  'snake-hero.png',
  'puck-marquee.png',
  'puck-attract.png',
  'puck-hero.png',
  'block-marquee.png',
  'block-attract.png',
  'block-hero.png',
  'galaxy-marquee.png',
  'galaxy-attract.png',
  'galaxy-hero.png',
  'river-marquee.png',
  'river-attract.png',
  'river-hero.png',
  'myriad-marquee.png',
  'myriad-attract.png',
  'myriad-hero.png',
  // R57.28–.30: Coast hall marquee / attract / hero plates
  'coast-marquee.png',
  'coast-attract.png',
  'coast-hero.png',
] as const;

export type ArtFile = (typeof ART_FILES)[number];

/** R57: marquee/attract/hero filenames for all seven cabinets. */
export const WAVE3_CABINET_GAMES = ['snake', 'puck', 'block', 'galaxy', 'river', 'myriad', 'coast'] as const;

export const HALL_CHROME_FILES = [
  'hall-floor.png',
  'cabinet-bezel.png',
  'splash-logo.png',
  'marquee-neon.png',
  'coin-slot.png',
  'credit-panel.png',
  'wait-badge.png',
] as const;

export function cabinetArtFile(
  game: GameId,
  slot: 'marquee' | 'attract' | 'hero',
): ArtFile | null {
  const name = `${game}-${slot}.png`;
  return (ART_FILES as readonly string[]).includes(name) ? (name as ArtFile) : null;
}

/** R57.53: a landed bezel must stay visible — skip the dark body wash. */
export function skipCabinetBodyWash(hasBezel: boolean): boolean {
  return hasBezel;
}

/**
 * R57.3 / R57.53: EN splash uses the Latin wordmark plate when the loader
 * kept it. JA paints the i18n title — the plate bakes TOKYO ARCADE.
 */
export function splashWordmarkKind(hasLogo: boolean, lang: 'en' | 'ja' = 'en'): 'art' | 'procedural' {
  if (lang === 'ja') return 'procedural';
  return hasLogo ? 'art' : 'procedural';
}

export type HeroSheetScene = 'title' | 'ready' | 'playing' | 'hall' | 'attract';

/** R57.54: hero sheets are title spotlight + ready overlay; never gameplay. */
export function heroSheetForScene(game: GameId, scene: HeroSheetScene): ArtFile | null {
  if (scene !== 'title' && scene !== 'ready') return null;
  return cabinetArtFile(game, 'hero');
}

/** Fit src into dest while preserving aspect (letterbox). */
export function containRect(
  srcW: number,
  srcH: number,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
): { x: number; y: number; w: number; h: number } {
  if (!(srcW > 0) || !(srcH > 0) || !(destW > 0) || !(destH > 0)) {
    return { x: destX, y: destY, w: destW, h: destH };
  }
  const s = Math.min(destW / srcW, destH / srcH);
  const w = srcW * s;
  const h = srcH * s;
  return { x: destX + (destW - w) / 2, y: destY + (destH - h) / 2, w, h };
}

export const artPath = (name: ArtFile): string => `/art/${name}`;

export type ArtAtlas = Partial<Record<ArtFile, HTMLImageElement>>;

/** never rejects: a failed or throwing load simply leaves the slot empty (R38.4) */
export async function loadArt(
  load: (src: string) => Promise<HTMLImageElement | null>,
): Promise<ArtAtlas> {
  const atlas: ArtAtlas = {};
  await Promise.all(
    ART_FILES.map(async (name) => {
      try {
        const img = await load(artPath(name));
        // P1-6: 16x16 stubs dropped into the folder are placeholders, not art;
        // real drops carry ≥64 px on at least one axis, else procedural drawing
        // (which was designed to stand alone) keeps its precedence
        if (img && Math.max(img.naturalWidth, img.naturalHeight) >= 64) atlas[name] = img;
      } catch {
        /* procedural fallback stays in charge */
      }
    }),
  );
  return atlas;
}

export const artGet = (atlas: ArtAtlas, name: ArtFile): HTMLImageElement | undefined => atlas[name];

let atlas: ArtAtlas = {};

/** browser bootstrap; safe to call once at startup */
export function loadArtBrowser(): void {
  if (typeof Image === 'undefined') return;
  void loadArt(
    (src) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      }),
  ).then((a) => {
    atlas = a;
  });
}

export const art = (): ArtAtlas => atlas;
