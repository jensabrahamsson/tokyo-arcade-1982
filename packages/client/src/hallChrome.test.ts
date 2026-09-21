import { describe, it, expect } from 'vitest';
import { GAME_IDS, t } from '@arkad/core';
import {
  HALL_I18N,
  cabinetTitleKey,
  cabinetTagKey,
  cabinetMarquee,
  countedStatus,
  hallCoinKey,
  insertCoinVisible,
  insertCoinPlate,
  waitingHintLine,
  waitingPanelCopy,
} from './hallChrome';

describe('hall cabinet identity (R54.2)', () => {
  it('every marquee is the translated game title, not a generic slot', () => {
    const titles = GAME_IDS.map((g) => t('en', cabinetTitleKey(g)));
    for (const [i, g] of GAME_IDS.entries()) {
      const title = titles[i]!;
      const tag = t('en', cabinetTagKey(g));
      expect(title.length).toBeGreaterThan(2);
      expect(title).not.toMatch(/CABINET|SLOT|GAME \d|DEBUG/i);
      expect(tag.length).toBeGreaterThan(2);
    }
    expect(new Set(titles).size).toBe(GAME_IDS.length);
  });

  it('NOW PLAYING is a lamp, not a replacement for the game name', () => {
    const live = cabinetMarquee('now-playing', 'SNAKE', 'NOW PLAYING', 'OUT OF ORDER');
    expect(live.title).toBe('SNAKE');
    expect(live.lampLabel).toBe('NOW PLAYING');
    const ooo = cabinetMarquee('out-of-order', 'COAST RUNNER', 'NOW PLAYING', 'OUT OF ORDER');
    expect(ooo.title).toBe('COAST RUNNER');
    expect(ooo.lampLabel).toBe('OUT OF ORDER');
    const idle = cabinetMarquee('idle', 'MYRIAD', 'NOW PLAYING', 'OUT OF ORDER');
    expect(idle.title).toBe('MYRIAD');
    expect(idle.lampLabel).toBeNull();
  });
});

describe('hall i18n chrome (P2-E / Wave 2)', () => {
  it('FREE PLAY / JOIN / READY come from i18n keys, not baked English', () => {
    expect(HALL_I18N.freePlay).toBe('hall.freePlay');
    expect(HALL_I18N.coinMode).toBe('hall.coinMode');
    expect(HALL_I18N.join).toBe('hud.joinWindow');
    expect(HALL_I18N.ready).toBe('phase.ready');
    expect(hallCoinKey(true)).toBe('hall.freePlay');
    expect(hallCoinKey(false)).toBe('hall.coinMode');
    expect(t('en', HALL_I18N.freePlay)).toBe('FREE PLAY');
    expect(t('ja', HALL_I18N.freePlay)).toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
    expect(t('en', HALL_I18N.join)).toBe('JOIN');
    expect(t('en', HALL_I18N.ready)).toBe('READY');
    expect(countedStatus(t('en', HALL_I18N.join), 2)).toBe('JOIN 2');
    expect(countedStatus(t('ja', HALL_I18N.ready), 3)).toBe(`${t('ja', HALL_I18N.ready)} 3`);
  });
});

describe('insert-coin / waiting readability', () => {
  it('INSERT COIN only on idle coin-mode cabinets, plated so the CRT cannot stripe it', () => {
    expect(insertCoinVisible('idle', false)).toBe(true);
    expect(insertCoinVisible('idle', true)).toBe(false);
    expect(insertCoinVisible('now-playing', false)).toBe(false);
    expect(insertCoinVisible('out-of-order', false)).toBe(false);
    const screen = { x: 10, y: 56, w: 58, h: 44 };
    const plate = insertCoinPlate(screen, 48, 8, 320, 240);
    expect(plate.x).toBeGreaterThanOrEqual(screen.x);
    expect(plate.y).toBeGreaterThanOrEqual(screen.y);
    expect(plate.x + plate.w).toBeLessThanOrEqual(screen.x + screen.w);
    expect(plate.y + plate.h).toBeLessThanOrEqual(screen.y + screen.h);
    expect(plate.w).toBeGreaterThanOrEqual(48);
    expect(plate.h).toBeGreaterThanOrEqual(8);
  });

  it('waiting copy is i18n, names the unstick keys, and never says ARKAD', () => {
    const coin = waitingHintLine('coin-then-start', t('en', 'hall.insertCoin'), t('en', 'menu.solo'));
    expect(coin).toContain('INSERT COIN');
    expect(coin).toContain('1P GAME');
    expect(waitingHintLine('start', t('en', 'hall.insertCoin'), t('en', 'menu.solo'))).toBe('Z: 1P GAME');
    const ja = waitingHintLine('coin-then-start', t('ja', 'hall.insertCoin'), t('ja', 'menu.solo'));
    expect(ja).toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
    const lines = waitingPanelCopy({
      title: t('en', 'app.title'),
      waiting: t('en', 'lobby.waiting'),
      hintLine: coin,
      back: `ESC: ${t('en', 'menu.back')}`,
    });
    expect(lines.join(' ')).not.toMatch(/ARKAD/);
    expect(lines[0]).toBe('TOKYO ARCADE');
    expect(lines[1]).toBe('WAITING FOR PLAYERS');
    expect(lines[2]).toBe(coin);
    expect(lines[3]).toContain('BACK');
  });
});
