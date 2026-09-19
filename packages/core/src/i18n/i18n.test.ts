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

  it('t() interpolates {params}', () => {
    expect(t('en', 'phase.winner', { name: 'AKIRA' })).toContain('AKIRA');
    expect(t('ja', 'phase.winner', { name: 'Akira' })).toContain('Akira');
  });

  it('t() falls back to the key when missing', () => {
    expect(t('en', 'nope.nothing' as never)).toBe('nope.nothing');
  });

  // P2-3: the JA table must read like a Japanese cabinet, not like a
  // transliteration of somebody else's cabinet
  it('brand titles stay ASCII in both languages', () => {
    expect(EN['app.title']).toMatch(/^[A-Z0-9 ]+$/);
    expect(JA['app.title']).toMatch(/^[A-Z0-9 ]+$/);
  });

  it('the year uses 年, never the katakana ネン', () => {
    expect(JA['app.year']).toBe('1982年');
    expect(JA['hall.name']).toContain('1982年');
    expect(JA['marquee.1']).toContain('1982年');
    for (const key of ['app.year', 'hall.name', 'marquee.1'] as const) {
      expect(JA[key], key).not.toContain('ネン');
    }
  });

  it('hall.wait says 待機', () => {
    expect(JA['hall.wait']).toBe('待機');
  });

  it('river tag is katakana, no Latin shouting in the JA marquee of it', () => {
    expect(JA['game.river.tag']).toBe('カワヲ ワタレ!');
    expect(JA['game.river.tag']).not.toMatch(/[A-Za-z]/);
  });

  it('toast.generic is readable Japanese', () => {
    expect(JA['toast.generic']).toBe('キカイ ガ イヤト イッテイル');
  });

  it('coast copy follows the EN table to LO Castle, not to a Swedish park', () => {
    expect(JA['marquee.3']).toContain('ロキャッスル');
    expect(JA['game.coast.tag']).toContain('ロキャッスル');
    expect(JA['marquee.3']).not.toContain('リーゼ');
    expect(JA['game.coast.tag']).not.toContain('リーゼ');
    expect(JA['marquee.3']).toContain('アンゼン ウンテン');
  });
});
