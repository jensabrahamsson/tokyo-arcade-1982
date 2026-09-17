# AGENTS.md — how to work on ARKAD

Rules for humans and agents working in this repo. Read `REQUIREMENTS.md`
for *what*, `ARCHITECTURE.md` for *where*, this file for *how*.

These rules are **stricter** than convenience. If a shortcut would
weaken a test, mutate core state, trust a client frame, change the
license, or commit as the wrong author — stop.

## Prime directives

1. **Test-first, always.** Every new behavior starts as a **failing**
   spec, then the code that makes it green. Every bug-fix ships with a
   **regression test that would have caught the bug**. A change without
   that test is not finished. Never delete, skip, or weaken a test to
   go green — fix the product.
2. **The core is sacred.** `packages/core` is pure: no DOM, no Node
   APIs, no `Math.random`, no `Date.now`, no I/O, no timers, no network.
   `step()` never mutates its input state (shallow copies are not clones
   — clone what you write). State must stay plain JSON. Randomness is
   the seeded `Rng` only, passed explicitly.
3. **Validate at the edge.** The server trusts nothing that was not
   approved by `parseClientMessage`. A client (or a curl) must never be
   able to crash the hall. Oversized, unknown, or malformed frames are
   rejected, not thrown up the stack.
4. **Finish green, always.** Before any commit:
   `npx tsc -b && npm test && node build.mjs` — all three, no
   exceptions. Anything touching input, seating, or WebSockets also
   needs a **real-socket / live-server** check (`node dist/server/index.cjs`
   plus a `ws` script from `/tmp`, or the existing E2E specs).
5. **Identity & license.** Git author/committer is **only**
   `Jens Abrahamsson <jens.abrahamsson@makeitso.se>`. Never commit as
   `jens-krypto`, `Jens Krypto`, `kmoonai@`, Cursor Agent, or any other
   identity. License is **GPL-3.0-only**; do not relicense to MIT (or
   any other terms). Do not "or later" the license in package metadata.

## Working agreements

- Small, verifiable steps. Run the suite after every handful of edits,
  not after every file.
- End-to-end before "done": unit tests have missed integration bugs on
  seating and sockets before — that is exactly what they cannot see.
- Each component must be good in itself: core game specs are readable
  and deterministic; the server never crashes from client behavior;
  renderers are pure functions of snapshots; hall demos never seat
  players or write high scores.
- No `alert`/`prompt`/`confirm` — everything is on the canvas, 1982
  style. **No new npm dependencies without asking**; the stack is
  Node + ws + Canvas2D + Web Audio + Vitest, on purpose.
- README numbers (test count) must be true — update them in the **same
  change** that changes them. `REQUIREMENTS.md` R7.2 defers to README
  for the live count.
- Do not force-push `main`. Do not rewrite published history.

## Layout & commands

```
packages/core     engine/, games/<6>/, hall/, protocol/, i18n/, audio/, difficulty/
packages/server   http.ts, arcade.ts, session.ts, highscores.ts
packages/client   main.ts, net.ts, input.ts, namepad.ts, audio/, renderers/, static/
```

```sh
npm test                # vitest run (count in README; incl. real-socket E2E)
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
  Hall demo ambience may replay those same events on the client at
  reduced gain; it still must not invent sounds inside core.
- Server resilience: per-table `try/catch` in `tick()`, `ws.on('error')`
  everywhere, store writes that log instead of throw.
- Demo / attract loops use `createDemo` / `stepDemo` and the seeded
  RNG. They are not paid sessions: no roster seats, no high-score
  writes, yield immediately to a real `start`.

## Definition of done

`npx tsc -b` clean · `npm test` green (count updated in README) ·
`node build.mjs` OK · a live-server smoke of the touched flow ·
no requirement in `REQUIREMENTS.md` violated · tests not deleted or
weakened · author is Jens Abrahamsson · license still GPL-3.0-only.
