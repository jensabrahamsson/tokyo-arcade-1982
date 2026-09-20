# ART — Tokyo Arcade 1982 pixel-art catalog (R55)

Wave 3 inventory + IDs. Imagine / Cursor drops real PNGs into
`packages/client/static/art/` using the filenames below. Core never
loads Image/DOM/fetch. Missing files and 16×16 stubs fall back to
procedural drawing (R38.4, P1-6). Player-facing brand is **Tokyo
Arcade 1982**.

This catalog does **not** drop Coast billboard or LO-borgen PNGs
(Wave 1 owns those) and does **not** invent fake “real” 16×16 heroes.

**Landed** = PNG magic, ≥64 px on at least one axis, typically 16–32 KB
(R7.4 / R38.5), original / GPL-compatible, no commercial sprites.
A 16×16 stub is never landed. **Zero assets are landed** as of
`origin/main` SHA `352782b` + this catalog.

Credits provenance (`packages/client/src/tweaks.ts` `provenanceLines`)
must stay `PIXEL ART: PROCEDURAL UNTIL ART LANDS` until one ID below
is landed (R55.51). Do not claim watermark-checked originals while the
drop zone is stubs.

## Drop-zone files (`packages/client/static/art/`)

All eight files on disk are 16×16 8-bit colormap PNGs (~109–136 B).
The loader refuses them (`naturalWidth/Height` max < 64), so they do
not draw. None are JPEG-misnamed.

| File | Bytes | Pixels | Magic | Kind | Wired `drawImage` | Catalog |
|------|------:|--------|-------|------|-------------------|---------|
| `hall-floor.png` | 110 | 16×16 | PNG | stub | hall carpet pattern (skipped) | R55.1 |
| `cabinet-bezel.png` | 109 | 16×16 | PNG | stub | cabinet body (skipped) | R55.2 |
| `splash-logo.png` | 136 | 16×16 | PNG | stub | **not used** — splash is procedural `drawWordmark` | R55.3 |
| `marquee-neon.png` | 113 | 16×16 | PNG | stub | hall neon strip (skipped) | R55.4 |
| `coin-slot.png` | 116 | 16×16 | PNG | stub | coin-insert chrome (skipped) | R55.5 |
| `credit-panel.png` | 112 | 16×16 | PNG | stub | credit-strip backdrop (skipped) | R55.6 |
| `wait-badge.png` | 132 | 16×16 | PNG | stub | WAIT badge (skipped) | R55.7 |
| `coast-lo-castle.png` | 112 | 16×16 | PNG | stub | Coast LO-borgen (skipped → procedural castle) | R55.40 |

Manifest names with **no file** (R38 `ART_FILES`, R54.7). Loader leaves
the slot empty; Coast renderer draws procedural glyphs.

| File | Kind | Catalog |
|------|------|---------|
| `coast-centerpartiet.png` | missing | R55.41 |
| `coast-harpsund.png` | missing | R55.42 |
| `coast-bommersvik.png` | missing | R55.43 |
| `coast-valdebatt76.png` | missing | R55.44 |
| `coast-castro-visit.png` | missing | R55.45 |

There is **no** `packages/client/static/art/pilots/` directory. P2-C
already relocated the JPEG pilots (see below).

## JPEG pilots (not served)

`packages/client/art-pilots/*.jpg` — 1280×720 JPEG reference stills for
Imagine. Not under `static/`, not served, never named `.png` (HTTP would
claim `image/png`). Wave 3 does not move them again.

| Pilot | Bytes | Maps to |
|-------|------:|---------|
| `coast-centerpartiet-pilot.jpg` | 357015 | R55.41 `coast-centerpartiet.png` |
| `coast-harpsund-pilot.jpg` | 417831 | R55.42 `coast-harpsund.png` |
| `coast-bommersvik-pilot.jpg` | 384702 | R55.43 `coast-bommersvik.png` |
| `coast-debate-1976-pilot.jpg` | 254754 | R55.44 `coast-valdebatt76.png` |
| `coast-palme-castro-pilot.jpg` | 347140 | R55.45 `coast-castro-visit.png` |

## Cabinets → current hero visual

Every cabinet is **procedural**. Hall idle minis use `cabThumb` glyphs
in `cabAccent` when there is no live snapshot; otherwise the attract
demo is the live procedural renderer scaled into the bezel (R8).
Marquees are i18n titles on an accent fill — no plate art.

| Game | In-cabinet hero | Hall marquee | Attract / idle mini | IDs |
|------|-----------------|--------------|---------------------|-----|
| snake | procedural grid snakes + food | i18n title + accent | `cabThumb` chevrons / live demo | R55.10–.12 |
| puck | procedural maze / dots / ghosts | i18n title + accent | `cabThumb` dotted field / live demo | R55.13–.15 |
| block | procedural bricks / paddles / ball | i18n title + accent | `cabThumb` brick rows / live demo | R55.16–.18 |
| galaxy | procedural starfield / aliens / ship | i18n title + accent | `cabThumb` stars + ship / live demo | R55.19–.21 |
| river | procedural lanes / frog | i18n title + accent | `cabThumb` water lines / live demo | R55.22–.24 |
| myriad | procedural mushrooms / segments | i18n title + accent | `cabThumb` dots / live demo | R55.25–.27 |
| coast | procedural pseudo-3D road; LO-borgen procedural (stub ignored); billboards procedural glyphs | i18n title + accent | `cabThumb` road + castle glyph / live demo | R55.28–.30 + R55.40–.45 |

Reserved drop names (not in `ART_FILES` yet — do not add 16×16
placeholders; wiring is a later wave):

`snake-hero.png` `snake-marquee.png` `snake-attract.png`
`puck-hero.png` `puck-marquee.png` `puck-attract.png`
`block-hero.png` `block-marquee.png` `block-attract.png`
`galaxy-hero.png` `galaxy-marquee.png` `galaxy-attract.png`
`river-hero.png` `river-marquee.png` `river-attract.png`
`myriad-hero.png` `myriad-marquee.png` `myriad-attract.png`
`coast-hero.png` `coast-marquee.png` `coast-attract.png`

Live attract demos stay (R8). Attract PNGs are idle mini-screen cards,
not a replacement for the bots.

## Hall / splash chrome (what the player actually sees)

| Surface | Current visual | ID |
|---------|----------------|----|
| Splash wordmark | procedural white + magenta shadow + amber year | R55.3 |
| Hall floor | procedural dark carpet + faint piping | R55.1 |
| Cabinet body | procedural fill; stub bezel ignored | R55.2 |
| Hall neon marquee | procedural scrolling i18n copy | R55.4 |
| Coin slot | procedural navy slot | R55.5 |
| Credit strip | procedural yellow badge | R55.6 |
| WAIT badge | procedural WAIT + dots | R55.7 |

## Handoff rules

1. Same filename as the ID. PNG bytes, not JPEG named `.png`.
2. ≥64 px on at least one axis or the loader ignores the drop.
3. Target 16–32 KB. Limited 1982 Tokyo arcade palette.
4. Own art / GPL-compatible. No commercial-game sprites.
5. Wave 1 drops R55.40–R55.45 (LO-borgen + five billboards).
6. After the first landed PNG, update `provenanceLines` in the same
   change (watermark-checked originals). Until then leave it honest.
