#!/usr/bin/env node
/** ~60 s of Jev-driven self-play per cabinet; prints an action/confidence summary. */
import { GAME_IDS } from '@arkad/core';
import { loadTypesafeEnvFile } from './jevPolicy';
import { runAutoplayForGame, type AutoplaySummary } from './jevAutoplay';

const env = loadTypesafeEnvFile();
const seconds = Number(env.ARKAD_JEV_AUTOPLAY_SECONDS ?? '60');
const key = (env.TYPESAFE_API_KEY ?? '').trim();

const summaries: AutoplaySummary[] = [];
for (const game of GAME_IDS) {
  summaries.push(
    await runAutoplayForGame(game as (typeof GAME_IDS)[number], {
      apiKey: key,
      secondsPerGame: seconds,
      log: console.log,
    }),
  );
}
const live = summaries.filter((s) => !s.skipped);
console.log(
  `autoplay done: ${live.length}/${summaries.length} cabinets played` +
    (live.length > 0 ? `, total ok=${live.reduce((n, s) => n + s.ok, 0)}` : ' (no key: everything skipped)'),
);
process.exit(0);
