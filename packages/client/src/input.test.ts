import { describe, it, expect } from 'vitest';
import { Keys } from './input';

interface FakeEvent {
  type: string;
  code: string;
  repeat: boolean;
  isComposing: boolean;
  preventDefault(): void;
}

function harness() {
  const target = new EventTarget();
  const keys = new Keys(target as unknown as Window);
  const fire = (type: string, code: string, repeat = false) => {
    const e = new Event(type) as Event & FakeEvent;
    e.code = code;
    e.repeat = repeat;
    e.isComposing = false;
    e.preventDefault = () => {};
    target.dispatchEvent(e);
  };
  return { keys, down: (code: string) => fire('keydown', code), up: (code: string) => fire('keyup', code) };
}

describe('keyboard taps survive fast release (background/throttled rAF)', () => {
  it('a tap released before any frame consumed it still fires exactly once', () => {
    const { keys, down, up } = harness();
    down('KeyZ');
    up('KeyZ');
    expect(keys.take('KeyZ')).toBe(true);
    expect(keys.take('KeyZ')).toBe(false);
  });

  it('a held key fires once, not again per frame', () => {
    const { keys, down, up } = harness();
    down('Space');
    expect(keys.take('Space')).toBe(true);
    expect(keys.take('Space')).toBe(false);
    expect(keys.isHeld('Space')).toBe(true);
    up('Space');
    expect(keys.take('Space')).toBe(false);
  });

  it('repeat events do not re-arm an already consumed tap', () => {
    const target = new EventTarget();
    const keys = new Keys(target as unknown as Window);
    const fire = (type: string, code: string, repeat = false) => {
      const e = new Event(type) as Event & FakeEvent;
      e.code = code;
      e.repeat = repeat;
      e.isComposing = false;
      e.preventDefault = () => {};
      target.dispatchEvent(e);
    };
    fire('keydown', 'Enter');
    expect(keys.take('Enter')).toBe(true);
    fire('keydown', 'Enter', true); // OS auto-repeat
    expect(keys.take('Enter')).toBe(false);
    fire('keyup', 'Enter');
    expect(keys.take('Enter')).toBe(false);
  });

  it('two fast taps are two events, never coalesced into one step', () => {
    const { keys, down, up } = harness();
    down('ArrowRight'); up('ArrowRight');
    down('ArrowRight'); up('ArrowRight');
    expect(keys.take('ArrowRight')).toBe(true);
    expect(keys.take('ArrowRight')).toBe(true);
    expect(keys.take('ArrowRight')).toBe(false);
  });

  it('blur clears everything, no stuck taps', () => {
    const { keys, down } = harness();
    down('KeyZ');
    keys.clear();
    expect(keys.take('KeyZ')).toBe(false);
  });
});
