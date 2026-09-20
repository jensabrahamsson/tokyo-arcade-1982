/** R38: pixel-art manifest + async loader. Presentation only; core never sees this. */

import type { GameId } from '@arkad/core';

export const ART_FILES = [
  'hall-floor.png',
  'cabinet-bezel.png',
  'coast-lo-castle.png',
  'splash-logo.png',
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
  // R57 Wave 3: six-cabinet marquee + attract plates. Coast plates are PR #8
  // (do not add coast-marquee/attract here). Hero sheets stay unwired.
  'snake-marquee.png',
  'snake-attract.png',
  'puck-marquee.png',
  'puck-attract.png',
  'block-marquee.png',
  'block-attract.png',
  'galaxy-marquee.png',
  'galaxy-attract.png',
  'river-marquee.png',
  'river-attract.png',
  'myriad-marquee.png',
  'myriad-attract.png',
] as const;

export type ArtFile = (typeof ART_FILES)[number];

/** R57: marquee/attract filenames for the six Wave 3 cabinets. Coast → null. */
export const WAVE3_CABINET_GAMES = ['snake', 'puck', 'block', 'galaxy', 'river', 'myriad'] as const;

export function cabinetArtFile(game: GameId, slot: 'marquee' | 'attract'): ArtFile | null {
  const name = `${game}-${slot}.png`;
  return (ART_FILES as readonly string[]).includes(name) ? (name as ArtFile) : null;
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
