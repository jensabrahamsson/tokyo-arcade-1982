import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { Keys } from './input';
import { moveHallSel } from './hall';
import {
  consumeHallStick,
  operatorIntent,
  type OperatorSurface,
} from './serviceChord';

interface FakeEvent {
  code: string;
  repeat: boolean;
  isComposing: boolean;
  shiftKey: boolean;
  preventDefault(): void;
}

function harness() {
  const target = new EventTarget();
  const keys = new Keys(target as unknown as Window);
  const fire = (type: string, code: string, shiftKey = false) => {
    const e = new Event(type) as Event & FakeEvent;
    e.code = code;
    e.repeat = false;
    e.isComposing = false;
    e.shiftKey = shiftKey;
    e.preventDefault = () => {};
    target.dispatchEvent(e);
  };
  return {
    keys,
    down: (code: string, shiftKey = false) => fire('keydown', code, shiftKey),
    up: (code: string) => fire('keyup', code),
  };
}

describe('operatorIntent (R16.1 / R17.1)', () => {
  it('Shift+S on hall or title opens service; S alone on hall is nav', () => {
    expect(operatorIntent('hall', { code: 'KeyS', shiftHeld: true })).toBe('open-service');
    expect(operatorIntent('title', { code: 'KeyS', shiftHeld: true })).toBe('open-service');
    expect(operatorIntent('hall', { code: 'KeyS', shiftHeld: false })).toBe('hall-nav');
  });

  it('F is FREE PLAY only inside service; on hall it is fullscreen', () => {
    expect(operatorIntent('service', { code: 'KeyF', shiftHeld: false })).toBe('toggle-freeplay');
    expect(operatorIntent('hall', { code: 'KeyF', shiftHeld: false })).toBe('fullscreen');
    expect(operatorIntent('title', { code: 'KeyF', shiftHeld: false })).toBe('fullscreen');
  });

  it('walks Shift+S then F: service, then free play — never hall-nav / hall-fullscreen', () => {
    let surface: OperatorSurface = 'hall';
    expect(operatorIntent(surface, { code: 'KeyS', shiftHeld: true })).toBe('open-service');
    surface = 'service';
    expect(operatorIntent(surface, { code: 'KeyF', shiftHeld: false })).toBe('toggle-freeplay');
  });
});

describe('consumeHallStick (R16.1 leftover: KeyS was hall-down)', () => {
  it('ShiftLeft+KeyS opens service and does not walk sel 0 (ヘビ) to River', () => {
    const { keys, down } = harness();
    down('ShiftLeft');
    down('KeyS');
    expect(consumeHallStick(keys)).toBe('service');
    expect(consumeHallStick(keys)).toBeNull();
    expect(moveHallSel(0, 'KeyS')).toBe(4);
  });

  it('KeyS alone is hall nav; CDP KeyS+shiftKey is still the service chord', () => {
    const plain = harness();
    plain.down('KeyS');
    expect(consumeHallStick(plain.keys)).toBe('KeyS');

    const cdp = harness();
    cdp.down('KeyS', true);
    expect(consumeHallStick(cdp.keys)).toBe('service');
    expect(cdp.keys.take('KeyS')).toBe(false);
  });

  it('same-frame Shift+S then F leaves F for the service scene', () => {
    const { keys, down } = harness();
    down('ShiftLeft');
    down('KeyS');
    down('KeyF');
    expect(consumeHallStick(keys)).toBe('service');
    expect(keys.take('KeyF')).toBe(true);
  });
});

describe('main.ts hall/title wiring (R16.1)', () => {
  const MAIN = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

  it('title takes the service chord before KeyF fullscreen', () => {
    const title = MAIN.slice(
      MAIN.indexOf("} else if (scene === 'title') {"),
      MAIN.indexOf("} else if (scene === 'name') {"),
    );
    const chord = title.search(/takeServiceChord/);
    expect(chord).toBeGreaterThanOrEqual(0);
    expect(chord).toBeLessThan(title.indexOf("take('KeyF')"));
  });
});
