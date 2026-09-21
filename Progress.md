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

**P1 — TALENT + DEVOTION POINT CALCULATORS (2026-09-15).** Both trees are now real point calculators:
- **Skill tree = the class picker** (replaced the old mastery chips). Header shows a Class & Points
  panel: character-level input (drives budgets), combo class name (36 dual-class names), and
  Skill/Devotion budget buttons. The overlay: two mastery SLOTS (pick a mastery from a 9-class grid →
  costs 1 pt, mastery level 1), a **50-segment mastery-bar control** with tier markers (invest points
  → raises mastery level → unlocks tier-gated skills), and the authentic node canvas where each node
  shows a **rank badge (x/max)**, dims+locks when its tier or base-skill prereq isn't met, and glows
  gold/green when allocated/maxed. Click = +1, right-click / Shift-click = −1, double-click = detail
  (per-rank scaling table + description). Budget counter turns red on overspend.
- **Devotion = a real star calculator.** Every star is a clickable hit-target on the galaxy image at
  its true pixel centre. Clicking allocates (gated by affinity thresholds + link order), clicking an
  allocated star removes it and **cascades** (dependents + affinity-loss). Affinity bar (5 colours)
  tracks accrual; a side panel shows the selected constellation's requirement/grant/stars/celestial
  powers. 55-point budget. Crossroads seed affinity exactly as in-game (verified: only the 6
  no-requirement constellations are reachable at 0 affinity; Bat etc. correctly lock).
- **Totals integration.** New **Talents** column folds in mastery-bar attributes + allocated skill
  (flat scaling at current rank) + devotion (flat grants) for any field in the totals whitelist.
- **Authentic class-selection screen + per-class art (2026-09-15, LIVE).** Picking a mastery now opens
  the real GD class-selection screen: the `skills_classselectionbackgroundimage` backdrop, a column of
  nameplate buttons (the game ships only TWO plate skins — `skills_buttonclassselectionup01/02` — reused
  alternately, NOT one per class; matched that), and a preview pane with the per-class **644×460
  illustration** (`skills_classselectedimage0N`, index N = mastery id, verified Soldier=01…Oathkeeper=09)
  + mastery description + Choose button. Each class's skill tree gets **its own art** as a darkened
  backdrop behind the (still shared, pixel-calibrated) stone node canvas + a rail hero image, so trees
  read as per-class. KEY finding: GD uses ONE shared node-grid backdrop for all classes
  (`classpanelbackgroundimage` all point to `skills_classbackgroundimage.tex`) — per-class identity is
  the selection art, not the grid. `build-data.mjs` emits `skilltree.classSelectBg`, `bannerArt[2]`,
  and per-class `art`/`desc`; 12 new PNGs ship under `assets/ui/skills/classselection/`.
- **Extract-side additions** (`_gd_extract`): `build_progression.py` → `progression.json` (max level
  100, 55 devotion, per-level skill points [Σ=238], `skillMasteryTierLevel=[1,5,10,15,20,25,32,40,50]`,
  mastery-bar max 50, 36 dual-class combo names). `build_devotion_map.py` now also emits per-star
  pixel centres (`ui_layout.devotion.starPos`, 558/559 joined). `build-data.mjs` joins ui_layout →
  `skills.json` (maxLevel/ultimateLevel/tier/desc + label-driven per-rank `scaling`) and derives
  modifier→base prereqs (stem + spatial fallback, **124/124 resolved**); joins `devotion.json`
  (affinity req/given, links, star grants) → starPos. Verified end-to-end via a jsdom smoke harness
  (29 checks: allocation, tier gating, budgets, cascade, totals, persistence).
- **DEPLOYED (2026-09-15).** All of P1 (calculators + class-selection screen) is pushed to `main` and
  LIVE at the GitHub Pages URL; verified the CDN serves the new `data.js` (2,082,479 B), `app.js`, and
  class art. data.js grew 1.37→2.08 MB. Not yet reviewed on a real phone (LAN preview was blocked by a
  phone-side filter / router client-isolation — PC firewall was confirmed open, so we shipped instead).

**UI POLISH — mastery selector + skill tree (2026-09-19, NOT yet deployed).** `app.js` + `styles.css`
only (no data/pipeline change):
- **Centered home layout (web).** `.class-panel`, `.totals`, `.xref-section`, `.app-foot` now use
  `margin: … auto` so every home block centers in a column (paperdoll already was).
