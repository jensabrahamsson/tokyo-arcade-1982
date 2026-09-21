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

  // Wave 6 leftover: old lock was machine-katakana カワヲ ワタレ!.
  // Native PCB mix is 川を渡れ! — still no Latin shouting.
  it('river tag is native Japanese, no Latin shouting in the JA marquee of it', () => {
    expect(JA['game.river.tag']).toBe('川を渡れ!');
    expect(JA['game.river.tag']).not.toMatch(/[A-Za-z]/);
  });

  // Wave 6 / R58: old lock was machine-katakana キカイ ガ イヤト イッテイル.
  // Native 1982 cabinet copy for a generic reject is ただいま 故障中.
  it('toast.generic is cabinet Japanese, not machine katakana', () => {
    expect(JA['toast.generic']).toBe('ただいま 故障中');
  });

  // Wave 6 leftover: game.coast.tag used ロキャッスルマデ ハシレ (all katakana).
  // Native tag is エルオー城まで走れ; still LO Castle, still not リーゼ.
  it('coast copy follows the EN table to LO Castle, not to a Swedish park', () => {
    expect(JA['marquee.3']).toContain('エルオー城');
    expect(JA['game.coast.tag']).toContain('エルオー城');
    expect(JA['marquee.3']).not.toContain('リーゼ');
    expect(JA['game.coast.tag']).not.toContain('リーゼ');
    expect(JA['marquee.3']).toContain('安全運転');
    expect(JA['marquee.3']).not.toContain('アンゼン ウンテン');
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

  // R58: 1982 Tokyo cabinet Japanese — mixed kanji/kana, not machine katakana.
  // EN values stay put; only JA strings in this table change. coast.* HUD
  // (beyond the kept qualifying line) is Wave 1's job.
  const WAVE6_NATIVE_JA = {
    'splash.welcome': 'ようこそ —— どうぞ お入りください',
    'splash.enter': 'スペースキーで 入場',
    'hall.insertCoin': 'コインを入れてね',
    'toast.insertCoin': 'コインを入れてください',
    'marquee.2': '100円投入 —— レジェンドをめざせ',
    'marquee.3': 'エルオー城への道は つねに営業中 —— 安全運転',
    'toast.generic': 'ただいま 故障中',
    'hall.watching': '観戦',
    'hall.clock': '時計',
    'hud.lives': '残機',
    'hud.joinWindow': '参加受付',
    'lobby.waiting': 'プレイヤー募集中',
    'net.lost': '接続が切れました',
    'name.title': 'ネームを入れてください',
    'toast.soloOnly': '1人用です',
    'menu.language': '言語',
    'menu.back': 'もどる',
    'menu.map': '館内図',
    'name.select': '決定',
    'name.cancel': 'やめる',
    'game.snake.tag': 'しっぽを出せ!',
    'game.puck.tag': 'ドットを全部くれ!',
    'game.block.tag': '壁を砕け!',
    'game.galaxy.tag': '空を守れ!',
    'game.river.tag': '川を渡れ!',
    'game.coast.tag': 'エルオー城まで走れ',
    'game.myriad.tag': '虫にさわるな!',
  } as const;

  const WAVE6_EN_UNCHANGED = {
    'splash.welcome': 'WELCOME - COME ON IN',
    'splash.enter': 'PRESS SPACE TO COME IN',
    'hall.insertCoin': 'INSERT COIN',
    'toast.insertCoin': 'INSERT COIN FIRST',
    'marquee.2': 'INSERT COIN - BECOME A LEGEND - NO DIAGONALS IN SNAKE',
    'marquee.3': 'THE ROAD TO LO CASTLE IS ALWAYS OPEN - DRIVE SAFE',
    'toast.generic': 'THE MACHINE SAYETH NO',
    'hall.watching': 'WATCH',
    'hall.clock': 'CLOCK',
    'hud.lives': 'LIVES',
    'hud.joinWindow': 'JOIN',
    'lobby.waiting': 'WAITING FOR PLAYERS',
    'net.lost': 'CONNECTION LOST',
    'name.title': 'ENTER YOUR NAME',
    'toast.soloOnly': 'ONE PLAYER ONLY ON THAT CABINET',
    'menu.language': 'LANGUAGE',
    'menu.back': 'BACK',
    'menu.map': 'HALL MAP',
    'name.select': 'SELECT',
    'name.cancel': 'CANCEL',
    'game.snake.tag': 'TRON-STYLE TAIL TAG',
    'game.puck.tag': 'EAT EVERY DOT',
    'game.block.tag': 'BREAK THE WALL',
    'game.galaxy.tag': 'DEFEND THE SKY',
    'game.river.tag': 'CROSS THE BUSY RIVER',
    'game.coast.tag': 'RUN TO LO CASTLE',
    'game.myriad.tag': 'DONT TOUCH THE BUG',
  } as const;

  it('Wave 6 JA strings are native cabinet copy (R58)', () => {
    for (const [key, value] of Object.entries(WAVE6_NATIVE_JA)) {
      expect(JA[key as keyof typeof JA], key).toBe(value);
    }
  });

  it('Wave 6 does not retune English copy of the same keys (R58 lockstep)', () => {
    for (const [key, value] of Object.entries(WAVE6_EN_UNCHANGED)) {
      expect(EN[key as keyof typeof EN], key).toBe(value);
    }
    expect(Object.keys(WAVE6_NATIVE_JA).sort()).toEqual(Object.keys(WAVE6_EN_UNCHANGED).sort());
  });

  it('Wave 6 keeps brand, free-play, Coast qualifying, game-over, OOO (R58)', () => {
    expect(JA['app.title']).toBe('トウキョウ アーケード');
    expect(JA['hall.freePlay']).toBe('フリープレイ');
    expect(JA['coast.qualifying']).toBe('予選スタート！');
    expect(JA['coast.mph']).toBe('キロ');
    expect(JA['phase.gameOver']).toBe('ゲーム オーバー');
    expect(JA['cab.ooo']).toBe('故障中');
    expect(JA['game.snake']).toBe('ヘビ');
    expect(JA['game.puck']).toBe('パック メイズ');
  });
});
