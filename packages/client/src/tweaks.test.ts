import { describe, it, expect } from 'vitest';
import {
  DEFAULT_KNOBS, cycleKnob, crtFilterCss, scanlineOpacity,
  ACCESS_MODES, nextAccess, accessFilterCss,
  attractLang, tournamentBanner, loadKnobs, saveKnobs, loadAccess, saveAccess,
  volumeGain, effectiveGain, cycleVolume, loadVolume, saveVolume, loadMuted, saveMuted,
  DEFAULT_VOLUME, joinCountdown, marqueeOffset, marqueeLamp, visibleSpectators,
  rejectToast, toastVisible, TOAST_MS, walkBob, creditStrip,
  freePlayBannerVisible, cabinetFocus, isNewRecord, recordFlashVisible, blinkOn,
  powerLed, ledState, scoreCrawlOffset,
  waitDots, thunkEnvelope, formatHallClock, exitToastVisible,
  attractGain, effectiveAttractGain, heatShimmer, readyCountdown, initialGlow,
  testToneAllowed, shouldRequestFullscreen, fullscreenHintVisible,
  type CrtKnobs, type VolumeDetent,
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

describe('operator volume / mute (R23)', () => {
  it('detents are strictly monotonic and 0 means silence', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(1)).toBeGreaterThan(volumeGain(0));
    expect(volumeGain(2)).toBeGreaterThan(volumeGain(1));
    expect(volumeGain(3)).toBe(volumeGain(3));
    expect(volumeGain(3)).toBeLessThanOrEqual(1);
  });

  it('mute forces gain 0 and unmute restores the detent', () => {
    expect(effectiveGain(3, true)).toBe(0);
    expect(effectiveGain(2, false)).toBe(volumeGain(2));
    expect(effectiveGain(0, false)).toBe(0);
  });

  it('the detent cycles 0-1-2-3-0', () => {
    let v: VolumeDetent = 0;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(v);
      v = cycleVolume(v);
    }
    expect(seen).toEqual([0, 1, 2, 3]);
    expect(v).toBe(0);
  });

  it('volume and mute survive the storage round-trip; junk falls back', () => {
    const store = fakeStorage();
    saveVolume(store, 1);
    saveMuted(store, true);
    expect(loadVolume(store, DEFAULT_VOLUME)).toBe(1);
    expect(loadMuted(store, false)).toBe(true);
    const junk = fakeStorage({ 'arkad-volume': '"loud"', 'arkad-mute': 'yes' });
    expect(loadVolume(junk, DEFAULT_VOLUME)).toBe(DEFAULT_VOLUME);
    expect(loadMuted(junk, false)).toBe(false);
  });
});

describe('join-window countdown (R25)', () => {
  it('mirrors the server deadline in whole seconds and never invents time', () => {
    expect(joinCountdown(1120, 1000)).toBe(2); // 120 ticks = 2 s
    expect(joinCountdown(1111, 1000)).toBe(2); // 111 ticks -> 1.85 s -> shows 2
    expect(joinCountdown(1110, 1000)).toBe(2);
    expect(joinCountdown(1109, 1000)).toBe(2);
    expect(joinCountdown(1061, 1000)).toBe(2);
    expect(joinCountdown(1060, 1000)).toBe(1);
    expect(joinCountdown(1001, 1000)).toBe(1);
    expect(joinCountdown(1000, 1000)).toBeNull();
    expect(joinCountdown(999, 1000)).toBeNull();
    expect(joinCountdown(null, 1000)).toBeNull();
  });

  it('counts down monotonically and deterministically', () => {
    let prev = Infinity;
    for (let now = 1000; now <= 1122; now++) {
      const c = joinCountdown(1120, now);
      const v = c ?? -1;
      expect(v).toBeLessThanOrEqual(prev);
      expect(joinCountdown(1120, now)).toBe(c);
      prev = v;
    }
  });
});

describe('neon marquee scroll (R27)', () => {
  it('is deterministic and bounded by the text width', () => {
    expect(marqueeOffset(0, 100, 5000)).toBe(100);
    expect(marqueeOffset(2500, 100, 5000)).toBeCloseTo(0);
    expect(marqueeOffset(5000, 100, 5000)).toBe(100); // wraps to the start, seamless
    expect(marqueeOffset(99999, 100, 5000)).toBeLessThanOrEqual(100);
    expect(marqueeOffset(99999, 100, 5000)).toBeGreaterThanOrEqual(-100);
    for (let ms = 0; ms <= 20000; ms += 137) {
      const v = marqueeOffset(ms, 100, 5000);
      expect(v).toBeLessThanOrEqual(100);
      expect(v).toBeGreaterThanOrEqual(-100);
      expect(marqueeOffset(ms, 100, 5000)).toBe(v);
    }
  });

  it('degenerate inputs never produce NaN', () => {
    expect(marqueeOffset(1000, 0, 5000)).toBe(0);
    expect(marqueeOffset(1000, 100, 0)).toBe(0);
    expect(marqueeOffset(-50, 100, 5000)).toBe(100);
  });
});

