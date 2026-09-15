/*
  Grim Dawn Build Calculator — app logic (P0: build-first + overlay-driven).
  Reads window.GD_DATA (generated into data.js by build-data.mjs).

  P0 scope:
    - Mastery combo picker (up to 2 of 9).
    - GD paperdoll: 14 gear slots; click a slot → item selector overlay filtered to
      that slot's type; real sprites, rarity-coloured.
    - Live totals: aggregate flat gear stats; a difficulty selector applies the real
      per-type resist penalties; resists cap at 80 (Total turns gold at the cap).
    - Damage-type cross-reference matrix across equipped gear.

  House conventions (see build-calc-planner references):
    - Overlays statically sized (CSS); every re-render PRESERVES scrollTop.
    - Escape / ✕ / backdrop = dismiss (no commit); Confirm commits.
    - Event delegation: one click handler per root, bound once at init.
    - Traits are DATA; banners theme via --aff-color/--aff-text; associations only.
    - Stat tables are grids with fixed Base…Total columns; no cell shows two numbers.
*/
(function () {
  "use strict";

  const DATA = window.GD_DATA || { masteries: [], items: [], traits: [], slots: [], statMeta: [], difficulty: {} };
  const STORAGE_KEY = "gdbc.build";

  const byId = new Map(DATA.items.map((it) => [it.id, it]));
  const traitById = new Map(DATA.traits.map((t) => [t.id, t]));
  const slotById = new Map(DATA.slots.map((s) => [s.id, s]));
  const itemsBySlotType = new Map();
  for (const it of DATA.items) {
    if (!itemsBySlotType.has(it.slot)) itemsBySlotType.set(it.slot, []);
    itemsBySlotType.get(it.slot).push(it);
  }
  for (const arr of itemsBySlotType.values())
    arr.sort((a, b) => (rarityRank(b.rarity) - rarityRank(a.rarity)) || a.name.localeCompare(b.name));

  const DIFFICULTIES = ["Normal", "Elite", "Ultimate"];
  function rarityRank(r) { return { Legendary: 4, Epic: 3, Rare: 2, Magical: 1, Common: 0 }[r] ?? 0; }

  // ── state ──
  const state = {
    masteries: [],                              // up to 2 mastery ids
    build: {},                                  // { slotId: itemId | null }
    difficulty: "Normal",
    ovl: null,                                  // { slotId, pending, search } while selector open
  };
  Object.assign(state, load());
  for (const s of DATA.slots) if (!(s.id in state.build)) state.build[s.id] = null;

  // ── persistence (localStorage under "gdbc.*") ──
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (v && typeof v === "object") return { masteries: v.masteries || [], build: v.build || {}, difficulty: v.difficulty || "Normal" };
    } catch {}
    return {};
  }
  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ masteries: state.masteries, build: state.build, difficulty: state.difficulty }));
  }

  // ── html helpers ──
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => (n > 0 ? "+" + n : String(n));

  // Contrast-chosen foreground for a trait colour (the --aff-text half of the theming model).
  function textColorFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!m) return "#fff";
    const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? "#111" : "#fff";
  }

  function traitBanner(trait) {
    if (!trait) return "";
    const color = trait.color || "var(--surface2)";
    return `<div class="trait-banner" data-action="nav-trait" data-trait="${esc(trait.id)}"
        style="--aff-color:${esc(color)};--aff-text:${textColorFor(color)}" title="${esc(trait.name)}">
      <span class="trait-banner-label">${esc(trait.name)}</span>
    </div>`;
  }
  function traitBannersHTML(item) {
    const assoc = (item.traits || []).map((id) => traitById.get(id)).filter(Boolean);
    return assoc.length ? `<div class="primary-traits">${assoc.map(traitBanner).join("")}</div>` : "";
  }

  const raritySlug = (r) => "rar-" + String(r || "common").toLowerCase();

  // ── stat aggregation ──
  function equippedItems() {
    return DATA.slots.map((s) => state.build[s.id]).filter(Boolean).map((id) => byId.get(id)).filter(Boolean);
  }
  function gearContrib() {
    const totals = {};
    for (const it of equippedItems())
      for (const [k, v] of Object.entries(it.stats || {})) totals[k] = (totals[k] || 0) + Number(v || 0);
    return totals;
  }

  // Main TOTALS table: grid Stat | Base | Gear | Total. For resists, Base is the
  // difficulty penalty (negative) and Total caps at the stat's cap (gold when capped).
  function totalsTableHTML() {
    const gear = gearContrib();
    const pen = DATA.difficulty[state.difficulty] || {};
    let rows = "";
    for (const m of DATA.statMeta) {
      const g = Number(gear[m.field] || 0);
      const base = m.group === "resist" ? Number(pen[m.field] || 0) : 0;
      if (!g && !base) continue;                        // skip untouched stats
      const raw = base + g;
      const capped = m.cap != null && raw > m.cap;
      const total = capped ? m.cap : raw;
      const hl = g ? " hl-med" : "";
      rows += `<div class="stat-row${capped ? " capped" : ""}${hl}">
        <span class="stat-key">${esc(m.name)}</span>
        <span class="stat-base ${base < 0 ? "stat-val neg" : ""}">${base ? base : "0"}</span>
        <span class="stat-src stat-val${g > 0 ? " pos" : g < 0 ? " neg" : ""}">${g ? fmt(g) : "—"}</span>
        <span class="stat-total">${total}</span>
      </div>`;
    }
    if (!rows) return `<p class="muted">Equip gear to see totals.</p>`;
    return `<div class="stat-grid">
      <div class="stat-header"><span>Stat</span><span>Base</span><span>Gear</span><span>Total</span></div>
      ${rows}
    </div>`;
  }

  // An item's OWN contributions (single source → Stat | Value grid).
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

  // ── cross-reference MATRIX: damage-type traits × equipped gear ──
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

    return `<section class="xref-section">
      <h2>Damage-type coverage</h2>
      <div class="xref-wrap"><table class="player-xref">
        <thead><tr><th class="xref-corner"></th>${cols.map(colHead).join("")}</tr></thead>
        <tbody>${rows}${shared}</tbody>
      </table></div>
      <div class="xref-legend"><span><b class="xref-on">●</b> deals/boosts type</span><span><b class="xref-sh">n</b> shared by n pieces</span></div>
    </section>`;
  }

  // ── mastery picker ──
  function masteryBarHTML() {
    const chips = DATA.masteries.map((m) => {
      const on = state.masteries.includes(m.id);
      return `<button class="mastery-chip ${on ? "on" : ""}" data-action="toggle-mastery" data-id="${esc(m.id)}">${esc(m.name)}</button>`;
    }).join("");
    const label = state.masteries.length
      ? state.masteries.map((id) => DATA.masteries.find((m) => m.id === id)?.name).filter(Boolean).join(" / ")
      : "Pick up to 2 masteries";
    return `<section class="mastery-bar">
      <div class="mastery-head"><h2>Class</h2><span class="mastery-label">${esc(label)}</span></div>
      <div class="mastery-chips">${chips}</div>
    </section>`;
  }

  // ═══ BUILD VIEW (build-first home screen) ═══
  function renderApp() {
    const app = document.getElementById("app");
    const prevMain = app.querySelector(".planning-main");
    const prevScroll = prevMain ? prevMain.scrollTop : 0;

    const slots = DATA.slots.map((s) => {
      const it = state.build[s.id] ? byId.get(state.build[s.id]) : null;
      const inner = it
        ? `${it.icon ? `<img src="assets/${esc(it.icon)}" alt="" onerror="this.style.visibility='hidden'">` : ""}<span class="slot-name ${raritySlug(it.rarity)}">${esc(it.name)}</span>`
        : `<img class="slot-bg" src="assets/${esc(s.art)}" alt="" onerror="this.style.visibility='hidden'"><span class="slot-label">${esc(s.name)}</span>`;
      return `<div class="slot ${it ? "filled " + raritySlug(it.rarity) : ""}" data-action="open-slot" data-slot="${esc(s.id)}" title="${esc(s.name)}">${inner}</div>`;
    }).join("");

    const diffBtns = DIFFICULTIES.map((d) => `<button class="diff-btn ${state.difficulty === d ? "on" : ""}" data-action="set-diff" data-diff="${d}">${d}</button>`).join("");

    app.innerHTML = `
      <header class="app-header">
        <h1>Grim Dawn <span>Build Calculator</span></h1>
        <button class="ghost" data-action="clear">Clear</button>
      </header>
      <main class="planning-main">
        ${masteryBarHTML()}
        <section class="paperdoll">
          <div class="build-slots">${slots}</div>
        </section>
        <section class="totals">
          <div class="totals-head"><h2>Totals</h2><div class="diff-switch">${diffBtns}</div></div>
          ${totalsTableHTML()}
          <p class="cap-note muted">Resistances cap at 80% (gold). Difficulty applies GD's resist penalties.</p>
        </section>
        ${xrefMatrixHTML()}
        <footer class="app-foot muted">Data: extracted from the game files (Epic + Legendary), unverified. Icons © Crate Entertainment.</footer>
      </main>`;

    const newMain = app.querySelector(".planning-main");
    if (newMain) newMain.scrollTop = prevScroll;
  }

  // ═══ SELECTOR OVERLAY (#overlay-root) ═══
  function openOverlay(slotId) {
    const slot = slotById.get(slotId);
    if (!slot) return;
    state.ovl = { slotId, pending: state.build[slotId] || null, search: "" };
    const root = document.getElementById("overlay-root");
    root.innerHTML = `
      <div class="overlay-panel" role="dialog" aria-modal="true">
        <div class="overlay-header">
          <h2>${esc(slot.name)}</h2>
          <button class="overlay-close" data-action="cancel" aria-label="Close">&times;</button>
        </div>
        <div class="overlay-body">
          <div class="ovl-info">
            <div class="ovl-left"></div>
            <div class="ovl-right"></div>
          </div>
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
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
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
      ? items.map((it) => `
        <div class="ovl-card ${raritySlug(it.rarity)} ${it.id === state.ovl.pending ? "selected" : ""}"
             data-action="pick" data-id="${esc(it.id)}" title="${esc(it.name)}">
          ${it.icon ? `<img src="assets/${esc(it.icon)}" alt="" onerror="this.style.visibility='hidden'">` : `<span>${esc((it.name || "?")[0])}</span>`}
        </div>`).join("")
      : `<p class="muted">No matching items.</p>`;

    const pending = state.ovl.pending ? byId.get(state.ovl.pending) : null;
    panel.querySelector(".ovl-left").innerHTML = `<h3>Stats</h3>` + (pending ? itemStatsHTML(pending) : `<p class="muted">Select an item.</p>`);
    panel.querySelector(".ovl-right").innerHTML = pending
      ? `<div class="ovl-right-top">
           <h3 class="${raritySlug(pending.rarity)}">${esc(pending.name)}</h3>
           <div class="ovl-sub muted">${esc(pending.rarity)}${pending.levelReq ? " · Level " + pending.levelReq : ""}</div>
           <button class="ghost" data-action="detail" data-id="${esc(pending.id)}">More info</button>
         </div>
         <div class="ovl-right-body">
           ${traitBannersHTML(pending)}
           ${itemSkillsHTML(pending)}
         </div>`
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

  // ═══ DETAIL OVERLAY (#detail-overlay-root) ═══
  function openDetail(id) {
    const it = byId.get(id);
    if (!it) return;
    renderDetail(`<span class="${raritySlug(it.rarity)}">${esc(it.name)}</span>`, `
      <div class="detail-sub muted">${esc(it.rarity)}${it.levelReq ? " · Level " + it.levelReq : ""} · ${esc(slotById.get(DATA.slots.find((s) => s.type === it.slot)?.id || "")?.name || it.slot)}</div>
      ${traitBannersHTML(it)}
      ${itemSkillsHTML(it)}
      <h3>Stats</h3>${itemStatsHTML(it)}`);
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

  // ═══ EVENT DELEGATION (bound once per root) ═══
  function onAppClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    switch (el.dataset.action) {
      case "open-slot": openOverlay(el.dataset.slot); break;
      case "toggle-mastery": toggleMastery(el.dataset.id); break;
      case "set-diff": state.difficulty = el.dataset.diff; persist(); renderApp(); break;
      case "clear":
        state.build = {}; for (const s of DATA.slots) state.build[s.id] = null;
        state.masteries = []; persist(); renderApp(); break;
      case "nav-trait": openTraitDetail(el.dataset.trait); break;
      case "nav-item": openDetail(el.dataset.id); break;
    }
  }
  function toggleMastery(id) {
    const i = state.masteries.indexOf(id);
    if (i >= 0) state.masteries.splice(i, 1);
    else if (state.masteries.length < 2) state.masteries.push(id);
    persist(); renderApp();
  }
  function onOverlayClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) { if (e.target.id === "overlay-root") closeOverlay(false); return; }
    switch (el.dataset.action) {
      case "pick": state.ovl.pending = state.ovl.pending === el.dataset.id ? null : el.dataset.id; refreshOverlay(); break;
      case "unequip": state.ovl.pending = null; closeOverlay(true); break;
      case "detail": openDetail(el.dataset.id); break;
      case "nav-trait": openTraitDetail(el.dataset.trait); break;
      case "cancel": closeOverlay(false); break;
      case "confirm": closeOverlay(true); break;
    }
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
    if (state.ovl) closeOverlay(false);
  }

  document.getElementById("app").addEventListener("click", onAppClick);
  document.getElementById("overlay-root").addEventListener("click", onOverlayClick);
  document.getElementById("overlay-root").addEventListener("input", onOverlayInput);
  document.getElementById("detail-overlay-root").addEventListener("click", onDetailClick);
  document.addEventListener("keydown", onKeydown);
  renderApp();
})();
