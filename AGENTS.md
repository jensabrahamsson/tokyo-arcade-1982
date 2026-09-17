# AGENTS.md — how to work on ARKAD

Rules for humans and agents working in this repo. Read `REQUIREMENTS.md`
for *what*, `ARCHITECTURE.md` for *where*, this file for *how*.

## Prime directives

1. **Test-first.** New behavior gets a failing test before code. Bug
   fixes ship with a regression test that would have caught the bug.
   A fix without a test is not finished.
2. **The core is sacred.** `packages/core` is pure: no DOM, no Node
   APIs, no `Math.random`/`Date.now`, no I/O, no timers. `step()` never
   mutates its input state (shallow copies are not clones — clone what
   you write). State must stay plain JSON.
3. **Validate at the edge.** The server trusts nothing that was not
   approved by `parseClientMessage`. A client (or a curl) must never be
   able to crash the hall.
4. **Finish green, always.** Before any commit:
   `npx tsc -b && npm test && node build.mjs` — all three, no exceptions.
   Never weaken or delete a test to get green; fix the code.

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

`tsc -b` clean · `npm test` green (count updated in README) ·
`node build.mjs` OK · a live-server smoke of the touched flow ·
no requirement in `REQUIREMENTS.md` violated.