- **Mastery selector reworked.** Dropped the "Choose a Mastery" rail instructions and the
  "Pick a mastery to view…" footer hint; moved the **Choose/Confirm button into the header next to the
  ×** (new `.st-header-right` + `.st-header-confirm`, injected per-render, hidden in allocation mode).
  Selection is **tinted red** (inset red wash + `--accent-hi` outline, was gold glow) and the hover
  **brightness pop is gone**. Banner list sits left of an explicit divider (`border-right`), preview
  fills the container width independent of prose. **Mobile (`≤900`):** rail/hero hidden (`.mode-pick`),
  banners become a **centered vertical list**, and the info panel only appears once a mastery is tapped
  (`.st-select.has-sel`).
- **Fixed-size preview (task 1).** Preview is now a stable region — class art pinned at top (`height:58%`,
  `flex:0 0 auto`) with prose scrolling below (`flex:1 1 auto; min-height:0; overflow-y:auto`), panel
  `overflow:hidden` + `justify-content:flex-start`. Art no longer shifts/resizes with description length.
- **Unique per-mastery tree backdrops (task 2).** The per-class art was hidden behind the opaque shared
  grid; moved `--class-art`/`has-art` onto `.skilltree-canvas` and added
  `.skilltree-canvas.has-art::before` (`cover`, `opacity:.32`, behind nodes). All 9 masteries now show a
  distinct backdrop over the shared stone grid.
- **Skill connectors (task 3).** `renderTreeCanvas` emits an SVG overlay (`.st-links`,
  `preserveAspectRatio="none"`, non-scaling strokes) drawing a line from each modifier skill to the base
  skill it `requires` (**124 links**, all resolve). Dim by default, lights **gold** when the prerequisite
  point is invested AND the tier is unlocked. Z-order: backdrop(0) → connectors(1) → nodes(2/alloc3/hover4).
- **Allocation enforcement (task 4).** Confirmed already-correct: `allocSkill`/`legalizeSkills`/
  `tierUnlocked` gate by mastery-bar level (tiers→`[1,5,10,15,20,25,32,40,50]`), require ≥1 pt in a
  modifier's base skill, enforce the shared point budget, and cascade un-allocation on downgrade — the
  new connectors just make the gating legible. Locked nodes stay 🔒/greyed and flash the reason on click.
- **Status:** `node --check` clean; data joins re-verified (124/124 links, 9/9 backdrops). Visual-only,
  **needs a browser look on desktop + phone width** before pushing. Not deployed.

## Backlog
### In progress
- (none — P1 talent + devotion calculators complete; pick the top "Next up" item)

### Next up (P1)
- [ ] **Deploy + browser-verify the 2026-09-19 UI polish** (mastery-selector rework, centered home,
      fixed-size preview, per-mastery backdrops, skill connectors) — currently local-only; look on
      desktop + phone width, then push to `main`. Easy dials if needed: backdrop `opacity:.32`, connector
      stroke colors, art `height:58%`.
- [ ] **Mobile review of the new UI** (still unverified on a real phone): class-selection screen now
      stacks vertically under `≤900` (centered banner list + on-tap info panel) — confirm it reads well;
      check skill-node + devotion-star tap-target sizes; touch has no right-click/Shift for rank-DOWN,
      so add a −/＋ stepper (e.g. in the node detail) for touch.
- [ ] The ~26 iconless skill-tree modifier nodes (render with a letter fallback now) — resolve via
      base-skill sibling icon.
- [ ] Attribute-point allocation (Physique/Cunning/Spirit; `attributePointsPerLevel`=1, +8/pt) —
      steppers + requirement checks; fold into totals.
- [ ] Expand Talents totals: %-damage / OA-DA / skill-conditional bonuses (currently flat-only).
- [ ] Celestial-power NAMES/details on devotion stars (currently a ✦ flag; resolve the proc skill).
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
- 2026-09-15: **Talent + devotion POINT CALCULATORS shipped.** Extract: added `build_progression.py`
  (progression.json: budgets, tier gates, combo names), extended `build_devotion_map.py` (per-star
  pixel centres). Pipeline: `build-data.mjs` now joins ui_layout→skills.json (caps/tier/desc/label
  scaling) with a 124/124 modifier→base prereq resolver (stem+spatial), and devotion.json→starPos.
  App: rewrote `app.js` — mastery chips REPLACED by the skill tree as class picker; mastery-bar
  control + tier-gated rank allocation; clickable devotion stars with affinity accrual/thresholds +
  cascade removal; character-level→budget; Talents column in totals. data.js 1.37→2.08MB. Verified
  with a jsdom harness (29 checks, all pass).
