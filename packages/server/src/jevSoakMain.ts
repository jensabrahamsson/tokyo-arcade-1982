#!/usr/bin/env node
/** N minutes × every cabinet; writes a JSON soak report under data/ (gitignored). */
import { join } from 'node:path';
import { loadTypesafeEnvFile, redactSecrets } from './jevPolicy';
import { writeSoakReport } from './jevAutoplay';

const env = loadTypesafeEnvFile();
const minutesRaw = Number(env.ARKAD_JEV_SOAK_MINUTES ?? '5');
const minutesPerGame = Number.isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : 5;
const key = (env.TYPESAFE_API_KEY ?? '').trim();
const reportPath =
  (env.ARKAD_JEV_SOAK_REPORT ?? '').trim() || join(env.ARKAD_DATA ?? 'data', 'jev-soak.json');

await writeSoakReport({
  apiKey: key,
  minutesPerGame,
  reportPath,
  log: (line) => console.log(redactSecrets(line, key.length >= 8 ? [key] : [])),
});
process.exit(0);
