# Grim Dawn Build Calculator — Progress

## Current state
**LIVE (2026-09-14):** https://misterwtheface-oss.github.io/gd-build-calc/ — repo
`misterwtheface-oss/gd-build-calc` (public, `main`, GitHub Pages from root). Cloudflare Web
Analytics beacon active (shared github.io token). Verified serving 200 (html/js/css/icons).

**Authentic game-UI reproduction (2026-09-14):** all three GD windows are now rendered from the
game's own layout data (extracted into `_gd_extract/data/tables/ui_layout.json` by
`build_ui_layout.py` + `build_devotion_map.py`):
- **Paperdoll centerpiece** — real character-window geometry (14 slots at their true pixel
  coords + silhouettes + model-viewport, over the cropped panel art), positioned as % so it scales.
- **Skill trees** (Skills button) — per-mastery class panel: shared background + every skill node
  at its true `bitmapPositionX/Y`, icon resolved per node (buff-chain fallback), circular transmuters.
- **Devotion** (Devotion button) — the celestial galaxy: 5 nebulae + 110 constellation figures +
  ~558 stars pre-composited from real galaxy coords into one pannable/zoomable JPEG (~0.8MB).

**P0 (2026-09-14).** Mastery combo picker, item selector overlay (Epic + Legendary, ~2,951 items),
difficulty-aware totals (resist penalties + 80% cap), damage-type cross-reference matrix. Data
compiled from `_gd_extract` by `build-data.mjs` (1,762 icons copied) with hygiene passing clean.

## Backlog
### In progress
- (none — P0 complete; pick the top "Next up" item)

### Next up (P1)
- [ ] Skill-tree **point allocation** (the authentic layout renders; add per-node ranks, level →
      skill/attribute/devotion point budgets from `game_formulas`, fold +skill from gear) + node
      descriptions. Skill icons + positions already shipped.
- [ ] Devotion **allocation** (galaxy renders; add per-star ranks, affinity thresholds, celestial
      powers). Constellation centroids + affinity already emitted in `GD_DATA.devotion`.
- [ ] The ~26 iconless skill-tree modifier nodes (render as empty nodes now) — resolve via base-skill
      sibling icon.
- [ ] Affixes / components / augments on items (`affixes.json`, `components.json`, `augments.json`).
- [ ] Sets & set bonuses (`sets.json`) — completed-set highlight, fold bonuses into totals.
- [ ] Attributes & level allocation (Physique/Cunning/Spirit) with requirement checks.
- [ ] Save / load / share builds (schema-versioned `gdbc.builds` + shareable URL).
- [ ] Expand shipped item set beyond Epic + Legendary (config in `build-data.mjs`: `SHIP_RARITY`).

### Later (P2)
- [ ] DPS / EHP simulation vs a target (`_gd_extract/code/PROCEDURAL_MAP.md` + `monsters.json`).
- [ ] Pets panel (`pets.json`).
- [ ] Conversion / flat→% damage interplay; skill modifier interactions.
- [ ] Appendix / detail pages; component & augment suggestions by damage type.

## Known issues / warnings
- Data is an **unverified extract** — numbers are provisional until checked against in-game values.
- Totals surface a curated stat whitelist only (resists, armor, health, OA/DA, attributes); many
  offensive %-damage / speed fields exist on items but aren't in the totals table yet (they DO feed
  the trait derivation). Expand `STAT_META` in `build-data.mjs` as the totals view grows.
- Off-hand slot accepts caster off-hands + shields but does not yet enforce main-hand compatibility
  (2H should disable off-hand; dual-wield rules). Deferred to P1.
- `ring2` shares the `ring` pool with `ring1` (correct); no per-slot uniqueness rule yet.
- Analytics beacon in `index.html` is ACTIVE (enabled at public release; shared github.io token).

## Session log
- 2026-09-14: Scaffolded the project via build-calc-planner. Wrote `build-data.mjs` (extract → lean
  `window.GD_DATA`, damage-type trait derivation, difficulty penalties, icon copy, hygiene), adapted
  the skeleton (GD palette: dark iron + gold + blood-red; rarity colours; paperdoll; mastery picker;
  difficulty switch), and the planning artifacts. P0 flow verified locally; git initialized.
- 2026-09-14: Deployed. Activated the Cloudflare analytics beacon, created public repo
  `misterwtheface-oss/gd-build-calc`, pushed `main`, enabled GitHub Pages (root). Live + verified.
- 2026-09-14: Authentic game-UI reproduction. Discovered GD's UI is data-driven (`records/ui/**`),
  added `_gd_extract/tools/build_ui_layout.py` (paperdoll + skill-tree geometry → `ui_layout.json`,
  crops the doll panel) and `build_devotion_map.py` (composites the devotion galaxy JPEG). Rebuilt the
  main page around the real paperdoll; added Skills (per-mastery class panel) and Devotion (pannable
  galaxy) views. Verified each with pixel composites; all three live. Point allocation is next.
