# REQUIREMENTS — ARKAD, Tokyo Arcade Hall 1982

The contract for what this product must do. `README.md` sells it; this list
defines done. Each item is verified by a test, a live check, or both.

**Process:** every accepted product requirement lives in this file as a
numbered R-item or a Lab bullet. Chat threads and pull-request text are
not a substitute — if it is not written here, it is not the contract.

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

- R6.1 Gameplay is 1982 chiptune only: square/triangle/noise via Web
  Audio. Cabinet SFX never load audio files. The sole exception is R54:
  the hall attract loop (`Late_Night_Cabinet.mp3`) and the Coast READY
  stinger (`coast_yosen_start_ja.mp3`).
- R6.2 Every gameplay event has a sound: eat, power, die, shoot, hit,
  bounce, hop, goal, level up, coin, start jingle.
- R6.3 Events must actually reach the client (sfx are batched into
  snapshots and never dropped by the snapshot gate).
- R6.4 Audio unlocks on first interaction (browser autoplay policy).

## R7 — Non-functional

- R7.1 TypeScript strict, zero `any` in public APIs; `tsc -b` clean.
- R7.2 Test-first culture: every bug-fix ships with a regression test.
  `npm test` green (515 tests, incl. real-WebSocket E2E for 2- and)
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

### Optional: Jev attract self-play (not a hall R-feature)

Operator/autotest flag, not a cabinet requirement. See **Lab — Jev
self-play** (end of this file) for the seven-cabinet contract: fail-closed
to `spec.demo`, Block/Myriad MUST payload, Galaxy/Coast SHOULD. Does not
change R8.1–R8.5.

## R9 — Arrow keys everywhere

- R9.1 Cursor keys (arrows) work everywhere a stick/menu/namepad input
  is expected, always paired with WASD: hall navigation, cabinet select,
  name keyboard, score screens, map, credits, and in-game stick.
- R9.2 Menu navigation is a pure, tested helper (`nav.ts`); the namepad
  and table-scene tests already cover arrows.

## R10 — The hall, not a list

- R10.1 The game select is a rendered arcade hall: floor, back wall,
  six cabinets (seven since R22) with lit marquees and live mini-screens
  fed by the demo
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
  the existing core note tables. High-score music is not an R54 sample.

## R15 — Polish within the frame

- R15.1 Continuous polish inside the 1982 CRT + chiptune frame: hall
  floor reflections, marquee light chase, cabinet bezels, attract color
  cycles, coin-slot glints. No new large games, no new dependencies.

## R16 — Operator service menu

- R16.1 A hidden key combination (hold `Shift` + `S`) from the title or
  hall opens the operator service menu, 1982 bookkeeping style.
- R16.2 It shows real server-side bookkeeping: total plays, total coin
  drops, free-play mode and server uptime; counters persist across
  restarts under `ARKAD_DATA/service.json` and survive corrupt files.
- R16.3 The service menu exits cleanly back to the hall and must never
  disturb or crash live tables (it only reads stats and toggles R17).

## R17 — Free play vs coin mode

- R17.1 The operator toggles the hall between coin mode (default) and
  free play from the service menu; the setting persists.
- R17.2 In coin mode `start` requires a credit: one `coin` per player
  per game; a start without credit is rejected with `insert-coin` and
  seats nobody. Spectating stays free.
- R17.3 The current mode is displayed in the hall as a badge (COIN 1C /
  FREE PLAY) delivered on the hall channel.

## R18 — Insert-coin animation

- R18.1 In coin mode, pressing start on a cabinet plays a short
  coin-insert animation at the cabinet slot plus the chiptune coin sfx
  before the game takes over the demo.
- R18.2 Contract stays clean: the client inserts a `coin` message, then
  `start` after the animation; the server gates credits, not vibes.
  No audio files, no browser dialogs.

## R19 — CRT knobs

- R19.1 Three operator knobs — brightness, contrast, scanline density —
  adjustable from the service menu, each a 3-step detent.
