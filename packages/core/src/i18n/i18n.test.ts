import { describe, it, expect } from 'vitest';
import { LANGS, t, EN, JA, type Lang } from './i18n';

describe('i18n', () => {
  it('supports exactly English and Japanese', () => {
    expect(LANGS).toEqual(['en', 'ja']);
  });

  it('every EN key exists in JA and vice versa', () => {
    const enKeys = Object.keys(EN).sort();
    const jaKeys = Object.keys(JA).sort();
    expect(jaKeys).toEqual(enKeys);
  });

  it('no empty strings in either language', () => {
    for (const [k, v] of Object.entries(EN)) expect(v, `EN ${k}`).not.toBe('');
    for (const [k, v] of Object.entries(JA)) expect(v, `JA ${k}`).not.toBe('');
  });

  it('JA translations contain Japanese characters somewhere', () => {
    const withKanjiOrKana = Object.values(JA).filter((v) => /[\u3040-\u30ff\u4e00-\u9fff]/.test(v));
    expect(withKanjiOrKana.length).toBeGreaterThan(Object.keys(JA).length / 2);
  });

  it('t() returns the translation per language', () => {
    expect(t('en', 'phase.gameOver')).toBe('GAME OVER');
    expect(/[\u3040-\u30ff\u4e00-\u9fff]/.test(t('ja', 'phase.gameOver'))).toBe(true);
  });

  it('has EN/JA copy for hall demo chrome', () => {
    expect(EN['hall.demo']).toMatch(/DEMO/i);
    expect(EN['hall.demoTag'].length).toBeGreaterThan(4);
    expect(EN['hall.inUse'].length).toBeGreaterThan(2);
    expect(/[\u3040-\u30ff\u4e00-\u9fff]/.test(JA['hall.demo'])).toBe(true);
    expect(/[\u3040-\u30ff\u4e00-\u9fff]/.test(JA['hall.inUse'])).toBe(true);
  });

  it('t() interpolates {params}', () => {
    expect(t('en', 'phase.winner', { name: 'AKIRA' })).toContain('AKIRA');
    expect(t('ja', 'phase.winner', { name: 'Akira' })).toContain('Akira');
  });

  it('t() falls back to the key when missing', () => {
    expect(t('en', 'nope.nothing' as never)).toBe('nope.nothing');
  });
});
