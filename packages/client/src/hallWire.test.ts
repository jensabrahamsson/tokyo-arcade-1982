import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const MAIN = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

describe('Wave 2 hall chrome wiring (main.ts)', () => {
  it('drawWordmark paints splashWordmark lines and colors', () => {
    expect(MAIN).toContain("from './splashLook'");
    expect(MAIN).toMatch(/splashWordmark\(t\('app\.title'\),\s*t\('app\.year'\)\)/);
    expect(MAIN).toContain('mark.line1');
    expect(MAIN).toContain('mark.line2');
    expect(MAIN).toContain('mark.bodyColor');
    expect(MAIN).toContain('mark.shadowColor');
    expect(MAIN).toContain('mark.yearColor');
  });

  it('cabinet marquee uses cabinetMarquee so the game title survives OOO', () => {
    expect(MAIN).toContain('cabinetMarquee(');
    expect(MAIN).toContain('cabinetTitleKey');
    expect(MAIN).toContain('mark.title');
    expect(MAIN).toContain('mark.lampLabel');
    // old paint: OOO replaced the whole band as the only centered marquee text
    expect(MAIN).not.toMatch(/px\(ctx, t\('cab\.ooo'\), x \+ w \/ 2/);
  });

  it('INSERT COIN blink draws a plate from insertCoinPlate', () => {
    expect(MAIN).toContain('insertCoinVisible(');
    expect(MAIN).toContain('insertCoinPlate(');
  });

  it('waiting panel copy comes from waitingHintLine and waitingPanelCopy', () => {
    expect(MAIN).toContain('waitingHintLine(');
    expect(MAIN).toContain('waitingPanelCopy(');
    expect(MAIN).not.toMatch(/\$\{t\('hall\.insertCoin'\)\} \+ Z:/);
  });

  it('Late Night Cabinet loop still lives in applyPresentation, not moved', () => {
    expect(MAIN).toContain("ATTRACT_TRACK = 'audio/Late_Night_Cabinet.mp3'");
    expect(MAIN).toContain('attractMusicActive(scene)');
    expect(MAIN).toContain('music.startLoop(ATTRACT_TRACK)');
  });
});
