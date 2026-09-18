import { describe, it, expect } from 'vitest';
import { reconnectBackoffMs } from './net';

describe('reconnect backoff (stability)', () => {
  it('grows exponentially and caps at 15 s', () => {
    expect(reconnectBackoffMs(0)).toBe(800);
    expect(reconnectBackoffMs(1)).toBe(1600);
    expect(reconnectBackoffMs(2)).toBe(3200);
    expect(reconnectBackoffMs(5)).toBe(25_600 > 15_000 ? 15_000 : reconnectBackoffMs(5));
    expect(reconnectBackoffMs(99)).toBe(15_000);
  });

  it('is monotonic and never negative', () => {
    let prev = 0;
    for (let a = 0; a <= 12; a++) {
      const v = reconnectBackoffMs(a);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeGreaterThan(0);
      prev = v;
    }
    expect(reconnectBackoffMs(-3)).toBe(reconnectBackoffMs(0));
  });
});
