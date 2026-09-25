import { describe, it, expect } from 'vitest';
import {
  applyNamePadAction,
  createNamePad,
  moveCursor,
  namePadAction,
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

  it('physical Space chooses the highlighted cell, including the default Q', () => {
    // 024796f dropped Space on letter cells so a CDP leftover could not
    // prefix Q before a scripted AKIRA. On the cabinet Space is the button,
    // and that drop made ENTER YOUR NAME ignore the key. The title scene
    // still consumes the Space that opens the pad.
    let p = createNamePad();
    expect(keyAt(p, p.cursor)).toBe('Q');
    p = pressNamePadSpace(p);
    expect(p.text).toBe('Q');
    p = moveCursor(p, { dr: 3, dc: 0 });
    expect(keyAt(p, p.cursor)).toBe(' ');
    p = pressNamePadSpace(p);
    expect(p.text).toBe('Q ');
  });

  it('letter keys spell the tag, including WASD, and Space still chooses the cell', () => {
    let p = createNamePad();
    for (const code of ['KeyJ', 'KeyE', 'KeyN', 'KeyS']) {
      const action = namePadAction(code);
      expect(action).toEqual({ kind: 'type', key: code.slice(3) });
      p = applyNamePadAction(p, action!);
    }
    expect(p.text).toBe('JENS');
    const space = namePadAction('Space');
    expect(space).toEqual({ kind: 'select' });
    p = applyNamePadAction(p, space!);
    expect(p.text).toBe('JENSQ');
  });

  it('arrow keys move the name cursor and do not type', () => {
    let p = createNamePad();
    const action = namePadAction('ArrowRight');
    expect(action).toEqual({ kind: 'move', dr: 0, dc: 1 });
    p = applyNamePadAction(p, action!);
    expect(p.cursor).toEqual({ row: 0, col: 1 });
    expect(p.text).toBe('');
    expect(namePadAction('Enter')).toEqual({ kind: 'select' });
    expect(namePadAction('NumpadEnter')).toEqual({ kind: 'select' });
    expect(namePadAction('Escape')).toEqual({ kind: 'cancel' });
    expect(namePadAction('Backspace')).toEqual({ kind: 'backspace' });
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