- R19.2 Knobs affect presentation only (CSS filter / overlay opacity
  computed by one pure helper) and persist in localStorage; they never
  touch the simulation or protocol.

## R20 — Language attract cycle

- R20.1 Attract text (hall sign, marquee flavor lines) cycles EN ↔ JA
  on a fixed period using the existing i18n tables, via a pure helper
  `attractLang(ms, period)` — deterministic and unit-tested.

## R21 — Tournament banner & accessibility palette

- R21.1 The hall shows a tournament banner derived from the live
  high-score board (leader name + score, 1982 color chase), computed by
  a pure helper with a default banner when the board is empty.
- R21.2 An accessibility palette mode (high contrast / color-blind
  assist) is toggleable from the service menu and credits; it only
  remaps presentation colors (pure helper + CSS filter) and persists in
  localStorage — no new dependencies, no sim changes.

## R22 — Seventh cabinet: COAST RUNNER (OutRun-style)

- R22.1 A pseudo-3D coast racing cabinet inspired by Sega OutRun (1986),
  rebuilt in the same 1982 hall spirit: `packages/core` pure logic
  (`games/coast`), server-authoritative, canvas renderer, chiptune only,
  EN/JA. Visual bar is R56 (Pole Position / early OutRun silhouette,
  never C64 Night Driver void).
- R22.2 The background landmark is the LO castle of Liseberg,
  Gothenburg (wooden fairytale castle silhouette on the horizon with
  parallax against the road curves) — never Mount Fuji or any
  Japan-mountain motif.
- R22.3 Solo-only (like galaxy/river/myriad): time-chased run to LO
  castle with checkpoint time extensions; versus stays disabled.
- R22.4 Core mechanics (pure, deterministic, seeded): accelerate/brake/
  steer, curve centrifugal push, off-road slowdown, seeded roadside
  obstacles with collisions, checkpoint bonus time + score, goal at the
  castle gate, time-out at zero.
- R22.5 The cabinet joins the hall: marquee, live attract demo bot
  (steer-to-center + throttle), high scores, map — like every other
  cabinet.

## R23 — Operator volume / mute

- R23.1 The service menu gains a 4-step master volume detent
  (0 = mute … 3 = loud) plus an explicit MUTE toggle; both persist in
  localStorage via pure helpers, same pattern as the CRT knobs (R19).
- R23.2 Volume and mute affect the Web Audio output gain only — never
  core, protocol or simulation. Mute forces gain 0; unmuting restores
  the detent value.
- R23.3 Unit-tested helpers: mute yields gain 0, detents are strictly
  monotonic, persistence survives the load/save round-trip and junk
  values fall back to the default.

## R24 — Cabinet OUT OF ORDER

- R24.1 The operator can mark any cabinet id out-of-order (and clear
  it) from the service menu. Flags persist server-side under
  ARKAD_DATA with the same validated-load discipline as service.json,
  and every flag change is broadcast on the hall channel.
- R24.2 An out-of-order cabinet shows an OUT OF ORDER / 故障中 overlay
  on its marquee, its attract demo is stopped, and `start`/`coin`
  targeting it are rejected with the clear reason `out-of-order`.
  Spectating and all other cabinets are unaffected.
- R24.3 Clearing the flag restores the attract demo and seating
  immediately. Tests: store round-trip, start/coin rejection while
  flagged, hall snapshot carries the flags, demo resumes after clear.

## R25 — Join-window countdown on the cabinet

- R25.1 While a versus table sits in its start-grace join window
  (snake 2–4 etc.), both the hall mini-screen and the in-cabinet HUD
  show the seconds left, derived from a pure helper of
  (deadlineTick, nowTick): deterministic, clamped, unit-tested.
- R25.2 The countdown never invents seats; it only mirrors the
  existing server-side join-window/grace logic. When the window
  closes (table dealt) the countdown disappears.

## R26 — Pause overlay

