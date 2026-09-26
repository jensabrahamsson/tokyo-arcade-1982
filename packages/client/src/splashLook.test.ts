import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { EN, JA } from '@arkad/core';
import { PAL } from './ui';
import {
  splashWordmark, SPLASH_LOOK, attractFaceLines, attractFaceInvitesPlay,
  attractBulbXs, attractBulbHot, ATTRACT_BULB_COUNT, attractMarqueeBand,
  attractPromptPlate, attractWordmarkSize,
  attractSpotlightLayout, attractCornerPips,
} from './splashLook';

const MAIN = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

function fnBody(name: string): string {
  const start = MAIN.indexOf(`function ${name}`);
  const end = MAIN.indexOf('\nfunction ', start + 10);
  return MAIN.slice(start, end === -1 ? undefined : end);
}

describe('splash wordmark (R54.1 / Wave 2)', () => {
  it('is two lines: TOKYO ARCADE and an amber 1982 year, never ARKAD', () => {
    const w = splashWordmark(EN['app.title'], EN['app.year']);
    expect(w.line1).toBe('TOKYO ARCADE');
    expect(w.line1).not.toMatch(/ARKAD/i);
    expect(w.line2).toBe('— 1982 —');
    expect(w.bodyColor).toBe(PAL.white);
    expect(w.shadowColor).toBe('#5e1740');
    expect(w.yearColor).toBe(PAL.orange);
    const ja = splashWordmark(JA['app.title'], JA['app.year']);
    expect(ja.line1).toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
    expect(ja.line2).toContain('1982年');
  });

  it('has no generic AI chrome — one shadow, lanterns, no rainbow or colour bar', () => {
    expect(SPLASH_LOOK.colorBar).toBe(false);
    expect(SPLASH_LOOK.rainbow).toBe(false);
    expect(SPLASH_LOOK.glitchOffset).toBe(false);
    expect(SPLASH_LOOK.lanterns).toBe(7);
    const w = splashWordmark(EN['app.title'], EN['app.year']);
    expect(new Set([w.bodyColor, w.shadowColor, w.yearColor]).size).toBe(3);
  });
});

