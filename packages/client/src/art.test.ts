import { describe, it, expect } from 'vitest';
import { ART_FILES, artPath, loadArt, artGet } from './art';

const fakeImg = (src: string, w = 128, h = 128) =>
  ({ src, ok: true, naturalWidth: w, naturalHeight: h }) as unknown as HTMLImageElement;

describe('art manifest (R38)', () => {
  it('lists the manifest with stable names (first batch + R54 coast landmarks)', () => {
    expect([...ART_FILES].sort()).toEqual(
      [
        'cabinet-bezel.png', 'coast-lo-castle.png', 'hall-floor.png', 'splash-logo.png',
        'marquee-neon.png', 'coin-slot.png', 'credit-panel.png', 'wait-badge.png',
        // R54 additions: Coast roadside landmark billboards (Imagine PNG drop zone)
        'coast-centerpartiet.png', 'coast-harpsund.png', 'coast-bommersvik.png',
        'coast-valdebatt76.png', 'coast-castro-visit.png',
      ].sort(),
    );
  });

  it('paths all live under /art/', () => {
    for (const f of ART_FILES) {
      expect(artPath(f)).toBe(`/art/${f}`);
      expect(f).toMatch(/^[a-z0-9-]+\.png$/);
    }
  });

  it('loader records successes and failures and never rejects (R38.4)', async () => {
    const atlas = await loadArt(async (src) => (src.includes('coast') ? null : fakeImg(src)));
    expect(Object.keys(atlas).sort()).toEqual(ART_FILES.filter((f) => !f.includes('coast')).sort());
    expect(atlas['splash-logo.png']).toBeTruthy();
    expect(atlas['coast-lo-castle.png']).toBeUndefined();
    expect(artGet(atlas, 'coast-lo-castle.png')).toBeUndefined();
    expect(artGet(atlas, 'splash-logo.png')).toBeTruthy();
  });

  it('ignores 16x16 placeholder drops; keeps anything ≥64 on either axis (P1-6)', async () => {
    const atlas = await loadArt(async (src) => {
      const name = src.split('/').pop()!;
      if (name === 'hall-floor.png') return fakeImg(src, 16, 16); // placeholder stub
      if (name === 'marquee-neon.png') return fakeImg(src, 120, 11); // real chrome sprite, wide
      return fakeImg(src);
    });
    expect(atlas['hall-floor.png']).toBeUndefined();
    expect(atlas['marquee-neon.png']).toBeTruthy();
    expect(atlas['cabinet-bezel.png']).toBeTruthy();
  });

  it('a throwing loader still yields an atlas (no crash, procedural fallback)', async () => {
    const atlas = await loadArt(async (src) => {
      if (src.includes('hall')) throw new Error('boom');
      return fakeImg(src);
    });
    expect(atlas['hall-floor.png']).toBeUndefined();
    expect(atlas['splash-logo.png']).toBeTruthy();
  });
});
