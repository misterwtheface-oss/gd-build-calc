/*
  build-data.mjs — compiles the Grim Dawn datamine (../_gd_extract) into data.js
  as `window.GD_DATA = {...}`, running data-hygiene guardrails first.

  Pipeline (datamine-integration "reference by relative path" pattern):
    1. Read the extract's clean tables (items/relics/masteries), asset_manifest,
       labels.json (display-name boundary) and game_formulas (difficulty penalties).
    2. Filter to the shipped subset (Epic + Legendary equippable gear + relics).
    3. Transform each into a lean SPA record; DERIVE damage-type/archetype traits
       from the item's real stat fields (associations = data, never prose).
    4. Copy ONLY the icons actually used (item sprites + paperdoll slot art) into assets/.
    5. Resolve every trait ref + assert every icon exists on disk; refuse to write
       data.js on any error (leave the last good copy intact).

  Usage:  node build-data.mjs            (warnings allowed)
          node build-data.mjs --strict   (warnings -> errors)

  The extract is a SIBLING and is never committed here (see .gitignore / WIKI_CONTEXT.md).
*/
import fs from "node:fs";
import path from "node:path";

const ACRONYM = "GD";
const EXTRACT = path.resolve("..", "_gd_extract");
const TABLES = path.join(EXTRACT, "data", "tables");
const EXTRACT_ASSETS = path.join(EXTRACT, "assets");
const ASSETS_DIR = "assets";
const OUT = "data.js";
const STRICT = process.argv.includes("--strict");

const errors = [], warnings = [];
const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// ── load the extract ──────────────────────────────────────────────────────
const itemsRaw   = readJSON(path.join(TABLES, "items.json"));
const relicsRaw  = readJSON(path.join(TABLES, "relics.json"));
const masteryRaw = readJSON(path.join(TABLES, "masteries.json"));
const manifest   = readJSON(path.join(EXTRACT_ASSETS, "asset_manifest.json"));
const labels     = readJSON(path.join(EXTRACT, "labels.json"));
const formulas   = readJSON(path.join(TABLES, "game_formulas.json"));
const uiLayout   = readJSON(path.join(TABLES, "ui_layout.json"));
const skillsRaw  = readJSON(path.join(TABLES, "skills.json"));
const devoRaw    = readJSON(path.join(TABLES, "devotion.json"));
const progression = readJSON(path.join(TABLES, "progression.json"));

const labelName = (field) => {
  const l = labels[field];
  return (l && typeof l === "object" && l.name) ? l.name : field;
};
const labelOf = (field) => {
  const l = labels[field];
  return (l && typeof l === "object") ? l : null;
};

