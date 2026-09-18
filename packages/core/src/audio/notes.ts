import type { SfxName } from '../engine/types';

const SEMITONE: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

/** noteFreq('A4') = 440; '-' means rest. */
export function noteFreq(note: string): number {
  if (note === '-') return 0;
  const m = /^([A-G]#?)(\d)$/.exec(note);
  if (!m) throw new Error(`bad note: ${note}`);
  const semis = SEMITONE[m[1]!]! + (Number(m[2]) - 4) * 12 - 9;
  return 440 * 2 ** (semis / 12);
}

export type Wave = 'square' | 'triangle' | 'noise';

export interface SfxDef {
  wave: Wave;
  /** note tokens, each 1/16 of a beat unit */
  notes: string[];
  /** milliseconds per note */
  stepMs: number;
  volume?: number;
}

export const chiptune: Record<SfxName, SfxDef> = {
  thunk: { wave: 'triangle', notes: ['C3', 'G2'], stepMs: 55, volume: 0.9 },
  pause: { wave: 'triangle', notes: ['G4', 'D4'], stepMs: 85, volume: 0.6 },
  eat: { wave: 'square', notes: ['E5', 'B5'], stepMs: 28 },
  power: { wave: 'square', notes: ['C4', 'G4', 'C5', 'E5'], stepMs: 45 },
  die: { wave: 'square', notes: ['B4', 'F#4', 'D4', 'A#3', 'F4', 'C4'], stepMs: 60 },
  shoot: { wave: 'square', notes: ['D6', 'A5', 'E5'], stepMs: 20 },
  hit: { wave: 'noise', notes: ['-', '-', '-'], stepMs: 40 },
  levelUp: { wave: 'square', notes: ['C5', 'E5', 'G5', 'C6'], stepMs: 70 },
  coin: { wave: 'square', notes: ['B5', 'E6'], stepMs: 55 },
  start: { wave: 'triangle', notes: ['C4', 'E4', 'G4', 'C5'], stepMs: 90 },
  extraLife: { wave: 'square', notes: ['G5', 'C6', 'G5', 'C6'], stepMs: 55 },
  goal: { wave: 'square', notes: ['C5', 'E5', 'C6', 'G5', 'C6'], stepMs: 80 },
  hop: { wave: 'triangle', notes: ['G4', 'C5'], stepMs: 22, volume: 0.7 },
  bounce: { wave: 'square', notes: ['A4'], stepMs: 18, volume: 0.6 },
  jingle: {
    wave: 'square',
    notes: ['C5', 'E5', 'G5', 'C6', '-', 'G5', '-', 'C6', 'E6', 'G6', 'C6'],
    stepMs: 85,
    volume: 0.8,
  },
};
