# ARKAD — Tokyo Arcade Hall 1982 🕹️

Seven classic arcade cabinets from the golden age, rebuilt in TypeScript with
authentic 1982 flavor: CRT scanlines, synthesized chiptune sound, coin drops
and a Japanese arcade hall atmosphere. Play solo or challenge your friends on
the same LAN.

## Run it

```sh
npm install
npm run build
npm start            # prints the LAN address, e.g. http://192.168.50.185:8442
```

Open the printed address in any browser — on the host machine or any device
on `192.168.50.x` / `10.x`. No installation on the clients.

Env: `ARKAD_PORT` (default 8442), `ARKAD_DATA` (default `./data`).
Optional Jev attract self-play (all eight cabinets): `ARKAD_JEV_SELFPLAY=1`
plus `TYPESAFE_API_KEY` (TypeSafe Jev; local file `.env.typesafe` at the
repo root, gitignored, never commit it). Unset key fail-closes to the
built-in demo bots. Live one-shot: `npm run jev:smoke` (skips if the key
is unset). One-minute autoplay per cabinet:
`ARKAD_JEV_AUTOPLAY_SECONDS=60 npm run jev:autoplay` (~7 min total, prints
an action/confidence summary, exit 0). See [`JEV.md`](JEV.md) for attract
self-play tuning. Soak: `ARKAD_JEV_SOAK_MINUTES=5 npm run jev:soak`
(JSON under `data/`, gitignored). Show-floor smokes (muted, not a
human Mac, not fullscreen Chrome): `npm test` is the required path;
optional muted headless CDP is in `AGENTS.md`.

## Demo hall (operator)

Trusted LAN only. Operator frames `ooo` / `freePlay` / `note` are open
on the wire — there is no PIN. Do not expose the port to the internet.

1. `npm install && npm run build && npm start`
2. Hold `Shift+S` for SERVICE MODE, then `F` for FREE PLAY. (Outside
   the service menu `F` is fullscreen, R53.)
3. `V` / `M` in the service menu for volume / mute. Attract loop
   `Late_Night_Cabinet.mp3` plays on splash/hall only; it goes silent
   inside a cabinet.
4. Jev without anyone at the stick: gitignored `.env.typesafe`
   (`TYPESAFE_API_KEY`). Hall demos: `ARKAD_JEV_SELFPLAY=1` (missing
   key fail-closes to the built-in bots). One cabinet:
   `npm run jev:smoke`. One minute per cabinet:
   `ARKAD_JEV_AUTOPLAY_SECONDS=60 npm run jev:autoplay`. Optional muted
   CDP is in `AGENTS.md` — localhost, `--mute-audio`, never fullscreen
   on someone else's Mac.

Coin-mode reconnect: same name + language within 60 s returns to the
same seat with no extra credit. The in-memory wallet is keyed
`name|lang` (two players who pick the same AAA tag share coins). Never
written to disk.

## Cabinets

| Cabinet      | 1982 inspiration | Solo | VS. Duel |
|--------------|------------------|------|----------|
| SNAKE / ヘビ | Blockade, Tron   | ✅   | ✅ 2–4 players, Tron-style, last tail alive wins |
| PUCK MAZE / パックメイズ | Puck-Man | ✅ | ✅ VS. System style: alternating turns, best score wins |
| BLOCK BATTLE / ブロックバトル | Breakout Duel | ✅ | ✅ first to 7 goals |
| GALAXY RAIDER / ギャラクシーレイダー | Galaga | ✅ | — |
| RIVER FROG / カエルのリバー | Frogger | ✅ | — |
| MYRIAD / ムカデ | Centipede | ✅ | — |
| COAST RUNNER / コーストランナー | OutRun (1986) — the road to **LO Castle**, Liseberg | ✅ | — |

## Controls

- **Move:** Arrow keys or WASD — cursor keys work everywhere, always paired
- **Start / coin:** `Space` — first press opens the marquee keyboard (in-canvas, arrow keys + `Z`, up to 12 chars — no browser dialog)
- **Fire / button:** hold `Space` (or `Z`/`J`) inside a cabinet — galaxy and myriad shoot, paddles and the stick respond everywhere
- **Solo:** `Z` · **VS. duel:** `X` · **High scores:** `H` · **Hall map:** `M` · **Credits:** `C` · **Language EN/JP:** `L` · **Back:** `Esc` / `B`
- **Operator service menu:** hold `Shift` + `S` — bookkeeping (plays, coins, uptime), free-play/coin toggle, CRT knobs (`Q`/`W`/`E`), accessibility palette (`A`), master volume detent + mute (`V`/`M`), cabinet OUT-OF-ORDER switch (`O`, persists + broadcasts); seats can pause with `P`

Operator commands (`Shift+S`, the `O` switch, the free-play toggle) are
trusted-LAN conveniences — there is no keycard on the service door, so do
not expose the hall to the internet.

The hall starts in coin mode: watch the coin drop into the slot before the
cabinet wakes up, or flip it to FREE PLAY from the service menu. Live
cabinets light a NOW PLAYING lamp, crowd badges count the onlookers,
rejections surface as 1982 canvas toasts, the operator log keeps
today's plays and coins beside the lifetime totals, credit digits
ride the hall channel, a FREE PLAY banner flies in free-play mode,
the standing cabinet gets a focus ring, finished runs flash NEW
RECORD, idle coin cabinets blink INSERT COIN, cabinets carry power
LEDs and rolling top-3 boards, and the operator can slap a sticker
on the hall wall. A dropped socket parks leftover coins in memory
for 60 s under `name|lang` (arcade convention: two players who pick
the same tag share the wallet) and puts you back at the same cabinet
without another coin if the table is still up — never written to disk. Pixel art
IDs (R57) and the drop-zone inventory live in [`ART.md`](ART.md) —
`static/art/` is the Imagine PNG drop zone; 16×16 stubs and missing
files fall back to procedural drawing. Attract
signage alternates English and Japanese on its own timer, and a tournament
banner tracks the live leader of the hall.