// ── slots: the GD paperdoll. Each physical slot has a `type`; items carry that
// type as their `slot`, so ring1 and ring2 (both type "ring") share the ring pool. ──
const SLOT_CLASSES = {
  head: ["ArmorProtective_Head"], neck: ["ArmorJewelry_Amulet"], chest: ["ArmorProtective_Chest"],
  shoulders: ["ArmorProtective_Shoulders"], medal: ["ArmorJewelry_Medal"], hands: ["ArmorProtective_Hands"],
  ring: ["ArmorJewelry_Ring"], waist: ["ArmorProtective_Waist"], legs: ["ArmorProtective_Legs"],
  feet: ["ArmorProtective_Feet"],
  mainhand: ["WeaponMelee_Sword","WeaponMelee_Mace","WeaponMelee_Axe","WeaponMelee_Dagger","WeaponMelee_Scepter","WeaponMelee_Sword2h","WeaponMelee_Mace2h","WeaponMelee_Axe2h","WeaponMelee_Spear2h","WeaponHunting_Ranged1h","WeaponHunting_Ranged2h"],
  offhand: ["WeaponArmor_Offhand","WeaponArmor_Shield"], relic: ["__RELIC__"],
};
const SLOTS = [
  { id: "head",      type: "head",      name: "Head",       art: "ui/character/character_equipslothead.png" },
  { id: "neck",      type: "neck",      name: "Amulet",     art: "ui/character/character_equipslotneck.png" },
  { id: "chest",     type: "chest",     name: "Chest",      art: "ui/character/character_equipslotchest.png" },
  { id: "shoulders", type: "shoulders", name: "Shoulders",  art: "ui/character/character_equipslotshoulders.png" },
  { id: "medal",     type: "medal",     name: "Medal",      art: "ui/character/character_equipslotmedal.png" },
  { id: "hands",     type: "hands",     name: "Hands",      art: "ui/character/character_equipslothands.png" },
  { id: "ring1",     type: "ring",      name: "Ring",       art: "ui/character/character_equipslotfingers.png" },
  { id: "ring2",     type: "ring",      name: "Ring",       art: "ui/character/character_equipslotfingers.png" },
  { id: "waist",     type: "waist",     name: "Belt",       art: "ui/character/character_equipslotwaist.png" },
  { id: "legs",      type: "legs",      name: "Legs",       art: "ui/character/character_equipslotlegs.png" },
  { id: "feet",      type: "feet",      name: "Feet",       art: "ui/character/character_equipslotfeet.png" },
  { id: "mainhand",  type: "mainhand",  name: "Main Hand",  art: "ui/character/character_equipslothandright.png" },
  { id: "offhand",   type: "offhand",   name: "Off Hand",   art: "ui/character/character_equipslothandleft.png" },
  { id: "relic",     type: "relic",     name: "Relic",      art: "ui/character/character_equipslotrelic.png" },
];
const classToType = new Map();
for (const [type, classes] of Object.entries(SLOT_CLASSES)) for (const c of classes) classToType.set(c, type);

// ── traits: GD damage types (+ archetype tags), coloured by damage-type identity ──
// An item is associated with a damage type if it carries flat/%/DoT for it. The regex
// /^offensive(Slow)?<Tok>(Min|Max|Modifier)$/ captures damage + DoT modifiers and
// EXCLUDES traps (offensiveLifeLeech, offensivePierceRatio, *Global, *Duration).
const DAMAGE_TRAITS = [
  { id: "physical",  name: "Physical",   color: "#d8d2c0", tok: "Physical" },
  { id: "pierce",    name: "Pierce",     color: "#cfa96b", tok: "Pierce" },
  { id: "fire",      name: "Fire",       color: "#ec5a23", tok: "Fire" },
  { id: "cold",      name: "Cold",       color: "#58b0e6", tok: "Cold" },
  { id: "lightning", name: "Lightning",  color: "#efd23e", tok: "Lightning" },
  { id: "acid",      name: "Acid/Poison",color: "#86c53a", tok: "Poison" },
  { id: "vitality",  name: "Vitality",   color: "#b348c8", tok: "Life" },
  { id: "aether",    name: "Aether",     color: "#b9a6e0", tok: "Aether" },
  { id: "chaos",     name: "Chaos",      color: "#9b1f22", tok: "Chaos" },
  { id: "bleeding",  name: "Bleeding",   color: "#c0241f", tok: "Bleeding" },
  { id: "elemental", name: "Elemental",  color: "#e08a30", tok: "Elemental" },
];
const TAG_TRAITS = [
  { id: "retaliation", name: "Retaliation", color: "#c07a2c", test: (rec) => Object.keys(rec).some((k) => /^retaliation/.test(k)) },
  { id: "pet",         name: "Pet Bonus",   color: "#5f9e4a", test: (rec) => "petBonusName" in rec || Object.keys(rec).some((k) => /Pet/.test(k)) },
];
const traits = [...DAMAGE_TRAITS.map(({ id, name, color }) => ({ id, name, color, icon: null,
                   blurb: `Items and skills that deal or boost ${name} damage.` })),
                ...TAG_TRAITS.map(({ id, name, color }) => ({ id, name, color, icon: null,
                   blurb: id === "pet" ? "Bonuses that apply to your pets." : "Retaliation damage." }))];

