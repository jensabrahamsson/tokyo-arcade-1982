import { describe, it, expect } from 'vitest';
import { noteFreq, chiptune } from './notes';

describe('note frequencies (equal temperament, A4 = 440 Hz)', () => {
  it('maps the classic notes', () => {
    expect(noteFreq('A4')).toBeCloseTo(440, 1);
    expect(noteFreq('C4')).toBeCloseTo(261.63, 1);
    expect(noteFreq('E5')).toBeCloseTo(659.26, 1);
    expect(noteFreq('C8')).toBeCloseTo(4186.01, 1);
  });

  it('handles sharps and one octave shifts', () => {
    expect(noteFreq('A#4')).toBeCloseTo(noteFreq('A4') * 2 ** (1 / 12), 1);
    expect(noteFreq('A5')).toBeCloseTo(880, 1);
  });

  it('silence is frequency 0', () => {
    expect(noteFreq('-')).toBe(0);
  });
});

describe('chiptune sequences', () => {
  it('pacman-style intro is a list of note tokens', () => {
    for (const def of Object.values(chiptune)) {
      expect(def.notes.length).toBeGreaterThan(0);
      for (const n of def.notes) expect(typeof n).toBe('string');
    }
  });
});

describe('hall audio (R14)', () => {
  it('a high-score jingle exists and is playable', () => {
    const def = chiptune.jingle;
    expect(def).toBeDefined();
    expect(def.notes.length).toBeGreaterThanOrEqual(4);
    for (const n of def.notes) expect(() => noteFreq(n)).not.toThrow();
  });
});