- R26.1 From a live playing seat, `P` toggles a server-authoritative
  pause flag on the table: the simulation's `step` is skipped while
  paused and spectators see the same frozen snapshot.
- R26.2 A 1982 PAUSE / ポーズ overlay is drawn on the canvas (never a
  browser dialog); `P` again resumes. Opening the pause plays a short
  chiptune sting delivered through the existing sfx batching.
- R26.3 Disconnect / table teardown clears the pause. Tests: `step`
  does not advance while paused, the toggle is validated at the edge,
  and junk pause frames are rejected.

## R27 — Neon marquee scroll

- R27.1 The hall marquee scrolls a short flavor string (EN/JA from
  the existing i18n tables, kept in sync by the compiler) using a
  pure `marqueeOffset(ms, width, period)` helper: deterministic,
  bounded, no DOM timers, nothing in core.
- R27.2 Presentation only: the renderer consumes the helper; no
  protocol or simulation changes.

## Constraints for R23–R27

- GPL-3.0-only; canvas-only UI; chiptune only; TypeScript strict; the
  core stays pure. Daytime rule: no browser E2E playtests requested;
  real-ws server checks from /tmp scripts when seating/sockets are
  touched. When green: commit, push, summary with new test count.

## R28 — NOW PLAYING lamp

- R28.1 When a cabinet hosts a live (non-demo) table, its hall marquee
  lights a NOW PLAYING / プレイ中 lamp; the lamp clears when the table
  returns to attract/demo or the table tears down.
- R28.2 The lamp is computed by a pure helper from the hall snapshot
  (occupied vs demo vs empty), unit-tested. Presentation only — no new
  protocol fields unless an existing gap forces one.
- R28.3 OUT OF ORDER (R24) wins over NOW PLAYING: a cabinet never
  shows both.

## R29 — Spectator count badge

- R29.1 The hall mini-screen and the in-cabinet HUD show a compact
  spectator count badge when spectators > 0; hidden at zero.
- R29.2 The count derives from the authoritative snapshot (server-
  counted seats) through a pure helper; deterministic, unit-tested.
  It never invents seats or changes seating rules.

## R30 — Soft reject toasts on canvas

- R30.1 When `start` / `coin` is rejected (insert-coin, out-of-order,
  solo-only, unknown-game and any existing clear reason), the client
  shows a short 1982 canvas toast (EN/JA via i18n) instead of failing
  silently. No alert/prompt.
- R30.2 A pure `rejectToast(reason)` maps reason → i18n key; unknown
  reasons get a safe generic line. A pure timing helper governs the
  auto-clear window. Unit-tests cover the mapper and the timing.

## R31 — Operator day counters

- R31.1 The service menu shows today's plays and coin drops alongside
  the lifetime totals. The day bucket is the calendar date in
  Europe/Stockholm; crossing midnight starts a fresh day without
  wiping the lifetime counters.
- R31.2 Persisted under ARKAD_DATA with the same validated-load
  discipline as service.json; junk or missing day fields fall back
  safely. Unit-tests: day-rollover helper (Stockholm mapping,
  DST-boundary dates) and store round-trip.

## R32 — Hall walk bob

- R32.1 While the "you are here" token moves through the hall, it
  gets a subtle vertical bob from a pure `walkBob(stepIndex)` helper:
  deterministic, bounded, unit-tested.
- R32.2 Presentation only (renderer); no core/protocol/sim changes.

## Constraints for R28-R32

- GPL-3.0-only; canvas-only UI; chiptune only; TypeScript strict; the
  core stays pure. Real-ws server checks from /tmp scripts when
  seating/sockets are touched. When green: commit, push, summary with
  the new test count.

## R33 — Coin-mode credit digits

- R33.1 In coin mode, every hall mini-screen (and the in-cabinet HUD
  while seated) shows a compact CREDITS / クレジット digit strip for
  the player's remaining credits on that cabinet; hidden entirely in
  free-play.
