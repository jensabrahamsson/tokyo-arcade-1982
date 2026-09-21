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
A 16×16 stub is never landed. Hall chrome R57.1–7 and **eighteen**
seven-cabinet marquee/attract/hero plates are landed (R57.52–R57.54),
including Coast (R57.28–.30). Coast landmark PNGs landed with Wave 1 (R56).

Credits provenance names hall chrome + seven cabinets + Coast PNGs
(R57.51). Do not claim Circuit art.

## Drop-zone files (`packages/client/static/art/`)

LO-borgen and the five Coast billboards are Wave 1 paletted PNG drops.
None are JPEG-misnamed. Wave 3 hall chrome and six-cabinet plates are
paletted ≥64 px, 16–32 KB, color-type 3.

| File | Kind | Wired `drawImage` | Catalog |
|------|------|-------------------|---------|
| `hall-floor.png` | **landed** paletted | hall carpet pattern | R57.1 |
| `cabinet-bezel.png` | **landed** paletted | cabinet body; wash skipped | R57.2 |
| `splash-logo.png` | **landed** paletted | splash wordmark | R57.3 |
| `marquee-neon.png` | **landed** paletted | hall neon strip | R57.4 |
| `coin-slot.png` | **landed** paletted | coin-insert slot | R57.5 |
| `credit-panel.png` | **landed** paletted | credit-strip backdrop | R57.6 |
| `wait-badge.png` | **landed** paletted | NOW PLAYING wait badge | R57.7 |
| `coast-lo-castle.png` | **landed** paletted (Wave 1) | horizon landmark | R57.40 |
| `snake-marquee.png` | **landed** paletted | hall cabinet marquee | R57.11 |
| `snake-attract.png` | **landed** paletted | idle mini if no live demo | R57.12 |
| `snake-hero.png` | **landed** paletted | title spotlight + ready overlay | R57.10 |
| `puck-marquee.png` | **landed** paletted | hall cabinet marquee | R57.14 |
| `puck-attract.png` | **landed** paletted | idle mini if no live demo | R57.15 |
| `puck-hero.png` | **landed** paletted | title spotlight + ready overlay | R57.13 |
| `block-marquee.png` | **landed** paletted | hall cabinet marquee | R57.17 |
| `block-attract.png` | **landed** paletted | idle mini if no live demo | R57.18 |
| `block-hero.png` | **landed** paletted | title spotlight + ready overlay | R57.16 |
| `galaxy-marquee.png` | **landed** paletted | hall cabinet marquee | R57.20 |
| `galaxy-attract.png` | **landed** paletted | idle mini if no live demo | R57.21 |
| `galaxy-hero.png` | **landed** paletted | title spotlight + ready overlay | R57.19 |
| `river-marquee.png` | **landed** paletted | hall cabinet marquee | R57.23 |
| `river-attract.png` | **landed** paletted | idle mini if no live demo | R57.24 |
| `river-hero.png` | **landed** paletted | title spotlight + ready overlay | R57.22 |
| `myriad-marquee.png` | **landed** paletted | hall cabinet marquee | R57.26 |
| `myriad-attract.png` | **landed** paletted | idle mini if no live demo | R57.27 |
| `myriad-hero.png` | **landed** paletted | title spotlight + ready overlay | R57.25 |

Manifest Coast landmarks (Wave 1 landed paletted PNG; loader uses them).

| File | Kind | Catalog |
|------|------|---------|
| `coast-centerpartiet.png` | **landed** paletted (Wave 1) | R57.41 |
| `coast-harpsund.png` | **landed** paletted (Wave 1) | R57.42 |
| `coast-bommersvik.png` | **landed** paletted (Wave 1) | R57.43 |
| `coast-valdebatt76.png` | **landed** paletted (Wave 1) | R57.44 |
| `coast-castro-visit.png` | **landed** paletted (Wave 1) | R57.45 |

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
uses attract PNG when there is no live snapshot. Hero sheets show on
the title spotlight and the ready-phase overlay — not during play.

| Game | In-cabinet hero | Hall marquee | Attract / idle mini | IDs |
|------|-----------------|--------------|---------------------|-----|
| snake | **landed** sheet; title + ready | **landed** plate + i18n title | landed idle card / live demo | R57.10–.12 |
| puck | **landed** hockey-puck sheet; title + ready | **landed** plate + i18n title | landed idle card / live demo | R57.13–.15 |
| block | **landed** sheet; title + ready | **landed** plate + i18n title | landed idle card / live demo | R57.16–.18 |
| galaxy | **landed** sheet; title + ready | **landed** plate + i18n title | landed idle card / live demo | R57.19–.21 |
| river | **landed** sheet; title + ready | **landed** plate + i18n title | landed idle card / live demo | R57.22–.24 |
| myriad | **landed** sheet; title + ready | **landed** plate + i18n title | landed idle card / live demo | R57.25–.27 |
| coast | **landed** sheet; title + ready | **landed** plate + i18n title | landed idle card / live demo | R57.28–.30 + R57.40–.45 |

Live attract demos stay (R8). Attract PNGs are idle mini-screen cards,
not a replacement for the bots. Hero sheets never replace gameplay.

## Hall / splash chrome (what the player actually sees)

| Surface | Current visual | ID |
|---------|----------------|----|
| Splash wordmark | **landed** TOKYO ARCADE plate + amber year | R57.3 |
| Hall floor | **landed** teal klinker tile + faint piping | R57.1 |
| Cabinet body | **landed** wood bezel (wash skipped) | R57.2 |
| Hall neon marquee | **landed** katakana neon strip + i18n scroll | R57.4 |
| Coin slot | **landed** brass 1982 slot plate | R57.5 |
| Credit strip | **landed** CREDIT panel behind digits | R57.6 |
| WAIT badge | **landed** WAIT lamp | R57.7 |

## Handoff rules

1. Same filename as the ID. PNG bytes, not JPEG named `.png`.
2. ≥64 px on at least one axis or the loader ignores the drop.
3. Target 16–32 KB. Limited 1982 Tokyo arcade palette.
4. Own art / GPL-compatible. No commercial-game sprites.
5. Wave 1 drops R57.40–R57.45 (LO-borgen + five billboards).
6. After the first landed PNG, update `provenanceLines` in the same
   change (watermark-checked originals). Until then leave it honest.
