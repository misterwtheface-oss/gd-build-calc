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
- [ ] **Class nameplate in the paperdoll center** (fill the empty model-viewport). Render a live
      class title that updates as masteries are picked: 0 picked → "choose masteries" prompt; 1 →
      the mastery name; 2 → the combined class name (e.g. Soldier+Demolitionist = *Commando*).
      Data ready in the extract: all **36 dual-class combo names** = `tagSkillClassName0<a><b>` (a,b =
      the two mastery digits 01-09; e.g. 0102=Commando, 0103=Witchblade, 0104=Blademaster, 0109=Warlord),
      plus per-class **colour-coded name banners** `ui/skills/skillallocation/skills_class0Ntrainingbuttonup.png`
      (197×41) usable as the nameplate backdrop, and the class-selection bg (983×605).
      NOTE: GD has **no class emblems/portraits and no dual-class art** — identity is name+colour only,
      so this is typographic/banner-based, not an emblem. To build: emit combo-name map + banner art
      into `GD_DATA`, render into `.pd-viewport`. Open Q: keep the mastery chip row above the doll, or
      move the picker into the center itself (asked, not yet decided).
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

### Parked (big / gated)
- [ ] **3D character wearing equipped gear** (fill the model viewport with the actual character).
      PARKED — data exists (each item's `armorMale/FemaleMesh` `.msh` + `baseTexture`/`bumpTexture` +
      `hideFeet/Legs/Shoulders/Hands` layering flags; base player body `creatures/pc/*.msh` + anims),
      but GD's `.msh` is a **custom format (`MSH\x03`) with NO exporter** — `ModelCompiler.exe` only
      compiles *to* .msh. Rendering (live OR pre-rendered static PNGs) requires reverse-engineering
      MSH v3 + a render rig (skeleton/pose/camera/textures) + per-item worn-render batch — a dedicated
      multi-session effort. Static-PNG approach does NOT dodge the cost (mesh RE + render rig is the
      hard part). Note: the inventory icons we already ship ARE static renders of each item *in
      isolation*; GD ships no *worn-on-body* renders. Viable first step if revisited: attempt to parse
      MSH v3 (community Blender importers exist) and render base body + one chest piece as a PoC.

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
- 2026-09-14: Fixed paperdoll bottom-frame clipping (crop 430→447) + enlarged doll (468px). Explored
  filling the model viewport: 3D character render PARKED (MSH format has no exporter — see Parked).
  Class-nameplate-in-center scoped instead (36 combo names + banner art available) — added to P1.
