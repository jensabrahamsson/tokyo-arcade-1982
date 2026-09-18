import { describe, it, expect } from 'vitest';
import {
  DEFAULT_KNOBS, cycleKnob, crtFilterCss, scanlineOpacity,
  ACCESS_MODES, nextAccess, accessFilterCss,
  attractLang, tournamentBanner, loadKnobs, saveKnobs, loadAccess, saveAccess,
  type CrtKnobs,
} from './tweaks';

const fakeStorage = (init: Record<string, string> = {}) => {
  const map = new Map<string, string>(Object.entries(init));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
};

describe('CRT knobs (R19)', () => {
  it('defaults are the neutral detent', () => {
    expect(DEFAULT_KNOBS).toEqual({ brightness: 1, contrast: 1, scanlines: 1 });
  });

  it('Q/W/E cycle their knob 0-1-2-0', () => {
    let k = DEFAULT_KNOBS;
    k = cycleKnob(k, 'KeyQ');
    expect(k.brightness).toBe(2);
    k = cycleKnob(k, 'KeyQ');
    expect(k.brightness).toBe(0);
    expect(cycleKnob(DEFAULT_KNOBS, 'KeyW').contrast).toBe(2);
    expect(cycleKnob(DEFAULT_KNOBS, 'KeyE').scanlines).toBe(2);
  });

  it('other keys change nothing', () => {
    expect(cycleKnob(DEFAULT_KNOBS, 'KeyZ')).toEqual(DEFAULT_KNOBS);
  });

  it('the filter string reflects the knobs and nothing else', () => {
    const css = crtFilterCss(DEFAULT_KNOBS, 'normal');
    expect(css).toContain('brightness(1.12)');
    expect(css).toContain('contrast(1.15)');
    expect(crtFilterCss({ brightness: 0, contrast: 0, scanlines: 2 }, 'normal')).toContain('brightness(1)');
    expect(scanlineOpacity(DEFAULT_KNOBS, 'normal')).toBeGreaterThanOrEqual(0.2);
    expect(scanlineOpacity({ brightness: 1, contrast: 1, scanlines: 0 } as CrtKnobs, 'normal')).toBeLessThan(0.1);
  });

  it('persists through storage and survives garbage', () => {
    const st = fakeStorage();
    saveKnobs(st, { brightness: 2, contrast: 0, scanlines: 1 });
    expect(loadKnobs(st, DEFAULT_KNOBS)).toEqual({ brightness: 2, contrast: 0, scanlines: 1 });
    st.setItem('arkad-crt', '{{{not json');
    expect(loadKnobs(st, DEFAULT_KNOBS)).toEqual(DEFAULT_KNOBS);
    saveAccess(st, 'cb');
    expect(loadAccess(st, 'normal')).toBe('cb');
  });
});

describe('accessibility palette (R21.2)', () => {
  it('cycles normal -> hi -> cb -> normal', () => {
    expect(ACCESS_MODES).toEqual(['normal', 'hi', 'cb']);
    expect(nextAccess('normal')).toBe('hi');
    expect(nextAccess('hi')).toBe('cb');
    expect(nextAccess('cb')).toBe('normal');
  });

  it('high-contrast and color-blind filters are real and distinct', () => {
    expect(accessFilterCss('normal')).toBe('');
    expect(accessFilterCss('hi')).toContain('contrast');
    expect(accessFilterCss('cb')).toContain('hue-rotate');
    expect(accessFilterCss('hi')).not.toBe(accessFilterCss('cb'));
  });
});

describe('language attract cycle (R20)', () => {
  it('alternates en/ja deterministically on the period', () => {
    expect(attractLang(0, 4000)).toBe('en');
    expect(attractLang(3999, 4000)).toBe('en');
    expect(attractLang(4000, 4000)).toBe('ja');
    expect(attractLang(8000, 4000)).toBe('en');
    expect(attractLang(12001, 4000)).toBe('ja');
  });

  it('is stable for equal inputs', () => {
    expect(attractLang(12345)).toBe(attractLang(12345));
  });
});

describe('tournament banner (R21.1)', () => {
  const cabs = (entries: { name: string; score: number }[][]) =>
    entries.map((scores) => ({ game: 'snake' as const, mode: 'solo' as const, demo: true, phase: 'playing', data: null, scores }));

  it('shows a default banner when the board is empty', () => {
    const b = tournamentBanner(cabs([[], []]), 0);
    expect(b.text.length).toBeGreaterThan(4);
    expect(b.colorIdx).toBeGreaterThanOrEqual(0);
  });

  it('shows the live leader and score, colors chasing over time', () => {
    const c = cabs([[{ name: 'AKIRA', score: 420 }], [{ name: 'MIO', score: 999 }]]);
    const b = tournamentBanner(c, 0);
    expect(b.text).toContain('MIO');
    expect(b.text).toContain('999');
    const later = tournamentBanner(c, 60_000);
    expect(later.colorIdx).not.toBe(tournamentBanner(c, 0).colorIdx);
  });
});