- R33.2 Digits derive from the authoritative server-side credit count
  (delivered per connection on the hall channel and snapshots) via a
  pure helper; unit-tested. Never invents credits or bypasses the
  coin gate (R17/R18).
- R33.3 Zero credits still shows `0` in coin mode (INSERT COIN
  framing stays honest). OUT OF ORDER (R24) wins visually over the
  strip.

## R34 — FREE PLAY hall banner

- R34.1 While the operator has free-play enabled (R17), the hall
  flies a clear FREE PLAY / フリープレイ banner (canvas, EN/JA via
  i18n) so nobody hunts for a coin slot.
- R34.2 Banner visibility is a pure function of the free-play flag;
  unit-tested; coin mode hides it. Presentation only — the flag is
  read from the existing hall channel, no new protocol fields.

## R35 — Standing-at-cabinet focus ring

- R35.1 With the "you are here" token standing on a cabinet tile,
  that cabinet gets a subtle 1982 focus ring so the active machine
  reads instantly in a busy hall.
- R35.2 Pure `cabinetFocus(playerTile, cabinetTiles)` helper —
  deterministic, unit-tested, highlights at most one cabinet.
  Renderer-only; no core/protocol/sim changes.

## R36 — NEW RECORD canvas flash

- R36.1 When a finished run posts a score that enters the cabinet's
  top table, the client flashes a short NEW RECORD / 新記録 canvas
  overlay (EN/JA) over the game-over screen. No alert/prompt; no
  change to scoring rules or high-score persistence shape.
- R36.2 A pure `isNewRecord(score, tableScores, maxRows)` helper
  decides; unit-tested. A timing helper auto-clears the flash.

## R37 — Attract INSERT COIN blink

- R37.1 Idle coin-mode cabinets (attract/demo, not out-of-order, not
  live) blink an INSERT COIN / コインを入れて frame on the mini-screen
  via a pure `blinkOn(tick, period, duty)` helper — deterministic,
  unit-tested.
- R37.2 Presentation only. Free-play hides the blink (R34 covers
  that mode); OUT OF ORDER (R24) and NOW PLAYING (R28) win over it.

## Constraints for R33-R37

- GPL-3.0-only; canvas-only UI; chiptune only; TypeScript strict; the
  core stays pure. Real-ws server checks from /tmp scripts when
  seating/sockets/credits are touched. When green: commit, push,
  summary with the new test count.

## R38 — Pixel art assets (Grok Imagine pipeline)

- R38.1 Client-only art under `packages/client/static/art/` (PNG).
  Core never loads Image/DOM/fetch. A small manifest helper (pure
  path list) is unit-tested.
- R38.2 Style: 1982 Tokyo arcade / CRT, limited palette, pixel feel
  that survives 320x240 upscale. Own art / GPL-compatible — no
  copyrighted sprites from commercial games.
- R38.3 First batch (placeholders until Cursor drops real PNGs with
  the same filenames): `hall-floor.png`, `cabinet-bezel.png`,
  `coast-lo-castle.png`, `splash-logo.png`.
- R38.4 Client loads assets async; renderers `drawImage` where they
  fit. Missing/failed load falls back to the existing procedural
  drawing (never a crash). Tests mock Image or cover only the
  path/manifest helpers.
- R38.5 AGENTS.md documents the handoff: Cursor/Grok Imagine
  delivers PNGs into `static/art/`; OpenCode writes code/wiring only.
  Bundle budget R7.4 — keep files small (ideally 16-32 KB each).

## R39 — Attract demo speed tiers

- R39.1 A pure helper `attractDemoTier(idleMs)` maps how long a
  cabinet has stood without a human seat to slow/normal/fast;
  attract bots tick-skip via the tier (pure `demoRuns` helper),
  deterministic and unit-tested.
- R39.2 Presentation: an optional tiny tier indicator; no protocol
  change beyond what demos already use.

## R40 — Cabinet power LED

