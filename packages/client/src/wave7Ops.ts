/**
 * Wave 7 (R60) — docs honesty helpers. Pure string checks; callers inject
 * file text. No DOM, no Node, no product features — operator README,
 * Lyria attribution, published test-count, LinkedIn shot list.
 */

export type DocsSource = 'readme' | 'agents' | 'r72';

const COUNT_PATTERNS: Record<DocsSource, RegExp> = {
  readme: /vitest:\s*(\d+)\s+tests/,
  agents: /vitest run \((\d+) tests/,
  r72: /npm test` green \((\d+) tests/,
};

/** The integer a file publishes next to `npm test` / vitest. */
export function publishedNpmTestCount(source: DocsSource, text: string): number | null {
  const m = text.match(COUNT_PATTERNS[source]);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function publishedCountsAgree(
  readme: number | null,
  agents: number | null,
  r72: number | null,
): boolean {
  return readme !== null && readme === agents && agents === r72 && readme > 0;
}

export function missingNeedles(haystack: string, needles: readonly string[]): string[] {
  return needles.filter((n) => !haystack.includes(n));
}

/** Operator demo-hall + reconnect + test-count honesty (README). */
export const README_OPERATOR_NEEDLES = [
  'Shift+S',
  'FREE PLAY',
  'Late_Night_Cabinet',
  '`ooo`',
  '`freePlay`',
  '`note`',
  'name|lang',
  'this checkout',
] as const;

/** LinkedIn canvas shots — brand, Coast yosen, seven cabinets, credits/Lyria. */
export const README_SHOT_NEEDLES = [
  'LinkedIn',
  'TOKYO ARCADE',
  '予選スタート',
  'NOW PLAYING',
  'INSERT COIN',
  'LYRIA 3.5',
  'Puck',
  'Block',
  'Galaxy',
  'River',
  'Myriad',
] as const;

/** Credits-wall honesty already in Sound; README must still name both samples. */
export const README_LYRIA_NEEDLES = [
  'LYRIA 3.5',
  'Late_Night_Cabinet',
  'coast_yosen_start_ja',
  'procedural',
] as const;

/**
 * Operator how-to in AGENTS. Keep Wave 0 muted CDP notes if present; this
 * list must not require deleting them. `--mute-audio` + no Mac/fullscreen
 * is the contract either wave may document.
 */
export const AGENTS_OPERATOR_NEEDLES = [
  'ARKAD_JEV_SELFPLAY=1',
  'jev:autoplay',
  '.env.typesafe',
  '--mute-audio',
  'fullscreen',
] as const;

export const REQUIREMENTS_R60_NEEDLES = [
  'R60',
  'LinkedIn',
  'Lyria',
  'name|lang',
  'this checkout',
] as const;
