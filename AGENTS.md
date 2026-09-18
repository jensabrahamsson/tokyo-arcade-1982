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
packages/core     engine/, games/<6>/, protocol/, i18n/, audio/, difficulty/
packages/server   http.ts, arcade.ts, session.ts, highscores.ts
packages/client   main.ts, net.ts, input.ts, namepad.ts, audio/, renderers/, static/
```

```sh
npm test                # vitest run (175 tests, incl. real-socket E2E)
npx vitest run <path>   # one file while iterating
npm run typecheck       # tsc -b
node build.mjs          # esbuild bundles into dist/
node dist/server/index.cjs   # ARKAD_PORT / ARKAD_DATA
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

## Definition of done

`tsc -b` clean · `npm test` green twice (count updated in README) ·
`node build.mjs` OK · a live-server smoke of the touched flow (real
server + `ws` script for anything socket-facing) · every requirement ID
touched by the change verified or downgraded with a note · no
requirement in `REQUIREMENTS.md` violated · author check passes.