describe('NOW PLAYING lamp + spectator badge (R28/R29)', () => {
  it('lamp mode is idle for empty or demo cabinets, now for live seats', () => {
    expect(marqueeLamp({ demo: true, players: 0 })).toBe('idle');
    expect(marqueeLamp({ demo: false, players: 0 })).toBe('idle');
    expect(marqueeLamp({ demo: false, players: 2 })).toBe('now-playing');
    expect(marqueeLamp({ demo: true, players: 3 })).toBe('idle');
  });

  it('OUT OF ORDER wins over NOW PLAYING, always', () => {
    expect(marqueeLamp({ demo: false, players: 2 }, true)).toBe('out-of-order');
    expect(marqueeLamp({ demo: true, players: 0 }, true)).toBe('out-of-order');
    expect(marqueeLamp({ demo: false, players: 0 }, true)).toBe('out-of-order');
  });

  it('spectator badge hides zero and shows the count otherwise', () => {
    expect(visibleSpectators(0)).toBeNull();
    expect(visibleSpectators(-1)).toBeNull();
    expect(visibleSpectators(1)).toBe(1);
    expect(visibleSpectators(42)).toBe(42);
  });
});

describe('reject toasts (R30)', () => {
  it('maps every known clear reason to its own line', () => {
    expect(rejectToast('insert-coin')).toBe('toast.insertCoin');
    expect(rejectToast('out-of-order')).toBe('toast.outOfOrder');
    expect(rejectToast('solo-only')).toBe('toast.soloOnly');
    expect(rejectToast('unknown-game')).toBe('toast.unknownGame');
    expect(rejectToast('insert-coin')).not.toBe(rejectToast('out-of-order'));
  });

  it('unknown reasons get the safe generic line', () => {
    expect(rejectToast('meteor-impact')).toBe('toast.generic');
    expect(rejectToast('')).toBe('toast.generic');
    expect(rejectToast('INSERT COIN')).toBe('toast.generic');
  });

  it('the toast clears after its window and stays before it', () => {
    expect(toastVisible(1000, 1000)).toBe(true);
    expect(toastVisible(1000, 1999)).toBe(true);
    expect(toastVisible(1000, 2800)).toBe(false);
    expect(toastVisible(1000, 5000)).toBe(false);
    expect(TOAST_MS).toBeGreaterThanOrEqual(1500);
  });
});

describe('hall walk bob (R32)', () => {
  it('is deterministic, periodic and subtle', () => {
    expect(walkBob(0)).toBe(0);
    for (let i = 0; i < 64; i++) {
      const v = walkBob(i);
      expect(v).toBeLessThanOrEqual(0);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(walkBob(i)).toBe(v);
      expect(walkBob(i + 4)).toBe(v);
    }
    expect(new Set([0, 1, 2, 3].map(walkBob)).size).toBeGreaterThan(1);
    expect(walkBob(-1)).toBe(walkBob(3));
  });
});

describe('credit digits strip (R33)', () => {
  it('coin mode always shows a digit, zero included; free-play hides the strip', () => {
    expect(creditStrip(0, false)).toBe('0');
    expect(creditStrip(3, false)).toBe('3');
    expect(creditStrip(12, false)).toBe('12');
    expect(creditStrip(0, true)).toBeNull();
    expect(creditStrip(7, true)).toBeNull();
  });

  it('never shows negative or fractional credits', () => {
    expect(creditStrip(-4, false)).toBe('0');
    expect(creditStrip(2.9, false)).toBe('2');
  });
});

describe('free-play banner visibility (R34)', () => {
  it('flies only when free-play is on', () => {
    expect(freePlayBannerVisible(true)).toBe(true);
    expect(freePlayBannerVisible(false)).toBe(false);
  });
});

describe('cabinet focus ring (R35)', () => {
  it('highlights the one cabinet the token stands on', () => {
    expect(cabinetFocus(2, [0, 1, 2, 3])).toBe(2);
    expect(cabinetFocus(0, [0, 1, 2, 3])).toBe(0);
    expect(cabinetFocus(9, [0, 1, 2, 3])).toBeNull();
    expect(cabinetFocus(1, [])).toBeNull();
  });

  it('is deterministic and picks the first match on duplicated tiles', () => {
    expect(cabinetFocus(5, [7, 5, 5])).toBe(1);
    expect(cabinetFocus(5, [7, 5, 5])).toBe(1);
  });
});

