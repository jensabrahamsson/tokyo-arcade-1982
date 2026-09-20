import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  publishedNpmTestCount,
  publishedCountsAgree,
  missingNeedles,
  README_OPERATOR_NEEDLES,
  README_SHOT_NEEDLES,
  README_LYRIA_NEEDLES,
  AGENTS_OPERATOR_NEEDLES,
  REQUIREMENTS_R60_NEEDLES,
} from './wave7Ops';

const ROOT = join(__dirname, '..', '..', '..');

const readme = () => readFileSync(join(ROOT, 'README.md'), 'utf8');
const agents = () => readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');
const requirements = () => readFileSync(join(ROOT, 'REQUIREMENTS.md'), 'utf8');

describe('published test-count parser (R60.6)', () => {
  it('reads the vitest integers from README, AGENTS, and R7.2 fixtures', () => {
    expect(publishedNpmTestCount('readme', 'npm test          # vitest: 457 tests across')).toBe(457);
    expect(publishedNpmTestCount('agents', 'npm test                # vitest run (457 tests, incl.')).toBe(457);
    expect(publishedNpmTestCount('r72', '`npm test` green (457 tests, incl. real-WebSocket')).toBe(457);
  });

  it('returns null when a file never publishes a count', () => {
    expect(publishedNpmTestCount('readme', 'no count here')).toBeNull();
  });

  it('agrees only when all three integers match and are positive', () => {
    expect(publishedCountsAgree(457, 457, 457)).toBe(true);
    expect(publishedCountsAgree(457, 465, 457)).toBe(false);
    expect(publishedCountsAgree(null, 457, 457)).toBe(false);
    expect(publishedCountsAgree(0, 0, 0)).toBe(false);
  });
});

describe('needle helper (R60)', () => {
  it('lists only the missing markers', () => {
    expect(missingNeedles('ALPHA BRAVO', ['ALPHA', 'CHARLIE', 'BRAVO'])).toEqual(['CHARLIE']);
    expect(missingNeedles('ALPHA BRAVO CHARLIE', ['ALPHA', 'CHARLIE'])).toEqual([]);
  });
});

describe('README operator runbook + Lyria + LinkedIn shots (R60)', () => {
  it('documents trusted-LAN free-play, wire-open operator frames, reconnect, checkout-honest counts', () => {
    expect(missingNeedles(readme(), README_OPERATOR_NEEDLES)).toEqual([]);
  });

  it('lists the LinkedIn canvas shots (splash, hall, Coast yosen, seven cabinets, waiting, credits)', () => {
    expect(missingNeedles(readme(), README_SHOT_NEEDLES)).toEqual([]);
  });

  it('names both Lyria 3.5 samples and keeps pixel art procedural until drops land', () => {
    expect(missingNeedles(readme(), README_LYRIA_NEEDLES)).toEqual([]);
  });
});

describe('AGENTS operator how-to keeps Wave 0 CDP mute notes (R60.2)', () => {
  it('keeps Jev harness plus muted CDP (`--mute-audio`) and never-fullscreen how-to', () => {
    expect(missingNeedles(agents(), AGENTS_OPERATOR_NEEDLES)).toEqual([]);
  });
});

describe('REQUIREMENTS R60 (Wave 7 ops)', () => {
  it('lands R60 in the same change as the README/AGENTS lift, not R59', () => {
    const text = requirements();
    expect(missingNeedles(text, REQUIREMENTS_R60_NEEDLES)).toEqual([]);
    expect(text).toContain('## R60 — Operator runbook');
    expect(text).not.toContain('## R59 — Operator runbook');
  });
});

describe('published counts on disk agree (R60.6)', () => {
  it('README, AGENTS, and R7.2 publish the same npm test integer', () => {
    const nReadme = publishedNpmTestCount('readme', readme());
    const nAgents = publishedNpmTestCount('agents', agents());
    const nR72 = publishedNpmTestCount('r72', requirements());
    expect(publishedCountsAgree(nReadme, nAgents, nR72)).toBe(true);
  });
});