## The hall is alive (1982 mode)

The game select is not a menu — it is a rendered arcade hall: eight cabinets
with lit marquees, floor reflections and a "you are here" token you walk
around with the arrow keys. Every idle cabinet runs a live attract demo
(built-in deterministic bots playing their own games), so the hall hums
like a real one even at 3 AM. Drop a coin and the demo steps aside
instantly. `M` opens the floor plan, `C` the credits, and opening the
high-score board gets its own chiptune jingle. A boot splash starts it all.

## Multiplayer over the LAN

One machine runs the server (it is the arcade hall — it keeps the tables,
the simulation and the shared high-score board in `data/scores.json`).
Everyone else just opens the URL in a browser. Pick a game and mode; if a
cabinet already has a duel running, extra players become spectators — just
like real 1982. Snake is the one free-for-all cabinet: its table seats up to
4 players (tables deal when full, or a couple of seconds after player two).
Coast Runner versus is a top/bottom split of the night road. Circuit d'Or
versus puts both cars on the same overview. Press `X` the way snake versus
already seats a second player. The joiner does not debit the seated wallet;
free play seats both for nothing. The marquee stays Circuit d'Or.

## Difficulty

Every cabinet ramps up per level, and the shared adaptive curve
(`packages/core/src/difficulty`) eases off when a player dies a lot and
pushes harder when a player is cruising — never boring, never unfair.

## Architecture

```
packages/
  core/      pure game logic (no DOM, no Node): engines, eight games,
             i18n (EN/JA), difficulty, protocol, chiptune note tables
  server/    Node + ws: lobby, tables, authoritative 60 Hz loop, high scores
  client/    Canvas 2D renderer, Web Audio chiptune synth, scenes
```

Core is deterministic and framework-free: the server runs the simulation and
broadcasts snapshots; clients render and send input. All game rules are
unit-testable without a browser or network.

## Development (test-driven)

```sh
npm test          # vitest: 659 tests across engine, games, server, client
npm run typecheck # tsc
npm run build     # bundles server + client into dist/
```

The integer is this checkout's `npm test` total. Bump it here, in
`AGENTS.md`, and in R7.2 in the same commit as the tests. Do not copy
counts from unmerged PRs.

Every feature was written test-first: a failing spec, then the code that
makes it green.

## Sound

Almost every bleep, crumb-munch and exploding ghost is synthesized live with
Web Audio square/triangle/noise channels, the way the hardware did it. The
single documented exception (R54): two Lyria 3.5 MP3s — `Late_Night_Cabinet`
as the hall's attract/splash loop and `coast_yosen_start_ja` as the Coast
READY call, played exactly once per Coast table. Operator volume/mute
applies to them, a missing file fails closed to silence, and core never
touches audio. The credits wall (press `C`) carries the same provenance
as the caps, pixel art included:
`CHIPtune: LIVE WEB AUDIO` ·
`ATTRACT TRACK: LATE NIGHT CABINET (LYRIA 3.5)` ·
`READY CALL: COAST YOSEN START JA (LYRIA 3.5)` ·
`PIXEL ART: HALL CHROME + SEVEN CABS + COAST` ·
`LICENSE: GPL-3.0-ONLY`.
Hall chrome, seven-cabinet plates, and Coast landmarks already landed
(R56 / R57); missing files still fall back to procedural drawing.
No extra Lyria files.

## Pixel art (R38 / R46 / R54 / R57)

Drop real PNGs into `packages/client/static/art/` using the filenames in
[`ART.md`](ART.md) (catalog IDs R57.1–R57.54). Style: 1982 Tokyo arcade,
limited palette, typically 16–32 KB, ≥64 px on at least one axis. The
loader ignores 16×16 placeholders, so a stub never beats the procedural
drawing that already stands alone. JPEG Imagine pilots for Coast
billboards live in `packages/client/art-pilots/*.jpg` — not served.

Wave 3 landed paletted hall chrome (R57.53) and marquee + attract +
hero plates for all seven cabinets including Coast
(R57.52 / R57.54). Coast landmark PNGs already landed with Wave 1 (R56).

## LinkedIn shots (canvas, not OS chrome)

1920-ish capture of the **canvas** — not browser chrome, not a coworker
Mac, not fullscreen stolen from the cloud. English pass, then `L` for
the JA pair. `jev:autoplay` or hall attract keeps the cabinets alive.

1. Splash — two lines TOKYO ARCADE + amber 1982.
2. Hall — eight live attract cabinets, one chrome row, title Tokyo Arcade 1982. Circuit d'Or is the eighth.
3. Coast — 「予選スタート！」 ~3 s, then billboards + LO castle.
4. Snake versus in the hall mini (NOW PLAYING).
5. Puck / Block / Galaxy / River / Myriad — one hero frame each, not a 16×16 stub.
6. Waiting / INSERT COIN under the CRT.
7. Credits row: chiptune + Lyria attribution, honest pixel-art line.

## License

Copyright (C) 2026 Jens Abrahamsson.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, **version 3 only** (`GPL-3.0-only`) — see [`LICENSE`](LICENSE).