- 2026-09-15: **Class-selection screen + per-class art, then DEPLOYED.** Added the authentic
  class-selection screen (backdrop + nameplate buttons + per-class 644×460 illustration + description +
  Choose), per-class tree backdrop + rail hero. Found GD ships only 2 generic nameplate skins (not per
  class) and uses one shared node-grid backdrop for all classes — so per-class identity = the selection
  art. `build-data.mjs` now emits `classSelectBg`/`bannerArt[2]`/per-class `art`+`desc`; 12 new PNGs.
  Re-verified via jsdom (20/20). Tried LAN preview for mobile (`tools/serve.mjs`) — phone was blocked;
  audited the firewall and confirmed it was OPEN (8080 Allow Any + Node allow on Public), so the block
  was phone-side (VPN/Private-Relay/DNS) or router client-isolation. Per user, pushed to `main` and
  deployed to GitHub Pages instead; verified the live CDN serves the new build. Server stopped.
- 2026-09-19: **UI polish (mastery selector + skill tree), local-only.** `app.js`+`styles.css`, no data
  change. (1) Centered home blocks on web. (2) Reworked the mastery selector: dropped rail "Choose a
  Mastery" + footer hint, moved Confirm next to the header ×, red-tinted selection, killed the hover
  pop, list-left-of-divider, and a **fixed-size preview** (art pinned top, prose scrolls) so it no longer
  resizes with description length. Mobile (`≤900`): rail hidden, centered vertical banner list, info panel
  on tap. (3) **Per-mastery tree backdrops** — moved class art onto the canvas (`::before`, opacity .32)
  since the opaque grid was hiding it. (4) **Skill connectors** — SVG lines from each modifier to its
  required base skill (124/124), gold when the prereq+tier are satisfied. (5) Confirmed tier/prereq
  **allocation enforcement** was already correct; connectors just make it visible. `node --check` clean;
  joins re-verified. Needs a browser look before deploying — NOT pushed.

- **UI overhaul session (2026-09-19, remote-control):**
  1. **Mobile mastery selector** — on `≤900` the picker now shows ONLY the selection icons; dropped the
     `.st-select.has-sel .st-select-preview` reveal so the mastery art + prose stay hidden on mobile
     (confirm lives in the header, unaffected). Desktop unchanged.
  2. **Corrected skill-tree backdrop art (grounded)** — the pane backdrop was using the framed class-
     *selection* portrait (`classselection/skills_classselectedimage`, cover+opacity .32). The game's
     skill-allocation pane (`records/ui/skills/classNN/classtable.dbr` → `skillPaneMasteryBitmap`) actually
     draws `skillallocation/skills_classimage${cid}` (640×605) crisp at (0,0) over the 983×605
     `skills_classbackgroundimage` pane — the asset carries its own right-side alpha fade. Added `paneArt`
     + `paneArtBox{0,0,640,605}` to build-data; `renderTreeCanvas` + `.has-art::before` now draw it left-
     anchored at its native box, no cover/opacity hacks. `art` (selection portrait) kept for the picker.
  3. **Berserker (gdx3 / class 10) fully wired** — the extract's `ui_layout.json` predated gdx3, so the
     app only had 9 skill trees. Re-ran `build_ui_layout.py` (records.pkl already had all 31 class10
     buttons) → `build_devotion_map.py` (re-merges devotion). Skilltree now 10 classes, Berserker = 31/31
     named+iconed nodes, mastery-bar attrs populated (50 lvls), paneArt = `skills_classimage10`. Fixed
     `build_progression.py dual_class_names()` (was classes 1–9, mis-padded `0{a}0{b}` tag) → zero-padded
     `tagSkillClassName{a:02d}{b:02d}`, all 10 masteries → 45 combos incl. 9 Berserker pairings (Thane,
     Dreadnaught, Mystic, Reaver, Evoker, Primalist, Runekeeper, Veilwalker, Zealot). App comboName key
     (`Number(cid)` sorted, e.g. "110") matches. data.js rebuilt (2056 icons). NOT pushed — browser look first.

