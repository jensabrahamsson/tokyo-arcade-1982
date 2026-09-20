# Jev attract self-play

Operator/autotest flag, not a cabinet requirement. Core stays pure: fetch,
keys, and logs live in `packages/server/src/jevPolicy.ts`.

Enable: `ARKAD_JEV_SELFPLAY=1` plus `TYPESAFE_API_KEY` (environment or
gitignored repo-root `.env.typesafe` — never commit it). Unset key, HTTP
failure, or low confidence **fail-closes** to each cabinet's `spec.demo`.
CI never hits the live API (mock `fetch` only).

Live one-shot and CDP/hall smoke stay documented in the README / AGENTS.md
(Wave 0). This file is the **attract-policy tuning** note. Numbered Lab
bullets (Block/Myriad MUST, Galaxy/Coast SHOULD) live in `REQUIREMENTS.md`.

## Harden

- Confidence: finite and in `[floor, 1]` (`JEV_CONFIDENCE_MIN = 0.35` global;
  Myriad keeps `0.25` because 3–4 choices still cap Jev near argmax).
- Rate limit: one in-flight POST, shared `JEV_MIN_INTERVAL_MS = 125` (~8 Hz)
  across cabinets on a single `JevSelfPlay`.
- Flaky network / 408 / 429 / 5xx: **retry once**, then fail-closed.
- Logs never print the API key, `Bearer` tokens, or `TYPESAFE_API_KEY=…`
  (`redactSecrets`). Cache stores the choice *word* so Coast `straight`
  is not reused as Galaxy `fire`.

## Attract quality (Wave 4)

Baseline live 30 s/cabinet (2026-09-20) vs what the adapters now send:

| game   | MUST/SHOULD | baseline issue                         | adapter change                                      |
|--------|-------------|----------------------------------------|-----------------------------------------------------|
| block  | MUST        | stay×89, avgConf 0.40, floor thrash    | predicted `landX` / signed `error` / `dySign`; drop `stay` when `\|error\| > 0.7` |
| myriad | MUST        | fire×89, avgConf 0.29, 5-choice cap    | nearest dx/dy/manhattan, `inColumn`, mushrooms, `fireWouldHit`; omit fire when beside |
| galaxy | SHOULD      | fire×107                               | `alienAbove`; omit `fire` on empty sky              |
| coast  | SHOULD      | straight×107 (verify dodge)            | drop `straight` when an obstacle is on the current line |
| snake/puck/river | —    | good                                   | unchanged                                           |

Targets for `ARKAD_JEV_AUTOPLAY_SECONDS=30 npm run jev:autoplay`:

- block: avgConf ≥ 0.55, failed ≤ 5%, stay not >60% of topChoices unless aligned
- myriad: avgConf ≥ 0.40 (or documented 0.25 floor), failed ≤ 10%, fire not >70% unless in-column
- galaxy: fire share drops when no alien is above the ship
- coast: unit test: obstacle dead ahead → `straight` illegal
- snake/puck/river: avgConf within ~0.1 of baseline

## Commands

```sh
ARKAD_JEV_SELFPLAY=1                         # hall attract (fail-closed without key)
npm run jev:smoke                            # one Snake decision; skip if no key
ARKAD_JEV_AUTOPLAY_SECONDS=60 npm run jev:autoplay
ARKAD_JEV_SOAK_MINUTES=5 npm run jev:soak    # JSON under data/ (gitignored)
```

Override soak path with `ARKAD_JEV_SOAK_REPORT` or `ARKAD_DATA`.
