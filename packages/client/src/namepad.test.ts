import { describe, it, expect } from 'vitest';
import {
  createNamePad,
  moveCursor,
  pressKey,
  pressNamePadSelect,
  pressNamePadSpace,
  keyAt,
  type NamePad,
} from './namepad';

describe('namepad (marquee keyboard input)', () => {
  it('starts empty with a cursor and 12-char limit', () => {
    const p = createNamePad();
    expect(p.text).toBe('');
    expect(p.max).toBe(12);
    expect(p.done).toBe(false);
  });

  it('appends pressed keys up to the max length', () => {
    let p = createNamePad();
    for (const k of ['A', 'K', 'I', 'R', 'A']) p = pressKey(p, k);
    expect(p.text).toBe('AKIRA');
    for (let i = 0; i < 20; i++) p = pressKey(p, 'X');
    expect(p.text).toHaveLength(12);
  });

  it('backspace removes the last character', () => {
    let p = createNamePad();
    p = pressKey(pressKey(p, 'A'), '<');
    expect(p.text).toBe('');
  });

  it('space key inserts a space after the first character', () => {
    let p = pressKey(createNamePad(), 'A');
    p = pressKey(p, ' ');
    expect(p.text).toBe('A ');
  });

  it('rejects a leading space in the tag', () => {
    let p = pressKey(createNamePad(), ' ');
    expect(p.text).toBe('');
    p = pressKey(pressKey(p, 'A'), ' ');
    expect(p.text).toBe('A ');
  });

  it('physical Space only inserts when the cursor is on the space cell (Wave 0 CDP)', () => {
    let p = createNamePad();
    expect(keyAt(p, p.cursor)).toBe('Q');
    p = pressNamePadSpace(p);
    expect(p.text).toBe('');
    p = moveCursor(p, { dr: 3, dc: 0 });
    expect(keyAt(p, p.cursor)).toBe(' ');
    p = pressKey(p, 'A');
    p = pressNamePadSpace(p);
    expect(p.text).toBe('A ');
  });

  it('typing AKIRA after an accidental Space at Q stays AKIRA', () => {
    let p = createNamePad();
    p = pressNamePadSpace(p);
    for (const k of ['A', 'K', 'I', 'R', 'A']) p = pressKey(p, k);
    expect(p.text).toBe('AKIRA');
  });

  it('select at cursor still commits Q when the player chooses it', () => {
    let p = createNamePad();
    p = pressNamePadSelect(p);
    expect(p.text).toBe('Q');
  });

  it('physical Space still activates OK and backspace cells', () => {
    let p = pressKey(createNamePad(), 'A');
    p = moveCursor(p, { dr: 3, dc: 2 });
    expect(keyAt(p, p.cursor)).toBe('OK');
    p = pressNamePadSpace(p);
    expect(p.done).toBe(true);
    p = pressKey(createNamePad(), 'Z');
    p = moveCursor(p, { dr: 3, dc: 1 });
    p = pressNamePadSpace(p);
    expect(p.text).toBe('');
  });

  it('rejects characters outside the keyboard and empty presses', () => {
    const p = pressKey(createNamePad(), 'ä');
    expect(p.text).toBe('');
  });

  it('OK finishes entry; empty entry is not accepted', () => {
    let p = pressKey(createNamePad(), 'M');
    p = pressKey(p, 'OK');
    expect(p.done).toBe(true);
    expect(p.text).toBe('M');
    const empty = pressKey(createNamePad(), 'OK');
    expect(empty.done).toBe(false);
  });

  it('cursor moves within the grid bounds', () => {
    let p = createNamePad();
    const { row, col } = p.cursor;
    p = moveCursor(p, { dr: -1, dc: 0 });
    expect(p.cursor.row).toBe(row);
    p = moveCursor(p, { dr: 0, dc: -50 });
    expect(p.cursor.col).toBe(0);
    p = moveCursor(p, { dr: 50, dc: 50 });
    expect(p.cursor.row).toBeLessThanOrEqual(p.rows.length - 1);
  });

  it('keyAt returns the key under the cursor', () => {
    const p = createNamePad();
    expect(typeof keyAt(p, p.cursor)).toBe('string');
  });

  it('rows contain letters, space, backspace and OK', () => {
    const flat = createNamePad().rows.flat();
    expect(flat).toContain('A');
    expect(flat).toContain(' ');
    expect(flat).toContain('<');
    expect(flat).toContain('OK');
  });
});