function deriveTraits(rec) {
  const out = [];
  for (const dt of DAMAGE_TRAITS) {
    const re = new RegExp(`^offensive(Slow)?${dt.tok}(Min|Max|Modifier)$`);
    if (Object.keys(rec).some((k) => re.test(k) && Number(rec[k]) !== 0)) out.push(dt.id);
  }
  for (const tg of TAG_TRAITS) if (tg.test(rec)) out.push(tg.id);
  return out;
}

// ── stat whitelist for the totals table (display name via labels; resists cap at 80) ──
const RESIST_CAP = 80;
const STAT_META = [
  // resistances (capped)
  ["defensiveFire", "resist", RESIST_CAP], ["defensiveCold", "resist", RESIST_CAP],
  ["defensiveLightning", "resist", RESIST_CAP], ["defensivePoison", "resist", RESIST_CAP],
  ["defensivePierce", "resist", RESIST_CAP], ["defensiveAether", "resist", RESIST_CAP],
  ["defensiveChaos", "resist", RESIST_CAP], ["defensiveLife", "resist", RESIST_CAP],
  ["defensiveBleeding", "resist", RESIST_CAP], ["defensivePhysical", "resist", RESIST_CAP],
  // defence / offence / attributes (uncapped)
  ["defensiveProtection", "defense", null], ["characterLife", "defense", null],
  ["characterDefensiveAbility", "defense", null], ["characterOffensiveAbility", "offense", null],
  ["characterStrength", "attr", null], ["characterDexterity", "attr", null],
  ["characterIntelligence", "attr", null],
];
const STAT_FIELDS = STAT_META.map(([f]) => f);
const statMeta = STAT_META.map(([field, group, cap]) => ({ field, name: labelName(field), group, cap }));

// difficulty resist penalties (Elite = band idx 4, Ultimate = idx 8) from game_formulas
const dsAdj = formulas.difficultyScaling.players.adjustments;
const difficulty = { Normal: {}, Elite: {}, Ultimate: {} };
for (const [field, group] of STAT_META) {
  if (group !== "resist") continue;
  const arr = dsAdj[field];
  difficulty.Elite[field] = Array.isArray(arr) ? (arr[4] || 0) : 0;
  difficulty.Ultimate[field] = Array.isArray(arr) ? (arr[8] || 0) : 0;
}

// ── icon copy (only what ships) ────────────────────────────────────────────
const copied = new Set();
function copyIcon(srcRel) {
  // srcRel is relative to the extract's assets/ (e.g. "items/c003_omen01.png")
  const dst = path.join(ASSETS_DIR, srcRel);
  if (copied.has(srcRel)) return srcRel;
  const src = path.join(EXTRACT_ASSETS, srcRel);
  if (!fs.existsSync(src)) return null;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  copied.add(srcRel);
  return srcRel;
}