describe('new-record flash (R36)', () => {
  it('enters the table when it beats the last slot or the table is not full', () => {
    expect(isNewRecord(100, [200, 150, 90], 3)).toBe(true); // 100 > 90
    expect(isNewRecord(80, [200, 150, 90], 3)).toBe(false);
    expect(isNewRecord(1, [200], 3)).toBe(true); // room left
    expect(isNewRecord(0, [], 3)).toBe(false); // zero never enters
    expect(isNewRecord(50, [50, 40], 3)).toBe(true); // 2 rows of 3: room
    expect(isNewRecord(50, [50, 40, 30], 3)).toBe(true); // ties enter
  });

  it('auto-clears after its window', () => {
    expect(recordFlashVisible(1000, 1000)).toBe(true);
    expect(recordFlashVisible(1000, 3599)).toBe(true);
    expect(recordFlashVisible(1000, 3600)).toBe(false);
  });
});

describe('attract blink (R37)', () => {
  it('is a deterministic duty-cycle square wave', () => {
    expect(blinkOn(0, 20, 0.5)).toBe(true);
    expect(blinkOn(9, 20, 0.5)).toBe(true);
    expect(blinkOn(10, 20, 0.5)).toBe(false);
    expect(blinkOn(19, 20, 0.5)).toBe(false);
    expect(blinkOn(20, 20, 0.5)).toBe(true); // wraps
    expect(blinkOn(5, 20, 1)).toBe(true);
    expect(blinkOn(5, 20, 0)).toBe(false);
    expect(blinkOn(5, 0, 0.5)).toBe(false); // no period, no blink
    expect(blinkOn(-3, 20, 0.5)).toBe(blinkOn(17, 20, 0.5));
  });
});

describe('cabinet power LED (R40)', () => {
  it('maps each state to its colour and duty', () => {
    expect(powerLed('idle')).toEqual({ color: 'gray', duty: 0 });
    expect(powerLed('playing')).toEqual({ color: 'lime', duty: 1 });
    expect(powerLed('ooo')).toEqual({ color: 'red', duty: 0.5 });
  });

  it('derivation keeps the priority OOO > playing > idle', () => {
    expect(ledState({ live: true, ooo: true })).toBe('ooo');
    expect(ledState({ live: true, ooo: false })).toBe('playing');
    expect(ledState({ live: false, ooo: true })).toBe('ooo');
    expect(ledState({ live: false, ooo: false })).toBe('idle');
  });
});

describe('high-score roll crawl (R41)', () => {
  it('is deterministic and cycles the strip of rows once per period', () => {
    expect(scoreCrawlOffset(0, 10, 4000)).toBe(0);
    expect(scoreCrawlOffset(4000, 10, 4000)).toBe(0); // wraps
    expect(scoreCrawlOffset(2000, 10, 4000)).toBe(20); // half: two rows up (3 rows + gap)
    expect(scoreCrawlOffset(1000, 10, 4000)).toBe(10);
    for (let ms = 0; ms <= 9000; ms += 97) {
      const v = scoreCrawlOffset(ms, 10, 4000);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(40); // 3 rows + 1 gap
      expect(scoreCrawlOffset(ms, 10, 4000)).toBe(v);
    }
    expect(scoreCrawlOffset(500, 0, 4000)).toBe(0);
    expect(scoreCrawlOffset(500, 10, 0)).toBe(0);
  });
});

describe('join-queue waiting dots (R43)', () => {
  it('cycles 0,1,2,3 dots deterministically over the period', () => {
    expect(waitDots(0, 40)).toBe(0);
    expect(waitDots(9, 40)).toBe(0);
    expect(waitDots(10, 40)).toBe(1);
    expect(waitDots(19, 40)).toBe(1);
    expect(waitDots(39, 40)).toBe(3);
    expect(waitDots(40, 40)).toBe(0); // wraps
    expect(waitDots(-5, 40)).toBe(waitDots(35, 40));
    expect(waitDots(7, 0)).toBe(0);
    for (let t = 0; t < 120; t++) expect(waitDots(t, 40)).toBeGreaterThanOrEqual(0);
  });
});

describe('coin thunk envelope (R44)', () => {
  it('is a linear decay with hard silence outside the window', () => {
    expect(thunkEnvelope(0, 300)).toBe(1);
    expect(thunkEnvelope(150, 300)).toBeCloseTo(0.5);
    expect(thunkEnvelope(300, 300)).toBe(0);
    expect(thunkEnvelope(-10, 300)).toBe(0);
    expect(thunkEnvelope(301, 300)).toBe(0);
    expect(thunkEnvelope(10, 0)).toBe(0);
  });
});

