import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

  it('does not keep JPEG pilots on the static serve path (P2-C)', () => {
    const artDir = join(__dirname, '..', 'static', 'art');
    expect(existsSync(join(artDir, 'pilots'))).toBe(false);
  });

  it('Coast show-cabinet PNGs are real pixel art, size-gated, 16–32KB class', () => {
    const artDir = join(__dirname, '..', 'static', 'art');
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const coastArt = ART_FILES.filter((f) => f.startsWith('coast-'));
    expect(coastArt).toEqual(expect.arrayContaining([
      'coast-lo-castle.png', 'coast-centerpartiet.png', 'coast-harpsund.png',
      'coast-bommersvik.png', 'coast-valdebatt76.png', 'coast-castro-visit.png',
    ]));
    expect(coastArt.length).toBe(6);
    for (const name of coastArt) {
      const p = join(artDir, name);
      expect(existsSync(p), name).toBe(true);
      const buf = readFileSync(p);
      expect(buf.subarray(0, 8).equals(pngMagic), name).toBe(true);
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      expect(Math.max(width, height), name).toBeGreaterThanOrEqual(64);
      // 16–32 KB class: small arcade sprites, not 1.7 MB JPEG pilots
      expect(buf.length, name).toBeGreaterThanOrEqual(12 * 1024);
      expect(buf.length, name).toBeLessThanOrEqual(36 * 1024);
      // no Imagine/Grok watermark stashed in PNG text chunks
      const text = buf.toString('latin1');
      expect(text).not.toMatch(/GROK|IMAGINE WATERMARK|OPENAI/i);
    }
  });

  it('every PNG in the drop zone is actually PNG bytes, not JPEG (P2-C)', () => {
    const artDir = join(__dirname, '..', 'static', 'art');
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...walk(p));
        else if (name.endsWith('.png')) out.push(p);
      }
      return out;
    };
    const pngs = walk(artDir);
    expect(pngs.length).toBeGreaterThan(0);
    for (const p of pngs) {
      const head = readFileSync(p).subarray(0, 8);
      expect(head.equals(pngMagic), p).toBe(true);
    }
  });
});
