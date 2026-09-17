import { describe, it, expect } from 'vitest';
import { VERSION } from './version';

describe('core version', () => {
  it('exposes a semver string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
