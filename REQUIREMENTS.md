# REQUIREMENTS — ARKAD, Tokyo Arcade Hall 1982

The contract for what this product must do. `README.md` sells it; this list
defines done. Each item is verified by a test, a live check, or both.

## R1 — Theme & atmosphere

- R1.1 Setting: a Tokyo arcade hall, 1982. Cabinet marquee, Japanese copy,
  coin-drop rituals, "INSERT COIN" framing.
- R1.2 CRT-styled presentation: scanlines, phosphor glow, vignette,
  subtle flicker, pixel-scaled canvas (320×240, 4:3).
- R1.3 All UI is drawn on the canvas — no browser dialogs
  (`alert`/`prompt`/`confirm` are banned).
- R1.4 Bilingual EN/JA, switchable at any time from the cabinet (`L`);
  choice persists across reloads. Key parity between languages is enforced
  by tests.

## R2 — Six cabinets (1982-accurate inspirations)

| ID | Game | Inspiration | Solo | Versus |
|----|------|-------------|------|--------|
| snake | SNAKE / ヘビ | Blockade, Tron | ✅ | ✅ 2–4 players FFA |
| puck | PUCK MAZE / パックメイズ | Puck-Man | ✅ | ✅ VS. System (alternating turns) |
| block | BLOCK BATTLE / ブロックバトル | Breakout duel | ✅ | ✅ first to 7 goals |
| galaxy | GALAXY RAIDER / ギャラクシーレイダー | Galaga | ✅ | — |
| river | RIVER FROG / カエルのリバー | Frogger | ✅ | — |
| myriad | MYRIAD / ムカデ | Centipede | ✅ | — |

- R2.1 Snake versus seats 2–4 players; last tail alive wins. Tables deal
  when full or ~2 s after player two arrives (join window).
- R2.2 Puck versus: players alternate turns (VS. System); each turn is a
  fresh maze at level 1; most points wins when a player burns all lives.
- R2.3 Block versus: first to 7 goals wins; goals are awarded by paddle
  geometry, never by insertion order.
- R2.4 Solo modes have lives, score, level progression and game over.
- R2.5 Every cabinet ramps difficulty per level (speed, ghost AI tempo,
  bug pace). Puck additionally uses the shared adaptive curve
  (eases off after deaths, pushes when cruising).

## R3 — Arcade input

- R3.1 Stick: arrows/WASD. Release must release (no sticky input).
- R3.2 Button: Space (also Z/J). Galaxy and myriad fire on it.
- R3.3 Edge-triggered reads for menus and river hops (seq-numbered);
  level reads for paddles/ships. A repeated/stale `seq` never re-triggers.
- R3.3 Focus loss (alt-tab) must not leave a key held.
- R3.4 Name entry: in-canvas marquee keyboard, max 12 chars, backspace,
  OK, cancellable. Enforced client-side, protocol-side and storage-side.

## R4 — Multiplayer over the LAN

- R4.1 One server hosts the hall; clients need only a browser at the LAN
  URL. WebSockets + JSON.
- R4.2 The server is authoritative: clients render snapshots and send
  input; no client-side simulation.
- R4.3 One cabinet per game+mode; full tables get spectators (who still
  receive snapshots). Late joiners to a live table watch, they never
  become phantom players.
- R4.4 Robustness: a dead socket or a table whose sim throws must never
  take down the hall. Malformed/oversized frames are rejected, not crashes.
- R4.5 Reconnect: a client that loses the network re-joins automatically
  with its name when the link returns.

## R5 — High scores

- R5.1 Persistent shared board in `data/scores.json` (env `ARKAD_DATA`),
  per game+mode, top 10, names clamped to 12 chars.
- R5.2 Corrupt score files must not crash the server (shape-checked on
  load; failed writes are logged, not thrown).
- R5.3 Viewable from the cabinet (`H`), rendered as an arcade board.

## R6 — Sound

- R6.1 1982 chiptune only: square/triangle/noise via Web Audio; no audio
  files.
- R6.2 Every gameplay event has a sound: eat, power, die, shoot, hit,
  bounce, hop, goal, level up, coin, start jingle.
- R6.3 Events must actually reach the client (sfx are batched into
  snapshots and never dropped by the snapshot gate).
- R6.4 Audio unlocks on first interaction (browser autoplay policy).

## R7 — Non-functional

- R7.1 TypeScript strict, zero `any` in public APIs; `tsc -b` clean.
- R7.2 Test-first culture: every bug-fix ships with a regression test.
  `npm test` green (210 tests, incl. real-WebSocket E2E for 2- and
  4-player snake versus, plus integration surfaces for puck turn-handoff
  and block first-to-7).
- R7.3 Deterministic, framework-free core: pure `create`/`step` on a
  fixed 60 Hz tick; state is plain JSON; no DOM/Node/Math.random in core.
- R7.4 Runs on Node 18+, macOS/Linux; build < 10 s; bundle < 200 KB.
- R7.5 LAN scale: dozens of clients at 60 Hz without measurable lag.

## R8 — Hall demo / attract mode

- R8.1 Every idle cabinet in the hall runs a live attract demo of its
  game (a deterministic built-in bot playing it), not a static poster.
  The hall therefore always looks alive, 1982 style.
- R8.2 Demos run server-side as seatless `demo` tables; they must never
  record high scores and never appear in the joinable roster.
- R8.3 A demo must not disturb live seating: humans never get routed
  into a running demo's session, and a demo never seats or ejects
  players.
- R8.4 Coin/start takes the cabinet over: the first human `start`
  replaces the demo with a real game immediately.
- R8.5 Demos are pure core logic (`spec.demo(state, tick)`), deterministic
  and unit-tested; the hall view shows them through the same snapshot
  channel as live games.

## R9 — Arrow keys everywhere

- R9.1 Cursor keys (arrows) work everywhere a stick/menu/namepad input
  is expected, always paired with WASD: hall navigation, cabinet select,
  name keyboard, score screens, map, credits, and in-game stick.
- R9.2 Menu navigation is a pure, tested helper (`nav.ts`); the namepad
  and table-scene tests already cover arrows.

## R10 — The hall, not a list

- R10.1 The game select is a rendered arcade hall: floor, back wall,
  six cabinets with lit marquees and live mini-screens fed by the demo
  (or live) snapshots. No flat text list.
- R10.2 A glowing "you are here" token stands at the selected cabinet;
  navigation walks the hall with arrows/WASD.

## R11 — Hall map

- R11.1 A canvas map of the hall (top-down layout of floor, walls and
  cabinets) is available at any time from the hall (`M`), with a marker
  showing where the player currently stands.

## R12 — Splash screen

- R12.1 On load the client shows a splash/boot screen (marquee, build
  line, 1982 boot flavor) for a few seconds; any key skips it to the
  title screen.

## R13 — Credits

- R13.1 A credits screen names the author (Jens Abrahamsson), the
  license (GPL-3.0-only), the stack (TypeScript, Node, ws, Canvas2D,
  Web Audio, Vitest) and 1982 flavor; reachable from title and hall.

## R14 — High-score music

- R14.1 Opening the high-score board plays a chiptune jingle, and the
  hall's score display gets a matching musical sting — synthesized via
  the existing core note tables; zero audio files.

## R15 — Polish within the frame

- R15.1 Continuous polish inside the 1982 CRT + chiptune frame: hall
  floor reflections, marquee light chase, cabinet bezels, attract color
  cycles, coin-slot glints. No new large games, no new dependencies.
