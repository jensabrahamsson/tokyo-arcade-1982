# AGENTS.md — how to work on ARKAD

Rules for humans and agents working in this repo. Read `REQUIREMENTS.md`
for *what* (krav-sanningen: numbered R-items or Lab only; chat/PRs are
not a substitute), `ARCHITECTURE.md` for *where*, this file for *how*.

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
`cabinet-bezel`, `coast-lo-castle`, `splash-logo`, `splash-marquee`, `marquee-neon`,
`coin-slot`, `credit-panel`, `wait-badge` (all `.png`). OpenCode
never draws art — it writes the manifest/loader/wiring only. Core must never touch
Image/DOM/fetch; missing files fall back to procedural drawing.
JPEG reference stills for Imagine (Coast billboard pilots) live in
`packages/client/art-pilots/*.jpg` — not under `static/`, not served,
never named `.png` (HTTP would otherwise claim `image/png`).

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

## Jev self-play (optional autotest, all cabinets)

`ARKAD_JEV_SELFPLAY=1` lets the attract demos of all seven cabinets
(snake, puck, block, galaxy, river, myriad, coast) consult TypeSafe Jev
(`POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`) at
~8 Hz. Compact JSON state only (no images); per-cabinet adapters live
in `packages/server/src/jevPolicy.ts` (`JEV_ADAPTERS`), fetch included
— core stays pure. Missing key or HTTP failure fail-closed to
`spec.demo`. The key is `TYPESAFE_API_KEY` in the environment or
gitignored repo-root `.env.typesafe` (never commit that file; never
log the value). One-shot snake smoke: `npm run jev:smoke`. Full
one-minute autoplay per cabinet (~7 min, prints action/confidence
summary, exit 0 even when every call fails closed):

```sh
ARKAD_JEV_AUTOPLAY_SECONDS=60 npm run jev:autoplay
```

CI uses a mock classifier; live one-shot: `npm run jev:smoke` (skips if
the key is unset).

## Show-floor smokes (muted CDP / Jev autoplay)

Wave 0 proof runs **in this checkout** (cloud VM or your own machine) —
never on Jens's Mac, never as fullscreen Chrome, never `--kiosk`. The
required path is vitest (unit / FakeNet / real-ws). CDP and Jev autoplay
are optional extras. Operator mute (R23) applies; CDP launches with
`--mute-audio`.

### Required: vitest (unit / FakeNet / real-ws)

```sh
npm test
# the wave-0 walk lives in:
#   packages/client/src/showFloorSmoke.test.ts
#   Arcade free-play smoke in packages/server/src/arcade.test.ts
#   real-ws free-play smoke in packages/server/src/http.test.ts
npx vitest run packages/client/src/showFloorSmoke.test.ts \
  packages/server/src/arcade.test.ts packages/server/src/http.test.ts
```

Covers splash → title → namepad → 7-cab hall → Coast qualifying overlay
(~3 s) + stinger-due when the MP3 is present → Escape/KeyB home → snake
versus on the hall mini → pause keeps credits → L language toggle.
P1-A/B (Coast overlay independent of phase; reconnect without re-debit)
stay in the same suite.

### Optional: Jev attract autoplay

```sh
ARKAD_JEV_AUTOPLAY_SECONDS=60 npm run jev:autoplay
```

~7 min, all seven cabinets, compact JSON only (no images). Missing key
or HTTP failure fail-closes to `spec.demo` and still exits 0. One-shot:
`npm run jev:smoke` (skips if `TYPESAFE_API_KEY` is unset).

### Optional: muted CDP (headless, windowed, localhost only)

Chrome DevTools Protocol against **this process's localhost**. Do not
`--start-fullscreen` / `--kiosk`. Do not attach to a remote Mac display
or steal a coworker's desktop.

```sh
node build.mjs
ARKAD_PORT=8443 node dist/server/index.cjs
# other terminal — headless, muted, windowed:
google-chrome --headless=new --mute-audio --window-size=1280,720 \
  --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
  http://127.0.0.1:8443/
# CDP Input.dispatchKeyEvent: Space (splash→title) → Space (namepad) →
# type a name + OK → hall → Coast Z → ~3 s QUALIFYING START! →
# Escape/KeyB home → snake X versus → P pause → L language.
# Targets: http://127.0.0.1:9222/json
```

If Chrome is missing, skip CDP; `npm test` is the required smoke.

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
npm test                # vitest run (581 tests, incl. real-socket E2E)
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

## Operator LAN runbook (Wave 7)

Player-facing demo steps and the LinkedIn shot list live in `README.md`.
How-to at the keyboard:

- Demo hall: `npm start` → hold `Shift+S` → `F` (FREE PLAY). `V`/`M`
  volume/mute. Attract `Late_Night_Cabinet.mp3` only on splash/hall.
- Do not expose the port. `ooo` / `freePlay` / `note` are open on the
  wire (trusted LAN, no PIN).
- Jev: `.env.typesafe` / `TYPESAFE_API_KEY`; `ARKAD_JEV_SELFPLAY=1`;
  `npm run jev:smoke`; `ARKAD_JEV_AUTOPLAY_SECONDS=60 npm run jev:autoplay`.
  Fail-closed without a key.
- Coin reconnect: same name+lang within 60 s, wallet `name|lang`.

### Muted CDP (keep Wave 0)

Optional extra — `npm test` is the required smoke. Chrome DevTools
Protocol against **this process's localhost** only:

- Launch with `--mute-audio` (operator mute R23 still applies).
- Headless or windowed. Do not `--start-fullscreen` or `--kiosk`.
- Do not attach to a remote Mac display or steal a coworker's desktop.

Wave 0 may add a fuller recipe (debug port, key sequence) earlier in
this file. Do not delete it; this section is the floor so those notes
survive either merge order.
