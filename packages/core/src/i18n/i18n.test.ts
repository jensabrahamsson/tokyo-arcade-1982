import { describe, it, expect } from 'vitest';
import { LANGS, t, EN, JA, nextLang } from './i18n';

describe('i18n', () => {
  it('supports exactly English and Japanese', () => {
    expect(LANGS).toEqual(['en', 'ja']);
  });

  it('L toggles language EN ↔ JA and back', () => {
    expect(nextLang('en')).toBe('ja');
    expect(nextLang('ja')).toBe('en');
    expect(nextLang(nextLang('en'))).toBe('en');
    expect(t(nextLang('en'), 'coast.qualifying')).toBe(JA['coast.qualifying']);
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

  // P2-F: previous lock required ASCII `app.title` in BOTH languages, which
  // froze the JA splash as 'TOKYO ARCADE' and blocked a native title.
  // English stays the Latin wordmark; Japanese is written Japanese.
  it('English brand title stays ASCII; Japanese title is native', () => {
    expect(EN['app.title']).toMatch(/^[A-Z0-9 ]+$/);
    expect(JA['app.title']).toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
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

  it('coast speed in Japanese is metric, not miles (P2-F)', () => {
    expect(JA['coast.mph']).toMatch(/キロ|km\/h/i);
    expect(JA['coast.mph']).not.toContain('マイル');
  });

  it('Coast HUD TIME / OFF ROAD / speed units are consistent EN+JA (metric)', () => {
    expect(EN['coast.time']).toBe('TIME');
    expect(JA['coast.time']).toBe('タイム');
    expect(EN['coast.offRoad']).toBe('OFF ROAD!');
    expect(JA['coast.offRoad']).toBe('オフロード！');
    // Tokyo Arcade 1982 is a Japanese-market cabinet: both languages show km/h,
    // never mixed MPH/マイル. JA already locked metric in P2-F.
    expect(EN['coast.mph']).toMatch(/KM\/H/i);
    expect(EN['coast.mph']).not.toMatch(/MPH/i);
    expect(JA['coast.mph']).toMatch(/キロ|km\/h/i);
    expect(JA['coast.mph']).not.toContain('マイル');
  });

  it('coin-mode chrome has an i18n string in both languages (P2-E)', () => {
    expect(EN['hall.coinMode']).toBe('COIN 1C');
    expect(JA['hall.coinMode']).toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
  });
});