- R40.1 Every cabinet has a power LED: dim when idle, bright on NOW
  PLAYING, red pulse when OUT OF ORDER. A pure `powerLed(state)`
  helper returns color/duty; renderer-only.
- R40.2 Unit-tested LED states with priority OOO > playing > idle.

## R41 — High-score roll crawl

- R41.1 On an idle cabinet mini-screen, the top-3 high scores
  (name + score) crawl vertically via a pure
  `scoreCrawlOffset(ms, rowH, period)` helper — deterministic, EN/JA
  labels via the existing i18n.
- R41.2 An empty table falls back to the existing attract text. No
  simulation changes.

## R42 — Operator note / sticker

- R42.1 The service menu can set a short hall sticker string
  (max 24 chars, validated on the server), persisted in
  service.json.
- R42.2 The hall shows the sticker as a 1982 canvas decal (EN/JA
  label); empty hides it. Tests cover validation, persistence and
  junk rejection.

## Constraints for R38-R42

- GPL-3.0-only; canvas-only UI; chiptune only; core stays pure; no
  new npm dependencies. Real-ws server checks from /tmp scripts when
  sockets/credits/service data are touched. When green: commit,
  push, summary with the new test count.

## R43 — Join-queue waiting dots

- R43.1 When a cabinet is NOW PLAYING (R28) and the standing player
  is on that tile but not seated, the mini-screen shows a compact
  WAIT / 待機 with animated dots from a pure `waitDots(tick, period)`
  helper — deterministic, unit-tested. The R30 soft-reject toasts
  stay as-is for failed joins; this is the calm waiting cue.
- R43.2 OUT OF ORDER (R24) and seated play win over the dots.
  Renderer/client only; no protocol change.

## R44 — Coin-slot thunk SFX

- R44.1 On a successful coin insert (the existing R18 path), a short
  chiptune thunk plays through the existing Web Audio stack — no new
  deps, no copyrighted samples. Mute and the operator volume detent
  (R23) apply like on every other sound.
- R44.2 The envelope/timing helper is pure and unit-tested where
  feasible; wiring follows the existing audio patterns. Missing
  AudioContext fails closed.

## R45 — Hall wall clock

- R45.1 A neon wall clock (HH:MM, 24h) draws on the hall back wall.
  `formatHallClock(epochMs, tzOffsetMin)` is pure (no Date.now inside
  helpers; the source is injected) and unit-tested; the renderer gets
  wall time from the client loop.
- R45.2 EN/JA label, tiny; presentation only — no sim or protocol
  involvement.

## R46 — Art pack 2 (manifest + placeholders)

- R46.1 The R38 manifest gains `marquee-neon.png`, `coin-slot.png`,
  `credit-panel.png`, `wait-badge.png`, with tiny palette
  placeholders (<1 KB) until Cursor drops real 16-32 KB PNGs under
  the same filenames.
- R46.2 drawImage is wired where they fit (marquee strip, coin slot
  chrome, credit-strip backdrop, wait badge); procedural fallbacks
  stay. Core never touches Image/DOM/fetch. AGENTS lists the new
  drop-zone filenames. Bundle budget R7.4.

## R47 — Thank-you exit toast

- R47.1 When a seated player leaves a cabinet (stand up / session
  end), a short THANKS / ありがとう canvas flash plays (~1.2 s) via a
  pure `exitToastVisible(sinceMs, nowMs, durMs)` helper,
  unit-tested.
- R47.2 No alert/prompt and no scoring changes. The R36 NEW RECORD
  flash wins if both would show.

## Constraints for R43-R47

- GPL-3.0-only; canvas-only UI; chiptune only; TypeScript strict; the
  core stays pure; no new npm dependencies. Real-ws checks from /tmp
  scripts when sockets/credits/service are touched. When green:
  commit, push, summary with the new test count.

## R48 — Attract demo volume dip

- R48.1 When a human sits at a cabinet, the attract/demo chiptune
  channel ducks (pure `attractGain(hasHuman)` helper) so live sfx
  cut through; full gain resumes when the seat empties.
  Presentation/audio only — no simulation changes.
