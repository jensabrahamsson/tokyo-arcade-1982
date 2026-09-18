import { describe, it, expect } from 'vitest';
import { ART_FILES, artPath, loadArt, artGet } from './art';

const fakeImg = (src: string) => ({ src, ok: true }) as unknown as HTMLImageElement;

describe('art manifest (R38)', () => {
  it('lists the first-batch files with stable names', () => {
    expect([...ART_FILES].sort()).toEqual(
      ['cabinet-bezel.png', 'coast-lo-castle.png', 'hall-floor.png', 'splash-logo.png'].sort(),
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
    expect(Object.keys(atlas).sort()).toEqual(
      ['cabinet-bezel.png', 'hall-floor.png', 'splash-logo.png'].sort(),
    );
    expect(atlas['splash-logo.png']).toBeTruthy();
    expect(atlas['coast-lo-castle.png']).toBeUndefined();
    expect(artGet(atlas, 'coast-lo-castle.png')).toBeUndefined();
    expect(artGet(atlas, 'splash-logo.png')).toBeTruthy();
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