- **UI overhaul + skill-window fidelity + tooltips + synergy edges (2026-09-19 → 09-21, remote-control):**
  Continues the session above; all LIVE on GitHub Pages (auto-deploy, main; site has NO active users →
  push+deploy straight to main, no local-verify gate).
  4. **Mobile mastery info = half-page bottom sheet** — tapping a mastery opens a ~62vh bottom sheet
     (art + full prose + Back/Choose) over the dimmed list, not full-screen. Fixed a flex `min-width:auto`
     chain (`#overlay-root` is flex; the `<img>` inflated the panel past 100vw) with a definite width.
  5. **Mastery prose grounded** — was showing the terse mastery-bar training-node tooltip
     (`_classtraining_classNN.dbr.skillBaseDescription`). Real blurb = `classtable.dbr →
     skillPaneDescriptionTag → tagSkillClassDescription{NN}`. `build_tables.py build_masteries()` now emits
     `description`; `build-data.mjs` reads `masteryRaw[cid].description`.
  6. **Skill mastery-gating fix** — `[skillTier-1]` index into `[1,5,10,15,20,25,32,40,50]` was correct
     (code: `SkillProfile::LoadProfile @ 0x44dda0`), but 49 tree buttons point to WRAPPER skills (toggled
     auras / SkillSecondary / pet-mods) with no `skillTier`; real tier is on `buffSkillName`/`petSkillName`/
     `modifiedSkillName`. `build-data` follows that chain (`effectiveSkillRec`) for tier + scaling → 43
     skills were mis-gated to lvl 1 (e.g. Field Command now lvl 20).
  7. **Mobile mastery selector polish** — black field (no UI backdrop), tiny header, Choose→footer,
     centered stack; deselect via a ✕ on each assigned mastery TAB (rail's old remove button dropped).
     Rail is now JUST the investment tracker (level readout + 50 CSS squares + −/+, no art/chrome).
  8. **Skill window fidelity** — nest the interior in the game's ornate outer frame
     (`skills_classwindowbackgroundimage`, opening insets measured t11.5/r1.0/b5.1/l0.9%); number the 9
     bottom tier circles 1/5/10/…/50 (measured x-centers, lit as the bar reaches each) + light-rays rising
     from each (origin pinned to the ring opening y=546/9.75%-from-bottom); skill icons `image-rendering:
     pixelated` (32px native, upscaled). Frame unwraps on mobile.
  9. **Mobile tree = fill height, horizontal pan, NO vertical scroll** — canvas `height:100%; width:auto`
     (inline-block in a block scroll container so aspect-ratio drives width reliably; flex mangled it). The
     mobile rule must live AFTER the base `.skilltree-canvas` (media queries add no specificity).
  10. **Connectors = rounded elbows, branch topology** — off-row modifiers are an offshoot of the base's
     horizontal spine: run along the spine to the midpoint between base & modifier columns, rounded turn,
     into the modifier's LEFT edge (e.g. Tremor branches midway between Forcewave "1" and its "5").
  11. **Game-accurate skill tooltips** (hover desktop / tap mobile) — composition verified vs decompiled
     `GenerateUISkillText @ 0x102645e0`: name · `<Mastery> · <Type> · Requires Mastery N · Modifies <base>`
     · rank · description (format codes cleaned: `^o`=break+orange note, `{^n}` breaks, `{%…}` value tokens
     dropped) · mechanical block (energy/cooldown/duration/weapon%/radius) · effect stats ordered by
     labels.json `cat` (skill→offense→dot→resist→cc) each with a next-rank `→`. `kind` (from record `Class`)
     + `exclusive` added to build-data. Tooltip: interactive+scrollable (62vh mobile cap), tap-off dismiss,
     placed in the larger gap above/below the node so it never covers the icon. Double-tap detail overlay
     REMOVED. (Bug fixed: fmtDesc used invisible `\x01` markers → corrupted capital A/B; now `@@BR@@`.)
  12. **Dual-mastery synergy edges** — `skilltree.edges[pair]` (numeric-sorted cid key "12"/"110"): per
     shared damage type, per-mastery `{deal,buff}` counts (magnitude). Per skill: `deals` (outputs a type)
     vs `buffs` (**global** amplifiers). **Edge = a type BOTH masteries HAVE (deal OR buff)** — gear affixes
     then benefit both. Dropdown (off / all / a specific type w/ magnitude) focuses one edge; DEALERS ring
     cyan, AMPLIFIERS ring purple, rest dim. Tooltip states deals-vs-amplifies + per-mastery counts.
     **Local/global fix**: a `+n% X Damage` modifier is GLOBAL only on a character-wide buff
     (Passive/Buff/Toggle); on an active attack or transmuter/modifier it's LOCAL (scales that skill only,
     e.g. Fire Strike's %Physical) → counts as DEALING, not amplifying. RR is always global (enemy debuff).
     `skillEdge(scaling, kind)` gates on kind; global amps 86→35.