// ── transform gear + relics into lean SPA items ────────────────────────────
const slug = (recPath) => recPath.replace(/^records\/items\//, "").replace(/\.dbr$/, "").replace(/[\/\\]/g, "_");
const SHIP_RARITY = new Set(["Epic", "Legendary"]);

function buildItem(recPath, rec, slotId) {
  const stats = {};
  for (const f of STAT_FIELDS) if (rec[f] != null && Number(rec[f]) !== 0) stats[f] = Number(rec[f]);
  const iconRel = manifest.items[recPath] ? copyIcon(manifest.items[recPath]) : null;
  if (manifest.items[recPath] && !iconRel) warnings.push(`icon missing on disk for ${recPath} (${manifest.items[recPath]})`);
  const skills = (rec.skillGrants || [])
    .filter((g) => g.name && (g.type === "grantedSkill" || g.type === "augmentSkill" || g.type === "augmentMastery"))
    .map((g) => ({ name: g.name, level: g.level ?? null, type: g.type }));
  return {
    id: slug(recPath),
    name: rec.name || rec.itemNameTag || slug(recPath),
    slot: slotId,
    rarity: rec.itemClassification || "Common",
    levelReq: Number(rec.itemLevel || 0) || null,
    icon: iconRel,
    traits: deriveTraits(rec),
    conflicts: [],                      // separate channel; unused in P0 (kept for the house model)
    stats,
    skills,
    set: rec.itemSetName ? String(rec.itemSetName).replace(/^records.*[\/\\]/, "").replace(/\.dbr$/, "") : null,
  };
}

const items = [];
for (const [recPath, rec] of Object.entries(itemsRaw)) {
  if (!SHIP_RARITY.has(rec.itemClassification)) continue;
  const slotType = classToType.get(rec.Class);
  if (!slotType) continue;            // not an equippable paperdoll class
  items.push(buildItem(recPath, rec, slotType));
}
// relics (ItemArtifact) → the relic slot
for (const [recPath, rec] of Object.entries(relicsRaw)) {
  if (!SHIP_RARITY.has(rec.itemClassification)) continue;
  items.push(buildItem(recPath, rec, "relic"));
}

// ── masteries (all 9) ──────────────────────────────────────────────────────
const masteries = Object.values(masteryRaw)
  .map((m) => ({ id: m.id, name: m.name, icon: null }))
  .filter((m) => m.name)
  .sort((a, b) => a.id.localeCompare(b.id));

// ── copy paperdoll slot art ────────────────────────────────────────────────
for (const s of SLOTS) {
  const rel = copyIcon(s.art);
  if (!rel) errors.push(`slot "${s.id}" art missing: ${s.art}`);
  else s.art = rel;
}

// ── authentic paperdoll layout (from ui_layout.json) ───────────────────────
// GD's internal equip-slot name → our physical slot id.
const GD_TO_SLOT = {
  head: "head", neck: "neck", chest: "chest", shoulders: "shoulders", hands: "hands",
  legs: "legs", feet: "feet", waist: "waist", medal: "medal", device: "relic",
  finger1: "ring1", finger2: "ring2", handright: "mainhand", handleft: "offhand",
};
const pdSrc = uiLayout.paperdoll;
const paperdoll = {
  canvas: { w: pdSrc.canvas.w, h: pdSrc.canvas.h, bg: copyIcon(pdSrc.canvas.bg) },
  viewport: { ...pdSrc.viewport, art: pdSrc.viewport.art ? copyIcon(pdSrc.viewport.art) : null },
  slots: [],
};
if (!paperdoll.canvas.bg) errors.push(`paperdoll canvas bg missing: ${pdSrc.canvas.bg}`);
for (const s of pdSrc.slots) {
  const slotId = GD_TO_SLOT[s.gdName];
  if (!slotId) { warnings.push(`paperdoll slot "${s.gdName}" has no app mapping`); continue; }
  paperdoll.slots.push({
    id: slotId, gdName: s.gdName,
    x: s.x, y: s.y, w: s.w, h: s.h,
    silhouette: s.silhouette ? copyIcon(s.silhouette) : null,
  });
}
// every physical slot should be placed exactly once on the doll
for (const s of SLOTS) if (!paperdoll.slots.some((p) => p.id === s.id)) errors.push(`paperdoll missing slot "${s.id}"`);

// ── skill trees (ui_layout geometry JOINED to skills.json allocation data) ──
// Each node carries: layout (x/y/icon/circular), rank caps (maxLevel = manual cap,
// ultimateLevel = +skills overcap), tier (mastery-bar gate index), a modifier
// prereq (`requires` → base skill path), and per-rank `scaling` stats (labelled).
const stSrc = uiLayout.skilltree;
const N = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// per-rank / scalar labelled stats for a skill record (drives node tooltips)
function skillScaling(rec, ranks) {
  const out = [];
  for (const [field, val] of Object.entries(rec)) {
    const lbl = labelOf(field);
    if (!lbl) continue;                                   // labels.json = curated whitelist
    if (Array.isArray(val)) {
      const vals = val.slice(0, ranks || val.length).map(N);
      if (vals.every((v) => v === 0)) continue;
      out.push({ field, name: lbl.name, conv: lbl.valueConvention || "flat", cat: lbl.cat || "misc", values: vals });
    } else {
      const v = N(val);
      if (v === 0) continue;
      out.push({ field, name: lbl.name, conv: lbl.valueConvention || "flat", cat: lbl.cat || "misc", values: [v], scalar: true });
    }
  }
  return out;
}

// modifier-prereq resolver: a modifier skill (Class ~ Modifier/Transmuter/SkillSecondary)
// requires its base skill. Base = the single non-modifier node sharing the family stem
// (record name minus trailing digits/letters and any _mod/_petmod suffix); when the stem
// is ambiguous, fall back to the nearest non-modifier node to its left on the same row —
// GD always draws a modifier on its base's line. (Validated 124/124 named modifiers.)
const isModCls = (cls) => /Modifier|Transmuter|SkillSecondary/.test(cls || "");
function famStem(skPath) {
  const fn = (skPath || "").split("/").pop().replace(/\.dbr$/, "");
  return fn.replace(/_(pet)?mod(ifier)?$/, "").replace(/\d+[a-z]*$/, "");
}

const skilltree = {
  canvas: { w: stSrc.canvas.w, h: stSrc.canvas.h, bg: copyIcon(stSrc.canvas.bg) },
  button: stSrc.button,
  tierLevels: progression.skillMasteryTierLevel,   // [1,5,10,15,20,25,32,40,50]
  masteryMax: progression.masteryBarMax,           // 50
  classSelectBg: copyIcon("ui/skills/classselection/skills_classselectionbackgroundimage.png"),
  // the game ships only TWO nameplate button skins (alternated by row), not one per class
  bannerArt: ["ui/skills/classselection/skills_buttonclassselectionup01.png",
              "ui/skills/classselection/skills_buttonclassselectionup02.png"].map(copyIcon),
  classes: {},
};
if (!skilltree.canvas.bg) errors.push(`skill-tree bg missing: ${stSrc.canvas.bg}`);
if (!skilltree.classSelectBg) warnings.push(`class-selection bg missing`);
let stIcons = 0, stNodes = 0, stMods = 0, stModRes = 0;

for (const [cid, rawNodes] of Object.entries(stSrc.classes)) {
  // pre-index this class's non-modifier ("base") nodes for prereq resolution
  const enriched = rawNodes.map((n) => {
    const rec = skillsRaw[n.skill] || skillsRaw[(n.skill || "").toLowerCase()] || {};
    return { n, rec, mod: isModCls(rec.Class), stem: famStem(n.skill), base: null };
  });
  const namedBases = enriched.filter((e) => !e.mod && e.n.name && !e.n.masteryBar);
  const byStem = new Map();
  for (const e of namedBases) { if (!byStem.has(e.stem)) byStem.set(e.stem, []); byStem.get(e.stem).push(e); }

  const mastery = masteryRaw[cid] || {};
  const ms = mastery.masteryStats || {};
  const barMax = progression.masteryBarMax;
  const barAttr = {};                                     // per-bar-level cumulative attribute totals
  for (const f of ["characterStrength", "characterDexterity", "characterIntelligence", "characterLife", "characterMana"])
    if (Array.isArray(ms[f])) barAttr[f] = ms[f].slice(0, barMax).map(N);

  // per-class art (index N = mastery id N; verified Soldier=01 … Oathkeeper=09)
  const art = copyIcon(`ui/skills/classselection/skills_classselectedimage${cid}.png`);
  if (!art) warnings.push(`class ${cid} art missing`);
  const classDesc = (skillsRaw[mastery.path] || {}).desc || null;

  skilltree.classes[cid] = {
    id: cid,
    name: mastery.name || `Class ${cid}`,
    art, desc: classDesc,
    bar: { attr: barAttr },
    nodes: enriched.map((e) => {
      const { n, rec, mod } = e;
      stNodes++;
      const icon = n.icon ? copyIcon(n.icon) : null;
      if (icon) stIcons++;
      // resolve modifier prereq
      let requires = null;
      if (mod && n.name && !n.masteryBar) {
        stMods++;
        const cand = byStem.get(e.stem) || [];
        let base = cand.length === 1 ? cand[0] : null;
        if (!base) {                                       // spatial fallback: nearest base left, same row
          const left = namedBases.filter((b) => Math.abs(b.n.y - n.y) <= 35 && b.n.x < n.x);
          if (left.length) base = left.reduce((a, b) => (b.n.x > a.n.x ? b : a));
        }
        if (base) { requires = base.n.skill; stModRes++; }
      }
      const ranks = N(rec.skillUltimateLevel) || N(rec.skillMaxLevel) || 1;
      return {
        skill: n.skill,
        name: n.name || rec.name || null,
        icon, x: n.x, y: n.y, circular: !!n.circular, masteryBar: !!n.masteryBar,
        tier: N(rec.skillTier) || 1,
        maxLevel: N(rec.skillMaxLevel) || (n.masteryBar ? barMax : 1),
        ultimateLevel: N(rec.skillUltimateLevel) || N(rec.skillMaxLevel) || 1,
        requires,
        desc: rec.desc || null,
        scaling: n.masteryBar ? [] : skillScaling(rec, ranks),
      };
    }),
  };
}

// ── devotion (galaxy image + FULL allocation model) ─────────────────────────
// Join devotion.json (affinity req/given, ordered stars w/ grants, link graph) to
// ui_layout.devotion.starPos (per-star pixel centre on the composed galaxy image),
// so each star is a clickable hit-target with real allocation semantics.
const dvSrc = uiLayout.devotion;
const starPos = dvSrc.starPos || {};
const AFFINITIES = [
  { name: "Chaos",      color: "#c0392b" },
  { name: "Eldritch",   color: "#27ae60" },
  { name: "Order",      color: "#2f7fd1" },
  { name: "Ascendant",  color: "#e6c437" },
  { name: "Primordial", color: "#8e5bd0" },
];
function starGrants(grants) {
  const stats = [];
  let power = false;
  for (const [field, val] of Object.entries(grants || {})) {
    if (/SkillName$/i.test(field)) { power = true; continue; }   // buffSkillName/petSkillName = celestial power/proc
    if (field === "skillMaxLevel") continue;                     // "+1 rank to a celestial power" (structural, not a display stat)
    const lbl = labelOf(field);
    if (!lbl) continue;
    const v = Array.isArray(val) ? val.map(N) : N(val);
    if (Array.isArray(v) ? v.every((x) => x === 0) : v === 0) continue;
    stats.push({ field, name: lbl.name, conv: lbl.valueConvention || "flat", value: v });
  }
  return { stats, power };
}
let dvStars = 0, dvPixels = 0;
const constellations = Object.entries(devoRaw).map(([recPath, c]) => {
  const id = (recPath.match(/constellation(\d+)\.dbr$/) || [, recPath])[1];
  const stars = (c.stars || []).map((s, i) => {
    dvStars++;
    const px = starPos[(s.button || "").toLowerCase()];
    if (px) dvPixels++;
    const g = starGrants(s.grants);
    return { i: i + 1, px: px ? px[0] : null, py: px ? px[1] : null,
             name: s.name || c.name, desc: s.desc || "", stats: g.stats, power: g.power };
  });
  const placed = stars.filter((s) => s.px != null);
  const cx = placed.length ? Math.round(placed.reduce((a, s) => a + s.px, 0) / placed.length) : 0;
  const cy = placed.length ? Math.round(placed.reduce((a, s) => a + s.py, 0) / placed.length) : 0;
  return {
    id, name: c.name,
    affinity: (c.affinityGiven && c.affinityGiven[0] && c.affinityGiven[0].name) || null,
    cx, cy,
    affinityRequired: c.affinityRequired || [],
    affinityGiven: c.affinityGiven || [],
    starCount: c.starCount || stars.length,
    links: c.links || [],
    desc: c.desc || "",
    stars,
  };
});
const devotion = {
  canvas: { w: dvSrc.canvas.w, h: dvSrc.canvas.h, image: copyIcon(dvSrc.canvas.image) },
  maxPoints: progression.maxDevotionPoints,       // 55
  affinities: AFFINITIES,
  constellations,
};
if (!devotion.canvas.image) errors.push(`devotion galaxy image missing: ${dvSrc.canvas.image}`);

// ── guardrails ─────────────────────────────────────────────────────────────
const traitIndex = new Set(traits.map((t) => t.id));
const seen = new Set();
for (const it of items) {
  if (seen.has(it.id)) errors.push(`duplicate item id "${it.id}"`);
  seen.add(it.id);
  for (const tr of it.traits) if (!traitIndex.has(tr)) errors.push(`"${it.id}" has trait "${tr}" (no such trait record)`);
  if (it.icon && !fs.existsSync(path.join(ASSETS_DIR, it.icon))) errors.push(`"${it.id}" -> assets/${it.icon} (missing on disk)`);
}
for (const t of traits) if (!/^#[0-9a-fA-F]{6}$/.test(t.color)) warnings.push(`trait "${t.id}" invalid color`);
// coverage sanity: every slot TYPE should have at least one shippable item
const shippedTypes = new Set(items.map((it) => it.slot));
for (const type of Object.keys(SLOT_CLASSES)) if (!shippedTypes.has(type)) warnings.push(`slot type "${type}" has no items in the shipped subset`);

// ── hygiene report ─────────────────────────────────────────────────────────
const iconCount = copied.size;
console.log("── GD data hygiene report ─────────────────────────");
console.log(`✓ ${items.length} items, ${masteries.length} masteries, ${traits.length} traits, ${iconCount} icons copied`);
const byRarity = items.reduce((a, i) => ((a[i.rarity] = (a[i.rarity] || 0) + 1), a), {});
console.log(`  rarity: ${Object.entries(byRarity).map(([k, v]) => `${k}=${v}`).join(", ")}`);
console.log(`  paperdoll: ${paperdoll.slots.length} slots · skilltree: ${Object.keys(skilltree.classes).length} classes, ${stIcons}/${stNodes} nodes iconed, ${stModRes}/${stMods} modifier prereqs resolved`);
console.log(`  devotion: ${constellations.length} constellations, ${dvPixels}/${dvStars} stars placed · budgets: L${progression.maxPlayerLevel}, ${progression.maxDevotionPoints} devo, mastery bar ${progression.masteryBarMax}`);
if (errors.length) { console.log(`✗ ${errors.length} error(s):`); errors.slice(0, 40).forEach((e) => console.log(`    ${e}`)); if (errors.length > 40) console.log(`    …and ${errors.length - 40} more`); }
if (warnings.length) { console.log(`⚠ ${warnings.length} warning(s):`); warnings.slice(0, 20).forEach((w) => console.log(`    ${w}`)); if (warnings.length > 20) console.log(`    …and ${warnings.length - 20} more`); }
console.log("─".repeat(52));

const hard = errors.length + (STRICT ? warnings.length : 0);
if (hard) { console.error(`BUILD FAILED: ${hard} error(s). data.js left untouched.`); process.exit(1); }

const data = { masteries, items, traits, slots: SLOTS, statMeta, difficulty, paperdoll, skilltree, devotion,
  progression: {
    maxLevel: progression.maxPlayerLevel, maxDevotionPoints: progression.maxDevotionPoints,
    masteryBarMax: progression.masteryBarMax, tierLevels: progression.skillMasteryTierLevel,
    skillPointsPerLevel: progression.skillPointsPerLevel, attributePointsPerLevel: progression.attributePointsPerLevel,
    dualClassNames: progression.dualClassNames,
  },
  meta: { source: "_gd_extract", subset: "Epic+Legendary", generated: "unverified extract" } };
fs.writeFileSync(OUT, `window.${ACRONYM}_DATA = ${JSON.stringify(data)};\n`);
console.log(`Wrote ${OUT} (window.${ACRONYM}_DATA) — ${items.length} items, ${iconCount} icons.`);
