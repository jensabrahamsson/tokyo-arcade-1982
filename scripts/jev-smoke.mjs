#!/usr/bin/env node
/**
 * Optional live Jev smoke: one Snake decision, print probabilities.
 * Skips (exit 0) when TYPESAFE_API_KEY is unset — CI never hits the live API.
 * Keep questions in sync with packages/server/src/jevPolicy.ts snakeJevQuestions().
 */
const key = (process.env.TYPESAFE_API_KEY ?? '').trim();
if (!key) {
  console.log('jev-smoke: skip (TYPESAFE_API_KEY unset)');
  process.exit(0);
}

const state = {
  game: 'snake',
  grid: { w: 28, h: 20 },
  mode: 'solo',
  head: { x: 4, y: 10 },
  dir: 'right',
  length: 4,
  body: [
    { x: 4, y: 10 },
    { x: 3, y: 10 },
    { x: 2, y: 10 },
    { x: 1, y: 10 },
  ],
  food: { x: 10, y: 8 },
  legal: ['up', 'down', 'right'],
  score: 0,
  lives: 3,
  level: 1,
};

const questions = {
  action: {
    type: 'choice',
    instructions:
      'Pick the next heading for this snake. Survive first (do not hit body or walls). Then chase food. Never reverse into the neck.',
    criteria: {
      up: 'Move up (y-1). Prefer when food is above or to escape downward trouble.',
      down: 'Move down (y+1). Prefer when food is below or to escape upward trouble.',
      right: 'Move right (x+1). Prefer when food is to the right.',
    },
  },
  danger: {
    type: 'noul',
    instructions: 'Is the snake in immediate danger of dying if it keeps its current heading for a few cells?',
    criteria: {
      true: 'Collision, trap, or no escape on the current heading',
      false: 'Current heading is clear enough to continue',
    },
  },
  aggression: {
    type: 'score',
    instructions: 'How aggressively should the snake chase food versus playing safe?',
    criteria: ['Play safe, avoid body and tight corridors', 'Balanced chase', 'Greedy: go straight at food'],
  },
};

const res = await fetch('https://api.typesafe.ai/v1/systemone', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ state, model: 'jev-latest', questions }),
});

if (!res.ok) {
  console.log(`jev-smoke: fail-closed (http_${res.status})`);
  process.exit(0);
}

const body = await res.json();
const action = body?.answers?.action;
console.log(
  `jev-smoke action=${action?.choice ?? ''} confidence=${action?.confidence ?? 'n/a'} probs=${JSON.stringify(action?.probabilities ?? {})} danger=${body?.answers?.danger?.noul ?? 'n/a'} aggression=${body?.answers?.aggression?.score ?? 'n/a'}`,
);
