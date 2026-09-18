import { describe, it, expect } from 'vitest';
import { HALL_SLOTS, MAP_SLOTS, moveHallSel, CANVAS_W, CANVAS_H } from './hall';
import { GAME_IDS } from '@arkad/core';

describe('hall layout (R10)', () => {
  it('places exactly the six cabinets, uniquely', () => {
    expect(HALL_SLOTS.map((s) => s.game)).toEqual([...GAME_IDS]);
    expect(new Set(HALL_SLOTS.map((s) => `${s.x},${s.y}`)).size).toBe(6);
  });

  it('every cabinet and its mini-screen fits on the canvas', () => {
    for (const s of HALL_SLOTS) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.x + s.w).toBeLessThanOrEqual(CANVAS_W);
      expect(s.y + s.h).toBeLessThanOrEqual(CANVAS_H);
    }
  });

  it('no two cabinets overlap', () => {
    for (const a of HALL_SLOTS) {
      for (const b of HALL_SLOTS) {
        if (a.game === b.game) continue;
        const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
        const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it('the map mirrors the cabinet count and sits inside the room', () => {
    expect(MAP_SLOTS.map((s) => s.game)).toEqual([...GAME_IDS]);
    for (const m of MAP_SLOTS) {
      expect(m.x).toBeGreaterThan(10);
      expect(m.y).toBeGreaterThan(10);
      expect(m.x).toBeLessThan(CANVAS_W - 10);
      expect(m.y).toBeLessThan(CANVAS_H - 10);
    }
  });
});

describe('hall navigation (R9)', () => {
  it('arrows and WASD do the same thing', () => {
    expect(moveHallSel(0, 'ArrowRight')).toBe(moveHallSel(0, 'KeyD'));
    expect(moveHallSel(3, 'ArrowUp')).toBe(moveHallSel(3, 'KeyW'));
    expect(moveHallSel(0, 'ArrowDown')).toBe(3);
    expect(moveHallSel(3, 'ArrowUp')).toBe(0);
  });

  it('wraps around the hall in both axes', () => {
    expect(moveHallSel(0, 'ArrowLeft')).toBe(2);
    expect(moveHallSel(5, 'ArrowDown')).toBe(2);
    expect(moveHallSel(5, 'ArrowRight')).toBe(3);
  });

  it('ignores non-navigation keys', () => {
    for (const key of ['KeyH', 'Space', 'KeyZ', 'KeyX', 'KeyL', 'Escape']) {
      expect(moveHallSel(4, key)).toBe(4);
    }
  });

  it('stays on a cabinet at all times', () => {
    let sel = 0;
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'KeyW', 'KeyD', 'ArrowDown', 'ArrowDown']) {
      sel = moveHallSel(sel, key);
      expect(sel).toBeGreaterThanOrEqual(0);
      expect(sel).toBeLessThan(GAME_IDS.length);
    }
  });
});
