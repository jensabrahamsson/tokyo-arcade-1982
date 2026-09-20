# ART — Tokyo Arcade 1982 pixel-art catalog (R57)

R55 is Circuit d’Or (document-only, other PR). R56 is Coast Pole
Position look (Wave 1). This file is the **R57** art catalog.

Wave 3 inventory + IDs. Imagine / Cursor drops real PNGs into
`packages/client/static/art/` using the filenames below. Core never
loads Image/DOM/fetch. Missing files and 16×16 stubs fall back to
procedural drawing (R38.4, P1-6). Player-facing brand is **Tokyo
Arcade 1982**.

This catalog does **not** drop Coast billboard or LO-borgen PNGs
(Wave 1 owns those) and does **not** invent fake “real” 16×16 heroes.

**Landed** = PNG magic, ≥64 px on at least one axis, typically 16–32 KB
(R7.4 / R38.5), original / GPL-compatible, no commercial sprites.
A 16×16 stub is never landed. **Twelve** six-cabinet marquee/attract
plates are landed (R57.52). Hall chrome, hero sheets, and Coast IDs
are still TODO. Coast PNG drops belong to PR #8.

Credits provenance names the six-cabinet plates and keeps hall chrome
/ Coast procedural (R57.51). Do not claim a full original art set.

## Drop-zone files (`packages/client/static/art/`)

Hall/splash chrome and LO-borgen remain 16×16 stubs (loader ignores).
None are JPEG-misnamed. Wave 3 six-cabinet plates are paletted ≥64 px,
16–32 KB, color-type 3.

| File | Kind | Wired `drawImage` | Catalog |
|------|------|-------------------|---------|
| `hall-floor.png` | stub 16×16 | skipped | R57.1 |
| `cabinet-bezel.png` | stub 16×16 | skipped | R57.2 |
| `splash-logo.png` | stub 16×16 | unused (procedural wordmark) | R57.3 |
| `marquee-neon.png` | stub 16×16 | skipped | R57.4 |
| `coin-slot.png` | stub 16×16 | skipped | R57.5 |
| `credit-panel.png` | stub 16×16 | skipped | R57.6 |
| `wait-badge.png` | stub 16×16 | skipped | R57.7 |
| `coast-lo-castle.png` | stub 16×16 | skipped → procedural castle | R57.40 |
| `snake-marquee.png` | **landed** paletted | hall cabinet marquee | R57.11 |
| `snake-attract.png` | **landed** paletted | idle mini if no live demo | R57.12 |
| `puck-marquee.png` | **landed** paletted | hall cabinet marquee | R57.14 |
| `puck-attract.png` | **landed** paletted | idle mini if no live demo | R57.15 |
| `block-marquee.png` | **landed** paletted | hall cabinet marquee | R57.17 |
| `block-attract.png` | **landed** paletted | idle mini if no live demo | R57.18 |
| `galaxy-marquee.png` | **landed** paletted | hall cabinet marquee | R57.20 |
| `galaxy-attract.png` | **landed** paletted | idle mini if no live demo | R57.21 |
| `river-marquee.png` | **landed** paletted | hall cabinet marquee | R57.23 |
| `river-attract.png` | **landed** paletted | idle mini if no live demo | R57.24 |
| `myriad-marquee.png` | **landed** paletted | hall cabinet marquee | R57.26 |
| `myriad-attract.png` | **landed** paletted | idle mini if no live demo | R57.27 |

Manifest names with **no file** (Coast landmarks, PR #8). Loader leaves
the slot empty; Coast renderer draws procedural glyphs.

| File | Kind | Catalog |
|------|------|---------|
| `coast-centerpartiet.png` | missing | R57.41 |
| `coast-harpsund.png` | missing | R57.42 |
| `coast-bommersvik.png` | missing | R57.43 |
| `coast-valdebatt76.png` | missing | R57.44 |
| `coast-castro-visit.png` | missing | R57.45 |

There is **no** `packages/client/static/art/pilots/` directory. P2-C
already relocated the JPEG pilots (see below).

## JPEG pilots (not served)

`packages/client/art-pilots/*.jpg` — 1280×720 JPEG reference stills for
Imagine. Not under `static/`, not served, never named `.png` (HTTP would
claim `image/png`). Wave 3 does not move them again.

| Pilot | Bytes | Maps to |
|-------|------:|---------|
| `coast-centerpartiet-pilot.jpg` | 357015 | R57.41 `coast-centerpartiet.png` |
| `coast-harpsund-pilot.jpg` | 417831 | R57.42 `coast-harpsund.png` |
| `coast-bommersvik-pilot.jpg` | 384702 | R57.43 `coast-bommersvik.png` |
| `coast-debate-1976-pilot.jpg` | 254754 | R57.44 `coast-valdebatt76.png` |
| `coast-palme-castro-pilot.jpg` | 347140 | R57.45 `coast-castro-visit.png` |

## Cabinets → current hero visual

Live attract demos (R8) still fill the mini-screen when a snapshot
exists. Marquee plates sit behind the i18n title. Idle `cabThumb`
uses attract PNG when there is no live snapshot.

| Game | In-cabinet hero | Hall marquee | Attract / idle mini | IDs |
|------|-----------------|--------------|---------------------|-----|
| snake | procedural grid snakes + food | **landed** plate + i18n title | landed idle card / live demo | R57.10–.12 |
| puck | procedural maze / dots / ghosts | **landed** plate + i18n title | landed idle card / live demo | R57.13–.15 |
| block | procedural bricks / paddles / ball | **landed** plate + i18n title | landed idle card / live demo | R57.16–.18 |
| galaxy | procedural starfield / aliens / ship | **landed** plate + i18n title | landed idle card / live demo | R57.19–.21 |
| river | procedural lanes / frog | **landed** plate + i18n title | landed idle card / live demo | R57.22–.24 |
| myriad | procedural mushrooms / segments | **landed** plate + i18n title | landed idle card / live demo | R57.25–.27 |
| coast | procedural pseudo-3D road; LO-borgen procedural; billboards procedural | i18n title + accent (PR #8) | `cabThumb` / live demo (PR #8) | R57.28–.30 + R57.40–.45 |

Reserved drop names still unwired (do not add 16×16 placeholders):

`snake-hero.png` `puck-hero.png` `block-hero.png`
`galaxy-hero.png` `river-hero.png` `myriad-hero.png`
`coast-hero.png` `coast-marquee.png` `coast-attract.png`

Live attract demos stay (R8). Attract PNGs are idle mini-screen cards,
not a replacement for the bots.

## Hall / splash chrome (what the player actually sees)

| Surface | Current visual | ID |
|---------|----------------|----|
| Splash wordmark | procedural white + magenta shadow + amber year | R57.3 |
| Hall floor | procedural dark carpet + faint piping | R57.1 |
| Cabinet body | procedural fill; stub bezel ignored | R57.2 |
| Hall neon marquee | procedural scrolling i18n copy | R57.4 |
| Coin slot | procedural navy slot | R57.5 |
| Credit strip | procedural yellow badge | R57.6 |
| WAIT badge | procedural WAIT + dots | R57.7 |

## Handoff rules

1. Same filename as the ID. PNG bytes, not JPEG named `.png`.
2. ≥64 px on at least one axis or the loader ignores the drop.
3. Target 16–32 KB. Limited 1982 Tokyo arcade palette.
4. Own art / GPL-compatible. No commercial-game sprites.
5. Wave 1 drops R57.40–R57.45 (LO-borgen + five billboards).
6. After the first landed PNG, update `provenanceLines` in the same
   change (watermark-checked originals). Until then leave it honest.
