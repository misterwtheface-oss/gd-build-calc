# Grim Dawn Build Calculator — Progress

## Current state
**P0 scaffolded and runnable (2026-09-14).** Build-first paperdoll with a mastery combo picker,
14 gear slots, a slot-filtered item selector overlay (real sprites, rarity-coloured), a
difficulty-aware totals table (resist penalties + 80% cap), and a damage-type cross-reference
matrix. Data is compiled from the `_gd_extract` datamine by `build-data.mjs` (Epic + Legendary gear
+ relics, ~2,951 items, 1,535 icons copied) with hygiene guardrails passing clean. Skills, devotion,
affixes, sets, and the DPS sim are not built yet — they are the P1/P2 backlog.

## Backlog
### In progress
- (none — P0 complete; pick the top "Next up" item)

### Next up (P1)
- [ ] Skill trees + point budgets (level → skill/attribute/devotion points from `game_formulas`);
      fold +skill from gear. Skill icons already in the extract.
- [ ] Devotion constellation map (`devotion.json`) — affinities + star allocation.
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
- Analytics beacon in `index.html` is intentionally commented out (enable only at public release).

## Session log
- 2026-09-14: Scaffolded the project via build-calc-planner. Wrote `build-data.mjs` (extract → lean
  `window.GD_DATA`, damage-type trait derivation, difficulty penalties, icon copy, hygiene), adapted
  the skeleton (GD palette: dark iron + gold + blood-red; rarity colours; paperdoll; mastery picker;
  difficulty switch), and the planning artifacts. P0 flow verified locally; git initialized.
