# Pull request archive

The original pull requests of this repository were lost when the repository was recreated on 2026-10-24. This file preserves their titles, dates, branches, descriptions and comments as plain text. Commit hashes and links from the old history have been removed because they no longer exist.

## PR #1

PR #1: content omitted.

## PR #2: P2-A–J: review fixes (R6/R54, provenance, pilots, demo pause, i18n)

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/p2-review-fixes-6f72` → `main`
- Opened: 2026-09-20 18:28 UTC
- Merged: 2026-09-20 19:08 UTC

### Description

FIX-ONLY from the 2026-09-20 code review. Baseline `[sha removed]`. No new feature R-batches.

#### P2-A…J (already on this branch, `[sha removed]`)

R6/R54 docs, provenance, JPEG pilots out of static, demo-tick pause, hall i18n chrome, JA title/HAVANNA/キロ, reconnect/pause helpers, credit park `name|lang`, MP3 duration smoke.

#### P1-A / P1-B (this push, `[sha removed]`)

- **P1-A** Coast 「予選スタート！」 is visible on solo: overlay for 3 s after the first seated Coast snapshot (`coastAnnouncedFor` + clock), independent of `phase`/`readyAt`.
- **P1-B** Drop parks the live table under `name|lang` (same grace as `parkCredits`). Reconnect `start` reseats without debit if the table lives; lapsed grace is a normal start (`insert-coin`). Client no longer invents versus when `lastStart` is null.
- **P1-C** left as trusted-LAN (no PIN).

#### Verify

`npx tsc -b && npm test && node build.mjs`, then `npm test` again. **457** tests.

Free-play soak: splash → hall → Coast (should see QUALIFYING START! / 予選スタート！ for ~3 s) → drop the tab / kill Wi-Fi → reopen same name → same run, no extra coin. `Esc` still hands the cabinet back to attract.

### Comments

_(no comments)_

## PR #3: R57.53/54: hall chrome and six-cabinet hero sheets

- Status: merged
- Author: Jens Abrahamsson
- Branch: `wave3-art-ids` → `main`
- Opened: 2026-09-20 19:17 UTC
- Merged: 2026-09-21 15:30 UTC

### Description

Wave 3 leftover on the R57 catalog: paletted hall/splash chrome (R57.1–7) and hero sheets for six cabinets. Coast belongs to PR #8 — `coast-*.png` and the Coast renderer are untouched. R55 stays Circuit d’Or (not implemented).

#### Landed

Paletted PNG, color-type 3, ≥64 px, 16–32 KB:

- **R57.53 hall chrome:** `hall-floor`, `cabinet-bezel`, `splash-logo`, `marquee-neon`, `coin-slot`, `credit-panel`, `wait-badge`
- **R57.52 marquee + attract** (already on this PR): snake, puck, block, galaxy, river, myriad
- **R57.54 hero sheets:** `snake|puck|block|galaxy|river|myriad-hero.png`

`cabinetArtFile('coast', …)` is null. `coast-lo-castle.png` stays the 16×16 stub. Live attract demos (R8) still win over idle cards. Hero sheets are title spotlight + ready overlay, never gameplay.

Wiring: skip the dark cabinet body wash when a bezel is present; splash uses `splash-logo.png` via `drawImage` (else `drawWordmark`).

#### Provenance

Credits wall: `PIXEL ART: HALL CHROME + SIX CABINETS` / `WATERMARK-CHECKED; COAST STILL PROCEDURAL` — does not claim a full original set.

#### Tests

`tsc -b` clean · `npm test` ×2 (**466**) · `node build.mjs` ok. Hall screenshot is a real six-cabinet floor (wood bezels, klinker tile, neon strip), not the namepad. SHA `[sha removed]`.

### Comments

_(no comments)_

## PR #4: Wave 0: stabilize free-play smoke and document muted CDP/Jev

- Status: merged
- Author: Jens Abrahamsson
- Branch: `wave0-stabilize-smoke` → `main`
- Opened: 2026-09-20 19:20 UTC
- Merged: 2026-09-21 15:29 UTC

### Description

P1-A/B already merget på `main` (PR #2: Coast qualifying overlay oberoende av phase, reconnect utan ny debit). Den här PR:n är bara Wave 0 — inga Wave 1–7, inga nya R-batchar, trusted LAN lämnas öppen för `ooo`/`freePlay`/`note`.

#### Vad som redan var grönt
- Coast `QUALIFYING START!` / `予選スタート！` i 3 s efter första sittande snapshot (`coastQualifyingOverlay`)
- Stinger-due + Lyria MP3-duration
- Reconnect reseat utan debit (`CREDIT_RECONNECT_GRACE`)
- Pause håller credits (FakeNet + real-ws)
- Hall watcher ser live snake versus (P1-1 / P1-7b)
- Escape/back till hall

#### Vad som lades till
- Ren boot-väg: `splashAdvance` → `titleStartTarget` → namepad → 7 kabinett
- `nextLang` (L), `isBackHomeKey` (Escape/KeyB), `cabinetScreenData` (hall-mini visar live versus)
- Sammansatt free-play-smoke: FakeNet + real-ws (Coast → back → snake versus i hallen → pause → lang)
- AGENTS.md: muted headless CDP (localhost, `--mute-audio`, aldrig fullscreen / Jens Mac) + Jev autoplay

**Tester:** 457 → **465**. `tsc -b && npm test` ×2 + `node build.mjs` gröna.

Ingen fullscreen Chrome, ingen Mac-desktop. CDP är dokumenterat, inte kört mot en mänsklig skärm.

### Comments

_(no comments)_

## PR #5: Wave 5: Wi-Fi reconnect soak (kill-socket Coast, lapsed grace, name|lang)

- Status: merged
- Author: Jens Abrahamsson
- Branch: `wave5-reconnect-soak` → `main`
- Opened: 2026-09-20 19:27 UTC
- Merged: 2026-09-21 15:29 UTC

### Description

Honesty tests only — P1-B on main already reseats without debit; this PR proves the Wi-Fi drop path and the two FakeNet gaps that arcade.test.ts did not cover.

#### What was already on main
- FakeNet Coast reseat + leftover credits (`arcade.test.ts` P1-B)
- FakeNet lapsed grace → `insert-coin` error (P1-B, snake)
- Pause snapshots keep credits (`arcade.test.ts` P2-1)
- Pause over real ws keeps snapshots + a credits number (`http.test.ts` P2-H) — **not duplicated**
- README already notes the `name|lang` 60 s parked wallet

#### What this PR adds (`packages/server/src/wave5ReconnectSoak.test.ts`, +4)
1. **Real ws `terminate()` mid-solo Coast** (coin mode, two coins): same `name|lang` within grace → same table, same leftover credit, new conn id on the seat.
2. **Lapsed grace → normal start:** `insert-coin`, then a fresh Coast deal (clock resets; cabinet id stays `demo-coast` on purpose).
3. **`reconnectKey` + lang pocket:** `AKIRA|ja` does not take `AKIRA|en` parked coins.
4. Pause-over-ws skipped (P2-H already there). README test count left for Wave 0 (this branch: **461**).

No `arcade.ts` change — P1-B held against abortive close. Core untouched. Hall mini-cache / Mac fullscreen out of scope.

#### Verify
`npx tsc -b && npm test && node build.mjs` ×2 — 461 passed, build ok. SHA `[sha removed]`.

### Comments

_(no comments)_

## PR #6: Wave 4: Jev attract harden (retry, Block/Myriad, Lab bullets)

- Status: merged
- Author: Jens Abrahamsson
- Branch: `wave4-jev-harden` → `main`
- Opened: 2026-09-20 19:31 UTC
- Merged: 2026-09-21 15:29 UTC

### Description

Operator/autotest Jev attract for all seven cabinets. Core stays pure; mock-fetch only in CI; no secrets.

#### Lab (REQUIREMENTS.md, same PR)

- **MUST Block:** predicted `landX`, signed error vs paddle, `dySign`; drop `stay` when `|error|` is large.
- **MUST Myriad:** nearest-segment dx/dy/manhattan, in-column, mushrooms, fire-would-hit; fewer legal choices when beside.
- **SHOULD Galaxy:** omit `fire` when the sky above the ship is empty.
- **SHOULD Coast:** drop `straight` when an obstacle sits on the current line.
- Harden: retry once on flaky network/408/429/5xx then fail-closed; confidence finite in `[floor, 1]`; ~8 Hz shared rate limit; logs never print the API key.
- No R55 (Circuit d’Or is queued elsewhere). Wave 3’s art catalog is out of scope.

#### Harness

- `ARKAD_JEV_SELFPLAY=1` + gitignored `.env.typesafe`; unset key fail-closes to `spec.demo`.
- `npm run jev:autoplay` stays green per game (mock). CLI skips without a key (confirmed: `0/7 cabinets played`).
- Optional: `ARKAD_JEV_SOAK_MINUTES=5 npm run jev:soak` → `data/jev-soak.json` (gitignored).
- Tuning notes: `JEV.md` (README one-liner; Wave 0 still owns AGENTS.md smoke/CDP).

#### Tests / gate

479 (was 457). `tsc -b && npm test` ×2 && `node build.mjs` green. Live 30s autoplay skipped here (no `TYPESAFE_API_KEY` / `.env.typesafe`). Author Jens Abrahamsson. SHA `[sha removed]`.

### Comments

_(no comments)_

## PR #7: R55 Circuit d’Or contract; R56 Coast look; R57 art IDs

- Status: merged
- Author: Jens Abrahamsson
- Branch: `wave-req-r55-circuit` → `main`
- Opened: 2026-09-20 19:32 UTC
- Merged: 2026-09-21 15:28 UTC

### Description

Docs-only hygiene. No Circuit gameplay, no soak changes, no Coast renderer / `jevPolicy` / `hall.ts` / `main.ts`.

#### What landed

- **Process** — accepted product requirements live in `REQUIREMENTS.md` as numbered R-items or Lab. Chat/PRs are not a substitute. One line in `AGENTS.md` points at that.
- **R55 Circuit d’Or / サーキット・ドール / Guldvarvet** — canonical eighth cabinet, queued until soak Mon 2026-09-21 ~06:00 CEST + E2E unless the owner says implement now. Game id `circuit` (or `or` if that collides). Solo-first v1. Bright circuit overview, not Night Driver, not the R22 Coast camera. Never ship the string “Le Mans”.
- **R56** — short Coast Pole Position visual bar (bright track, chunky rear car, roadside rhythm). Wave 1 fleshes the R-text in the same PR as the look. R22 / R54.5 overlay still required.
- **R57** — art catalog ID bands reserved here. **R55 is Circuit only.** This PR does not take `ART.md`.
- **Lab** — Jev adapter-tuning heading (Block/Myriad MUST, Galaxy/Coast SHOULD). Wave 4 fills measurements; no adapter implementation in this PR.

#### PR #3

Draft [PR #3]( still numbers the art catalog as R55. After this lands, rebase that PR and rename those IDs to **R57** in `REQUIREMENTS.md`, `ART.md`, and `README.md`. This PR stays small and does not stack on `wave3-art-ids`.

#### Out of scope

No `games/circuit`, no eighth-cabinet hall wiring, no PNG drops, no Jev adapter code.

### Comments

_(no comments)_

## PR #8: Wave 1: Coast show cabinet — Pole Position look (R56)

- Status: merged
- Author: Jens Abrahamsson
- Branch: `wave1-coast-show` → `main`
- Opened: 2026-09-20 19:32 UTC
- Merged: 2026-09-21 15:29 UTC

### Description

Show-floor Wave 1 for Coast Runner. Core stays pure. No AGENTS.md (Wave 0). No R55 (Circuit d’Or, queued). No Circuit gameplay. `main.ts` / `hall.ts` / seating untouched (Wave 2).

#### Look (R56)
Bright dusk vanishing-point road, grass shoulders, rumble, dashed center line, chunky rear-view car, striped posts/trees at a fixed scroll step. Frozen-frame test fails a Night Rider tunnel. Palette luma + car size + roadside density are unit-tested.

#### Art
Real paletted PNG (16–32 KB class, ≥64 px, not JPEG-as-PNG) in `ART_FILES`:
- `coast-lo-castle.png` (LO-borgen, Fuji-wide on the horizon)
- `coast-centerpartiet.png`, `coast-harpsund.png`, `coast-bommersvik.png`, `coast-valdebatt76.png`, `coast-castro-visit.png`

JPEG pilots stay in `packages/client/art-pilots/*.jpg` (not served). Provenance: Coast PNGs watermark-checked; hall still procedural.

#### Still green (P1-A / R54.5 / R56.5)
`coastQualifyingOverlay` still draws `QUALIFYING START!` / `予選スタート！` for 3 s after the first seated snapshot, independent of phase. Lyria stinger still once per table.

#### HUD (R56.6)
TIME / OFF ROAD / km/h (EN `KM/H`, JA `キロ`) in lockstep.

#### Billboard inset
Drive-past boards are size-capped and pulled to the rumble so they stay in the 320×240 frame (not off-screen at close range).

#### Frozen frames (node-canvas snapshots, not Playwright)
- `media/wave1-coast/qualifying.png` — bright track, chunky rear car, 「予選スタート！」
- `media/wave1-coast/track.png` — dusk sky, LO-borgen, rumble
- `media/wave1-coast/billboard.png` — Centerpartiet PNG on the shoulder

#### Tests
457 → **468**. `tsc -b`, `npm test` ×2, `node build.mjs` green.

#### Requirements
R56 added. R22.1 / R54.6–7 cross-ref. Do not use R55.

### Comments

_(no comments)_

## PR #9: Wave 2: hall & shell chrome (not AI slop)

- Status: merged
- Author: Jens Abrahamsson
- Branch: `wave2-hall-shell` → `main`
- Opened: 2026-09-20 19:34 UTC
- Merged: 2026-09-21 15:30 UTC

### Description

Splash/hall/waiting som 1982 Tokyo — i18n-krom, kabinett-identitet, ärlig provenance. Ingen ny hall-R-batch. Attract-loopen orörd i `applyPresentation`.

#### Wired i `main.ts` (denna revision)

1. `drawWordmark` → `splashWordmark` (två rader + amber år, R54.1).
2. `renderCabinet` marquee → `cabinetMarquee` / `cabinetTitleKey` — spel-titel stannar; NOW PLAYING/OOO är lampa (R54.2).
3. INSERT COIN-blinket ritar `insertCoinPlate` (R37).
4. `renderTableWaiting` → `waitingHintLine` / `waitingPanelCopy` (R54.3).

Inget nytt R-nummer: uppfyller R54.1–3 och R37. R55/R56/R57 orörda.

#### Hall-layout (förra committen)

Kabinett börjar under 52 px chrome-band (`HALL_CHROME_BAND`). 4×2 oförändrad.

#### Inte rört

`hall.ts` helpers, `splashLook.ts`, `hallChrome.ts` (bara importerade), `renderers/coast.ts`, `static/art/coast-*.png`, Jev, Circuit, `arcade.ts`, `tweaks.ts`, `AGENTS.md`. Attract `Late_Night_Cabinet` stannar i `main.ts`.

#### Leftover

- Attract-loopen medvetet kvar i `applyPresentation`.
- `AGENTS.md` / `REQUIREMENTS.md` R7.2 kan fortfarande säga 457 (Wave 0 / Wave 3). README här är **470**.

Tester: **457 → 470**. `tsc -b && npm test` ×2 && `node build.mjs`. SHA `[sha removed]`.

Base: `origin/main` @ `[sha removed]` (PR #2).

### Comments

_(no comments)_

## PR #10: R58: native JA cabinet copy (Wave 6)

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/wave6-ja-native-8ced` → `main`
- Opened: 2026-09-20 20:17 UTC
- Merged: 2026-09-21 15:30 UTC

### Description

Wave 6 native Japanese pass: 1982 Tokyo cabinet copy instead of machine katakana. EN/JA stay in key lockstep; English values are unchanged.

#### What
- 15 JA strings retuned to mixed kanji + kana (splash, coin prompts, marquee 2/3, HUD labels, lobby wait, net-lost, name pad, reject toasts).
- Leftover pass: menu chrome (言語 / もどる / 館内図), name-pad 決定/やめる, cabinet tags (しっぽを出せ! … エルオー城まで走れ). Cabinet *names* stay 1982 katakana.
- `cab.ooo` 故障中, `hall.freePlay` フリープレイ, `app.title` トウキョウ アーケード, `coast.qualifying` 予選スタート！, `phase.gameOver` ゲーム オーバー kept.
- **R58** (+ R58.4) and **R59** in REQUIREMENTS.md. R55–R57 reserved — not implemented. No Coast look, no `coast-*.png`, no Wave 3 art IDs.
- R59: `hallMarqueeClip` keeps the neon marquee out of the `F: FULLSCREEN` hint and clock gutters.
- Test-first. Tests 457 → 460 → 462. GPL-3.0-only. Canvas-only UI.

#### Verify
- `npx tsc -b` clean
- `npm test` 462/462 twice
- `node build.mjs` ok
- Live canvas: F-hint fully readable, marquee to the right of it; title `L: 言語` / tag `ドットを全部くれ!`; name pad `決定`/`やめる`; hall `M: 館内図`

#### Still leftover
- `marquee.1`, `hall.attract` (デモ チュウ on idle cabinets), extra toasts, `hud.turn`, `phase.ready/set/winner`, `lobby.pressKey`, `score.empty`, `net.connecting`, `misc.*`
- JA `marquee.2` still drops the EN snake-diagonal joke
- Coast HUD beyond qualifying/mph (Wave 1)
- `F: FULLSCREEN` remains hardcoded English (R53.2); it no longer collides with the marquee

### Comments

_(no comments)_

## PR #11: Wave 7: operator runbook (R60), Lyria credits, honest test count, LinkedIn shots

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/wave7-ops-polish-8ced` → `main`
- Opened: 2026-09-20 20:31 UTC
- Merged: 2026-09-21 15:30 UTC

### Description

Wave 7 polish/ops — docs + a small honesty test, no new product features.

Rebased on latest `main` (`[sha removed]`). Does not revert PR #4 Wave 0 CDP/Jev mute notes; AGENTS keeps a muted-CDP floor (`--mute-audio`, localhost, never fullscreen / coworker Mac) so those notes survive either merge order.

#### What
- README: trusted-LAN demo hall (`Shift+S` → `F` FREE PLAY), Jev without anyone at the stick, coin-mode reconnect (`name|lang`, 60 s), credits-wall Lyria 3.5 lines, LinkedIn canvas shot list.
- AGENTS: operator how-to only (Jev, wire-open `ooo`/`freePlay`/`note`, muted CDP floor).
- **R60** in REQUIREMENTS.md (same change). **R59 is hallMarqueeClip / F-hint gutter on PR #10** — not this item. R55 Circuit d’Or / R56 Coast look / R57 art IDs / R58 JA copy are not implemented here.
- Test-first: `wave7Ops.ts` helpers, then docs. Published `npm test` integer is this checkout: **457 → 467**. Do not copy counts from unmerged PRs.

#### Verify (done)
- `npx tsc -b` clean
- `npm test` **467/467** twice (after R59→R60)
- `node build.mjs` ok
- Author `Jens Abrahamsson `
- GPL-3.0-only

#### Not in this PR
- Circuit d’Or gameplay (R55)
- Coast look / art IDs / `ja.ts` rewrite
- Live LinkedIn captures, muted CDP against Chrome, `jev:autoplay` with a live key

### Comments

_(no comments)_

## PR #12: R58/R59 leftover: デモ中 and F-hint full-em gutter

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/wave6-fhint-gutter-8ced` → `main`
- Opened: 2026-09-21 15:55 UTC
- Merged: 2026-09-21 16:08 UTC

### Description

Wave 6 on `origin/main` `[sha removed]` claimed `hallMarqueeClip` kept `F: FULLSCREEN` off the neon marquee, and that JA cabinet copy was native. Headless CDP still showed the hint sharing pixels with the hall header, and idle minis still painted machine-katakana `デモ チュウ`.

This implements **existing R58 / R59** (no new krav number). EN/JA stay in lockstep. No Circuit gameplay. No Mac/fullscreen steal. No soak.

#### What
- **R58 leftover:** `hall.attract` JA `デモ チュウ` → `デモ中`. EN `ATTRACT` unchanged. Pinned in `i18n.test.ts` with the old katakana in a comment.
- **R59 leftover:** F-hint gutter is the painted `F: FULLSCREEN` string at full-em per glyph (13×8) plus 4px pad — the old 90px box was short. Neon PNG tiles clip to the marquee band via `hallMarqueeNeonDest` so a 120px step cannot overshoot the clock.
- Tests **539 → 542**. README / AGENTS / R7.2 updated in this commit.
- Core stays pure (i18n strings only). Presentation helpers live in `tweaks.ts`.

#### Verify (this checkout)
- `npx tsc -b` clean
- `npm test` **542/542 twice** (no flake)
- `node build.mjs` ok
- Author `Jens Abrahamsson `

Hall contract: `F: FULLSCREEN` fully in the left gutter; neon/flavor stay in the clip; idle minis show `デモ中` in JA, `ATTRACT` in EN.

#### Out of scope
- Circuit d’Or (R55)
- Other leftover katakana (`marquee.1`, `hud.turn`, `misc.*`, …)
- Hardcoded English `F: FULLSCREEN` (R53.2)

### Comments

_(no comments)_

## PR #13: fix(client): Wave 0 namepad — no leading space or stray Q from Space

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/wave0-namepad-space-8ced` → `main`
- Opened: 2026-09-21 15:58 UTC
- Merged: 2026-09-21 16:11 UTC

### Description

#### Problem

Headless CDP on `main` (`[sha removed]`) typed operator tag **QAKIRA** on the splash→title→namepad path: physical **Space** after opening the namepad activated the default **Q** cell instead of being ignored.

#### Fix

- `pressKey` rejects a leading space character.
- `pressNamePadSpace` / `pressNamePadSelect` pure helpers: Space only inserts or activates space / OK / backspace cells; Z and Enter still select the cell under the cursor.
- Wired in `main.ts` for `name` and `note` scenes.

#### Tests

Five new cases in `namepad.test.ts` (544 total, ×2 green).

#### Docs

Project note: `docs/wave0-namepad-space.md` in agent store.

#### Out of scope

Hall F-hint files, Coast renderer, Circuit gameplay.

### Comments

_(no comments)_

## PR #14: Coast: qualifying overlay gutter below LO-borgen (R56.5)

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/wave1-overlay-gutter-8ced` → `main`
- Opened: 2026-09-21 16:04 UTC
- Merged: 2026-09-21 16:14 UTC

### Description

#### Summary

Headless show-floor CDP on `main` showed the Coast 「予選スタート！」 / `QUALIFYING START!` banner at **y=78** overlapping the LO-borgen silhouette on the 320×240 playfield.

This PR adds **pure layout geometry** in `packages/client/src/renderers/coast.ts`, unit tests, and **main.ts wiring**:

- `coastCastleRect` — same numbers as `drawCastle`
- `coastQualifyingOverlayY()` → **101** (castle bottom 93 + **8px** gutter)
- `coastQualifyingClearOfCastle` — regression guard
- `drawCoastQualifyingBanner` — blink white/magenta unchanged
- **`main.ts`:** `drawCoastQualifyingBanner(ctx, t('coast.qualifying'), ms)` under `coastQualifyingOverlay(...)` (no hardcoded **78**)

Tests prove legacy **y=78** fails clearance; a source-level test locks main wiring.

#### Out of scope

No `tweaks`, hall, or i18n edits (wave6 F-hint work stays separate).

#### Checks

- `npx tsc -b && npm test` ×2 green (**544** tests)
- `node build.mjs` ok
- Published test counts: README / AGENTS / R7.2 → **544**

#### Requirement

- **R56.5** — qualifying overlay readability

### Comments

_(no comments)_

## PR #15: Wave 6 leftover: native JA copy (R58)

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/wave6-ja-leftover-8ced` → `main`
- Opened: 2026-09-21 16:04 UTC
- Merged: 2026-09-21 16:20 UTC

### Description

#### Summary

Finishes the Wave 6 **leftover** machine-katakana pass from `docs/wave6-ja-copy.md`: 14 `ja.ts` values become 1982 PCB-style mixed kanji/kana. `en.ts` unchanged. Core stays pure.

**Not in this PR:** `hall.attract` (PR #12 owns `デモ中`), Coast HUD beyond existing locks (Wave 1), `F: FULLSCREEN` (R53.2).

#### Changes

- `packages/core/src/i18n/ja.ts` — marquee.1, toasts, hall.thanks, hud.turn, phase ready/set/winner, lobby.pressKey, score.empty, net.connecting, misc.you/spectate/full
- `packages/core/src/i18n/i18n.test.ts` — `WAVE6_LEFTOVER_NATIVE_JA` + EN lockstep (test-first)
- README / AGENTS / REQUIREMENTS test count **539 → 541**

#### Verification

- `npx tsc -b` clean
- `npm test` **541/541** ×2
- `node build.mjs` ok
- Author: Jens Abrahamsson

#### Requirements

**R58** (R58.3 pins leftover table). No R59 layout changes. GPL-3.0-only.

### Comments

_(no comments)_

## PR #16: Wave 3: Coast marquee / attract / hero plates (R57.28–.30)

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/wave3-coast-plates-8ced` → `main`
- Opened: 2026-09-21 16:06 UTC
- Merged: 2026-09-21 16:29 UTC

### Description

#### Summary

Lands **Coast** hall chrome that the other six cabinets already had:

- `coast-marquee.png` (R57.29) — cabinet marquee plate behind i18n title
- `coast-attract.png` (R57.30) — hall idle `cabThumb` card when no live demo
- `coast-hero.png` (R57.28) — title spotlight + ready overlay via `heroSheetForScene`

**Art pipeline:** GenerateImage / Grok Imagine handoff rasters → nearest resize + palette quantize to indexed PNG (color-type 3, ≥64 px, 16–32 KB). No procedural plate drawing. Watermark byte-scan clean.

**Wiring:** `ART_FILES` + `WAVE3_CABINET_GAMES` includes `coast`; existing `main.ts` `cabinetArtFile` / `drawImage` paths pick up the plates.

#### Out of scope (explicit)

- `packages/client/src/renderers/coast.ts`
- `tweaks.ts` (F-hint, `hall.attract`, `provenanceLines`) — PR #12 boundary
- Not stacked on PR #12

#### Tests

`npx tsc -b && npm test` ×2 + `node build.mjs` — **539** tests green.

#### Docs / evidence

Project store: `docs/wave3-coast-plates.md`  
Hall/title CDP shots: `media/wave3-coast-plates/hall-coast-cabinet.png`, `title-coast-hero.png`

#### Follow-up

Credits wall still says “SIX CABS” until `provenanceLines` is updated in a separate tweaks PR (R57.51).

### Comments

_(no comments)_

## PR #17: Credits wall: SEVEN CABS after Coast plates (#16)

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/wave3-provenance-seven-8ced` → `main`
- Opened: 2026-09-21 16:39 UTC
- Merged: 2026-09-21 16:43 UTC

### Description

After #16, Coast marquee/attract/hero plates are on disk and in `ART_FILES`. R57.51 already requires the credits wall to name hall chrome + **seven** cabinets + Coast PNGs. The wall, README, R57 ingress, R57.54, R60.4, and ART.md drop-zone still said six / TODO / unwired.

#### Test-first

`tweaks.test.ts` now asserts `SEVEN CABS` (43 chars on the PIXEL ART line; `SEVEN CABINETS` is 47 and would break the ≤46 cap). Commented correction: the old `SIX CABS` lock was honest while Coast plates were TODO; after #16 it contradicts R57.51. Not a weakened assert.

Same commit: `provenanceLines()`, README Sound + «stay unwired», REQUIREMENTS ingress (eighteen six-cabinet / stay TODO), R57.54 (Never Coast → include `coast-hero`), R60.4, ART.md drop-zone rows for `coast-{marquee,attract,hero}` + eighteen→21.

No new `it()`. Test count stays **554**. No new R-numbers.

#### Gate

`npx tsc -b` OK · `npm test` 554 ×2 · `node build.mjs` OK. Author Jens Abrahamsson.

#### Out of scope (intentional)

- No PNG drawing
- No Circuit d’Or
- No secrets
- No rebase of PR #1
- No Jev key, no LAN soak

Base: `origin/main` `[sha removed]`. Draft — do not merge.

### Comments

_(no comments)_

## PR #18: Fix hall Shift+S so サービス モード opens (wave leftover / wave7)

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/wave7-service-shift-8ced` → `main`
- Opened: 2026-09-21 17:28 UTC
- Merged: 2026-09-21 17:37 UTC

### Description

Wave leftover / wave7. Shift+S from the hall never opened サービス モード in CDP because WASD consumed KeyS as down (ヘビ → カエルのリバー) before the operator chord. `ws {type:freePlay,on:true}` already worked.

**Fix:** `takeServiceChord()` / `consumeHallStick()` run before hall nav. `frame()` now paints `renderService` (it used to fill black, so even a successful chord was a blank CRT). F still toggles free play only inside the service menu (on the hall it remains fullscreen, R53).

**CDP (headless, DISPLAY unset, --mute-audio, localhost 18973/9273):** hall コイン1枚 + ヘビ → Shift+S → サービス モード (CAB SNAKE, not River) → F → MODE フリープレイ. `service.json` `freePlay: true`. Not LAN-stranger DoD. Not live Jev.

**Not in this PR:** Circuit gameplay, merge of #1.

Core stays pure. `parseClientMessage` unchanged. Tests 554 → 567.

### Comments

_(no comments)_

## PR #19: Coast: wrap EN QUALIFYING START! under LO-borgen (R56.5 leftover)

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/wave1-en-overlay-clip-8ced` → `main`
- Opened: 2026-09-21 18:52 UTC
- Merged: 2026-09-21 18:58 UTC

### Description

#### Summary

LinkedIn CDP on `origin/main` `[sha removed]` (after #18) showed the EN Coast qualifying banner clipped to **`IFYING ST`**. JA 「予選スタート！」 already fits under LO-borgen.

This leftover wraps EN `QUALIFYING START!` to **`QUALIFYING` / `START!`** so each line’s full-em width stays inside the castle rect minus the same **8px** gutter JA already has. Vertical placement is unchanged (`y=101`). JA stays one 12px line.

Pure layout in `packages/client/src/renderers/coast.ts`. Core untouched. i18n strings untouched (`QUALIFYING START!` / 「予選スタート！」).

#### Tests

- New regression in `coast.test.ts`: EN must paint more than one line, each ≤ castle width − 2×8px; joining the lines still reads `QUALIFYING START!`. Failed first (`expected 1 to be greater than 1`), then wrap made it green.
- Existing JA gutter / `y=78` / main.ts wiring tests unchanged.

#### Headless CDP (Wave 0)

- `env -u DISPLAY` · `--mute-audio` · localhost · **not** `--kiosk` / `--start-fullscreen`
- Operator ws `{type:freePlay,on:true}` (not Shift+S→F)
- Sit Coast Z → overlay ~3 s
- Eye: white and magenta frames both show **QUALIFYING** / **START!** fully under the keep, between the palisade. LinkedIn before-shot was `IFYING ST`.

Not claimed: stranger LAN, live Jev, Circuit, merge of #1.

#### Out of scope

- Circuit / `packages/core/src/games/circuit`
- PR #1 (Hall demo ambience)
- LAN stranger / live Jev DoD
- i18n copy changes

#### Checks

- `npx tsc -b && npm test` ×2 green (**568** tests)
- `node build.mjs` ok
- Published counts: README / AGENTS / R7.2 → **568**

#### Requirement

- **R56.5** — qualifying overlay readability (EN leftover after #14 vertical gutter)

Draft. Do not merge from this leftover unless asked.

### Comments

_(no comments)_

## PR #20: Show Coast ready-hero for 3s after solo sit (R57.54 leftover)

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/coast-ready-hero-8ced` → `main`
- Opened: 2026-09-21 19:04 UTC
- Merged: 2026-09-21 19:14 UTC

### Description

Solo Coast `begin()` jumps to `playing`, so `phase === 'ready'` never fires and `coast-hero` never appeared on the only playable path (R57.54 / ready-hero CDP FAIL on `[sha removed]`, SAD ~334).

This leftover uses the **same kind of exception as the qualifying overlay** (P1-A / R56.5): a short ~3 s window from the first seated snapshot, independent of phase. The sheet stays ready chrome via `heroSheetForScene(..., 'ready')` — not a gameplay replacement. After the window, live `step()` is visible.

- Client-only (`tweaks.ts` / `main.ts`). Core stays pure.
- No new R-batch: leftover sentence under existing R57.54.
- Tests first: old `phase===ready` gate would hide a playing solo snapshot; `coastHeroOverlay` is true for N ms, then false; not for other games / spectators / unannounced tables; wiring lock in `hallWire.test.ts`.
- Test count 568 → **572**. `npx tsc -b && npm test` ×2 + `node build.mjs` green.
- Headless CDP **PASS** (`DISPLAY` unset, `--mute-audio`, localhost, Wave 0 ws `{type:freePlay,on:true}`): sit Coast stays `phase=playing` / `readyAt=null` / 0 ready snaps; first ~3 s shows night road + orange Datsun (`coast-hero`) over live PP; after the window the plate is gone. Hero-box SAD **54.6** vs historical FAIL **~330**.
- Circuit / #1 not touched. Not LAN-stranger DoD. Not live Jev.

Do not merge until a human is happy with the leftover.

### Comments

_(no comments)_

## PR #21: Show hall WAIT cue and waiting panel for 1P versus

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/hall-wait-1p-cue-8ced` → `main`
- Opened: 2026-09-21 19:07 UTC
- Merged: 2026-09-21 19:55 UTC

### Description

R43 WAIT / wait-badge sat inside `if (live && render)`, so a 1P versus table (`hallTables.data === null`) never painted the hall wait cue. Snapshots with `data: null` also skipped WAITING FOR PLAYERS because `phase` defaults to `ready`.

Rebased onto `origin/main` `[sha removed]` (#22, 584 tests). `[sha removed]` / `[sha removed]` are stale.

Hall WAIT is now 5×5 `fillRect` glyphs in `HALL_WAIT_INK` (`#f7e766`) on a dim plate. Headless `fillText` AA never produced PAL.yellow; the 12×12 siren is not the cue.

#### Tests
**584 → 591.** README / AGENTS / R7.2 bumped in the leftover commits.

#### Gate
`npx tsc -b && npm test` ×2 (**591/591**) && `node build.mjs` on `[sha removed]`. Author Jens Abrahamsson.

#### CDP (19051 / 9351, DISPLAY unset, ws freePlay)
Hall WAIT **PASS**: readable WAIT on the 1P puck cabinet, `waitExact`/`waitBadgeYellow` = 43. Siren-only sample `badgePix` = 0. Waiting panel WAITING FOR PLAYERS **PASS**.

Not Circuit. Not merge of #1. Not LAN/Jev DoD. **Do not merge** this leftover until a human is ready.

### Comments

_(no comments)_

## PR #22: Night Coast road and orange sedan (R56 / R57.46)

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/coast-prettier-8ced` → `main`
- Opened: 2026-09-21 19:32 UTC
- Merged: 2026-09-21 19:43 UTC

### Description

#### Summary
Live Coast was a noon cartoon: bright blue sky and a flat red wedge (`#e03c2f`). The cabinet now reads as a 1982 night road — indigo zenith, sodium horizon, headlight asphalt, striped shoulders, LO-borgen — with a chunky orange Datsun-like sedan.

- `coast-datsun.png` (R57.46) is a paletted rear-view plate (160×105, color-type 3, 17 KB). Missing file still paints the procedural orange sedan.
- Swedish billboards (R57.41–.45) and `coast-lo-castle.png` are unchanged: already sharp, indexed, no text-chunk watermark.
- Qualifying overlay (~3 s 「予選スタート！」 / EN `QUALIFYING START!` wrap) and the ~3 s `coast-hero` window stay.
- Rebased onto `origin/main` `[sha removed]` after #23. Old daytime luma bar and the `#e03c2f` body assert are replaced with the night-band and orange-sedan checks. **581 → 584.**

`npx tsc -b && npm test && node build.mjs` green twice on the rebased tree. Not merged. No Circuit d’Or, no splash/title edits, no LAN claim, no live Jev.

#### Test plan
- [x] `npx tsc -b && npm test` (584) twice after rebase onto `[sha removed]`
- [x] `node build.mjs`
- [x] Headless CDP, `DISPLAY` unset, `--mute-audio`, localhost, Wave 0 ws freePlay: seated Coast during the hero window (SAD ~61 vs `coast-hero.png`) and after (SAD ~262, plate gone). Night sky and orange car visible in both.

### Comments

_(no comments)_

## PR #23: Splash and title are a press-start attract

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/splash-attract-8ced` → `main`
- Opened: 2026-09-21 19:33 UTC
- Merged: 2026-09-21 19:37 UTC

### Description

Splash and the title before the hall invited a README, not a game. BIOS and cartridge status sat under the wordmark, and the title printed a language/credits legend.

R12.1 and R54.1 now make that face one 1982 attract: neon marquee, lanterns, one cabinet in the spotlight on the title, and a single press-start. `L` and `C` still open language and credits. They are not painted here. `splash.welcome` stays the waiting-panel line.

`splash.enter` left the Wave 6 keymap freeze. Old EN was `PRESS SPACE TO COME IN`. Old JA was `スペースキーで 入場`. The attract uses `PRESS START` / `スタート！`.

`splash-marquee.png` is a paletted 320×240 plate (nearest resize, 24-color quantize, 18976 bytes, no baked words). Both languages paint the i18n wordmark on it. The Latin `splash-logo` plate remains the fallback when the marquee plate is missing, because its black field would cover the neon.

- Test count 572 → **581**. `npx tsc -b && npm test && node build.mjs` ×2, green.
- Headless CDP (`DISPLAY` unset, `--mute-audio`, localhost **8443**, CDP **9222**, Chrome 148): EN and JA splash, then Space to the title. Neon marquee, press-start, no BIOS line, no key legend.
- Coast renderer and Coast art untouched. No new R-batch. Circuit / #1 not touched. Not LAN. Not live Jev.

Do not merge until a human is happy with the attract.

### Comments

_(no comments)_

## PR #24: Add Circuit d'Or as the eighth cabinet

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/circuit-dor-lemans` → `main`
- Opened: 2026-09-21 21:55 UTC
- Merged: 2026-09-21 23:35 UTC

### Description

#### Summary

Circuit d'Or is the eighth cabinet. The player-facing title is **CIRCUIT D'OR** / **サーキット・ドール**. It is not Coast Runner and it is not named Le Mans on the marquee, hall label, or i18n.

Sit, drive a short endurance loop from a fixed overview camera (long straight, chicane, hairpin, gantry), score, finish two laps or run out of time or lives, then return to the hall. 60 Hz, pure core, solo only. No traffic product, gears, or radio. Coast Runner, its Swedish billboards, and LO-borgen are unchanged.

R55 is updated from docs-only to open. Art plates are not landed; the renderer is procedural. `circuit` is accepted by `parseClientMessage`; a `lemans` id is rejected.

#### Tests

`npx tsc -b`, `npm test` (613, twice), and `node build.mjs` are green. A live websocket smoke sat at the cabinet, scored, and returned to an 8-cabinet hall.

The old wave-0 asserts locked a 7-cabinet hall (R22). They now expect eight because this cabinet is live.

### Comments

_(no comments)_

## PR #25: Finish Coast Runner as a seated night drive

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/coast-runner-perfect` → `main`
- Opened: 2026-09-21 23:48 UTC
- Merged: 2026-09-21 23:58 UTC

### Description

Coast Runner stays a solo night drive. Circuit d'Or is untouched. No split screen.

The night sky, qualifying call, LO-borgen, and the five Swedish plates were already on main. This pass closes the holes that still read as a stub:

- The sedan is 120×79 on the 320×240 glass (was 80×52), tires inside the frame, procedural body scaled with the box, `coast-datsun.png` when it loads.
- TIME / GATE / KM/H sit on a dark instrument bar in the arcade font, clear of the moon. OFF ROAD is a banner above the roof, not gray type on the trunk.
- Drive-past billboards (Centerpartiet, Harpsund, Bommersvik, Valdebatt 1976, Palme/Castro) stay on the glass at a readable width. Specks at the vanishing point are not drawn.

Qualifying `t('coast.qualifying')` is still ~3 s and still sits under LO-borgen.

Tests: 620 (was 613).

### Comments

_(no comments)_

## PR #26: Seat a second human on Coast Runner and Circuit d'Or

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/two-player-racing` → `main`
- Opened: 2026-09-22 00:17 UTC
- Merged: 2026-09-22 00:19 UTC

### Description

Coast Runner versus is a top/bottom split of the night road, so each pane keeps the full 320-wide glass. Circuit d'Or versus stays one overview with both cars on the same circuit. The marquee stays CIRCUIT D'OR / サーキット・ドール.

Solo play is unchanged. A second human joins with `start` mode `versus`, the same seat path snake already uses. That join does not debit the player who is already seated. In coin mode the joiner spends one credit; free play seats both for nothing.

R55.2 shipped `supportsVersus: false` because versus was out of scope. R61 is that later versus, so the circuit create test now expects the flag to be true.

#### Proof

Headless Chrome, `DISPLAY` unset, `--mute-audio`, localhost, free play, two sockets:

- Coast split: (local screenshot path removed)
- Circuit d'Or, two cars: (local screenshot path removed)
- `cdp-result.json` in the same folder

631 tests.

### Comments

_(no comments)_

## PR #27: Circuit d'Or: 1976 Sarthe look

- Status: merged
- Author: Jens Abrahamsson
- Branch: `cursor/circuit-dor-1976-sarthe-6843` → `main`
- Opened: 2026-09-22 19:41 UTC
- Merged: 2026-09-23 05:50 UTC

### Description

Circuit d'Or stays CIRCUIT D'OR (JA サーキット・ドール). The cabinet id stays `circuit`. Le Mans 1976 is only the circuit on the glass.

The first pass was a schematic: 28×28 asphalt stamps, a 10 px arch bow, an 18×5 car, a 40×7 pit labelled 24H, and a 2 px grandstand. This pass makes the 320×240 overview readable.

- Thin road ribbon, continuous armco, trees on both sides of the long straight.
- Truss bridge over the pit straight, posts on both verges, no wordmark.
- Long low pit building, start gantry, grandstand with mass.
- West-end hairpin, return esses, late chicane. Both cars still share that one loop.
- Group 6 prototypes about 30 px long (orange and cyan). No sponsor wordmarks.

Tests: 634. New assertions cover the west hairpin, the thin road, the truss, the pit building, and the car length. The old 18×5 body, 12 px wing, and 2×2 grandstand checks were the schematic; the comments in the tests say so.

See it: `npm start`, hold Shift+S, F for free play, bottom-right cabinet. Z is solo, X is versus.

### Comments

_(no comments)_

## PR #28: Coast Runner: 1984 Volvo bonus stage

- Status: open
- Author: Jens Abrahamsson
- Branch: `cursor/coast-volvo-bonus-6843` → `main`
- Opened: 2026-09-23 16:44 UTC

### Description

#### What

Coast Runner gets a bonus stage after LO castle. The castle still pays the goal bonus and plays the goal sting. The run then continues on a shorter road instead of ending.

- The bonus car is a white 1984 Volvo 740 estate (long roof, tall lamps, rear glass). The orange Datsun stays on the coast road.
- A dog in the back seat slides outward in the bends and sits still on a straight.
- Other traffic is a 1984 BMW and a 1984 Mercedes, seeded, moving, hittable once. Both kinds are always on the bonus road. They are not on the coast road.
- No Volvo, BMW, or Mercedes wordmarks, and no badges. The shape is the homage.
- Clearing the bonus road ends the run. Running out of time still ends it. In versus, one driver reaching the castle opens only their bonus stage.

#### Tests

The old “castle ends the run” expectation is updated in the same tests, with a comment: the gate used to set game over, and now it opens this stage. 643 tests. `tsc -b`, `npm test` twice, and `node build.mjs` are green.

#### How to see it

`npm start`, hold Shift+S, F for free play, sit Coast Runner, hold the throttle through LO castle. The HUD switches to BONUS.

### Comments

_(no comments)_