describe('hall wall clock (R45)', () => {
  it('formats injected epoch time at a pure offset', () => {
    expect(formatHallClock(Date.UTC(2026, 8, 18, 14, 5), 120)).toBe('16:05');
    expect(formatHallClock(Date.UTC(2026, 8, 18, 23, 0), 120)).toBe('01:00'); // next day, 24h wrap
    expect(formatHallClock(Date.UTC(2026, 0, 1, 0, 0), -330)).toBe('18:30'); // previous day
    expect(formatHallClock(Date.UTC(2026, 8, 18, 0, 0), 0)).toBe('00:00');
  });
});

describe('thank-you exit toast (R47)', () => {
  it('shows for exactly its duration and never before start', () => {
    expect(exitToastVisible(0, 0, 1200)).toBe(true);
    expect(exitToastVisible(0, 1199, 1200)).toBe(true);
    expect(exitToastVisible(0, 1200, 1200)).toBe(false);
    expect(exitToastVisible(5, 0, 1200)).toBe(false);
    expect(exitToastVisible(1000, 2100, 1200)).toBe(true);
  });
});

describe('attract volume dip (R48)', () => {
  it('ducks attract sound while a human is seated', () => {
    expect(attractGain(false)).toBe(1);
    expect(attractGain(true)).toBeLessThan(1);
    expect(attractGain(true)).toBeGreaterThan(0);
  });

  it('mute wins over everything', () => {
    expect(effectiveAttractGain(false, true)).toBe(0);
    expect(effectiveAttractGain(true, true)).toBe(0);
    expect(effectiveAttractGain(false, false)).toBe(1);
  });
});

describe('heat shimmer (R49)', () => {
  it('is off for fresh attract and grows with idle time, capped', () => {
    expect(heatShimmer(0, 10).alpha).toBe(0);
    expect(heatShimmer(30_000, 10).alpha).toBe(0);
    const a = heatShimmer(60_000, 10).alpha;
    const b = heatShimmer(120_000, 10).alpha;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThanOrEqual(a);
    expect(heatShimmer(10 ** 9, 10).alpha).toBeLessThanOrEqual(0.18);
  });

  it('offset is small, deterministic and periodic in tick', () => {
    for (let t = 0; t < 40; t++) {
      const { offset } = heatShimmer(60_000, t);
      expect(Math.abs(offset)).toBeLessThanOrEqual(1);
      expect(heatShimmer(60_000, t).offset).toBe(offset);
      expect(heatShimmer(60_000, t + 4).offset).toBe(offset);
    }
  });
});

describe('versus ready countdown (R50)', () => {
  it('counts 3,2,1 over the window and null after', () => {
    expect(readyCountdown(0)).toBe(3);
    expect(readyCountdown(1000)).toBe(2);
    expect(readyCountdown(2000)).toBe(1);
    expect(readyCountdown(2999)).toBe(1);
    expect(readyCountdown(3000)).toBeNull();
    expect(readyCountdown(-1)).toBeNull();
  });
});

describe('initials glow (R51)', () => {
  it('is a bounded deterministic pulse', () => {
    for (let t = 0; t < 40; t++) {
      const g = initialGlow(t);
      expect(g).toBeGreaterThanOrEqual(0.4);
      expect(g).toBeLessThanOrEqual(1);
      expect(initialGlow(t + 4)).toBe(g);
    }
    expect(new Set([0, 1, 2, 3].map(initialGlow)).size).toBeGreaterThan(1);
  });
});

describe('operator test tone rate limit (R52)', () => {
  it('allows one tone per gap from a cold start', () => {
    expect(testToneAllowed(0, 0, 800)).toBe(true);
    expect(testToneAllowed(0, 500, 800)).toBe(false);
    expect(testToneAllowed(0, 800, 800)).toBe(true);
    expect(testToneAllowed(0, 801, 800)).toBe(true);
    expect(testToneAllowed(100, 50, 800)).toBe(false);
  });
});

describe('fullscreen ux helpers (R53)', () => {
  it('requests fullscreen on hall and table scenes only', () => {
    expect(shouldRequestFullscreen('hall')).toBe(true);
    expect(shouldRequestFullscreen('table')).toBe(true);
    expect(shouldRequestFullscreen('splash')).toBe(false);
    expect(shouldRequestFullscreen('service')).toBe(false);
  });

  it('the hint shows for a fixed window after boot', () => {
    expect(fullscreenHintVisible(0, 10_000)).toBe(true);
    expect(fullscreenHintVisible(9999, 10_000)).toBe(true);
    expect(fullscreenHintVisible(10_000, 10_000)).toBe(false);
  });
});
