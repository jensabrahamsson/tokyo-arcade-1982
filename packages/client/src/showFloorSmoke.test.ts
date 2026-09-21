import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_IDS, t, nextLang } from '@arkad/core';
import { createNamePad, pressKey } from './namepad';
import { HALL_SLOTS } from './hall';
import {
  splashAdvance, SPLASH_MS, titleStartTarget, isBackHomeKey,
  escapeBackTarget, coastQualifyingOverlay, COAST_QUALIFYING_MS,
  coastHeroOverlay, COAST_HERO_MS,
  readyStingerDue, cabinetScreenData, marqueeLamp,
} from './tweaks';
import { operatorIntent } from './serviceChord';

/**
 * Wave 0 free-play smoke as pure helpers (no Jens Mac, no fullscreen Chrome).
 * Socket seating lives in arcade.test.ts / http.test.ts; this file walks the
 * client path: splash → title → namepad → 7-cab hall → Coast overlay+stinger
 * → Escape/KeyB home → snake versus on the hall mini → L language.
 */
describe('show-floor free-play smoke (wave 0)', () => {
  it('walks splash → title → namepad → 7-cab hall, Coast 3s overlay+stinger, Escape/KeyB home, snake versus mini, L', () => {
    expect(splashAdvance(0, false)).toBe('splash');
    expect(splashAdvance(SPLASH_MS + 1, false)).toBe('title');
    expect(titleStartTarget(false)).toBe('name');

    let pad = createNamePad();
    for (const k of ['A', 'K', 'I', 'R', 'A']) pad = pressKey(pad, k);
    pad = pressKey(pad, 'OK');
    expect(pad.done).toBe(true);
    expect(pad.text).toBe('AKIRA');
    expect(titleStartTarget(true)).toBe('hall');
    expect(HALL_SLOTS.map((s) => s.game)).toEqual([...GAME_IDS]);
    expect(HALL_SLOTS).toHaveLength(7);

    const coast = {
      game: 'coast' as const,
      tableId: 't-coast',
      seated: true,
      announcedFor: 't-coast',
      announcedAtMs: 1_000,
    };
    expect(readyStingerDue('', 't-coast', 'coast', 'playing', true)).toBe(true);
    expect(coastQualifyingOverlay({ ...coast, nowMs: 1_000 })).toBe(true);
    expect(coastQualifyingOverlay({ ...coast, nowMs: 1_000 + COAST_QUALIFYING_MS - 1 })).toBe(true);
    expect(coastQualifyingOverlay({ ...coast, nowMs: 1_000 + COAST_QUALIFYING_MS })).toBe(false);
    expect(coastHeroOverlay({ ...coast, nowMs: 1_000 })).toBe(true);
    expect(coastHeroOverlay({ ...coast, nowMs: 1_000 + COAST_HERO_MS - 1 })).toBe(true);
    expect(coastHeroOverlay({ ...coast, nowMs: 1_000 + COAST_HERO_MS })).toBe(false);
    expect(t('en', 'coast.qualifying')).toBe('QUALIFYING START!');
    expect(t('ja', 'coast.qualifying')).toBe('予選スタート！');

    const stinger = join(__dirname, '..', 'static', 'audio', 'coast_yosen_start_ja.mp3');
    if (existsSync(stinger)) expect(readFileSync(stinger).byteLength).toBeGreaterThan(1024);

    expect(isBackHomeKey('Escape')).toBe(true);
    expect(isBackHomeKey('KeyB')).toBe(true);
    expect(escapeBackTarget('table', true)).toBe('hall');

    const liveSnakes = { snakes: { a: { body: [{ x: 2, y: 2 }] }, b: { body: [{ x: 8, y: 8 }] } } };
    const mini = cabinetScreenData(
      [{ game: 'snake', demo: false, data: liveSnakes }, { game: 'coast', demo: true, data: { dist: 0 } }],
      'snake',
    );
    expect(mini).toEqual({ data: liveSnakes, demo: false });
    expect(marqueeLamp({ demo: false, players: 2 })).toBe('now-playing');

    expect(nextLang('en')).toBe('ja');
    expect(nextLang('ja')).toBe('en');
  });

  it('Shift+S on hall opens service; F then toggles free play (not hall fullscreen)', () => {
    expect(operatorIntent('hall', { code: 'KeyS', shiftHeld: true })).toBe('open-service');
    expect(operatorIntent('hall', { code: 'KeyS', shiftHeld: false })).toBe('hall-nav');
    expect(operatorIntent('service', { code: 'KeyF', shiftHeld: false })).toBe('toggle-freeplay');
    expect(operatorIntent('hall', { code: 'KeyF', shiftHeld: false })).toBe('fullscreen');
  });
});
