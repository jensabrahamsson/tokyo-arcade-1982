import { describe, it, expect } from 'vitest';
import { EN, JA } from '@arkad/core';
import { PAL } from './ui';
import { splashWordmark, SPLASH_LOOK } from './splashLook';

describe('splash wordmark (R54.1 / Wave 2)', () => {
  it('is two lines: TOKYO ARCADE and an amber 1982 year, never ARKAD', () => {
    const w = splashWordmark(EN['app.title'], EN['app.year']);
    expect(w.line1).toBe('TOKYO ARCADE');
    expect(w.line1).not.toMatch(/ARKAD/i);
    expect(w.line2).toBe('— 1982 —');
    expect(w.bodyColor).toBe(PAL.white);
    expect(w.shadowColor).toBe('#5e1740');
    expect(w.yearColor).toBe(PAL.orange);
    const ja = splashWordmark(JA['app.title'], JA['app.year']);
    expect(ja.line1).toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
    expect(ja.line2).toContain('1982年');
  });

  it('has no generic AI chrome — one shadow, lanterns, no rainbow or colour bar', () => {
    expect(SPLASH_LOOK.colorBar).toBe(false);
    expect(SPLASH_LOOK.rainbow).toBe(false);
    expect(SPLASH_LOOK.glitchOffset).toBe(false);
    expect(SPLASH_LOOK.lanterns).toBe(7);
    const w = splashWordmark(EN['app.title'], EN['app.year']);
    expect(new Set([w.bodyColor, w.shadowColor, w.yearColor]).size).toBe(3);
  });
});
