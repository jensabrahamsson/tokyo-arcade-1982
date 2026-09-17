# ARCHITECTURE — ARKAD

## Shape

npm-workspaces monorepo, three packages, one direction of dependency:

```
client  ─┐
          ├──► core  (zero dependencies)
server  ─┘
```

`core` knows nothing about browsers or Node. `server` and `client` never
import each other; they meet only on the protocol types in core.

## packages/core — the arcade cabinet, minus the coin slot

Pure TypeScript. No `node:`, no DOM, no `Math.random`, no timers.

- `engine/` — the 1982 simulation contract: `GameSpec { create, step }`
  with **fixed 60 Hz ticks**, `GameStateBase` (phase, level, scores,
  lives, sfx), the phase machine (`ready → playing → roundOver /
  gameOver → attract`), seeded `Rng` (xorshift, passed explicitly), and
  `PlayerInput` (`dir`, `button`, `seq` for edge-triggered reads).
- `games/<name>/` — six specs: snake (capacity 4 FFA), puck (turnBased,
  4-personality ghost AI), block, galaxy, river, myriad. Every `step()`
  is **pure**: it clones before writing, never mutates the state it was
  handed, and returns plain-JSON state.
- `protocol/` — `ClientMessage`/`ServerMessage` unions plus
  `parseClientMessage()`: a hand-rolled validator that rejects unknown
  types, diagonal/zero dirs, non-finite seqs, >12-char names, oversized
  payloads. The server trusts nothing it did not validate.
- `i18n/` — `EN`/`JA` tables; `JA` is typed `Record<keyof typeof EN, …>`
  so a missing translation is a compile error.
- `audio/notes.ts` — chiptune definitions as note tables (name → wave,
  notes, step). Pure data; the client synthesizes.
- `difficulty/` — shared adaptive curve (used by puck; every cabinet
  also has its own per-level ramp).

Why a pure core: determinism (same seed + inputs → same state), trivial
unit testing, and snapshots that are just `JSON.stringify` of state.

## packages/server — the hall

- `http.ts` — one Node http server: static client from `dist/public`
  (path-traversal-safe, MIME allow-list, `maxPayload` 8 KB, error
  listeners everywhere) and the `ws` endpoint on `/ws`.
- `arcade.ts` — lobby + tables. Connections, seating (per-game
  `capacity`; full tables and post-deal joiners spectate), roster
  broadcasts, and the authoritative `tick()` loop (`setInterval` 60 Hz)
  that steps every session, batches sfx events, and sends full-state
  snapshots every other tick. A throwing table is closed, never fatal.
- `session.ts` — one game instance: owns state, latched per-player
  inputs, and the gameOver→highscore hook.
- `highscores.ts` — top-10 lists per game+mode in `data/scores.json`
  with shape-checked loads and non-throwing saves.

Model: **full snapshot broadcast** (~30 Hz, ~1.3 KB/table client, ~800
KB/s for a 20-client snake table). Right model for a LAN hall of dozens
of players; the wrong model for WAN — noted, not a bug.

## packages/client — the screen

- `main.ts` — scene machine: `title → name → select → table / scores`.
  Scene entry clears stale input; the table scene sends
  edge-detected `(dir, button, seq)` and bails on 4 s of silence.
- `net.ts` — WebSocket wrapper with auto-reconnect; `onOpen` re-joins
  with the stored name after a drop.
- `input.ts` — keyboard with press-ordered stick stack (`heldDir`),
  edge reads, keyup clearing, blur clearing, IME guard.
- `audio/chiptune.ts` — two-voice Web Audio synth (square/triangle +
  noise buffer) driven by core note tables; unlocks on first press.
- `renderers/` — one pure canvas function per game, fed snapshots.
- `static/` — HTML shell + CRT CSS (scanlines, glow, vignette, flicker).

## Language & runtime choices

- **TypeScript strict everywhere**, ESM sources compiled by `tsc -b`
  (project references) and bundled by esbuild (`build.mjs`) into
  `dist/server/index.cjs` (Node) and `dist/public/bundle.js` (browser).
- **Node + `ws`** on the server: zero frameworks; a hall is one process.
- **Canvas 2D + Web Audio** on the client: the 1982 look and sound are
  the product; no framework, no assets, ~90 KB bundle.
- **Vitest** for tests: shared config for all three packages;
  real-WebSocket integration tests run against the real server.

## Data flow (one tick, 60×/s)

```
client keydown ──{dir,button,seq}──► ws ──parseClientMessage──► Arcade
Arcade ──► Session.setInput (latched) ──► spec.step(state, inputs)
Arcade ◄── state + sfx events ─── Session
Arcade ──snapshot{tableView,state,events}──► every seat (every 2nd tick)
client ◄── JSON ── renderer(game) + chiptune(events)
```
