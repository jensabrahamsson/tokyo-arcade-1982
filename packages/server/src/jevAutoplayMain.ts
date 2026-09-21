#!/usr/bin/env node
/** ~60 s of Jev-driven self-play per cabinet; prints an action/confidence summary. */
import { loadTypesafeEnvFile, redactSecrets } from './jevPolicy';
import { runAutoplayForAll } from './jevAutoplay';

const env = loadTypesafeEnvFile();
const seconds = Number(env.ARKAD_JEV_AUTOPLAY_SECONDS ?? '60');
const key = (env.TYPESAFE_API_KEY ?? '').trim();
const secondsPerGame = Number.isFinite(seconds) && seconds > 0 ? seconds : 60;

const summaries = await runAutoplayForAll({
  apiKey: key,
  secondsPerGame,
  log: (line) => console.log(redactSecrets(line, key.length >= 8 ? [key] : [])),
});
const live = summaries.filter((s) => !s.skipped);
console.log(
  `autoplay done: ${live.length}/${summaries.length} cabinets played` +
    (live.length > 0 ? `, total ok=${live.reduce((n, s) => n + s.ok, 0)}` : ' (no key: everything skipped)'),
);
process.exit(0);
