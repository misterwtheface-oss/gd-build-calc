# Grim Dawn Build Calculator — Spec Plan

## Purpose
A theorycraft sandbox for Grim Dawn: pick a class combo and gear up a full paperdoll, then
see the resulting stat totals (resistances, armor, OA/DA, attributes) and which damage types
your equipped pieces reinforce — before committing to farming the items in-game. The long-term
north star is a high-fidelity in-app reproduction of GD's damage/defense math (the combat model
is already mapped in `_gd_extract/code/PROCEDURAL_MAP.md`) so a computed DPS/EHP matches the game.

## Data model
Compiled by `build-data.mjs` from the `_gd_extract` datamine into `window.GD_DATA`.

- **Mastery** — `{ id, name, icon }`. The 9 classes; a build picks up to 2 (the class combo).
- **Slot** — `{ id, type, name, art }`. 14 physical paperdoll positions; `type` is the item
  class family it accepts (ring1/ring2 share type `ring`). `art` = the extracted slot-background PNG.
- **Item** — `{ id, name, slot(type), rarity, levelReq, icon, traits[], conflicts[], stats{}, skills[], set }`.
  - `slot` is the item's slot *type*; the app pools items by type.
  - `stats` = a curated whitelist of flat contributions (resists, armor, health, OA/DA, attributes),
    keyed by the raw field, displayed via `statMeta` (names from `_gd_extract/labels.json`).
  - `traits` = **derived damage-type/archetype associations** (fire/cold/…/vitality/aether/chaos/
    bleeding/acid/elemental + retaliation/pet), computed from the item's real offensive fields.
    Associations are DATA, not prose — this is what powers the cross-reference matrix.
  - `conflicts` = separate channel (unused in P0, reserved so it never merges with `traits`).
  - `skills` = resolved `skillGrants` (granted actives + "+N to skill/mastery").
- **Trait** — `{ id, name, color, icon, blurb }`. Damage types + archetype tags; `color` is the
  single source of truth for theming (banners + matrix columns via `--aff-color`/`--aff-text`).
- **statMeta** — ordered stat descriptors `{ field, name, group, cap }` (resists cap at 80).
- **difficulty** — per-type resist penalties `{ Normal:{}, Elite:{…}, Ultimate:{…} }`, pulled from
  `game_formulas.difficultyScaling.players` (Elite band idx 4, Ultimate idx 8).

## Architecture
- Stack: vanilla HTML/CSS/JS; data compiled to `window.GD_DATA` (see `WIKI_CONTEXT.md`).
- Data flow: `../_gd_extract/data/tables/*.json` + `asset_manifest.json` + `labels.json`
  → `build-data.mjs` (transform + copy used icons + hygiene guardrails) → `data.js` → `app.js`.
- Persistence: `localStorage` under `gdbc.*` (`gdbc.build` = `{ masteries, build, difficulty }`).
- UI: build-first paperdoll; selection in a statically-sized overlay on `#overlay-root`; detail
  pages stack on `#detail-overlay-root`; every re-render preserves `scrollTop`; event delegation.

## Feature plan (prioritized)
### P0 — baseline (this session; runnable + testable) ✅
- [x] Mastery combo picker (up to 2 of 9).
- [x] Paperdoll (14 slots) with extracted slot art; click slot → slot-filtered item overlay.
- [x] Item selector: real sprites, rarity-coloured, search; left = item stats, right = traits + skills.
- [x] Live totals: gear aggregation, difficulty resist penalty, resist cap at 80 (gold).
- [x] Damage-type cross-reference matrix across equipped gear.
- [x] Data-hygiene guardrails in `build-data.mjs`.

### P1 — core value (next sessions)
- [ ] **Skill trees**: mastery skill trees + point budgets (level → skill/attribute/devotion points
      from `game_formulas`), +skill from gear folded in. Skill icons already extracted.
- [ ] **Devotion**: the constellation map (`devotion.json`), affinity requirements, star allocation.
- [ ] **Affixes / components / augments** on items (the extract has all three, roll-ready).
- [ ] **Sets & set bonuses** (`sets.json`) — highlight completed sets; fold set bonuses into totals.
- [ ] **Attributes & level**: physique/cunning/spirit allocation, requirements checking.
- [ ] **Save / share builds** (schema-versioned localStorage + shareable URL, like the VS tool).
- [ ] Expand shipped items to all rarities (currently Epic + Legendary only).

### P2 — nice-to-have
- [ ] **DPS / EHP simulation** vs a target (`PROCEDURAL_MAP.md` combat model + `monsters.json`,
      difficulty resist penalties already wired).
- [ ] **Pets** panel (`pets.json`: base equations + the "to all pets" bonus pool).
- [ ] Conversion & flat-damage-to-% interplay; skill modifier interactions.
- [ ] Appendix / detail pages; component & augment recommendations by trait.

## Open questions
- Weapon set 2 (GD has a second weapon slot pair) — model as a toggle in P1?
- Dual-wield vs 2H vs weapon+offhand: enforce offhand compatibility with main-hand class in P1.
- Which stat set to surface in totals as skills/devotion come online (the whitelist will grow).
- Verification: current data is an **unverified extract**; hardening against in-game values is a
  separate pass (drop annotated reference values, then wire in — see `_gd_extract` golden workflow).