- R48.2 Unit tests for the gain helper; operator mute (R23) still
  wins over everything.

## R49 — Cabinet heat shimmer

- R49.1 An idle cabinet that has been attracting for a long time
  gets a subtle heat/scanline shimmer from a pure
  `heatShimmer(idleMs, tick)` helper (offset + alpha).
  Renderer-only, deterministic, unit-tested.
- R49.2 OUT OF ORDER and NOW PLAYING suppress the shimmer.

## R50 — Versus ready countdown

- R50.1 When a versus table's required seats are all filled, a
  canvas READY 3-2-1 plays before the game starts ticking — a
  server-authoritative window (same moment for every client), derived
  by the pure `readyCountdown(msSinceFull)` helper.
- R50.2 Tests: countdown length, cancel when a seat empties, and no
  new client frame exists for it (nothing to forge; existing edge
  validation stands).

## R51 — High-score initials glow

- R51.1 While the initials pad is open, the current slot glows via a
  pure `initialGlow(tick)` pulse helper; EN/JA copy unchanged.
- R51.2 Renderer-only; the namepad protocol is untouched.

## R52 — Operator test tone

- R52.1 The service menu gets TEST TONE: a short client-side
  chiptune beep (existing Web Audio stack, core stays pure),
  rate-limited by a pure helper.
- R52.2 Mute (R23) is respected; rate-limit helper unit-tested.

## Constraints for R48-R52

- GPL-3.0-only; canvas-only UI; chiptune only; TypeScript strict; the
  core stays pure; no new npm dependencies; no new PNG art from the
  agent (Cursor delivers after 22:00). Real-ws checks from /tmp when
  seating/sockets are touched. When green: commit, push, summary
  with the new test count.

## R53 — Playtest UX: fullscreen (playtest feedback)

- R53.1 Entering the hall auto-requests browser fullscreen (Fullscreen
  API, graceful no-op where missing); `F` toggles it; Esc / normal
  browser exit always works — no locked kiosk.
- R53.2 A first-run canvas hint ("F: FULLSCREEN") shows for a fixed
  window. Pure helpers `shouldRequestFullscreen(scene)` and
  `fullscreenHintVisible(msSinceHallEnter, windowMs)` — the window
  counts from the first hall entry, never from boot (fix: splash +
  title ate the whole window before the hall was ever seen); the
  Fullscreen API itself is manually verified. Presentation only.

## R54 — UX shell & branding (product-owner review, post-R53)

Player-facing brand is **Tokyo Arcade 1982**: splash, hall chrome,
attract, waiting, credits and the HTML shell all carry it; internal
paths/protocol keep `arkad`. EN/JA tables updated in lockstep.

