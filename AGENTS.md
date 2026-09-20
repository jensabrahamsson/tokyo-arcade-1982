# AGENTS.md — how to work on ARKAD

Rules for humans and agents working in this repo. Read `REQUIREMENTS.md`
for *what*, `ARCHITECTURE.md` for *where*, this file for *how*.

## Prime directives

1. **Test-first, no exceptions.** New behavior gets a failing test
   *before* the code that makes it pass. Bug fixes ship with a
   regression test that would have caught the bug. A change without a
   test is not finished — "I'll add tests after" is not a plan, it is
   a wish. If a behavior cannot be unit-tested (browser-only), extract
   a pure helper and test that, and cover the rest with a real-server
   check.
2. **The core is sacred.** `packages/core` is pure: no DOM, no Node
   APIs, no `Math.random`/`Date.now`, no I/O, no timers, no
   `console.*`. `step()`/`demo()` never mutate their input state
   (shallow copies are not clones — clone what you write). State must
   stay plain JSON: anything that cannot survive `JSON.parse(JSON.stringify(state))`
   is a bug. Bots/demos live in core as pure functions, never in
   server or client.
3. **Validate at the edge.** The server trusts nothing that was not
   approved by `parseClientMessage` — every new message type gets its
   validator case and a rejection test *in the same commit*. Bounds on
   everything: lengths, finiteness, enum values, payload size. A client
   (or a curl) must never be able to crash the hall; prove it with a
   test that throws junk at the socket handler.
4. **Finish green, always.** Before any commit:
   `npx tsc -b && npm test && node build.mjs` — all three, no
   exceptions, twice for flake-checking.
5. **Tests are immutable evidence.** Never weaken, delete, skip
   (`.skip`, `xit`, loose asserts) or "update" a test to accommodate
   new code. A test that disagrees with your change means your change
   is wrong — or the test needs a *reasoned*, commented correction
   with the old expectation explained in the commit message. README
   test counts move up, never down.
6. **Commits are authored as Jens Abrahamsson `<jens.abrahamsson@makeitso.se>`**
   — verify `git log -1 --format='%ae'` before pushing; never the
   jens-krypto identity.

## Art pipeline (R38)

`packages/client/static/art/*.png` is the drop zone for pixel art
(Cursor / Grok Imagine handoff): 1982 Tokyo arcade style, limited
palette, small files (16-32 KB each). Current roster: `hall-floor`,
`cabinet-bezel`, `coast-lo-castle`, `splash-logo`, `marquee-neon`,
`coin-slot`, `credit-panel`, `wait-badge` (all `.png`). OpenCode
never draws art — it writes the manifest/loader/wiring only. Core must never touch
Image/DOM/fetch; missing files fall back to procedural drawing.

## Audio pipeline (R54)

`packages/client/static/audio/*.mp3` holds the two approved Lyria 3.5
samples: `Late_Night_Cabinet.mp3` (attract/splash loop, stops inside a
cabinet) and `coast_yosen_start_ja.mp3` (Coast READY stinger, once per
table). They are the only non-chiptune audio allowed; AI watermarks may
exist; the repo stays GPL-3.0-only. Player-facing brand is
**Tokyo Arcade 1982** (`arkad` is internal only). Playback lives in
`audio/samples.ts`: Web Audio, operator volume/mute (R23) applied,
fail-closed silent when a file is missing. Core stays pure — it emits
no audio for these.

## Jev snake self-play (optional autotest)

`ARKAD_JEV_SELFPLAY=1` lets the snake attract demo consult TypeSafe Jev
(`POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`) at
~8 Hz. Compact JSON state only (no images). The key is `TYPESAFE_API_KEY`
in the environment or gitignored repo-root `.env.typesafe` (never commit
that file; never log the value). Missing key or HTTP failure fail-closed
to `spec.demo`. Core stays pure — fetch lives in
`packages/server/src/jevPolicy.ts`. CI uses a mock classifier; live
one-shot: `npm run jev:smoke` (skips if the key is unset).

## Working agreements

- Small, verifiable steps. Run the suite after every handful of edits,
  not after every file.
- End-to-end before "done": for anything touching input, seating or the
  socket layer, run a real-server check too (start
  `node dist/server/index.cjs`, drive it with a `ws` script from /tmp).
  Unit tests have missed integration bugs here before — that is exactly
  what they cannot see.
- Each component must be good in itself: core game specs are readable
  and deterministic; the server never crashes from client behavior;
  renderers are pure functions of snapshots.
- No `alert`/`prompt`/`confirm` — everything is on the canvas, 1982
  style. No new npm dependencies without asking; the stack is
  Node + ws + Canvas2D + Web Audio + Vitest, on purpose.
- README numbers (test count) must be true — update them in the same
  change that changes them.

## Layout & commands

```
packages/core     engine/, games/<7>/, protocol/, i18n/, audio/, difficulty/
packages/server   http.ts, arcade.ts, session.ts, highscores.ts, jevPolicy.ts
packages/client   main.ts, net.ts, input.ts, namepad.ts, audio/, renderers/, static/
```

```sh
npm test                # vitest run (411 tests, incl. real-socket E2E)
npx vitest run <path>   # one file while iterating
npm run typecheck       # tsc -b
node build.mjs          # esbuild bundles into dist/
node dist/server/index.cjs   # ARKAD_PORT / ARKAD_DATA / ARKAD_JEV_SELFPLAY; key from env or .env.typesafe
npm run jev:smoke            # one live Snake Jev decision; skip if no key
```

## Conventions

- Fixed 60 Hz ticks everywhere; never scale by wall-clock in game logic.
- Edge-triggered input uses `seq` (a new number per change); level
  input is fine for paddles/ships. Games that read `seq` must treat
  `undefined` as stale, not fresh.
- Names: `snake_case` fields, `PascalCase` types, 1982 flavor in
  user-facing strings (`en.ts`/`ja.ts` — keep both tables in sync;
  the compiler enforces parity).
- sfx are emitted in core via `withSfx(state, { name })` and delivered
  by the server inside snapshot batches — never call audio from core.
- Server resilience: per-table `try/catch` in `tick()`, `ws.on('error')`
  everywhere, store writes that log instead of throw.
- Presentation-only state (CRT knobs, accessibility mode) lives in
  localStorage via pure helpers and must never reach core, protocol or
  simulation. Operator bookkeeping (coins, plays, free-play) lives
  server-side in `ServiceStore` and is validated at the edge like
  everything else.

## Definition of done

`tsc -b` clean · `npm test` green twice (count updated in README) ·
`node build.mjs` OK · a live-server smoke of the touched flow (real
server + `ws` script for anything socket-facing) · every requirement ID
touched by the change verified or downgraded with a note · no
requirement in `REQUIREMENTS.md` violated · author check passes.
