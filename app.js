/*
  Grim Dawn Build Calculator — app logic.
  Reads window.GD_DATA (generated into data.js by build-data.mjs).

  Scope:
    - Character level → skill/devotion point BUDGETS (from the game's own progression table).
    - Skill trees: authentic per-mastery layout with REAL point allocation — mastery-bar
      investment (unlocks tier-gated skills), per-node ranks, modifier prereqs. This is the
      class picker (choosing a mastery replaces the old "select your class" chips).
    - Devotion: the celestial galaxy with clickable stars, affinity accrual + thresholds,
      link-ordered allocation, and a 55-point budget.
    - GD paperdoll: 14 gear slots; click → item selector overlay.
    - Live totals: gear + mastery-bar attributes + allocated skill/devotion flat bonuses,
      difficulty resist penalties, resists cap at 80.

  House conventions:
    - Overlays statically sized (CSS); every re-render PRESERVES scroll position.
    - Escape / ✕ / backdrop = dismiss. Event delegation: one handler per root.
    - Allocation state is LEGALIZED after every change (cascading un-allocation).
*/
(function () {
  "use strict";

  const DATA = window.GD_DATA || {};
  const ST = DATA.skilltree || { classes: {}, tierLevels: [], masteryMax: 50 };
  const DV = DATA.devotion || { constellations: [], affinities: [], maxPoints: 55, canvas: {} };
  const PROG = DATA.progression || { maxLevel: 100, maxDevotionPoints: 55, masteryBarMax: 50, tierLevels: ST.tierLevels || [], skillPointsPerLevel: [], dualClassNames: {} };
  const STORAGE_KEY = "gdbc.build";

  const byId = new Map((DATA.items || []).map((it) => [it.id, it]));
  const traitById = new Map((DATA.traits || []).map((t) => [t.id, t]));
  const slotById = new Map((DATA.slots || []).map((s) => [s.id, s]));
  const affColor = new Map((DV.affinities || []).map((a) => [a.name, a.color]));
  const itemsBySlotType = new Map();
  for (const it of DATA.items || []) {
    if (!itemsBySlotType.has(it.slot)) itemsBySlotType.set(it.slot, []);
    itemsBySlotType.get(it.slot).push(it);
  }
  for (const arr of itemsBySlotType.values())
    arr.sort((a, b) => (rarityRank(b.rarity) - rarityRank(a.rarity)) || a.name.localeCompare(b.name));

  // skill-node index: skill path -> { cid, node }; and constellation index by id
  const nodeByPath = new Map();
  for (const [cid, cls] of Object.entries(ST.classes)) for (const n of cls.nodes) nodeByPath.set(n.skill, { cid, node: n });
  const devoById = new Map((DV.constellations || []).map((c) => [c.id, c]));

  const DIFFICULTIES = ["Normal", "Elite", "Ultimate"];
  const TIER_LEVELS = PROG.tierLevels || [1, 5, 10, 15, 20, 25, 32, 40, 50];
  const MASTERY_MAX = PROG.masteryBarMax || 50;
  function rarityRank(r) { return { Legendary: 4, Epic: 3, Rare: 2, Magical: 1, Common: 0 }[r] ?? 0; }

  // ── state ──────────────────────────────────────────────────────────────────
  const state = {
    level: PROG.maxLevel || 100,
    masteries: [],            // ordered class ids (primary first), max 2
    bar: {},                  // { cid: masteryBarPoints }
    skills: {},               // { skillPath: rank }
    devotion: {},             // { "cid:starIndex": true }
    build: {},                // { slotId: itemId | null }
    difficulty: "Normal",
    ovl: null,                // item selector
    skill: null,              // { cid } skill-tree overlay
    devo: null,               // { z, sel } devotion overlay
  };
  Object.assign(state, load());
  for (const s of DATA.slots || []) if (!(s.id in state.build)) state.build[s.id] = null;
  // NOTE: legalize runs at the very bottom, once all const helpers are initialized.

  // ── persistence ──────────────────────────────────────────────────────────
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (v && typeof v === "object")
        return { level: v.level || PROG.maxLevel, masteries: v.masteries || [], bar: v.bar || {},
                 skills: v.skills || {}, devotion: v.devotion || {}, build: v.build || {}, difficulty: v.difficulty || "Normal" };
    } catch {}
    return {};
  }
  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      level: state.level, masteries: state.masteries, bar: state.bar, skills: state.skills,
      devotion: state.devotion, build: state.build, difficulty: state.difficulty,
    }));
  }

  // ── html helpers ───────────────────────────────────────────────────────────
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => (n > 0 ? "+" + n : String(n));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const raritySlug = (r) => "rar-" + String(r || "common").toLowerCase();
  function textColorFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!m) return "#fff";
    const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? "#111" : "#fff";
  }

  // format a labelled value by its convention (flat / percent / seconds)
  function fmtVal(v, conv) {
    const s = v > 0 ? "+" + v : String(v);
    if (conv === "percent") return (v > 0 ? "+" : "") + v + "%";
    if (conv === "seconds") return v + "s";
    return s;
  }

  // ══ BUDGETS ═════════════════════════════════════════════════════════════════
  function skillPointsAvailable() {
    const arr = PROG.skillPointsPerLevel || [];
    let sum = PROG.initialSkillPoints || 0;
    for (let i = 0; i < state.level && i < arr.length; i++) sum += arr[i];
    return sum;
  }
  function skillPointsUsed() {
    let sum = 0;
    for (const cid of state.masteries) sum += state.bar[cid] || 0;
    for (const r of Object.values(state.skills)) sum += r;
    return sum;
  }
  function devoUsed() { return Object.keys(state.devotion).length; }
  const masteryLevel = (cid) => state.bar[cid] || 0;
  const tierUnlocked = (cid, tier) => masteryLevel(cid) >= (TIER_LEVELS[tier - 1] || 1);
  function comboName() {
    if (!state.masteries.length) return "";
    if (state.masteries.length === 1) return ST.classes[state.masteries[0]]?.name || "";
    const key = state.masteries.map((c) => String(Number(c))).sort((a, b) => a - b).join("");
    return (PROG.dualClassNames || {})[key] || state.masteries.map((c) => ST.classes[c]?.name).join(" / ");
  }

  // ══ LEGALIZE (cascading un-allocation after any change) ══════════════════════
  function legalizeSkills() {
    for (const cid of Object.keys(state.bar)) if (!state.masteries.includes(cid)) delete state.bar[cid];
    for (const cid of state.masteries) state.bar[cid] = clamp(state.bar[cid] || 0, 0, MASTERY_MAX);
    let changed = true;
    while (changed) {
      changed = false;
      for (const path of Object.keys(state.skills)) {
        const info = nodeByPath.get(path);
        if (!info || !state.masteries.includes(info.cid)) { delete state.skills[path]; changed = true; continue; }
        const n = info.node;
        if (!tierUnlocked(info.cid, n.tier)) { delete state.skills[path]; changed = true; continue; }
        if (n.requires && !(state.skills[n.requires] > 0)) { delete state.skills[path]; changed = true; continue; }
        if (state.skills[path] > n.maxLevel) { state.skills[path] = n.maxLevel; changed = true; }
        if (state.skills[path] <= 0) { delete state.skills[path]; changed = true; }
      }
    }
  }

  const reqMet = (reqs, aff) => (reqs || []).every((r) => (aff[r.name] || 0) >= r.amount);
  function starParents(con, i) { return (con.links || []).filter((l) => l[0] === i).map((l) => l[1]); }
  // Growth simulation: which constellations are reachable + the affinity they grant.
  function devoAffinityState() {
    const allocByCon = {};
    for (const k of Object.keys(state.devotion)) {
      const [cid, i] = k.split(":"); (allocByCon[cid] = allocByCon[cid] || new Set()).add(+i);
    }
    const aff = {}; const opened = new Set(); let grow = true;
    while (grow) {
      grow = false;
      for (const con of DV.constellations) {
        if (opened.has(con.id)) continue;
        if (reqMet(con.affinityRequired, aff)) {
          opened.add(con.id); grow = true;
          const alloc = allocByCon[con.id];
          if (alloc && alloc.size >= con.starCount) for (const g of con.affinityGiven || []) aff[g.name] = (aff[g.name] || 0) + g.amount;
        }
      }
    }
    return { aff, opened, allocByCon };
  }
  function legalizeDevotion() {
    let changed = true;
    while (changed) {
      changed = false;
      const { opened, allocByCon } = devoAffinityState();
      for (const k of Object.keys(state.devotion)) {
        const [cid, iss] = k.split(":"); const i = +iss; const con = devoById.get(cid);
        if (!con || !opened.has(cid)) { delete state.devotion[k]; changed = true; continue; }
        const parents = starParents(con, i);
        const alloc = allocByCon[cid] || new Set();
        if (parents.length && !parents.every((p) => alloc.has(p))) { delete state.devotion[k]; changed = true; }
      }
    }
  }

  // ══ STAT AGGREGATION ════════════════════════════════════════════════════════
  function equippedItems() {
    return (DATA.slots || []).map((s) => state.build[s.id]).filter(Boolean).map((id) => byId.get(id)).filter(Boolean);
  }
  function gearContrib() {
    const totals = {};
    for (const it of equippedItems())
      for (const [k, v] of Object.entries(it.stats || {})) totals[k] = (totals[k] || 0) + Number(v || 0);
    return totals;
  }
  // contributions from allocated masteries + skills + devotion (only fields in the totals whitelist)
  function talentContrib() {
    const t = {};
    const add = (f, v) => { if (v) t[f] = (t[f] || 0) + v; };
    // mastery bar attributes (cumulative total at current bar level)
    for (const cid of state.masteries) {
      const lvl = masteryLevel(cid); if (!lvl) continue;
      const attr = ST.classes[cid]?.bar?.attr || {};
      for (const [f, arr] of Object.entries(attr)) add(f, Number(arr[lvl - 1] || 0));
    }
    // allocated skills — flat scaling at current rank
    for (const [path, rank] of Object.entries(state.skills)) {
      const n = nodeByPath.get(path)?.node; if (!n) continue;
      for (const sc of n.scaling || []) {
        if (sc.conv !== "flat" || !sc.field) continue;
        const v = sc.scalar ? sc.values[0] : (sc.values[rank - 1] ?? 0);
        add(sc.field, Number(v || 0));
      }
    }
    // devotion stars — flat grants
    for (const k of Object.keys(state.devotion)) {
      const [cid, iss] = k.split(":"); const con = devoById.get(cid); if (!con) continue;
      const star = con.stars[(+iss) - 1]; if (!star) continue;
      for (const s of star.stats || []) if (s.conv === "flat" && s.field && !Array.isArray(s.value)) add(s.field, Number(s.value || 0));
    }
    return t;
  }

  // Main TOTALS: Stat | Gear | Talents | Total. Resists carry a difficulty penalty (Base) and cap.
  function totalsTableHTML() {
    const gear = gearContrib();
    const tal = talentContrib();
    const pen = DATA.difficulty[state.difficulty] || {};
    let rows = "";
    for (const m of DATA.statMeta) {
      const g = Number(gear[m.field] || 0);
      const a = Number(tal[m.field] || 0);
      const base = m.group === "resist" ? Number(pen[m.field] || 0) : 0;
      if (!g && !a && !base) continue;
      const raw = base + g + a;
      const capped = m.cap != null && raw > m.cap;
      const total = capped ? m.cap : raw;
      rows += `<div class="stat-row${capped ? " capped" : ""}">
        <span class="stat-key">${esc(m.name)}</span>
        <span class="stat-base ${base < 0 ? "stat-val neg" : ""}">${base ? base : "0"}</span>
        <span class="stat-src stat-val${g > 0 ? " pos" : g < 0 ? " neg" : ""}">${g ? fmt(g) : "—"}</span>
        <span class="stat-src stat-val${a > 0 ? " pos" : a < 0 ? " neg" : ""}">${a ? fmt(a) : "—"}</span>
        <span class="stat-total">${total}</span>
      </div>`;
    }
    if (!rows) return `<p class="muted">Equip gear or spend points to see totals.</p>`;
    return `<div class="stat-grid four">
      <div class="stat-header"><span>Stat</span><span>Base</span><span>Gear</span><span>Talents</span><span>Total</span></div>
      ${rows}
    </div>`;
  }

  // ── item detail helpers (unchanged) ─────────────────────────────────────────
  function traitBanner(trait) {
    if (!trait) return "";
    const color = trait.color || "var(--surface2)";
    return `<div class="trait-banner" data-action="nav-trait" data-trait="${esc(trait.id)}"
        style="--aff-color:${esc(color)};--aff-text:${textColorFor(color)}" title="${esc(trait.name)}">
      <span class="trait-banner-label">${esc(trait.name)}</span></div>`;
  }
  function traitBannersHTML(item) {
    const assoc = (item.traits || []).map((id) => traitById.get(id)).filter(Boolean);
    return assoc.length ? `<div class="primary-traits">${assoc.map(traitBanner).join("")}</div>` : "";
  }
  function itemStatsHTML(item) {
    let rows = "";
    for (const m of DATA.statMeta) {
      const v = Number((item.stats || {})[m.field] || 0);
      if (!v) continue;
      rows += `<div class="stat-row"><span class="stat-key">${esc(m.name)}</span>
        <span class="stat-total stat-val ${v > 0 ? "pos" : "neg"}">${fmt(v)}</span></div>`;
    }
    if (!rows) return `<p class="muted">No summary stats.</p>`;
    return `<div class="stat-grid single"><div class="stat-header"><span>Stat</span><span>Value</span></div>${rows}</div>`;
  }
  function itemSkillsHTML(item) {
    if (!item.skills || !item.skills.length) return "";
    const li = item.skills.map((s) => `<li>${s.level ? `<b>+${esc(s.level)}</b> ` : ""}${esc(s.name)}${s.type === "augmentMastery" ? " <span class='muted'>(all mastery)</span>" : ""}</li>`).join("");
    return `<h3>Granted / +Skills</h3><ul class="item-skills">${li}</ul>`;
  }

  // ── cross-reference matrix (unchanged) ──────────────────────────────────────
  function xrefMatrixHTML() {
    const filled = equippedItems();
    if (!filled.length) return "";
    const count = new Map();
    for (const it of filled) for (const t of it.traits || []) count.set(t, (count.get(t) || 0) + 1);
    const cols = [...count.keys()].map((id) => traitById.get(id)).filter(Boolean)
      .sort((a, b) => (count.get(b.id) - count.get(a.id)) || a.name.localeCompare(b.name));
    if (!cols.length) return "";
    const colHead = (t) => `<th class="xref-colhead"><div class="xref-col" data-action="nav-trait" data-trait="${esc(t.id)}"
        style="--aff-color:${esc(t.color)};--aff-text:${textColorFor(t.color)}"><span class="xref-col-name">${esc(t.name)}</span></div></th>`;
    const cell = (has) => `<td class="${has ? "xref-on" : ""}">${has ? "●" : ""}</td>`;
    const rows = filled.map((it) => {
      const set = new Set(it.traits || []);
      return `<tr><th class="xref-rowhead ${raritySlug(it.rarity)}" data-action="nav-item" data-id="${esc(it.id)}"><span>${esc(it.name)}</span></th>
        ${cols.map((t) => cell(set.has(t.id))).join("")}</tr>`;
    }).join("");
    const shared = `<tr class="xref-shared"><th class="xref-rowhead">Shared</th>
      ${cols.map((t) => { const n = count.get(t.id) || 0; return `<td class="${n >= 2 ? "xref-sh" : ""}">${n}</td>`; }).join("")}</tr>`;
    return `<section class="xref-section"><h2>Damage-type coverage</h2>
      <div class="xref-wrap"><table class="player-xref">
        <thead><tr><th class="xref-corner"></th>${cols.map(colHead).join("")}</tr></thead>
        <tbody>${rows}${shared}</tbody></table></div>
      <div class="xref-legend"><span><b class="xref-on">●</b> deals/boosts type</span><span><b class="xref-sh">n</b> shared by n pieces</span></div>
    </section>`;
  }

  // ── paperdoll (unchanged geometry) ──────────────────────────────────────────
  function renderPaperdoll() {
    const pd = DATA.paperdoll;
    if (!pd) return "";
    const { w: cw, h: ch } = pd.canvas;
    const pct = (v, d) => (v / d * 100).toFixed(3) + "%";
    const vp = pd.viewport;
    const label = comboName();
    const viewport = vp ? `<div class="pd-viewport" style="left:${pct(vp.x, cw)};top:${pct(vp.y, ch)};width:${pct(vp.w, cw)};height:${pct(vp.h, ch)}">
        <span class="pd-classlabel">${esc(label)}</span></div>` : "";
    const slots = pd.slots.map((s) => {
      const it = state.build[s.id] ? byId.get(state.build[s.id]) : null;
      const style = `left:${pct(s.x, cw)};top:${pct(s.y, ch)};width:${pct(s.w, cw)};height:${pct(s.h, ch)}`;
      const inner = it
        ? `<img class="pd-item" src="assets/${esc(it.icon)}" alt="" title="${esc(it.name)}" onerror="this.style.visibility='hidden'">`
        : (s.silhouette ? `<img class="pd-silhouette" src="assets/${esc(s.silhouette)}" alt="" onerror="this.style.display='none'">` : "");
      return `<div class="pd-slot ${it ? "filled " + raritySlug(it.rarity) : ""}" style="${style}"
          data-action="open-slot" data-slot="${esc(s.id)}" title="${esc(slotById.get(s.id)?.name || s.id)}">${inner}</div>`;
    }).join("");
    return `<div class="paperdoll-canvas" style="aspect-ratio:${cw}/${ch};background-image:url('assets/${esc(pd.canvas.bg)}')">
      ${viewport}${slots}</div>`;
  }

  // ── CLASS & POINTS panel (replaces the old mastery chips) ───────────────────
  function classPanelHTML() {
    const spAvail = skillPointsAvailable(), spUsed = skillPointsUsed();
    const devAvail = DV.maxPoints || 55, devUsedN = devoUsed();
    const name = comboName();
    const classText = name
      ? `<span class="cp-class">${esc(name)}</span>`
      : `<span class="cp-class muted">No class selected</span>`;
    const sub = state.masteries.length
      ? state.masteries.map((c) => `${esc(ST.classes[c]?.name)} <b>${masteryLevel(c)}</b>`).join(" · ")
      : "Open the skill tree to choose a mastery";
    return `<section class="class-panel">
      <div class="cp-level">
        <label>Level</label>
        <input class="cp-level-input" type="number" min="1" max="${PROG.maxLevel}" value="${state.level}" data-action="set-level">
      </div>
      <div class="cp-identity">
        ${classText}
        <span class="cp-sub muted">${sub}</span>
      </div>
      <div class="cp-budgets">
        <button class="cp-budget" data-action="skills">
          <span class="cpb-label">Skill Tree</span>
          <span class="cpb-count ${spUsed > spAvail ? "over" : ""}">${spUsed} / ${spAvail}</span>
        </button>
        <button class="cp-budget" data-action="devotion">
          <span class="cpb-label">Devotion</span>
          <span class="cpb-count ${devUsedN > devAvail ? "over" : ""}">${devUsedN} / ${devAvail}</span>
        </button>
      </div>
    </section>`;
  }

  // ══ HOME VIEW ════════════════════════════════════════════════════════════════
  function renderApp() {
    const app = document.getElementById("app");
    const prevMain = app.querySelector(".planning-main");
    const prevScroll = prevMain ? prevMain.scrollTop : 0;
    const diffBtns = DIFFICULTIES.map((d) => `<button class="diff-btn ${state.difficulty === d ? "on" : ""}" data-action="set-diff" data-diff="${d}">${d}</button>`).join("");
    app.innerHTML = `
      <header class="app-header">
        <h1>Grim Dawn <span>Build Calculator</span></h1>
        <div class="header-actions">
          <button class="ghost" data-action="skills">Skills</button>
          <button class="ghost" data-action="devotion">Devotion</button>
          <button class="ghost" data-action="clear">Clear</button>
        </div>
      </header>
      <main class="planning-main">
        ${classPanelHTML()}
        <section class="paperdoll">${renderPaperdoll()}</section>
        <section class="totals">
          <div class="totals-head"><h2>Totals</h2><div class="diff-switch">${diffBtns}</div></div>
          ${totalsTableHTML()}
          <p class="cap-note muted">Resistances cap at 80% (gold). Difficulty applies GD's resist penalties. Talents = mastery attributes + allocated skill/devotion flat bonuses.</p>
        </section>
        ${xrefMatrixHTML()}
        <footer class="app-foot muted">Data: extracted from the game files (Epic + Legendary), unverified. Icons © Crate Entertainment.</footer>
      </main>`;
    const newMain = app.querySelector(".planning-main");
    if (newMain) newMain.scrollTop = prevScroll;
  }

  // ══ ITEM SELECTOR OVERLAY (unchanged) ════════════════════════════════════════
  function openOverlay(slotId) {
    const slot = slotById.get(slotId);
    if (!slot) return;
    state.ovl = { slotId, pending: state.build[slotId] || null, search: "" };
    const root = document.getElementById("overlay-root");
    root.innerHTML = `
      <div class="overlay-panel" role="dialog" aria-modal="true">
        <div class="overlay-header"><h2>${esc(slot.name)}</h2>
          <button class="overlay-close" data-action="cancel" aria-label="Close">&times;</button></div>
        <div class="overlay-body">
          <div class="ovl-info"><div class="ovl-left"></div><div class="ovl-right"></div></div>
          <div class="ovl-center">
            <div class="ovl-center-search"><input class="ovl-search" type="search" placeholder="Search ${esc(slot.name)}…" /></div>
            <div class="ovl-center-scroll"><div class="ovl-grid"></div></div>
          </div>
        </div>
        <div class="overlay-footer">
          <button class="ghost" data-action="unequip">Unequip</button>
          <button class="ghost" data-action="cancel">Cancel</button>
          <button data-action="confirm">Confirm</button>
        </div>
      </div>`;
    root.classList.remove("hidden"); root.setAttribute("aria-hidden", "false");
    refreshOverlay();
    const input = root.querySelector(".ovl-search");
    const isTouch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (input && !isTouch) input.focus();
  }
  const SCROLLERS = [".ovl-center-scroll", ".ovl-info", ".ovl-left", ".ovl-right-body"];
  function refreshOverlay() {
    const panel = document.querySelector("#overlay-root .overlay-panel");
    if (!panel || !state.ovl) return;
    const saved = SCROLLERS.map((sel) => { const el = panel.querySelector(sel); return el ? el.scrollTop : 0; });
    const slot = slotById.get(state.ovl.slotId);
    const q = state.ovl.search.trim().toLowerCase();
    const pool = itemsBySlotType.get(slot.type) || [];
    const items = q ? pool.filter((it) => it.name.toLowerCase().includes(q)) : pool;
    panel.querySelector(".ovl-grid").innerHTML = items.length
      ? items.map((it) => `<div class="ovl-card ${raritySlug(it.rarity)} ${it.id === state.ovl.pending ? "selected" : ""}"
             data-action="pick" data-id="${esc(it.id)}" title="${esc(it.name)}">
          ${it.icon ? `<img src="assets/${esc(it.icon)}" alt="" onerror="this.style.visibility='hidden'">` : `<span>${esc((it.name || "?")[0])}</span>`}</div>`).join("")
      : `<p class="muted">No matching items.</p>`;
    const pending = state.ovl.pending ? byId.get(state.ovl.pending) : null;
    panel.querySelector(".ovl-left").innerHTML = `<h3>Stats</h3>` + (pending ? itemStatsHTML(pending) : `<p class="muted">Select an item.</p>`);
    panel.querySelector(".ovl-right").innerHTML = pending
      ? `<div class="ovl-right-top"><h3 class="${raritySlug(pending.rarity)}">${esc(pending.name)}</h3>
           <div class="ovl-sub muted">${esc(pending.rarity)}${pending.levelReq ? " · Level " + pending.levelReq : ""}</div>
           <button class="ghost" data-action="detail" data-id="${esc(pending.id)}">More info</button></div>
         <div class="ovl-right-body">${traitBannersHTML(pending)}${itemSkillsHTML(pending)}</div>`
      : `<div class="ovl-right-top"><h3>Details</h3></div><div class="ovl-right-body"><p class="muted">Select an item to see details.</p></div>`;
    panel.querySelector(".overlay-body").classList.toggle("has-selection", !!pending);
    SCROLLERS.forEach((sel, i) => { const el = panel.querySelector(sel); if (el) el.scrollTop = saved[i]; });
  }
  function closeOverlay(commit) {
    if (!state.ovl) return;
    if (commit) { state.build[state.ovl.slotId] = state.ovl.pending; persist(); }
    state.ovl = null;
    const root = document.getElementById("overlay-root");
    root.classList.add("hidden"); root.setAttribute("aria-hidden", "true"); root.innerHTML = "";
    renderApp();
  }

  // ══ SKILL TREE OVERLAY — allocation ═══════════════════════════════════════════
  function openSkillTree(cid) {
    // no mastery yet → open on the class-selection screen; else the first tree
    const active = cid || state.masteries[0] || "__pick__0";
    state.skill = { cid: active, pickSel: null };
    const root = document.getElementById("overlay-root");
    root.innerHTML = `
      <div class="overlay-panel skilltree-panel" role="dialog" aria-modal="true">
        <div class="overlay-header st-header">
          <div class="st-tabs"></div>
          <div class="st-header-right">
            <span class="st-header-confirm"></span>
            <button class="overlay-close" data-action="st-close" aria-label="Close">&times;</button>
          </div>
        </div>
        <div class="st-layout">
          <aside class="st-rail"></aside>
          <div class="overlay-body st-body"></div>
        </div>
        <div class="overlay-footer">
          <span class="st-hint muted"></span>
          <span class="st-footer-confirm"></span>
          <button data-action="st-close">Close</button>
        </div>
      </div>`;
    root.classList.remove("hidden"); root.setAttribute("aria-hidden", "false");
    renderSkillTree();
  }
  function stTabsHTML() {
    // one tab per mastery SLOT (assigned class or "＋")
    const slots = [];
    for (let i = 0; i < 2; i++) {
      const cid = state.masteries[i];
      if (cid) slots.push(`<button class="st-tab ${cid === state.skill.cid ? "on" : ""}" data-action="st-class" data-cid="${esc(cid)}">
          ${esc(ST.classes[cid]?.name)} <span class="st-tab-lvl">${masteryLevel(cid)}</span>
          <span class="st-tab-x" data-action="st-remove" data-cid="${esc(cid)}" role="button" aria-label="Remove ${esc(ST.classes[cid]?.name)}" title="Remove mastery">✕</span></button>`);
      else slots.push(`<button class="st-tab add ${state.skill.cid === "__pick__" + i ? "on" : ""}" data-action="st-pick" data-slot="${i}">＋ Add Mastery</button>`);
    }
    const spAvail = skillPointsAvailable(), spUsed = skillPointsUsed();
    slots.push(`<span class="st-points ${spUsed > spAvail ? "over" : ""}">Skill Points <b>${spUsed}</b> / ${spAvail}</span>`);
    return slots.join("");
  }
  function renderSkillTree() {
    const panel = document.querySelector("#overlay-root .skilltree-panel");
    if (!panel || !state.skill) return;
    panel.querySelector(".st-tabs").innerHTML = stTabsHTML();
    const body = panel.querySelector(".st-body");
    const rail = panel.querySelector(".st-rail");
    const cid = state.skill.cid;

    const headerConfirm = panel.querySelector(".st-header-confirm");
    const footerConfirm = panel.querySelector(".st-footer-confirm");

    // class-selection mode (empty slot) — authentic class-selection screen
    if (String(cid).startsWith("__pick__")) {
      panel.classList.add("mode-pick");
      const classes = Object.values(ST.classes).sort((a, b) => a.id.localeCompare(b.id));
      const chosen = new Set(state.masteries);
      const hasSel = !!ST.classes[state.skill.pickSel];
      const sel = ST.classes[state.skill.pickSel] || classes.find((c) => !chosen.has(c.id)) || classes[0];
      const plates = ST.bannerArt || [];
      const banners = classes.map((c, i) => {
        const taken = chosen.has(c.id);
        const plate = plates[i % (plates.length || 1)];
        return `<button class="st-banner ${sel && c.id === sel.id ? "on" : ""} ${taken ? "taken" : ""}"
            data-action="st-preview" data-cid="${esc(c.id)}"
            style="${plate ? `background-image:url('assets/${esc(plate)}')` : ""}">
          <span class="st-banner-name">${esc(c.name)}</span>${taken ? `<span class="st-banner-tag">✓</span>` : ""}</button>`;
      }).join("");
      const taken = sel && chosen.has(sel.id);
      body.innerHTML = `<div class="st-select ${hasSel ? "has-sel" : ""}" ${ST.classSelectBg ? `style="background-image:url('assets/${esc(ST.classSelectBg)}')"` : ""}>
        <div class="st-select-list">${banners}</div>
        <div class="st-select-preview">
          ${sel && sel.art ? `<img class="st-select-art" src="assets/${esc(sel.art)}" alt="${esc(sel.name)}">` : ""}
          <div class="st-select-body">
            <h2 class="st-select-name">${esc(sel ? sel.name : "")}</h2>
            ${sel && sel.desc ? `<p class="st-select-desc">${esc(sel.desc)}</p>` : ""}
          </div>
        </div>
      </div>`;
      // confirm button — rendered into BOTH the header slot (desktop) and the footer
      // slot (mobile, beside Close); CSS shows exactly one per viewport.
      const confirmHTML = `<button class="st-select-confirm" data-action="st-choose" data-cid="${esc(sel ? sel.id : "")}" ${taken ? "disabled" : ""}>
        ${taken ? "Already chosen" : `Choose ${esc(sel ? sel.name : "")}`}</button>`;
      headerConfirm.innerHTML = confirmHTML;
      if (footerConfirm) footerConfirm.innerHTML = confirmHTML;
      if (panel.querySelector(".st-hint")) panel.querySelector(".st-hint").textContent = "";
      return;
    }

    panel.classList.remove("mode-pick");
    headerConfirm.innerHTML = "";
    if (footerConfirm) footerConfirm.innerHTML = "";
    rail.innerHTML = masteryRailHTML(cid);
    renderTreeCanvas(body, cid);
    panel.querySelector(".st-hint").textContent = "Click a node to add a rank · right-click (or Shift-click) to remove.";
  }
  function masteryRailHTML(cid) {
    const cls = ST.classes[cid]; if (!cls) return "";
    const lvl = masteryLevel(cid);
    const nextTier = TIER_LEVELS.find((t) => t > lvl);
    const hero = cls.art ? `<div class="st-rail-hero"><img src="assets/${esc(cls.art)}" alt="${esc(cls.name)}"><span class="st-rail-hero-name">${esc(cls.name)}</span></div>` : "";
    // 50-segment mastery bar with tier markers
    const segs = [];
    for (let i = 1; i <= MASTERY_MAX; i++) {
      const isTier = TIER_LEVELS.includes(i);
      segs.push(`<button class="mb-seg ${i <= lvl ? "on" : ""} ${isTier ? "tier" : ""}" data-action="mb-set" data-cid="${esc(cid)}" data-lvl="${i}"
        title="Mastery level ${i}${isTier ? " — unlocks a skill tier" : ""}"></button>`);
    }
    return `${hero}<div class="st-rail-head">${esc(cls.name)} Mastery</div>
      <div class="mb-level">Level <b>${lvl}</b> / ${MASTERY_MAX}</div>
      <div class="mb-ctrls">
        <button class="mb-btn" data-action="mb-dec" data-cid="${esc(cid)}" ${lvl <= 0 ? "disabled" : ""}>−</button>
        <div class="mb-bar">${segs.join("")}</div>
        <button class="mb-btn" data-action="mb-inc" data-cid="${esc(cid)}" ${lvl >= MASTERY_MAX ? "disabled" : ""}>＋</button>
      </div>
      <div class="mb-tiernote muted">${nextTier ? `Next tier unlocks at mastery level ${nextTier}` : "All skill tiers unlocked"}</div>
      ${lvl > 0 ? `<button class="st-remove ghost" data-action="st-remove" data-cid="${esc(cid)}">Remove mastery</button>` : ""}`;
  }
  function renderTreeCanvas(body, cid) {
    const scroller = body.querySelector(".st-scroll");
    const sx = scroller ? scroller.scrollLeft : 0, sy = scroller ? scroller.scrollTop : 0;
    const cls = ST.classes[cid];
    const { w: cw, h: ch } = ST.canvas, bw = ST.button.w, bh = ST.button.h;
    const pct = (v, d) => (v / d * 100).toFixed(3) + "%";
    const named = cls.nodes.filter((n) => n.name);
    const bySkill = new Map(named.map((n) => [n.skill, n]));

    // connectors: a modifier skill is drawn wired to the base skill it requires.
    // The line lights up (gold) once the prerequisite point is invested AND the
    // mastery tier is unlocked — making the allocation gating visible.
    const ccx = (n) => n.x + bw / 2, ccy = (n) => n.y + bh / 2;
    const links = named.filter((n) => n.requires && bySkill.has(n.requires)).map((n) => {
      const p = bySkill.get(n.requires);
      const on = (state.skills[n.requires] > 0) && tierUnlocked(cid, n.tier);
      return `<line class="st-link ${on ? "on" : ""}" x1="${ccx(p)}" y1="${ccy(p)}" x2="${ccx(n)}" y2="${ccy(n)}" vector-effect="non-scaling-stroke" />`;
    }).join("");
    const linksSVG = links
      ? `<svg class="st-links" viewBox="0 0 ${cw} ${ch}" preserveAspectRatio="none" aria-hidden="true">${links}</svg>`
      : "";

    const nodeHTML = named.map((n) => {
      const rank = state.skills[n.skill] || 0;
      const unlocked = tierUnlocked(cid, n.tier) && (!n.requires || (state.skills[n.requires] > 0));
      const maxed = rank >= n.maxLevel;
      const cls2 = [n.circular ? "circ" : "", rank > 0 ? "allocated" : "", !unlocked ? "locked" : "", maxed ? "maxed" : ""].join(" ");
      const badge = rank > 0 || unlocked ? `<span class="st-rank">${rank}/${n.maxLevel}</span>` : `<span class="st-lock">🔒</span>`;
      return `<div class="st-node ${cls2}" style="left:${pct(n.x, cw)};top:${pct(n.y, ch)};width:${pct(bw, cw)};height:${pct(bh, ch)}"
          data-action="st-node" data-skill="${esc(n.skill)}" title="${esc(n.name)}">
        ${n.icon ? `<img src="assets/${esc(n.icon)}" alt="" onerror="this.style.visibility='hidden'">` : `<span class="st-noicon">${esc(n.name[0])}</span>`}
        ${badge}</div>`;
    }).join("");
    // per-class mastery art: the game's skillallocation/skills_classimage (paneArt), drawn crisp at
    // (0,0) over the pane — opaque figure on the left, alpha-fading right where the nodes sit. Sized to
    // its native box (640×605 within the 983×605 canvas) so it matches the in-game skill window exactly.
    const pab = ST.paneArtBox || { x: 0, y: 0, w: cw, h: ch };
    const artVars = cls.paneArt
      ? `--pane-art:url('assets/${esc(cls.paneArt)}');--pane-art-w:${pct(pab.w, cw)};--pane-art-h:${pct(pab.h, ch)};--pane-art-x:${pct(pab.x, cw)};--pane-art-y:${pct(pab.y, ch)}`
      : "";
    body.innerHTML = `<div class="st-scroll"><div class="skilltree-canvas ${cls.paneArt ? "has-art" : ""}"
      style="aspect-ratio:${cw}/${ch};background-image:url('assets/${esc(ST.canvas.bg)}');${artVars}">${linksSVG}${nodeHTML}</div></div>`;
    const ns = body.querySelector(".st-scroll");
    if (ns) { ns.scrollLeft = sx; ns.scrollTop = sy; }
  }

  // skill allocation actions
  function allocSkill(path, delta) {
    const info = nodeByPath.get(path); if (!info) return;
    const { cid, node } = info;
    if (!state.masteries.includes(cid)) return;
    const rank = state.skills[path] || 0;
    if (delta > 0) {
      if (!tierUnlocked(cid, node.tier)) return flash("Requires mastery level " + (TIER_LEVELS[node.tier - 1]));
      if (node.requires && !(state.skills[node.requires] > 0)) return flash("Requires its base skill first");
      if (rank >= node.maxLevel) return;
      if (skillPointsUsed() >= skillPointsAvailable()) return flash("No skill points remaining");
      state.skills[path] = rank + 1;
    } else {
      if (rank <= 0) return;
      state.skills[path] = rank - 1;
      if (state.skills[path] <= 0) delete state.skills[path];
    }
    legalizeSkills(); persist(); renderSkillTree();
  }
  function setMasteryBar(cid, lvl) {
    if (!state.masteries.includes(cid)) return;
    lvl = clamp(lvl, 0, MASTERY_MAX);
    const cur = masteryLevel(cid);
    if (lvl > cur) {
      const room = skillPointsAvailable() - skillPointsUsed();
      lvl = Math.min(lvl, cur + Math.max(0, room));
      if (lvl === cur) return flash("No skill points remaining");
    }
    state.bar[cid] = lvl;
    legalizeSkills(); persist(); renderSkillTree();
  }
  function chooseMastery(cid) {
    if (state.masteries.includes(cid) || state.masteries.length >= 2) return;
    if (skillPointsUsed() >= skillPointsAvailable()) return flash("No skill points remaining");
    state.masteries.push(cid);
    state.bar[cid] = 1;                     // selecting a mastery = level 1 (costs 1 point)
    state.skill.cid = cid;
    legalizeSkills(); persist(); renderSkillTree();
  }
  function removeMastery(cid) {
    // confirm only when there's real investment (past the free level-1 pick) so the
    // small ✕ can't nuke a built-out tree by accident; refunded points return to the pool.
    const invested = masteryLevel(cid) > 1 || Object.keys(state.skills).some((p) => p.includes(`playerclass${cid}/`));
    if (invested && !confirm(`Remove ${ST.classes[cid]?.name || "this mastery"}? Its allocated points are refunded to your pool.`)) return;
    state.masteries = state.masteries.filter((c) => c !== cid);
    delete state.bar[cid];
    legalizeSkills(); persist();
    state.skill.cid = state.masteries[0] || "__pick__0";
    renderSkillTree();
  }
  let flashT = null;
  function flash(msg) {
    const el = document.querySelector("#overlay-root .st-hint") || document.querySelector("#overlay-root .devo-hint");
    if (!el) return;
    el.textContent = msg; el.classList.add("flash");
    clearTimeout(flashT); flashT = setTimeout(() => el.classList.remove("flash"), 900);
  }
  function closeSkillTree() {
    state.skill = null;
    const root = document.getElementById("overlay-root");
    root.classList.add("hidden"); root.setAttribute("aria-hidden", "true"); root.innerHTML = "";
    renderApp();
  }

  // ══ DEVOTION OVERLAY — allocation ═════════════════════════════════════════════
  const ZOOMS = [1, 1.6, 2.4, 3.2];
  function openDevotion() {
    if (!DV.canvas || !DV.canvas.image) return;
    state.devo = { z: 1, sel: null };
    const root = document.getElementById("overlay-root");
    root.innerHTML = `
      <div class="overlay-panel devo-panel" role="dialog" aria-modal="true">
        <div class="overlay-header">
          <h2>Devotion</h2>
          <div class="devo-affbar"></div>
          <div class="devo-zoom">
            <button data-action="devo-zoom" data-d="-1" aria-label="Zoom out">−</button>
            <button data-action="devo-zoom" data-d="1" aria-label="Zoom in">+</button>
          </div>
          <button class="overlay-close" data-action="devo-close" aria-label="Close">&times;</button>
        </div>
        <div class="devo-layout">
          <div class="overlay-body devo-body">
            <div class="devo-scroll"><div class="devo-stage" style="--z:${ZOOMS[state.devo.z]}">
              <img class="devo-img" src="assets/${esc(DV.canvas.image)}" alt="Devotion map" width="${DV.canvas.w}" height="${DV.canvas.h}">
              <div class="devo-stars"></div>
            </div></div>
          </div>
          <aside class="devo-info"></aside>
        </div>
        <div class="overlay-footer"><span class="devo-hint muted">Click a star to allocate · click an allocated star to remove (cascades). Drag to pan.</span>
          <button data-action="devo-close">Close</button></div>
      </div>`;
    root.classList.remove("hidden"); root.setAttribute("aria-hidden", "false");
    renderDevotion();
    enableStarPan(root.querySelector(".devo-scroll"));
  }
  function renderDevotion() {
    const panel = document.querySelector("#overlay-root .devo-panel");
    if (!panel || !state.devo) return;
    const { aff, opened, allocByCon } = devoAffinityState();
    const W = DV.canvas.w, H = DV.canvas.h;
    const pct = (v, d) => (v / d * 100).toFixed(3) + "%";
    // stars
    const stars = [];
    for (const con of DV.constellations) {
      const alloc = allocByCon[con.id] || new Set();
      const conOpen = opened.has(con.id);
      for (const s of con.stars) {
        if (s.px == null) continue;
        const on = !!state.devotion[`${con.id}:${s.i}`];
        const parents = starParents(con, s.i);
        const parentOk = !parents.length || parents.every((p) => alloc.has(p));
        const avail = conOpen && parentOk && !on;
        const c = [on ? "on" : "", avail ? "avail" : "", s.power ? "power" : "", con.id === (state.devo.sel && state.devo.sel.id) ? "sel-con" : ""].join(" ");
        stars.push(`<button class="devo-star ${c}" style="left:${pct(s.px, W)};top:${pct(s.py, H)}"
          data-action="devo-star" data-cid="${esc(con.id)}" data-i="${s.i}" title="${esc(con.name)} — ${esc(s.name)}"></button>`);
      }
    }
    panel.querySelector(".devo-stars").innerHTML = stars.join("");
    // affinity bar
    panel.querySelector(".devo-affbar").innerHTML = (DV.affinities || []).map((a) =>
      `<span class="aff-chip" style="--aff:${esc(a.color)}"><i></i>${esc(a.name)} <b>${aff[a.name] || 0}</b></span>`).join("")
      + `<span class="devo-count ${devoUsed() > (DV.maxPoints || 55) ? "over" : ""}">${devoUsed()} / ${DV.maxPoints || 55}</span>`;
    // info panel
    panel.querySelector(".devo-info").innerHTML = devoInfoHTML(aff);
  }
  function devoInfoHTML(aff) {
    const sel = state.devo.sel && devoById.get(state.devo.sel.id);
    if (!sel) return `<div class="devo-info-empty muted">Select a constellation to see its stars, requirements and bonuses.</div>`;
    const allocN = Object.keys(state.devotion).filter((k) => k.startsWith(sel.id + ":")).length;
    const complete = allocN >= sel.starCount;
    const reqHTML = (sel.affinityRequired || []).map((r) => {
      const have = aff[r.name] || 0, ok = have >= r.amount;
      return `<span class="aff-req ${ok ? "ok" : "no"}" style="--aff:${esc(affColor.get(r.name) || "#888")}">${esc(r.name)} ${have}/${r.amount}</span>`;
    }).join("") || `<span class="muted">None</span>`;
    const giveHTML = (sel.affinityGiven || []).map((g) =>
      `<span class="aff-give" style="--aff:${esc(affColor.get(g.name) || "#888")}">+${g.amount} ${esc(g.name)}</span>`).join("");
    const starsHTML = sel.stars.map((s) => {
      const on = !!state.devotion[`${sel.id}:${s.i}`];
      const stats = (s.stats || []).map((st) => `<li>${esc(st.name)} <b>${esc(fmtVal(Array.isArray(st.value) ? st.value[0] : st.value, st.conv))}</b></li>`).join("");
      return `<div class="devo-starrow ${on ? "on" : ""}" data-action="devo-star" data-cid="${esc(sel.id)}" data-i="${s.i}">
        <div class="dsr-head"><span class="dsr-dot ${on ? "on" : ""}"></span><span class="dsr-name">${esc(s.name)}</span>${s.power ? `<span class="dsr-power">✦ Celestial Power</span>` : ""}</div>
        ${stats ? `<ul class="dsr-stats">${stats}</ul>` : ""}</div>`;
    }).join("");
    return `<div class="devo-con">
        <div class="devo-con-head"><span class="devo-con-name" style="--aff:${esc(affColor.get(sel.affinity) || "#888")}">${esc(sel.name)}</span>
          <span class="devo-con-prog ${complete ? "done" : ""}">${allocN}/${sel.starCount}</span></div>
        ${sel.desc ? `<p class="devo-con-desc muted">${esc(sel.desc)}</p>` : ""}
        <div class="devo-con-aff"><div><span class="daff-label">Requires</span> ${reqHTML}</div>
          ${giveHTML ? `<div><span class="daff-label">Grants</span> ${giveHTML}</div>` : ""}</div>
        <div class="devo-stars-list">${starsHTML}</div>
      </div>`;
  }
  // allocate/deallocate a devotion star
  function toggleStar(cid, i) {
    const con = devoById.get(cid); if (!con) return;
    state.devo.sel = { id: cid };
    const key = `${cid}:${i}`;
    if (state.devotion[key]) {
      delete state.devotion[key];
      legalizeDevotion(); persist(); renderDevotion(); return;
    }
    // allocate: budget + reachability + link order
    if (devoUsed() >= (DV.maxPoints || 55)) { renderDevotion(); return flash2("No devotion points remaining"); }
    const { aff, opened, allocByCon } = devoAffinityState();
    if (!opened.has(cid)) { renderDevotion(); return flash2("Affinity requirement not met"); }
    const parents = starParents(con, i);
    const alloc = allocByCon[cid] || new Set();
    if (parents.length && !parents.every((p) => alloc.has(p))) { renderDevotion(); return flash2("Allocate the connected star first"); }
    state.devotion[key] = true;
    legalizeDevotion(); persist(); renderDevotion();
  }
  function flash2(msg) {
    const el = document.querySelector("#overlay-root .devo-hint");
    if (!el) return;
    el.textContent = msg; el.classList.add("flash");
    clearTimeout(flashT); flashT = setTimeout(() => el.classList.remove("flash"), 1100);
  }
  function devoZoom(d) {
    if (!state.devo) return;
    const scroll = document.querySelector("#overlay-root .devo-scroll");
    const stage = document.querySelector("#overlay-root .devo-stage");
    if (!scroll || !stage) return;
    const cx = (scroll.scrollLeft + scroll.clientWidth / 2) / (scroll.scrollWidth || 1);
    const cy = (scroll.scrollTop + scroll.clientHeight / 2) / (scroll.scrollHeight || 1);
    state.devo.z = clamp(state.devo.z + d, 0, ZOOMS.length - 1);
    stage.style.setProperty("--z", ZOOMS[state.devo.z]);
    requestAnimationFrame(() => {
      scroll.scrollLeft = cx * scroll.scrollWidth - scroll.clientWidth / 2;
      scroll.scrollTop = cy * scroll.scrollHeight - scroll.clientHeight / 2;
    });
  }
  // pan the galaxy; suppress the star click if the pointer actually dragged
  function enableStarPan(el) {
    if (!el) return;
    let down = false, sx = 0, sy = 0, l = 0, t = 0, moved = false;
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      down = true; moved = false; sx = e.clientX; sy = e.clientY; l = el.scrollLeft; t = el.scrollTop;
    });
    el.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) { moved = true; el.classList.add("grabbing"); }
      if (moved) { el.scrollLeft = l - dx; el.scrollTop = t - dy; }
    });
    const end = () => { down = false; el.classList.remove("grabbing"); };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("click", (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);
  }
  function closeDevotion() {
    state.devo = null;
    const root = document.getElementById("overlay-root");
    root.classList.add("hidden"); root.setAttribute("aria-hidden", "true"); root.innerHTML = "";
    renderApp();
  }

  // ══ DETAIL OVERLAY (item / trait / skill node) ════════════════════════════════
  function openDetail(id) {
    const it = byId.get(id);
    if (!it) return;
    renderDetail(`<span class="${raritySlug(it.rarity)}">${esc(it.name)}</span>`, `
      <div class="detail-sub muted">${esc(it.rarity)}${it.levelReq ? " · Level " + it.levelReq : ""}</div>
      ${traitBannersHTML(it)}${itemSkillsHTML(it)}<h3>Stats</h3>${itemStatsHTML(it)}`);
  }
  function openTraitDetail(id) {
    const t = traitById.get(id);
    if (!t) return;
    const users = equippedItems().filter((it) => (it.traits || []).includes(id));
    const usersHtml = users.length
      ? `<h3>Equipped pieces with this type</h3><ul class="trait-users">${users.map((u) => `<li class="${raritySlug(u.rarity)}" data-action="nav-item" data-id="${esc(u.id)}">${esc(u.name)}</li>`).join("")}</ul>`
      : `<p class="muted">No equipped pieces carry this type.</p>`;
    renderDetail(esc(t.name), `<div class="primary-traits">${traitBanner(t)}</div><p>${esc(t.blurb || "")}</p>${usersHtml}`);
  }
  function openSkillNodeDetail(path) {
    const info = nodeByPath.get(path); if (!info) return;
    const { cid, node } = info;
    const rank = state.skills[path] || 0;
    const cname = ST.classes[cid]?.name || "";
    const tierReq = TIER_LEVELS[node.tier - 1];
    const baseName = node.requires ? nodeByPath.get(node.requires)?.node?.name : null;
    const scHTML = (node.scaling || []).map((sc) => {
      const cur = rank > 0 ? (sc.scalar ? sc.values[0] : sc.values[rank - 1]) : null;
      const nxt = sc.scalar ? sc.values[0] : sc.values[Math.min(rank, sc.values.length - 1)];
      return `<li><span class="sc-name">${esc(sc.name)}</span>
        <span class="sc-val">${rank > 0 ? esc(fmtVal(cur, sc.conv)) : "—"}${rank < node.maxLevel ? ` <span class="sc-next">→ ${esc(fmtVal(nxt, sc.conv))}</span>` : ""}</span></li>`;
    }).join("");
    renderDetail(esc(node.name), `
      <div class="detail-sub muted">${esc(cname)} · Tier ${node.tier} (mastery ${tierReq}+)${node.circular ? " · modifier" : ""}</div>
      <div class="sk-meta">
        <span class="sk-rank">Rank <b>${rank}</b> / ${node.maxLevel}${node.ultimateLevel > node.maxLevel ? ` <span class="muted">(${node.ultimateLevel} w/ +skills)</span>` : ""}</span>
        ${baseName ? `<span class="muted">Requires: ${esc(baseName)}</span>` : ""}
      </div>
      ${node.desc ? `<p class="sk-desc">${esc(node.desc)}</p>` : ""}
      ${scHTML ? `<h3>Per-rank stats</h3><ul class="sk-scaling">${scHTML}</ul>` : ""}`);
  }
  function renderDetail(title, bodyHtml) {
    const root = document.getElementById("detail-overlay-root");
    root.innerHTML = `
      <div class="overlay-panel" role="dialog" aria-modal="true">
        <div class="overlay-header"><h2>${title}</h2><button class="overlay-close" data-action="close-detail" aria-label="Close">&times;</button></div>
        <div class="overlay-body"><div class="ovl-center"><div class="ovl-center-scroll detail-main">${bodyHtml}</div></div></div>
        <div class="overlay-footer"><button data-action="close-detail">Close</button></div>
      </div>`;
    root.classList.remove("hidden"); root.setAttribute("aria-hidden", "false");
  }
  function closeDetail() {
    const root = document.getElementById("detail-overlay-root");
    root.classList.add("hidden"); root.setAttribute("aria-hidden", "true"); root.innerHTML = "";
  }

  // ══ EVENT DELEGATION ══════════════════════════════════════════════════════════
  function onAppClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    switch (el.dataset.action) {
      case "open-slot": openOverlay(el.dataset.slot); break;
      case "skills": openSkillTree(); break;
      case "devotion": openDevotion(); break;
      case "set-diff": state.difficulty = el.dataset.diff; persist(); renderApp(); break;
      case "clear":
        if (!confirm("Clear the entire build (gear, masteries, skills, devotion)?")) break;
        state.build = {}; for (const s of DATA.slots) state.build[s.id] = null;
        state.masteries = []; state.bar = {}; state.skills = {}; state.devotion = {};
        persist(); renderApp(); break;
      case "nav-trait": openTraitDetail(el.dataset.trait); break;
      case "nav-item": openDetail(el.dataset.id); break;
    }
  }
  function onAppInput(e) {
    if (!e.target.classList.contains("cp-level-input")) return;
    const v = clamp(parseInt(e.target.value, 10) || 1, 1, PROG.maxLevel);
    state.level = v; legalizeSkills(); persist();
    // update budget counters without full re-render (keep focus)
    renderApp();
  }
  function onOverlayClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) {
      if (e.target.id === "overlay-root") { state.devo ? closeDevotion() : state.skill ? closeSkillTree() : closeOverlay(false); }
      return;
    }
    switch (el.dataset.action) {
      // item selector
      case "pick": state.ovl.pending = state.ovl.pending === el.dataset.id ? null : el.dataset.id; refreshOverlay(); break;
      case "unequip": state.ovl.pending = null; closeOverlay(true); break;
      case "detail": openDetail(el.dataset.id); break;
      case "nav-trait": openTraitDetail(el.dataset.trait); break;
      case "cancel": closeOverlay(false); break;
      case "confirm": closeOverlay(true); break;
      // skill tree
      case "st-class": state.skill.cid = el.dataset.cid; renderSkillTree(); break;
      case "st-pick": state.skill.cid = "__pick__" + el.dataset.slot; state.skill.pickSel = null; renderSkillTree(); break;
      case "st-preview": state.skill.pickSel = el.dataset.cid; renderSkillTree(); break;
      case "st-choose": if (el.dataset.cid) chooseMastery(el.dataset.cid); break;
      case "st-remove": removeMastery(el.dataset.cid); break;
      case "st-node":
        if (e.shiftKey) allocSkill(el.dataset.skill, -1);
        else if (e.detail === 2) openSkillNodeDetail(el.dataset.skill);  // dbl-click = info
        else allocSkill(el.dataset.skill, +1);
        break;
      case "mb-inc": setMasteryBar(el.dataset.cid, masteryLevel(el.dataset.cid) + 1); break;
      case "mb-dec": setMasteryBar(el.dataset.cid, masteryLevel(el.dataset.cid) - 1); break;
      case "mb-set": setMasteryBar(el.dataset.cid, Number(el.dataset.lvl)); break;
      case "st-close": closeSkillTree(); break;
      // devotion
      case "devo-star": toggleStar(el.dataset.cid, Number(el.dataset.i)); break;
      case "devo-zoom": devoZoom(Number(el.dataset.d)); break;
      case "devo-close": closeDevotion(); break;
    }
  }
  function onOverlayContext(e) {
    const el = e.target.closest('[data-action="st-node"]');
    if (el) { e.preventDefault(); allocSkill(el.dataset.skill, -1); }
  }
  function onOverlayInput(e) {
    if (!e.target.classList.contains("ovl-search")) return;
    state.ovl.search = e.target.value; refreshOverlay();
  }
  function onDetailClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) { if (e.target.id === "detail-overlay-root") closeDetail(); return; }
    switch (el.dataset.action) {
      case "close-detail": closeDetail(); break;
      case "nav-trait": openTraitDetail(el.dataset.trait); break;
      case "nav-item": openDetail(el.dataset.id); break;
    }
  }
  function onKeydown(e) {
    if (e.key !== "Escape") return;
    if (!document.getElementById("detail-overlay-root").classList.contains("hidden")) return closeDetail();
    if (state.devo) return closeDevotion();
    if (state.skill) return closeSkillTree();
    if (state.ovl) closeOverlay(false);
  }

  document.getElementById("app").addEventListener("click", onAppClick);
  document.getElementById("app").addEventListener("change", onAppInput);
  document.getElementById("overlay-root").addEventListener("click", onOverlayClick);
  document.getElementById("overlay-root").addEventListener("contextmenu", onOverlayContext);
  document.getElementById("overlay-root").addEventListener("input", onOverlayInput);
  document.getElementById("detail-overlay-root").addEventListener("click", onDetailClick);
  document.addEventListener("keydown", onKeydown);
  legalizeSkills(); legalizeDevotion();     // sanitize any loaded state now that helpers exist
  renderApp();
})();