- R54.1 Splash is a warm 1982 entry: lantern string, one intentional
  wordmark (white body, single deep-magenta shadow, amber year line),
  quiet warm boot lines and a real invitation ("PRESS SPACE TO COME
  IN"); the rainbow-glitch logo and colour bar are gone.
- R54.2 Hall cabinets carry game identity: marquee shows the translated
  title (`game.<id>`) on a lit band, idle screens draw a procedural
  thumbnail in the cabinet's accent (`cabAccent`, unit-tested) instead
  of static; floor grid calmed; legend moved clear of the player token.
- R54.3 Waiting-for-players is a hosted-table panel (your seat taken,
  one open seat blinking, retry hint, ESC) — no more empty void.
- R54.4 Attract soundtrack: `static/audio/Late_Night_Cabinet.mp3`
  (Lyria 3.5 instrumental; may carry an AI watermark; repo stays
  GPL-3.0-only) loops on splash/hall/attract chrome via Web Audio,
  stops inside a cabinet, honours operator volume/mute (R23), fails
  closed when missing. Chiptune (R23) remains the games' own voice.
- R54.5 Coast READY stinger: Pole Position-style
  `static/audio/coast_yosen_start_ja.mp3` (「予選スタート！」) plays
  once per Coast table when it enters READY; mute-safe, fail-closed.
  Pure `readyStingerDue()` / `attractMusicActive()` helpers unit-tested.
- R54.6 LO Castle (LO-borgen) is Coast's primary landmark: larger,
  sun-haloed, flag on the keep, far-distance parallax; PNG plus
  procedural fallback. `static/art/coast-lo-castle.png` is a real
  size-gated drop (≥64 px, 16–32 KB class); P1-6 still ignores sub-64
  stubs. Draw scale is Fuji-wide on the horizon (R56), not a 16×16 stretch.
- R54.7 Drive-past roadside billboards along the coast road — stylized
  8-bit Swedish nostalgia tableaux (Center tree, Harpsund dinghy,
  Bommersvik lodge, Valdebatt '76, Palme in Havana) at fixed track
  distances; `static/art/coast-*.png` in the R38 manifest are real
  paletted PNG drops (not JPEG named `.png`). Homage scenery, not
  propaganda. Landmark *moments* — they must not clutter the vanishing
  point every frame (R56).

## R55 — Circuit d’Or / サーキット・ドール / Guldvarvet (queued)

Eighth cabinet. This item is the canonical contract. **Do not implement
gameplay until soak is done** (Monday 2026-09-21 ~06:00 CEST plus E2E)
unless the owner says implement now. Childhood memory: Atari 1976
circuit / endurance from an overview camera — a bright track you read
at speed, not a Night Driver void and not Coast Runner’s (R22)
behind-car camera.

Never ship the string “Le Mans” on marquees, UI, i18n, or filenames.

- R55.1 Game id: `circuit` (or `or` if that collides). Titles, EN/JA
  lockstep: Circuit d’Or · サーキット・ドール · optional SV Guldvarvet.
- R55.2 Same house rules as every cabinet: pure `packages/core`,
  server-authoritative, canvas renderer, chiptune, EN/JA. Hall presence
  like R22.5 (marquee, attract demo, high scores, map). Solo-first in
  v1; versus is out of scope until a later R.
- R55.3 After soak the hall has **eight** cabinets. Until then the live
  count stays seven (R2 + R22). This item is not a license to land
  `games/circuit` now.
- R55.4 Look: bright circuit, readable at speed. Not Night Driver. Not
  the R22 Coast camera.

## R56 — Coast look: Pole Position / early OutRun (not Night Rider)

Coast (R22) is an OutRun-feel drive with Pole Position chrome and the
R54.5 「予選スタート！」 call. A frozen cabinet frame must read **1982–83
Japanese arcade racing**, never a dark sparse C64 Night Driver / Night
Rider tunnel. Visual bar on top of R22 / R54 — not a new camera, not a
new game.

- R56.1 Sky is a bright daytime or clear-dusk band (saturated arcade
  RGB, high contrast against the road). Navy/black void fills are a
  spec fail. Unit-tested via luma of the palette constants.
- R56.2 The road is a vanishing-point trapezoid with grass shoulders,
  striped rumble, and a dashed center line. It must not paint a
  full-width gray slab that eats the grass at the horizon.
- R56.3 The player car is a chunky rear-view sprite (Pole Position
  weight — body ≥64 px wide on the 320×240 playfield), not a speck.
- R56.4 Roadside rhythm: striped posts and trees at a fixed scroll
  step so the shoulder reads at speed. Presentation only; core
  obstacles stay data (`kind` + position). Swedish billboards (R54.7)
  and LO-borgen (R54.6) are *moments*, not a postcard on every frame.
- R56.5 Qualifying overlay `t('coast.qualifying')` still shows ~3 s
  after the first seated Coast snapshot, independent of phase (P1-A /
  R54.5). The Lyria stinger still fires once per table. Do not regress.
- R56.6 HUD TIME / OFF ROAD / speed units stay in lockstep EN+JA
  (metric km/h on this Tokyo cabinet). Chunky arcade digits, not a
  modern minimal overlay.
- R56.7 A frozen-frame recorder test (mock canvas) must see sky + road
  + chunky car + roadside fills — a black-tunnel ratio is a fail.

## R57 — Art ID catalog (Wave 3)

Stable Imagine PNG IDs. **R55 is Circuit d’Or only.** Hall / cabinet
pixel-art must not reuse R55. Full inventory tables land in `ART.md`
with Wave 3. (A Wave 3 draft briefly numbered these IDs as R55; they
are R57.) This change does not take `ART.md`.

Reserved bands (filenames already in R38 / R46 / R54):

- R57.1–R57.7 Hall / splash chrome (`hall-floor`, `cabinet-bezel`,
  `splash-logo`, `marquee-neon`, `coin-slot`, `credit-panel`,
  `wait-badge`).
- R57.8–R57.9 Reserved per-cabinet filenames not yet in `ART_FILES`;
  JPEG pilots already off the static path (P2-C).
- R57.10–R57.30 Per-cabinet hero / marquee / attract (7×3).
- R57.40–R57.45 LO-borgen + five Coast billboards — Wave 1 landed the
  PNG drops (R54.6 / R54.7).
- R57.50 No fake 16×16 “heroes”; a drop under 64 px does not land.
- R57.51 Provenance names Coast PNGs after Wave 1; hall chrome stays
  procedural until Wave 3.

Coast landmark PNGs landed with Wave 1. Hall / six-cabinet plates still
await Wave 3. 16×16 stubs are not landed (P1-6).

## Lab — Jev self-play & 1-minute autoplay (all cabinets)

Operator/autotest flag, not a cabinet R-feature. Does not change R8.1–R8.5.
Adapters live in `packages/server/src/jevPolicy.ts`; core stays pure (no
fetch). Notes: [`JEV.md`](JEV.md).

- Enable: `ARKAD_JEV_SELFPLAY=1` + `TYPESAFE_API_KEY` (env or gitignored
  `.env.typesafe`). Attract demos of ALL seven cabinets consult Jev at
  ~8 Hz with compact JSON state; missing key/HTTP/low-confidence
  fail-closed to `spec.demo`.
- Harden: flaky network/408/429/5xx retry once then fail-closed; logs never
  print the API key or Bearer token; confidence must be finite and in
  `[floor, 1]`; shared ~8 Hz rate limit (`JEV_MIN_INTERVAL_MS`).
- MUST Block: payload carries predicted landing x, signed error vs
  `paddleCenter`, and `dy` sign. Legal `stay` is dropped when `|error|` is
  large. Rubric is “line up under the predicted landing”. Tests: falling
  left → left/right; aligned → stay; low confidence → demo fallback.
- MUST Myriad: payload carries nearest-segment dx/dy/manhattan, in-column,
  mushrooms-in-column, and fire-would-hit. Fewer legal choices when safe
  (omit fire when beside). Tests: above+clear → fire; beside → dodge; low
  confidence → demo; honour the per-game floor (0.25).
- SHOULD Galaxy: boolean alien-directly-above; omit `fire` when the sky
  above the ship is empty. Test: empty sky → fire is not always legal.
- SHOULD Coast: if an obstacle sits on the current line ahead, legal/rubric
  push left/right — not always `straight`. Test: obstacle dead ahead →
  `straight` illegal.
- One-minute autoplay per cabinet (mock-fetch unit tests cover all
  games; the live harness runs outside the vitest suite):
  `ARKAD_JEV_AUTOPLAY_SECONDS=60 npm run jev:autoplay` — prints
  ticks/calls/ok/avg-confidence per cabinet and exits 0; without a key
  every game is skipped with a log line.
- Optional soak: `ARKAD_JEV_SOAK_MINUTES=5 npm run jev:soak` writes
  `data/jev-soak.json` (gitignored; override with `ARKAD_JEV_SOAK_REPORT`).
