# ARKAD — Tokyo Arcade Hall 1982 🕹️

Six classic arcade cabinets from the golden age, rebuilt in TypeScript with
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
on the hall wall. Pixel art (R38) drops into `static/art/` — missing
files fall back to procedural drawing. Attract
signage alternates English and Japanese on its own timer, and a tournament
banner tracks the live leader of the hall.

## The hall is alive (1982 mode)

The game select is not a menu — it is a rendered arcade hall: six cabinets
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

## Difficulty

Every cabinet ramps up per level, and the shared adaptive curve
(`packages/core/src/difficulty`) eases off when a player dies a lot and
pushes harder when a player is cruising — never boring, never unfair.

## Architecture

```
packages/
  core/      pure game logic (no DOM, no Node): engines, six games,
             i18n (EN/JA), difficulty, protocol, chiptune note tables
  server/    Node + ws: lobby, tables, authoritative 60 Hz loop, high scores
  client/    Canvas 2D renderer, Web Audio chiptune synth, scenes
```

Core is deterministic and framework-free: the server runs the simulation and
broadcasts snapshots; clients render and send input. All game rules are
unit-testable without a browser or network.

## Development (test-driven)

```sh
npm test          # vitest: 352 tests across engine, games, server, client
npm run typecheck # tsc
npm run build     # bundles server + client into dist/
```

Every feature was written test-first: a failing spec, then the code that
makes it green.

## Sound

No audio files — every bleep, crumb-munch and exploding ghost is synthesized
live with Web Audio square/triangle/noise channels, the way the hardware
did it.

## License

Copyright (C) 2026 Jens Abrahamsson.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, **version 3 only** (`GPL-3.0-only`) — see [`LICENSE`](LICENSE).