describe('splash and title attract (R12.1 / R54.1)', () => {
  const copy = {
    pressStart: EN['splash.enter'],
    insertCoin: EN['hall.insertCoin'],
    gameTitle: EN['game.snake'],
    gameTag: EN['game.snake.tag'],
    coinPhase: false,
  };

  it('is a marquee attract: neon, press-start, no boot log, no key legend', () => {
    expect(SPLASH_LOOK.marquee).toBe(true);
    expect(SPLASH_LOOK.neon).toBe(true);
    expect(SPLASH_LOOK.pressStart).toBe(true);
    expect(SPLASH_LOOK.bootLog).toBe(false);
    expect(SPLASH_LOOK.instructionWall).toBe(false);
    expect(EN['splash.enter']).toBe('PRESS START');
    expect(JA['splash.enter']).toBe('スタート！');
  });

  it('splash paints only the press-start invite, never the welcome paragraph', () => {
    const lines = attractFaceLines('splash', copy);
    expect(lines).toEqual(['PRESS START']);
    expect(attractFaceInvitesPlay(lines, ['PRESS START', 'INSERT COIN'])).toBe(true);
    expect(lines.join('\n')).not.toContain(EN['splash.welcome']);
    const ja = attractFaceLines('splash', { ...copy, pressStart: JA['splash.enter'] });
    expect(ja).toEqual(['スタート！']);
  });

  it('title spotlights one cabinet and one invite, not a manual', () => {
    const start = attractFaceLines('title', copy);
    expect(start).toEqual(['SNAKE', 'TRON-STYLE TAIL TAG', 'PRESS START']);
    const coin = attractFaceLines('title', { ...copy, coinPhase: true });
    expect(coin).toEqual(['SNAKE', 'TRON-STYLE TAIL TAG', 'INSERT COIN']);
    expect(start.length).toBeLessThanOrEqual(3);
    expect(attractFaceInvitesPlay(start, ['PRESS START', 'INSERT COIN'])).toBe(true);
    expect(attractFaceInvitesPlay(coin, ['PRESS START', 'INSERT COIN'])).toBe(true);
  });

  it('rejects a README face: BIOS, cartridges, or a language/credits legend', () => {
    expect(attractFaceInvitesPlay(['BIOS 1982.6 ...... OK', 'PRESS START'], ['PRESS START'])).toBe(false);
    expect(attractFaceInvitesPlay(['CARTRIDGES 7/7 ..... OK'], ['PRESS START'])).toBe(false);
    expect(attractFaceInvitesPlay(['L: LANGUAGE  C: CREDITS', 'PRESS START'], ['PRESS START'])).toBe(false);
    expect(attractFaceInvitesPlay(['PRESS START', 'A', 'B', 'C'], ['PRESS START'])).toBe(false);
  });

  it('lays out a neon bulb chase and a press-start plate inside 320×240', () => {
    const xs = attractBulbXs(320);
    expect(xs).toHaveLength(ATTRACT_BULB_COUNT);
    expect(xs[0]).toBeGreaterThanOrEqual(8);
    expect(xs[xs.length - 1]).toBeLessThanOrEqual(312);
    expect(new Set(xs).size).toBe(xs.length);
    const hot = Array.from({ length: ATTRACT_BULB_COUNT }, (_, i) => attractBulbHot(i, 0));
    expect(hot.filter(Boolean).length).toBeGreaterThan(0);
    expect(hot.filter(Boolean).length).toBeLessThan(ATTRACT_BULB_COUNT);
    expect(attractBulbHot(0, 0)).toBe(true);
    const band = attractMarqueeBand(320);
    expect(band.w).toBe(320);
    expect(band.h).toBeGreaterThanOrEqual(16);
    expect(band.y).toBe(0);
    const plate = attractPromptPlate(320, 240);
    expect(plate.y + plate.h).toBeLessThanOrEqual(240);
    expect(plate.x).toBeGreaterThanOrEqual(0);
    expect(plate.x + plate.w).toBeLessThanOrEqual(320);
  });

  it('sizes the wordmark so the Japanese title fits the 320-wide screen', () => {
    const en = attractWordmarkSize(EN['app.title']);
    const ja = attractWordmarkSize(JA['app.title']);
    expect(en).toBeGreaterThanOrEqual(16);
    expect(en).toBeLessThanOrEqual(26);
    expect(ja).toBeGreaterThanOrEqual(11);
    expect(ja).toBeLessThan(en);
    const units = Array.from(JA['app.title']).length;
    expect(ja * units).toBeLessThanOrEqual(300);
  });

  it('renderSplash and renderTitle call the attract, not the boot log (R12.1)', () => {
    for (const name of ['renderSplash', 'renderTitle']) {
      const body = fnBody(name);
      expect(body.length).toBeGreaterThan(40);
      expect(body).not.toContain('BIOS');
      expect(body).not.toContain('CARTRIDGE');
      expect(body).not.toContain('menu.language');
      expect(body).not.toContain('menu.credits');
      expect(body).not.toContain("t('splash.welcome')");
      expect(body).toContain('drawAttractChrome(');
      expect(body).toContain('attractFaceLines(');
      expect(body).toContain('drawAttractPrompt(');
    }
    const title = MAIN.slice(
      MAIN.indexOf("} else if (scene === 'title') {"),
      MAIN.indexOf("} else if (scene === 'name') {"),
    );
    expect(title).toContain("keys.take('KeyL')");
    expect(title).toContain("keys.take('KeyC')");
  });

  it('computes spotlight preview frame and corner rivets for CRT showcase', () => {
    const spotNoHero = attractSpotlightLayout(320, 240, false);
    expect(spotNoHero.box.w).toBeGreaterThanOrEqual(180);
    expect(spotNoHero.box.h).toBeGreaterThanOrEqual(48);
    expect(spotNoHero.box.x + spotNoHero.box.w).toBeLessThanOrEqual(320);
    expect(spotNoHero.thumb.w).toBeGreaterThan(0);
    expect(spotNoHero.thumb.h).toBeGreaterThan(0);
    expect(spotNoHero.thumb.x).toBeGreaterThan(spotNoHero.box.x);
    expect(spotNoHero.textX).toBeGreaterThan(spotNoHero.thumb.x + spotNoHero.thumb.w);

    const spotHero = attractSpotlightLayout(320, 240, true);
    expect(spotHero.box.h).toBeGreaterThan(spotNoHero.box.h);

    const pips = attractCornerPips(spotNoHero.box);
    expect(pips).toHaveLength(4);
    expect(pips[0]).toEqual({ x: spotNoHero.box.x, y: spotNoHero.box.y });
    expect(pips[3]).toEqual({ x: spotNoHero.box.x + spotNoHero.box.w, y: spotNoHero.box.y + spotNoHero.box.h });
  });
});
