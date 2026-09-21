import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const alias = { '@arkad/core': 'packages/core/src/index.ts' };

await esbuild.build({
  entryPoints: ['packages/server/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/server/index.cjs',
  external: ['ws'],
  alias,
});

await esbuild.build({
  entryPoints: ['packages/server/src/jevAutoplayMain.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/jev-autoplay.mjs',
  alias,
});

await esbuild.build({
  entryPoints: ['packages/server/src/jevSoakMain.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/jev-soak.mjs',
  alias,
});

await esbuild.build({
  entryPoints: ['packages/client/src/main.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile: 'dist/public/bundle.js',
  alias,
  minify: process.argv.includes('--minify'),
});

mkdirSync('dist/public', { recursive: true });
cpSync('packages/client/static', 'dist/public', { recursive: true });
console.log('build ok');
