# Grim Dawn Build Calculator

A single-page build calculator for **Grim Dawn**, hosted on GitHub Pages.
Vanilla HTML/CSS/JS — no framework, no build server. Game data is compiled from the
`_gd_extract` datamine into `data.js` (a `window.GD_DATA` global) by `build-data.mjs`.

## Develop
```bash
node build-data.mjs          # compile _gd_extract tables -> data.js + copy used icons (runs hygiene guardrails)
node tools/serve.mjs         # preview at http://localhost:8080 (+ LAN URL for phone testing)
```
Stop the preview server (Ctrl+C) when done.

## Data pipeline
The calculator does **not** vendor raw game files. `build-data.mjs` reads the sibling
datamine `../_gd_extract/` at build time and ships only the subset the SPA uses:

- **Source:** `../_gd_extract/data/tables/*.json` (items, relics, masteries, game_formulas),
  `../_gd_extract/assets/asset_manifest.json` + PNG icons, and `../_gd_extract/labels.json`
  (the display-name boundary — every stat name in the UI comes from here).
- **Shipped subset (P0):** Epic + Legendary equippable gear + relics (~2,950 items), 9 masteries,
  the 13 damage-type/archetype traits, and only the icons those items use (copied into `assets/`).
- **Output:** `data.js` (`window.GD_DATA = { masteries, items, traits, slots, statMeta, difficulty }`).
- Guardrails resolve every trait reference and assert every icon exists on disk; the build
  **refuses to write `data.js`** on any error. Run `node build-data.mjs --strict` before a release.

The datamine (`_gd_extract`) is a **sibling** and is never committed here.

## What it does (P0)
- Pick up to **2 masteries** (the class combo).
- Fill the **paperdoll** (14 gear slots) — click a slot to open a slot-filtered item selector.
- **Live totals**: gear stats aggregate into a Base…Total stat table; a difficulty selector
  applies GD's real per-type resist penalties; resistances cap at 80% (Total turns gold).
- **Damage-type cross-reference matrix**: which equipped pieces share each damage type.

## Conventions
Build-first + overlay-driven UI, statically-sized overlays, scroll never resets on re-render,
mobile-first. Traits are **data** (damage types) coloured via `--aff-color`/`--aff-text`; stat
tables are grids with fixed `Base…Total` columns (no cell shows two numbers). See `SPEC_PLAN.md`,
`WIKI_CONTEXT.md`, and `Progress.md`.

## Deploy (later)
Everything is static and `data.js` is committed, so deploy is: push to GitHub, enable Pages on
`main`/`root`. The Cloudflare Web Analytics beacon in `index.html` ships **commented out**; enable
it only at public release.

*Item sprites and skill icons © Crate Entertainment, extracted for this fan tool. Data is an
unverified extract — treat numbers as provisional until hardened against in-game values.*
