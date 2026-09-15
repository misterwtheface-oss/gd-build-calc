# Grim Dawn — Wiki / Context Tree

Context for a future session to extend this calculator without re-learning the game or the pipeline.

## Game basics
Grim Dawn (Crate Entertainment) is an action-RPG (ARPG) in the Diablo/Titan Quest lineage. A
character combines **two of nine Masteries** (classes) — e.g. Soldier + Demolitionist = "Commando" —
each with its own skill tree. Power comes from four stacking systems:
1. **Skills** — points spent in the two mastery trees (active skills + passives + transmuters/modifiers).
2. **Devotion** — a separate constellation map; completing constellations grants stats + celestial powers.
3. **Gear** — a full paperdoll (~14 slots) of items with flat + % stats, granted skills, affixes,
   components (socketables), augments, and set bonuses.
4. **Attributes** — Physique / Cunning / Spirit points (GD's Strength / Dexterity / Intelligence).

Difficulty tiers (Normal → Elite → Ultimate) each apply a **resistance penalty** to the player, so
"resist overcap" is a core gearing goal. Resistances cap at **80%**.

## Key mechanics (for the calculator)
Non-obvious rules — many are naming traps decoded in `_gd_extract/PARAMETER_GLOSSARY.md`:
- **Engine `Class` names are inverted vs UI:** `ItemArtifact` = **Relic** (crafted), `ItemRelic` =
  **Component** (socketable), `ItemEnchantment` = **Augment**. Item slots are `ArmorProtective_*`,
  `ArmorJewelry_*`, `WeaponMelee_*`, `WeaponArmor_Offhand/Shield`, `WeaponHunting_Ranged1h/2h`.
- **`offensiveLife*` = Vitality damage** (NOT health/leech). `offensiveLifeLeech*` is life steal —
  the trait derivation regex `^offensive(Slow)?<Tok>(Min|Max|Modifier)$` deliberately excludes Leech.
- **`offensiveSlow<Type>*` = the named DoTs** (Fire→Burn, Cold→Frostburn, Lightning→Electrocute,
  Physical→Internal Trauma, Life→Vitality Decay, Bleeding, Poison). Counted toward the damage-type trait.
- **Attributes renamed:** Physique = `characterStrength`, Cunning = `characterDexterity`,
  Spirit = `characterIntelligence`. Armor = `defensiveProtection`. Vitality resist = `defensiveLife`.
- **Difficulty resist penalty is per-type**, from `game_formulas.difficultyScaling.players`: the arrays
  are 12-slot bands grouped in 4s (Normal[0-3]/Elite[4-7]/Ultimate[8-11]). Fire/Cold/Lightning/Pierce/
  Poison get −25 Elite / −50 Ultimate; Chaos/Aether/Vitality/Bleed get 0 Elite / −25 Ultimate. The build
  step reads idx 4 (Elite) and idx 8 (Ultimate).
- **Combat model is already mapped** (for the future DPS sim): `_gd_extract/code/PROCEDURAL_MAP.md` —
  %modifiers are additive per type, a separate multiplicative `0x3d` "% Total Damage" bucket, conversion
  order, OA/DA + 6 crit tiers, defensive pipeline (resist→reduction→armor→absorption), retaliation,
  pets (own base + owner's "to all pets" pool, not %-of-player).

## Data sources & datamine access
- **Datamine workspace:** `../_gd_extract/` (a SIBLING — NOT shipped, never committed here).
  Entry point: `_gd_extract/CONTEXT_MAP.md`. It is fully calculator-ready (Level-2 data tables,
  Level-3 combat model, and Level-1 icon assets + `asset_manifest.json`).
- **How to (re)generate this calculator's data:**
  - `node build-data.mjs` — reads the extract by relative path, transforms, copies used icons, writes `data.js`.
  - Inputs it reads (do not copy these into the repo):
    - `_gd_extract/data/tables/items.json` — equippable gear (Class = slot, `itemClassification` = rarity,
      stat fields, `skillGrants`, `itemSetName`).
    - `_gd_extract/data/tables/relics.json` — crafted relics (→ the relic slot).
    - `_gd_extract/data/tables/masteries.json` — the 9 classes.
    - `_gd_extract/data/tables/game_formulas.json` — `difficultyScaling.players` resist penalties.
    - `_gd_extract/assets/asset_manifest.json` + `_gd_extract/assets/items/*.png` +
      `_gd_extract/assets/ui/character/*.png` — item sprites + paperdoll slot art.
    - `_gd_extract/labels.json` — the display-name boundary; every stat label in the UI resolves here.
  - To regenerate the extract itself (rarely needed): see `_gd_extract/CONTEXT_MAP.md` §rebuild order.
- **What ships vs. gitignored:**
  - SHIPPED (committed): `data.js`, `assets/items/*.png`, `assets/ui/character/*.png`, the app source.
  - GITIGNORED / never committed: the entire `_gd_extract/` workspace, raw tables, decompiled source,
    the full 119 MB asset export. Only the ~1,535 icons the shipped items use are copied in.
- Future P1 tables ready in the extract when needed: `skills.json`, `devotion.json`, `affixes.json`,
  `affix_pools.json`, `item_affixes.json`, `components.json`, `augments.json`, `sets.json`,
  `blueprints.json`, `pets.json`, `monsters.json`.

## Data model reference
See `SPEC_PLAN.md` → Data model for the field-by-field `window.GD_DATA` shape the app expects.
Key derivations in `build-data.mjs`:
- **slot type** ← `classToType` (item `Class` → paperdoll slot type; rings share `ring`).
- **traits** ← `deriveTraits()` scans `^offensive(Slow)?<Tok>(Min|Max|Modifier)$` per damage type +
  `retaliation*` / pet fields for the archetype tags.
- **statMeta names** ← `labels.json` (`labelName(field)`).
- **difficulty penalties** ← `game_formulas.difficultyScaling.players.adjustments[field][4|8]`.

## Status
The shipped data is an **unverified extract** (extracted from game files, not yet checked against
in-game tooltips). Treat numbers as provisional; hardening is a later pass.
