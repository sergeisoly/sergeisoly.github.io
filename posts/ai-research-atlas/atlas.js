/* Paths to Alignment — renders into mount points: <div class="atlas" data-atlas="map|routes|people|index|glossary">.
   Data: window.TIMELINE_DATA (build_data.py). Diagrams: window.DIAGRAMS (diagrams.js). No dependencies. */
(function () {
  "use strict";
  const D = window.TIMELINE_DATA || {};
  D.events = D.events || []; D.lanes = D.lanes || []; D.threads = D.threads || [];
  D.eras = D.eras || []; D.orgs = D.orgs || []; D.people = D.people || [];
  const NS = "http://www.w3.org/2000/svg";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lc = (l) => `var(--${l})`;
  const LANE_NOTE = {
    safety: "Alignment, oversight, interpretability, evaluations",
    rl: "Learning from reward, and agents",
    lm: "From neural nets to LLMs",
    gov: "Labs, institutes, policy",
  };
  const REL = { builds_on: "Builds on", responds_to: "Responds to", enables: "Enables", tests: "Tests", critiques: "Critiques", parallel: "Parallel to" };
  const REL_IN = { builds_on: "Built on by", responds_to: "Answered by", enables: "Enabled by", tests: "Tested by", critiques: "Critiqued by", parallel: "Parallel to" };
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const byId = new Map(D.events.map((e) => [e.id, e]));
  const personId = (p) => p.id || p.name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const personById = new Map(D.people.map((p) => [personId(p), p]));
  D.events.forEach((e) => (e.people || []).forEach((name) => { const id = personId({ name }); if (!personById.has(id)) personById.set(id, { name, key_event_ids: D.events.filter((event) => (event.people || []).includes(name)).map((event) => event.id) }); }));
  const orgById = new Map(D.orgs.map((o) => [o.id, o]));
  [...new Set([...D.events.flatMap((e) => e.orgs || []), ...D.people.flatMap((p) => (p.affiliations || []).map((a) => a.org))])].forEach((name) => {
    if (!D.orgs.some((o) => orgMatches({ id: "", orgs: [name] }, o))) {
      const id = `unlisted-${personId({ name })}`;
      orgById.set(id, { id, name, key_event_ids: D.events.filter((e) => (e.orgs || []).includes(name)).map((e) => e.id), affiliations: D.people.flatMap((p) => (p.affiliations || []).filter((a) => a.org === name).map((a) => ({ ...a, person: p.name }))) });
    }
  });
  const profileRecords = [...D.people.map((p) => ({ key: `person:${personId(p)}`, name: p.name, kind: "Person", text: [p.name, p.known_for, ...(p.affiliations || []).map((a) => a.org)].join(" ") })),
    ...D.orgs.map((o) => ({ key: `org:${o.id}`, name: o.name, kind: "Organisation", text: [o.name, ...(o.aliases || []), ...(o.founders || []), o.historical_role, o.kind].join(" ") }))];
  const allProfileRecords = [...personById].map(([id, p]) => ({ key: `person:${id}`, name: p.name, kind: "Person", text: [p.name, p.known_for, ...(p.affiliations || []).map((a) => a.org)].join(" ") })).concat([...orgById].map(([id, o]) => ({ key: `org:${id}`, name: o.name, kind: "Organisation", text: [o.name, ...(o.aliases || []), ...(o.founders || []), o.historical_role, o.kind].join(" ") })));
  const profileHash = (key) => key && key.replace(/^person:/, "person-").replace(/^org:/, "organisation-");
  const profileFromHash = (hash) => hash.startsWith("person-") ? `person:${hash.slice(7)}` : hash.startsWith("organisation-") ? `org:${hash.slice(13)}` : null;
  const laneById = new Map(D.lanes.map((l) => [l.id, l]));
  const incoming = new Map();
  D.events.forEach((e) => (e.links || []).forEach((ln) => {
    if (!incoming.has(ln.to)) incoming.set(ln.to, []);
    incoming.get(ln.to).push({ from: e.id, type: ln.type, note: ln.note });
  }));
  // Keep every directed relation and its note, including reciprocal interpretations.
  const connections = D.events.flatMap((e) => (e.links || []).map((link, i) => ({ key: `${e.id}:${i}`, from: e.id, to: link.to, type: link.type, note: link.note }))).filter((c) => byId.has(c.to));
  const connectionByKey = new Map(connections.map((c) => [c.key, c]));
  const connectionsFor = (id) => connections.filter((c) => c.from === id || c.to === id);
  const connectionLabel = (c) => `${byId.get(c.from).title} — ${(REL[c.type] || c.type).toLowerCase()} — ${byId.get(c.to).title}`;

  const state = { selected: null, connection: null, route: null, org: null, query: "", queryInput: "", minImp: 2, zoom: 1, lanes: new Set(D.lanes.map((l) => l.id)), quiz: false, focus: null, era: null, browsePage: 0, profile: null, profileDock: "people", affiliationIndex: null, routeShown: (D.threads[0] || {}).id };
  let connectionHover = null, connectionFocus = null, connectionTrigger = null;
  const mounts = {};
  document.querySelectorAll("[data-atlas]").forEach((m) => { m.classList.add("atlas"); mounts[m.dataset.atlas] = m; });

  /* ---------- helpers ---------- */
  const yearOf = (e) => { const [y, m, d] = e.date_sort.split("-").map(Number); return y + (m - 1) / 12 + (d - 1) / 365; };
  const yearOfStr = (s) => { const m = String(s).match(/(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/); if (!m) return NaN; return +m[1] + ((+m[2] || 1) - 1) / 12 + ((+m[3] || 1) - 1) / 365; };
  function fmtDate(e) {
    const [y, m, d] = e.date_sort.split("-").map(Number);
    if (e.date_precision === "year") return String(y);
    if (e.date_precision === "month") return `${MON[m - 1]} ${y}`;
    return `${d} ${MON[m - 1]} ${y}`;
  }
  const laneTitle = (l) => (laneById.get(l) || { title: l }).title;
  function orgMatches(e, org) {
    if (!org) return true;
    if ((org.key_event_ids || []).includes(e.id)) return true;
    const names = [org.name, ...(org.aliases || [])].map((n) => n.toLowerCase());
    return (e.orgs || []).some((o) => { const s = o.toLowerCase(); return names.some((n) => s === n || s.includes(n)); });
  }
  function textMatches(e, q) {
    if (!q) return true;
    const organisations = D.orgs.filter((o) => orgMatches(e, o)).flatMap((o) => [o.name, ...(o.aliases || []), o.historical_role]);
    const researchers = D.people.filter((p) => (p.key_event_ids || []).includes(e.id)).map((p) => p.name);
    const hay = [e.title, e.label, e.problem, e.idea, e.changed, e.limits, e.date_context, e.date_basis,
      ...(e.people || []), ...(e.orgs || []), ...(e.tags || []), ...(e.terms || []).flatMap((t) => [t.term, t.def]),
      ...organisations, ...researchers].filter(Boolean).join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  }
  const SMOOTH = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  const inScope = (e) => (!state.route || state.route.event_ids.includes(e.id)) && orgMatches(e, state.org);
  const visible = () => D.events.filter((e) => state.lanes.has(e.lane) && (e.importance || 2) >= (state.query || state.route || state.org ? 1 : state.minImp));
  const lit = (e) => textMatches(e, state.query) && inScope(e);
  const matches = () => visible().filter(lit);
  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== "") n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  const textW = (s, px = 12, bold) => s.length * px * (bold ? 0.6 : 0.56);

  /* ---------- time scale: compress the long past, open up the crowded present ---------- */
  const SEG = [[1940, 1990, 8], [1990, 2010, 20], [2010, 2017, 56], [2017, 2027, 138]];
  function makeX(y0, pad) {
    const raw = (y) => { let x = 0; for (const [a, b, p] of SEG) { if (y <= a) break; x += (Math.min(y, b) - a) * p * state.zoom; if (y <= b) break; } return x; };
    const o = raw(y0);
    return (y) => pad + raw(y) - o;
  }
  const Y0 = (() => { const ys = [...D.events.map(yearOf), ...((D.compute && D.compute.frontier_points) || []).map((p) => yearOfStr(p.date))].filter(Number.isFinite); return Math.max(1940, Math.floor(Math.min(1955, ...ys)) - 2); })();

  /* ---------- MAP ---------- */
  let layout = null, mapSvg, mapScroll, labelsCol, tip, overview;
  const ERA_H = 22, CMP_TOP = 26, CMP_H = 96, AX_H = 22, ROW = 22;

  function eraRange(i) {
    const era = D.eras[i], next = D.eras[i + 1];
    return [yearOfStr(era.start), next ? yearOfStr(next.start) : yearOfStr(era.end) + 1];
  }
  function eraForYear(year) { return D.eras.findIndex((_, i) => { const [a, b] = eraRange(i); return year >= a && year < b; }); }
  const inEra = (e) => state.era == null || (() => { const [a, b] = eraRange(state.era); return yearOf(e) >= a && yearOf(e) < b; })();
  const browseEvents = () => D.events.filter((e) => state.lanes.has(e.lane) && lit(e) && inEra(e));
  function renderEraNav() {
    const host = $(".era-nav", mounts.map); if (!host) return;
    const focusedEra = host.contains(document.activeElement) ? document.activeElement.dataset.era : null;
    host.innerHTML = `<span class="eyebrow">Browse an era</span><div class="era-buttons" role="group" aria-label="Timeline eras"><button type="button" data-era="all" aria-pressed="${state.era == null}">All eras</button>${D.eras.map((era, i) => `<button type="button" data-era="${i}" aria-pressed="${state.era === i}"><span class="num">${String(era.start).slice(0, 4)}–${String(era.end).slice(0, 4)}</span><span>${esc(era.title)}</span></button>`).join("")}</div>`;
    if (focusedEra != null) host.querySelector(`[data-era="${focusedEra}"]`)?.focus({ preventScroll: true });
  }
  function browseEra(index) {
    saveHistory(true, true); state.era = index; state.browsePage = 0;
    const list = browseEvents();
    if (!list.some((e) => e.id === state.selected)) {
      state.selected = null; state.focus = null;
      if (list.length) select(list[0].id, { history: false, keepEra: true });
      else { renderMap(); renderPane(); }
    } else renderMap();
    if (index != null && layout) { const [a, b] = eraRange(index); mapScroll.scrollLeft = Math.max(0, layout.X(a) - 12); if (layout.X(b) - layout.X(a) < mapScroll.clientWidth) jumpYear((a + b) / 2); }
    updateOverview(); saveHistory();
  }
  function computeLayout() {
    const evs = visible();
    const X = makeX(Y0, 24);
    const width = Math.ceil(X(2027.1) + 40);
    const labelMin = state.zoom >= 1.5 ? 2 : 3;
    const lanesTop = CMP_TOP + CMP_H + AX_H + 6;
    let y = lanesTop;
    const lanes = [], pos = new Map();
    const routeIds = state.route ? new Set(state.route.event_ids) : null;
    const selectedIds = state.selected && !state.query && !state.route && !state.org ? new Set([
      state.selected, ...(byId.get(state.selected).links || []).map((l) => l.to), ...(incoming.get(state.selected) || []).map((l) => l.from),
    ]) : null;
    for (const lane of D.lanes) {
      if (!state.lanes.has(lane.id)) continue;
      const items = evs.filter((e) => e.lane === lane.id).sort((a, b) => yearOf(a) - yearOf(b));
      const rows = [];
      for (const e of items) {
        const x = X(yearOf(e));
        const imp = e.importance || 2;
        const label = e.id === state.selected || (routeIds ? routeIds.has(e.id) : selectedIds ? selectedIds.has(e.id) : (state.query || state.org ? lit(e) : true) && imp >= labelMin);
        const w = label ? textW(e.label, 12, imp === 3) + 20 : 14;
        let r = rows.findIndex((end) => end < x - 4);
        if (r === -1) { if (rows.length < 9) { r = rows.length; rows.push(0); } else r = rows.indexOf(Math.min(...rows)); }
        rows[r] = x + w;
        pos.set(e.id, { x, row: r, label });
      }
      const h = Math.max(rows.length, 3) * ROW + 26;
      lanes.push({ lane, top: y, h });
      items.forEach((e) => { const p = pos.get(e.id); p.y = y + 18 + p.row * ROW; });
      y += h;
    }
    return { evs, X, width, height: y + 6, lanes, pos, lanesTop };
  }

  function renderMap() {
    if (!mapSvg) return;
    layout = computeLayout();
    const { X, width, height, lanes, pos, evs, lanesTop } = layout;
    const svg = mapSvg;
    svg.innerHTML = "";
    svg.setAttribute("width", width); svg.setAttribute("height", height); svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    // eras: alternate tint, italic names
    D.eras.forEach((era, i) => {
      const [ea, eb] = eraRange(i), a = Math.max(ea, Y0), b = Math.min(eb, 2027.1);
      if (b <= a) return;
      if (i % 2) el("rect", { x: X(a), y: 0, width: X(b) - X(a), height, style: "fill:var(--paper-2)", opacity: 0.7 }, svg);
      if (state.era === i) el("rect", { x: X(a), y: 0, width: X(b) - X(a), height, class: "era-selected", "aria-hidden": "true" }, svg);
      const room = X(b) - X(a) - 10;
      const name = era.title.length * 6.6 < room ? era.title : era.title.length * 6.6 * 0.6 < room ? era.title.split(/[,&]/)[0].trim() : "";
      if (name) el("text", { x: X(a) + 6, y: 16, class: "era-name" }, svg, name);
    });

    // Curated estimates are dots; the envelope is computed from the pinned source population.
    const compute = D.compute || {}, C = compute.points || [], F = compute.frontier_points || [];
    const plotted = [...C, ...F].filter((p) => p.flop > 0 && yearOfStr(p.date) >= Y0);
    const logs = plotted.map((p) => Math.log10(p.flop));
    const lo = Math.min(5, Math.floor(Math.min(...logs, 5))), hi = Math.max(27.5, Math.ceil(Math.max(...logs, 27) + .5));
    const cy = (f) => CMP_TOP + CMP_H - ((Math.log10(f) - lo) / (hi - lo)) * CMP_H;
    const computeTicks = [];
    for (let exponent = Math.ceil(lo / 5) * 5; exponent < hi; exponent += 5) computeTicks.push(exponent);
    computeTicks.forEach((n) => el("line", { x1: 0, x2: width, y1: cy(10 ** n), y2: cy(10 ** n), class: "cmp-grid" }, svg));
    const latest = C.reduce((m, p) => (!m || p.date > m.date ? p : m), null);
    const LABELED = new Set(["AlexNet", "AlphaGo Zero", "GPT-3 175B (davinci)", "GPT-3 175B", "GPT-4", "GPT-4 (Mar 2023)", "Perceptron Mark I", "TD-Gammon", latest && latest.model]);
    const pts = C.filter((p) => p.flop > 0 && yearOfStr(p.date) >= Y0).map((p) => ({ ...p, x: X(yearOfStr(p.date)), y: cy(p.flop) }));
    const front = F.filter((p) => p.flop > 0 && yearOfStr(p.date) >= Y0).map((p) => ({ ...p, x: X(yearOfStr(p.date)), y: cy(p.flop) }));
    if (front.length > 1) {
      const path = el("path", { d: "M" + front.map((p, i) => (i ? `H${p.x.toFixed(1)} V${p.y.toFixed(1)}` : `${p.x.toFixed(1)},${p.y.toFixed(1)}`)).join(" "), class: "cmp-trend" }, svg);
      el("title", {}, path, compute.frontier_label || "Running maximum of documented estimates");
      front.forEach((p) => {
        const dot = el("circle", { cx: p.x, cy: p.y, r: 5, class: "cmp-frontier-hit" }, svg);
        el("title", {}, dot, `${p.model}, ${p.date}: ${p.flop.toExponential(1)} estimated training FLOP; confidence: ${p.confidence || "not supplied"}`);
        dot.addEventListener("mouseenter", (ev) => showTip(ev, `${esc(p.model)} · envelope estimate<br>${esc(p.flop.toExponential(1))} FLOP · ${esc(p.confidence || "confidence not supplied")}`));
        dot.addEventListener("mousemove", moveTip); dot.addEventListener("mouseleave", hideTip);
      });
    }
    SEG.slice(1).forEach(([yr]) => {
      if (yr <= Y0) return;
      const x = X(yr), y = CMP_TOP + CMP_H + 4;
      el("path", { d: `M${x - 5},${y + 4} l4,-8 M${x},${y + 4} l4,-8`, class: "ax-break" }, svg);
    });
    pts.forEach((p) => {
      const lab = [...LABELED].some((n) => n && p.model.startsWith(n.replace(/ \(.*?$/, "")) && (n === p.model || p.model.startsWith(n)));
      const c = el("circle", { cx: p.x, cy: p.y, r: lab ? 3.4 : 2.6, class: "cmp-dot conf-" + String(p.confidence || "unknown").toLowerCase().replace(/[^a-z]/g, "") + (lab ? " lab" : "") }, svg);
      el("title", {}, c, `${p.model}, ${p.date}: ${p.flop.toExponential(1)} estimated training FLOP; confidence: ${p.confidence || "not supplied"}`);
      c.addEventListener("mouseenter", (ev) => showTip(ev, `<b>${esc(p.model)}</b><br>${esc(p.date.slice(0, 7))} · ${esc(p.flop.toExponential(1))} estimated FLOP<br>Epoch confidence: ${esc(p.confidence || "not supplied")}`));
      c.addEventListener("mousemove", moveTip); c.addEventListener("mouseleave", hideTip);
      if (lab) el("text", { x: p.x + 6, y: p.y + 4, class: "cmp-text" }, svg, p.model.replace(/ \(.*\)$/, "").replace(" 175B", ""));
    });

    // axis
    const axY = CMP_TOP + CMP_H + 15;
    let last = -99;
    for (let yr = Math.ceil(Y0); yr <= 2026; yr++) {
      const step = yr < 1990 ? 10 : yr < 2010 ? 5 : 1;
      if (yr % step) continue;
      const x = X(yr);
      if (x - last < 30) continue;
      last = x;
      const g = el("g", { class: "ax" }, svg);
      el("line", { x1: x, x2: x, y1: CMP_TOP, y2: height, "stroke-dasharray": "1 4" }, g);
      el("text", { x: x + 3, y: axY }, g, yr);
    }

    // lane rules + labels column
    labelsCol.innerHTML = "";
    labelsCol.style.height = height + "px";
    const ticks = computeTicks.map((p) => `<div class="lab num" style="top:${cy(10 ** p) - 8}px;text-align:right"><span>10<sup>${p}</sup></span></div>`).join("");
    labelsCol.insertAdjacentHTML("beforeend", `<div class="lab compute-heading" style="top:0px"><b>Compute</b><span class="compute-unit">est. FLOP</span></div>${ticks}`);
    lanes.forEach((L) => {
      el("line", { x1: 0, x2: width, y1: L.top, y2: L.top, class: "lane-rule" }, svg);
      labelsCol.insertAdjacentHTML("beforeend", `<div class="lab" style="top:${L.top + 8}px"><b style="color:${lc(L.lane.id)}">${esc(L.lane.short || L.lane.title)}</b><span>${esc(LANE_NOTE[L.lane.id] || "")}</span></div>`);
    });
    labelsCol.insertAdjacentHTML("beforeend", `<div style="position:absolute;left:0;right:0;top:${lanesTop - 1}px;border-top:1px solid var(--rule)"></div>`);

    // connections
    const gArc = el("g", {}, svg);
    stubCount = {};
    const related = new Set();
    if (state.selected && pos.has(state.selected)) {
      const s = byId.get(state.selected);
      related.add(s.id);
      const pairSlots = new Map();
      connectionsFor(s.id).forEach((c) => {
        related.add(c.from); related.add(c.to);
        const other = c.from === s.id ? c.to : c.from, slot = pairSlots.get(other) || 0;
        pairSlots.set(other, slot + 1);
        if (pos.has(c.from) && pos.has(c.to)) arc(gArc, pos.get(c.from), pos.get(c.to), c, slot);
      });
    }
    let routeIds = null;
    if (state.route) {
      routeIds = state.route.event_ids.filter((id) => pos.has(id));
      if (routeIds.length > 1) {
        const P = routeIds.map((id) => pos.get(id));
        let d = `M${P[0].x},${P[0].y}`;
        for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], mx = (a.x + b.x) / 2; d += ` C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`; }
        el("path", { d, class: "route" }, gArc);
      }
    }

    // nodes
    const gN = el("g", {}, svg);
    const focusId = [state.focus, state.selected].find((id) => pos.has(id) && lit(byId.get(id))) || (evs.find((e) => lit(e) && e.importance === 3 && yearOf(e) >= 2010) || evs.find(lit) || evs[0] || {}).id;
    for (const e of evs) {
      const p = pos.get(e.id), imp = e.importance || 2;
      let dim = !lit(e);
      if (state.selected && !state.query && !state.route && !state.org) dim = !related.has(e.id);
      const g = el("g", { class: `node imp${imp}${dim ? " dim" : ""}${state.selected === e.id ? " sel" : ""}`, transform: `translate(${p.x},${p.y})`, tabindex: e.id === focusId ? 0 : -1, role: "button", "aria-label": `${e.title}, ${fmtDate(e)}` }, gN);
      const r = [0, 3, 4.2, 5.6][imp];
      el("circle", { r: r + 3.5, class: "ring" }, g);
      el("circle", { r, style: imp === 1 ? `fill:var(--paper);stroke:${lc(e.lane)};stroke-width:1.5` : `fill:${lc(e.lane)}` }, g);
      if (p.label) el("text", { x: r + 5, y: 4 }, g, e.label);
      else if (state.route && related.has(e.id)) el("text", { x: r + 5, y: 4, class: "connection-label" }, g, e.label);
      g.dataset.eventId = e.id;
      g.addEventListener("focus", () => { state.focus = e.id; });
      g.addEventListener("click", (ev) => { ev.stopPropagation(); select(e.id); });
      g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(e.id); } });
      g.addEventListener("mouseenter", (ev) => showTip(ev, `<b>${esc(e.title)}</b><br>${esc(fmtDate(e))}<span class="preview-idea">${esc(e.idea || e.problem || "")}</span>`));
      g.addEventListener("focus", (ev) => { showTip(ev, `<b>${esc(e.title)}</b><br>${esc(fmtDate(e))}<span class="preview-idea">${esc(e.idea || e.problem || "")}</span>`); g.setAttribute("aria-describedby", "atlas-preview"); });
      g.addEventListener("blur", hideTip);
      g.addEventListener("mousemove", moveTip);
      g.addEventListener("mouseleave", hideTip);
    }
    if (routeIds) routeIds.forEach((id) => {
      const p = pos.get(id);
      const g = el("g", { class: "badge", transform: `translate(${p.x},${p.y - 15})` }, gN);
      el("circle", { r: 7.5 }, g);
      el("text", { "text-anchor": "middle", y: 3.5 }, g, state.route.event_ids.indexOf(id) + 1);
    });
    renderContext(); renderOverview(); renderEraNav(); renderSearchResults(); updateConnectionAccent(); updateWorkspaceSticky();
    const cnt = $("#atlas-count");
    if (cnt) { const n = state.query ? matches().length : 0; cnt.textContent = !state.query ? "" : n ? `${n} match${n > 1 ? "es" : ""}` : "No matches"; }
  }

  let stubCount = {};
  function arc(parent, a, b, connection, slot) {
    const { type, from: aId, to: bId, key } = connection;
    const outsideRoute = state.route && (!state.route.event_ids.includes(aId) || !state.route.event_ids.includes(bId));
    const g = el("g", { class: `connection-hit${outsideRoute ? " connection-outside-route" : ""}`, "data-connection": key, tabindex: 0, role: "button", "aria-label": `Explain: ${connectionLabel(connection)}`, "aria-controls": "atlas-connection-detail", "aria-expanded": state.connection === key }, parent);
    el("title", {}, g, connectionLabel(connection));
    const draw = (d, cls = "") => {
      el("path", { d, class: "arc" + (type === "parallel" ? " parallel" : "") + cls }, g);
      el("path", { d, class: "arc-hit", "aria-hidden": "true" }, g);
    };
    // Far-apart links become short stubs pointing the way; the pane lists them in full.
    if (Math.abs(b.x - a.x) > 460) {
      const fromSel = layout.pos.get(state.selected) === a ? a : b, other = fromSel === a ? b : a;
      const dir = Math.sign(other.x - fromSel.x), len = 30;
      // fan stubs out above and below the node so their labels never stack
      const k = (stubCount[dir] = (stubCount[dir] || 0) + 1), off = (k % 2 ? -1 : 1) * (14 + Math.floor((k - 1) / 2) * 15);
      const ex = fromSel.x + dir * len, ey = fromSel.y + off;
      draw(`M${fromSel.x},${fromSel.y} L${ex},${ey}`, " stub");
      // This end mark points towards the offscreen event, not the relation direction.
      el("path", { d: `M${ex - dir * 4},${ey - 4} L${ex},${ey} L${ex - dir * 4},${ey + 4}`, class: "arc stub stub-direction" }, g);
      const o = byId.get(fromSel === a ? bId : aId);
      if (o) el("text", { x: ex + dir * 5, y: ey + 4, "text-anchor": dir > 0 ? "start" : "end", class: "stub-label" }, g, `${o.label}, ${o.date_sort.slice(0, 4)}`);
      return;
    }
    const mx = (a.x + b.x) / 2;
    const lift = Math.min(70, Math.abs(b.x - a.x) * 0.22) + 12 + slot * 15;
    const my = Math.min(a.y, b.y) - lift;
    draw(`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`);
    if (type === "parallel") return;
    const ang = Math.atan2(b.y - my, b.x - mx), r = 8;
    el("path", { d: `M${b.x - 6 * Math.cos(ang)},${b.y - 6 * Math.sin(ang)} l${-r * Math.cos(ang - 0.42)},${-r * Math.sin(ang - 0.42)} m${r * Math.cos(ang - 0.42)},${r * Math.sin(ang - 0.42)} l${-r * Math.cos(ang + 0.42)},${-r * Math.sin(ang + 0.42)}`, class: "arc" }, g);
  }

  function updateConnectionAccent() {
    const key = connectionHover || connectionFocus || state.connection, c = connectionByKey.get(key);
    mounts.map?.querySelectorAll(".connection-hit, [data-connection-row]").forEach((n) => {
      const active = (n.dataset.connection || n.dataset.connectionRow) === key;
      n.classList.toggle("connection-active", active);
      n.classList.toggle("connection-muted", Boolean(c) && !active);
      if (n.classList.contains("connection-hit")) n.setAttribute("aria-expanded", String(n.dataset.connection === state.connection));
    });
    mounts.map?.querySelectorAll("[data-explain-connection]").forEach((n) => n.setAttribute("aria-expanded", String(n.dataset.explainConnection === state.connection)));
    mapSvg?.querySelectorAll(".node").forEach((n) => n.classList.toggle("connection-endpoint", Boolean(c) && [c.from, c.to].includes(n.dataset.eventId)));
  }
  function renderConnectionDetail() {
    const host = $(".connection-detail", mounts.map); if (!host) return;
    const c = connectionByKey.get(state.connection);
    const valid = c && [c.from, c.to].includes(state.selected);
    host.hidden = !valid;
    if (!valid) { host.innerHTML = ""; host.removeAttribute("data-connection"); updateConnectionAccent(); return; }
    host.dataset.connection = c.key;
    const from = byId.get(c.from), to = byId.get(c.to);
    const pair = connections.filter((other) => other.key !== c.key && ((other.from === c.from && other.to === c.to) || (other.from === c.to && other.to === c.from)));
    const record = (item) => `<div class="connection-record" data-relation="${esc(item.key)}"><p class="connection-direction"><a href="#${esc(item.from)}" data-ev="${esc(item.from)}">${esc(byId.get(item.from).title)}</a><span class="connection-relation">${esc(REL[item.type] || item.type)}</span><a href="#${esc(item.to)}" data-ev="${esc(item.to)}">${esc(byId.get(item.to).title)}</a></p>${item.note ? `<p class="connection-note">${esc(item.note)}</p>` : '<p class="connection-note">No further note is recorded for this relation.</p>'}</div>`;
    const sources = [from, to].filter((e) => (e.sources || []).length).map((e) => `<div><span>${esc(e.label)}</span>${e.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label || s.url)}</a>`).join("")}</div>`).join("");
    host.innerHTML = `<div class="connection-detail-head"><h4 id="atlas-connection-title" tabindex="-1">Why these events are connected</h4><button type="button" class="text-button" data-act="close-connection" aria-label="Close connection explanation">Close ×</button></div>${record(c)}${pair.length ? `<details class="connection-other"><summary>${pair.length} other recorded relation${pair.length === 1 ? "" : "s"} between these events</summary>${pair.map(record).join("")}</details>` : ""}<p class="connection-method">This is the atlas’s interpretation of the relationship. The sources below describe the individual works.</p>${sources ? `<details class="connection-sources"><summary>Sources for these events</summary>${sources}</details>` : ""}`;
    updateConnectionAccent(); updateWorkspaceSticky();
  }
  function inspectConnection(key, trigger) {
    if (!connectionByKey.has(key)) return;
    const c = connectionByKey.get(key); if (![c.from, c.to].includes(state.selected)) return;
    if (state.connection !== key) { saveHistory(true, true); state.connection = key; saveHistory(); }
    connectionTrigger = trigger; connectionHover = null; connectionFocus = null; hideTip(); renderConnectionDetail();
    const host = $(".connection-detail", mounts.map), rect = host.getBoundingClientRect(), inset = workspaceInset();
    if (rect.top < inset) scrollBy({ top: rect.top - inset, behavior: "auto" });
    else if (rect.bottom > innerHeight - 16) scrollBy({ top: Math.min(rect.top - inset, rect.bottom - innerHeight + 16), behavior: "auto" });
    $("#atlas-connection-title", mounts.map)?.focus({ preventScroll: true });
  }
  function closeConnection(options = {}) {
    if (!state.connection) return;
    const key = state.connection; state.connection = null; connectionHover = null; connectionFocus = null; hideTip(); renderConnectionDetail();
    if (options.history !== false) saveHistory();
    if (options.focus !== false) {
      const trigger = connectionTrigger?.isConnected ? connectionTrigger : [...mounts.map.querySelectorAll("[data-explain-connection]")].find((n) => n.dataset.explainConnection === key);
      trigger?.focus({ preventScroll: true });
    }
  }

  function renderContext() {
    const c = $(".context", mounts.map);
    if (!c) return;
    const parts = [];
    if (state.route) parts.push(`Route: ${state.route.question || state.route.title}`);
    if (state.org) parts.push(`Organisation: ${state.org.name}`);
    if (state.query) parts.push(`Search: “${state.query}” (every event in the active lanes and scope)`);
    if (state.lanes.size < D.lanes.length) parts.push(`Lanes: ${D.lanes.filter((l) => state.lanes.has(l.id)).map((l) => l.short || l.title).join(", ")}`);
    const scopeCount = matches().length;
    c.hidden = false;
    c.innerHTML = `<span>${parts.length ? esc(parts.join(" · ")) : `${scopeCount} ${state.minImp === 3 ? "anchor" : state.minImp === 1 ? "total" : "main"} events across all lanes`}</span>${parts.length || state.selected || state.minImp !== 2 || state.zoom !== 1 ? '<button type="button" class="text-button" data-act="clear">Reset view</button>' : ""}`;
  }

  function renderSearchResults() {
    const host = $(".search-results", mounts.map); if (!host) return;
    const list = browseEvents(), pageSize = 4, pages = Math.max(1, Math.ceil(list.length / pageSize));
    state.browsePage = Math.min(state.browsePage, pages - 1);
    const start = state.browsePage * pageSize, era = state.era == null ? null : D.eras[state.era];
    const scoped = Boolean(state.query || state.route || state.org);
    const globalCount = D.events.filter((e) => state.lanes.has(e.lane) && lit(e)).length;
    host.dataset.total = list.length; host.dataset.globalTotal = globalCount;
    if (state.route) { renderRouteStepper(host); return; }
    host.innerHTML = `<div class="browser-heading"><h3 tabindex="-1">${era ? esc(era.title) : "Events across the history"}</h3><span class="num">${list.length} ${scoped ? "matching " : ""}event${list.length === 1 ? "" : "s"}${era ? " in this era" : ""}</span></div>${era && era.summary ? `<details class="era-summary"><summary>About this era</summary><p>${esc(era.summary)}</p></details>` : ""}${state.query && era ? `<p>${globalCount} search match${globalCount === 1 ? "" : "es"} across all eras. <button class="text-button" data-era="all">Show all matches</button></p>` : ""}${list.length ? `<ol>${list.slice(start, start + pageSize).map((e) => `<li${state.selected === e.id ? ' class="current"' : ""}><span class="num result-date">${esc(fmtDate(e))}</span><a href="#${esc(e.id)}" data-ev-card="${esc(e.id)}"${state.selected === e.id ? ' aria-current="true"' : ""}>${esc(e.title)}</a><span class="result-lane" style="color:${lc(e.lane)}">${esc(laneTitle(e.lane))}</span></li>`).join("")}</ol><div class="browser-pages"><button type="button" class="text-button" data-browse-page="${state.browsePage - 1}"${state.browsePage ? "" : " disabled"}>← Previous</button><span class="num">${start + 1}–${Math.min(start + pageSize, list.length)} of ${list.length}</span><button type="button" class="text-button" data-browse-page="${state.browsePage + 1}"${state.browsePage + 1 < pages ? "" : " disabled"}>Next →</button></div>` : `<p>No events ${era ? "in this era " : ""}match the active lanes${scoped ? " and search or scope" : ""}. ${scoped ? '<button type="button" class="text-button" data-act="clear">Reset view</button>' : '<button type="button" class="text-button" data-era="all">Browse all eras</button>'}</p>`}`;
  }

  function routeAvailable() {
    return state.route ? state.route.event_ids.filter((id) => { const e = byId.get(id); return e && state.lanes.has(e.lane) && lit(e) && inEra(e); }) : [];
  }
  function renderRouteStepper(host) {
    const t = state.route, ids = t.event_ids, available = routeAvailable(), current = ids.indexOf(state.selected), index = available.indexOf(state.selected);
    const previous = index > 0 ? available[index - 1] : null, next = index >= 0 ? available[index + 1] : available[0];
    const control = (id, dir, label) => `<button type="button" class="route-step-control" data-route-step="${dir}"${id ? ` aria-label="${label}: ${esc(byId.get(id).title)}, ${byId.get(id).date_sort.slice(0, 4)}"` : " disabled"}><span>${dir < 0 ? "← " : ""}${label}${dir > 0 ? " →" : ""}</span><strong>${id ? `${esc(byId.get(id).label)} <span class="num">${byId.get(id).date_sort.slice(0, 4)}</span>` : dir < 0 ? "Start of route" : "End of route"}</strong></button>`;
    host.innerHTML = `<nav class="route-stepper" data-route-id="${esc(t.id)}" aria-label="Active question route"><div class="route-stepper-head"><span class="eyebrow">Follow a question</span><button type="button" class="text-button" data-act="leave-route">Exit route</button></div><h3>${esc(t.question || t.title)}</h3><div class="route-position-row"><span class="route-position num">${current >= 0 ? `Step ${current + 1} of ${ids.length}` : `Choose a step · ${ids.length} in this route`}</span>${available.length < ids.length ? `<span>${available.length} available with these filters</span>` : ""}</div><progress class="route-progress" max="${ids.length}" value="${current + 1}" aria-label="Position in the curated route"></progress><ol class="route-stops" aria-label="Route steps">${ids.map((id, i) => { const e = byId.get(id), active = id === state.selected; return `<li><button type="button" data-route-stop="${esc(id)}"${active ? ' aria-current="step"' : ""}${available.includes(id) ? "" : " disabled"} title="${i + 1}. ${esc(e.label)}, ${e.date_sort.slice(0, 4)}${available.includes(id) ? "" : " · unavailable with these filters"}" aria-label="Step ${i + 1}: ${esc(e.title)}, ${e.date_sort.slice(0, 4)}" style="--stop-color:${lc(e.lane)}"><span class="num">${i + 1}</span></button></li>`; }).join("")}</ol>${current >= 0 ? `<p class="route-step-current"><span class="dot" style="background:${lc(byId.get(state.selected).lane)}"></span>${esc(byId.get(state.selected).label)} <span class="num">${byId.get(state.selected).date_sort.slice(0, 4)}</span></p>` : ""}${!available.length ? '<p class="route-empty">No events in this route match the active lanes, search and era. Adjust the filters or <button type="button" class="text-button" data-era="all">browse all eras</button>.</p>' : `<div class="route-step-controls">${control(previous, -1, "Previous")}${control(next, 1, "Next")}</div>`}<details class="route-stop-list"><summary>All ${ids.length} steps · curated reading order</summary><ol>${ids.map((id, i) => { const e = byId.get(id); return `<li value="${i + 1}"><button type="button" class="text-button" data-route-stop="${esc(id)}"${available.includes(id) ? "" : " disabled"}${id === state.selected ? ' aria-current="step"' : ""}>${esc(e.label)} <span class="num">${e.date_sort.slice(0, 4)}</span></button>${available.includes(id) ? "" : '<span class="route-unavailable">Unavailable with these filters</span>'}</li>`; }).join("")}</ol></details></nav>`;
    const rail = $(".route-stops", host), active = $(".route-stops [aria-current]", host);
    if (rail && active) rail.scrollLeft = Math.max(0, active.offsetLeft - rail.offsetLeft - rail.clientWidth / 2 + active.offsetWidth / 2);
  }

  function yearAtX(x) {
    let a = Y0, b = 2027.1;
    for (let n = 0; n < 30; n++) { const m = (a + b) / 2; if (layout.X(m) < x) a = m; else b = m; }
    return (a + b) / 2;
  }
  function renderOverview() {
    if (!overview || !layout) return;
    const ox = (year) => 12 + ((year - Y0) / (2027.1 - Y0)) * 976;
    overview.innerHTML = `<title>Whole history on a linear time scale. Click a year to move the map, or use the year slider below.</title>${[1960, 1980, 2000, 2020].filter((y) => y >= Y0).map((y) => `<line x1="${ox(y)}" x2="${ox(y)}" y1="7" y2="47" class="overview-grid"/>`).join("")}${D.events.map((e) => `<circle cx="${ox(yearOf(e))}" cy="${13 + D.lanes.findIndex((l) => l.id === e.lane) * 9}" r="${e.importance === 3 ? 2.4 : 1.5}" style="fill:${lc(e.lane)};opacity:${state.lanes.has(e.lane) && lit(e) ? .65 : .12}"/>`).join("")}<rect class="overview-window" y="5" height="43" rx="3"/>`;
    updateOverview();
  }
  function updateOverview() {
    if (!overview || !layout) return;
    const a = yearAtX(mapScroll.scrollLeft), b = yearAtX(mapScroll.scrollLeft + mapScroll.clientWidth);
    const ox = (y) => 12 + ((y - Y0) / (2027.1 - Y0)) * 976;
    const rect = $(".overview-window", overview);
    if (rect) { rect.setAttribute("x", ox(a)); rect.setAttribute("width", Math.max(4, ox(b) - ox(a))); }
    const range = $("#atlas-year");
    if (range) { range.value = Math.round((a + b) / 2); range.setAttribute("aria-valuetext", `Around ${Math.round((a + b) / 2)}; map shows ${Math.floor(a)} to ${Math.min(2026, Math.ceil(b))}`); }
    const label = $(".window-years", mounts.map); if (label) label.textContent = `Map window: ${Math.floor(a)}–${Math.min(2026, Math.ceil(b))}`;
  }
  function jumpYear(year) {
    if (!layout) return;
    mapScroll.scrollLeft = layout.X(Math.max(Y0, Math.min(2026.99, year))) - mapScroll.clientWidth / 2;
    updateOverview();
  }

  function workspaceInset() {
    const header = document.getElementById("quarto-header");
    return 16 + (header && getComputedStyle(header).position === "fixed" ? header.offsetHeight : 0);
  }
  function updateWorkspaceSticky() {
    const chart = $(".chart-column", mounts.map); if (!chart) return;
    chart.style.setProperty("--chart-top", `${Math.min(workspaceInset(), innerHeight - chart.offsetHeight - 16)}px`);
    const profileDock = mounts.people && $(".people-profile-dock", mounts.people); if (profileDock) profileDock.style.setProperty("--profile-top", `${Math.min(workspaceInset(), innerHeight - profileDock.offsetHeight - 16)}px`);
  }
  function updateChip() {
    const chip = $(".card-chip", mounts.map); if (!chip) return;
    const e = state.selected && byId.get(state.selected); chip.hidden = !e;
    if (e) chip.textContent = `Read: ${e.label} ↓`;
  }
  function readSelected() {
    const heading = $(".pane h3", mounts.map), target = heading || $(".pane-host", mounts.map);
    if (target) { target.scrollIntoView({ behavior: SMOOTH, block: "start" }); if (heading) heading.focus({ preventScroll: true }); }
  }
  function scrollMapTo(id, smooth = true) {
    const p = layout && layout.pos.get(id);
    if (!p) return;
    const sc = mapScroll;
    if (p.x < sc.scrollLeft + 60 || p.x > sc.scrollLeft + sc.clientWidth - 200) sc.scrollTo({ left: p.x - sc.clientWidth * 0.4, behavior: smooth ? SMOOTH : "auto" });
  }

  /* ---------- tooltip ---------- */
  function showTip(ev, html) { if (!tip) return; tip.innerHTML = html; tip.hidden = false; moveTip(ev); }
  function moveTip(ev) { if (!tip) return; const r = ev.target && ev.target.getBoundingClientRect ? ev.target.getBoundingClientRect() : { left: 0, bottom: 0 }; const x = Number.isFinite(ev.clientX) ? ev.clientX : r.left, y = Number.isFinite(ev.clientY) ? ev.clientY : r.bottom; tip.style.left = Math.max(8, Math.min(x + 14, innerWidth - tip.offsetWidth - 8)) + "px"; tip.style.top = Math.max(8, Math.min(y + 14, innerHeight - tip.offsetHeight - 8)) + "px"; }
  function hideTip() { if (tip) tip.hidden = true; }

  /* ---------- reading pane ---------- */
  function renderPane() {
    const pane = $(".pane-host", mounts.map);
    if (!pane) return;
    const e = state.selected && byId.get(state.selected);
    const sr = $(".sr-only", mounts.map); if (sr) sr.textContent = e ? `${e.title}, ${fmtDate(e)}` : "";
    updateChip();
    if (!e) {
      state.connection = null; connectionHover = null; connectionFocus = null;
      const anchors = D.events.filter((x) => x.importance === 3);
      const pick = ["safety-2017-deep-rl-human-prefs", "safety-2023-ai-control", "lm-2017-transformer"].filter((i) => byId.has(i));
      pane.innerHTML = `<div class="pane-empty"><p>Select any event on the map to read it here: the problem it faced, the idea, what changed afterwards, and what it left unsolved.</p><p>${anchors.length} anchor events are labelled. Some places to start: ${pick.map((i) => `<a href="#${i}" data-ev="${i}">${esc(byId.get(i).title)}</a>`).join(", ")}.</p><div class="start-routes"><span class="eyebrow">Start with a question</span>${["thread-human-feedback", "thread-interpretability", "thread-rl-agents"].map((id) => D.threads.find((t) => t.id === id)).filter(Boolean).map((t) => `<button type="button" class="text-button" data-route="${esc(t.id)}">${esc(t.question || t.title)} →</button>`).join("")}</div></div>`;
      return;
    }
    const conns = connectionsFor(e.id).map((c) => ({ ...c, id: c.from === e.id ? c.to : c.from, rel: (c.from === e.id ? REL : REL_IN)[c.type] || c.type })).sort((a, b) => byId.get(a.id).date_sort.localeCompare(byId.get(b.id).date_sort));
    const dg = window.DIAGRAMS && window.DIAGRAMS.forEvent(e);
    const answer = (key, title, html, cls = "") => `<div class="reveal ${cls}">${state.quiz ? `<button type="button" class="reveal-button" aria-expanded="false" aria-controls="answer-${esc(e.id)}-${key}" data-reveal="answer-${esc(e.id)}-${key}">Show ${esc(title.toLowerCase())}</button>` : `<div class="eyebrow">${esc(title)}</div>`}<div class="answer-content" id="answer-${esc(e.id)}-${key}"${state.quiz ? " hidden" : ""}>${html}</div></div>`;
    const block = (cls, h, t) => !t ? "" : cls.includes("reveal") ? answer(h.toLowerCase().replace(/[^a-z]+/g, "-"), h, `<p>${esc(t)}</p>`, cls) : `<div><div class="eyebrow">${h}</div><p>${esc(t)}</p></div>`;
    const routes = D.threads.filter((t) => t.event_ids.includes(e.id));
    pane.innerHTML = `<article class="pane${state.quiz ? " quiz" : ""}">
      <div class="head">
        <div class="meta eyebrow"><span class="dot" style="background:${lc(e.lane)}"></span>${esc(laneTitle(e.lane))} · <span class="num">${esc(fmtDate(e))}</span>${e.kind ? " · " + esc(e.kind) : ""}</div>
        <h3 tabindex="-1">${esc(e.title)}</h3>
        ${e.date_context || e.date_basis ? `<p class="date-context">${esc(e.date_context || `Date basis: ${e.date_basis}.`)}</p>` : ""}
        ${(e.people || []).length || (e.orgs || []).length ? `<div class="people">${(e.people || []).map(personLink).join(", ")}${(e.people || []).length && (e.orgs || []).length ? " · " : ""}${(e.orgs || []).map(orgLink).join(", ")}</div>` : ""}
      </div>
      <section class="connection-detail" id="atlas-connection-detail" aria-labelledby="atlas-connection-title" hidden></section>
      <div class="qa">
        ${block("", "The problem", e.problem)}
        ${block("reveal", "The idea", e.idea)}
        ${dg ? answer("diagram", "The idea in view", `<figure class="diagram">${dg.svg}<figcaption>${esc(dg.caption)}</figcaption></figure>`, "diagram-answer") : ""}
        ${block("reveal", "What changed", e.changed)}
        ${block("reveal limits", "What it did not solve", e.limits)}
        ${(e.terms || []).length ? `<div><div class="eyebrow">Terms</div><dl class="terms">${e.terms.map((t) => `<dt>${esc(t.term)}</dt><dd>${esc(t.def)}</dd>`).join("")}</dl></div>` : ""}
      </div>
      <div class="side">
        ${conns.length ? `<div><div class="eyebrow">Connections</div><ul class="conn">${conns.map((c) => { const o = byId.get(c.id); return `<li data-connection-row="${esc(c.key)}"><span class="rel">${esc(c.rel)}</span><span><a href="#${esc(c.id)}" data-ev="${esc(c.id)}">${esc(o.title)}</a> <span class="num" style="color:var(--muted)">${o.date_sort.slice(0, 4)}</span>${c.note ? `<span class="why">${esc(c.note)}</span>` : ""}<button type="button" class="text-button connection-explain" data-explain-connection="${esc(c.key)}" aria-expanded="${state.connection === c.key}" aria-controls="atlas-connection-detail" aria-label="Explain: ${esc(connectionLabel(c))}">Explain this connection ↗</button></span></li>`; }).join("")}</ul></div>` : ""}
        ${(e.sources || []).length ? `<div class="reads"><div class="eyebrow">Read next</div>${e.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label || s.url)}</a>`).join("")}</div>` : ""}
        ${routes.length ? `<div class="reads"><div class="eyebrow">On the routes</div>${routes.map((t) => `<a href="#" data-route="${esc(t.id)}">${esc(t.question || t.title)}</a>`).join("")}</div>` : ""}
      </div>
      <div class="foot"><span><button type="button" class="text-button" data-nav="-1">← Earlier</button> &nbsp; <button type="button" class="text-button" data-nav="1">Later →</button></span><button type="button" class="text-button" data-act="locate">Back to selected event ↑</button><span class="verify">${e.verified && e.verified.date ? "" : "This date is not yet confirmed against a primary source."}</span></div>
    </article>`;
    renderConnectionDetail();
  }
  function orgLink(name) {
    const o = D.orgs.find((x) => orgMatches({ id: "", orgs: [name] }, x)) || [...orgById.values()].find((x) => x.name === name);
    return o ? `<a href="#${profileHash(`org:${o.id}`)}" data-profile="org:${esc(o.id)}" aria-controls="atlas-profile" aria-expanded="${state.profile === `org:${o.id}`}">${esc(name)}</a>` : esc(name);
  }

  function personLink(name) {
    const p = [...personById.values()].find((x) => x.name.toLowerCase() === name.toLowerCase());
    return p ? `<a href="#${profileHash(`person:${personId(p)}`)}" data-profile="person:${esc(personId(p))}" aria-controls="atlas-profile" aria-expanded="${state.profile === `person:${personId(p)}`}">${esc(name)}</a>` : esc(name);
  }
  function snapshot() {
    return { selected: state.selected, connection: state.connection, route: state.route && state.route.id, org: state.org && state.org.id,
      query: state.query, queryInput: state.queryInput, minImp: state.minImp, zoom: state.zoom, lanes: [...state.lanes], scrollLeft: mapScroll ? mapScroll.scrollLeft : 0, era: state.era, browsePage: state.browsePage, profile: state.profile, profileDock: state.profileDock, affiliationIndex: state.affiliationIndex, quiz: state.quiz, routeShown: state.routeShown };
  }
  function saveHistory(replace = false, preserveUrl = false) {
    const url = preserveUrl ? location.href : `${location.pathname}${location.search}${state.profile ? "#" + profileHash(state.profile) : state.selected ? "#" + state.selected : "#the-map"}`;
    history[replace ? "replaceState" : "pushState"]({ ...(history.state || {}), atlas: snapshot() }, "", url);
  }
  function select(id, opts = {}) {
    if (!byId.has(id)) return;
    const previous = state.selected;
    if (opts.history !== false) saveHistory(true, true);
    state.selected = id; state.focus = id; state.connection = null; connectionHover = null; connectionFocus = null; connectionTrigger = null;
    const e = byId.get(id);
    if (!opts.keepEra && !(state.route && state.route.event_ids.includes(id))) state.era = eraForYear(yearOf(e));
    if (state.era < 0) state.era = null;
    if (state.profile) { state.profile = null; renderProfile(); }
    if (state.route && !state.route.event_ids.includes(id)) state.route = null;
    if (state.org && !orgMatches(e, state.org)) state.org = null;
    if (state.query && !textMatches(e, state.query)) { state.query = ""; state.queryInput = ""; }
    state.lanes.add(e.lane);
    if (!state.query && !state.route && !state.org && (e.importance || 2) < state.minImp) state.minImp = e.importance || 2;
    const hadFocus = mapSvg && mapSvg.contains(document.activeElement);
    const index = browseEvents().findIndex((x) => x.id === id); if (index >= 0) state.browsePage = Math.floor(index / 4);
    syncControls(); renderMap(); renderPane();
    scrollMapTo(id, false); updateOverview();
    if (hadFocus || opts.focus) { const n = mapSvg.querySelector(".node.sel"); if (n) n.focus({ preventScroll: true }); }
    if (opts.history !== false) saveHistory(previous === id);
    if (opts.card) readSelected();
    else if (opts.reveal) mounts.map.scrollIntoView({ behavior: SMOOTH, block: "start" });
  }
  function step(dir, fromId = state.selected || state.focus, opts = { focus: true }) {
    const seq = state.route ? routeAvailable() : matches().map((e) => e.id);
    if (!seq.length) return;
    const index = seq.indexOf(fromId);
    const next = index < 0 ? (dir > 0 ? 0 : seq.length - 1) : index + dir;
    if (next >= 0 && next < seq.length) select(seq[next], { ...opts, keepEra: Boolean(state.route) });
  }
  function reconcileSelection() {
    if (state.selected && !matches().some((e) => e.id === state.selected)) { state.selected = null; state.focus = null; state.connection = null; connectionHover = null; connectionFocus = null; }
  }
  function resetView() {
    state.selected = null; state.focus = null; state.connection = null; connectionHover = null; connectionFocus = null; state.route = null; state.org = null; state.query = ""; state.queryInput = "";
    state.era = null; state.browsePage = 0; state.profile = null; renderProfile(); state.minImp = 2; state.zoom = 1; state.lanes = new Set(D.lanes.map((l) => l.id));
    syncControls(); renderMap(); renderPane(); saveHistory();
  }

  /* ---------- controls ---------- */
  function renderControls() {
    const c = $(".controls", mounts.map);
    c.innerHTML = `
      <input class="search" id="atlas-search" type="search" placeholder="Search: reward, Christiano, debate…" aria-label="Search events" aria-describedby="atlas-count" value="${esc(state.queryInput)}"><span class="count" id="atlas-count" aria-live="polite"></span>
      <div class="group" role="group" aria-label="Lanes">${D.lanes.map((l) => `<button class="atlas-btn" data-lane="${l.id}" aria-pressed="${state.lanes.has(l.id)}"><span class="dot" style="background:${lc(l.id)}"></span>${esc(l.short || l.title)}</button>`).join("")}</div>
      <div class="group"><label class="ctl-label" for="atlas-detail">Show</label>
        <select class="atlas-btn" id="atlas-detail"><option value="1">every event</option><option value="2">main events</option><option value="3">anchors only</option></select></div>
      <div class="group" role="group" aria-label="Zoom"><button class="atlas-btn" data-zoom="-1" aria-label="Zoom out">−</button><button class="atlas-btn" data-zoom="1" aria-label="Zoom in">+</button></div>
      <div class="group"><button class="atlas-btn" id="atlas-quiz" aria-pressed="${state.quiz}">Quiz: hide answers</button></div>`;
    syncControls();
    $("#atlas-search").addEventListener("input", (ev) => { state.queryInput = ev.target.value; state.query = state.queryInput.trim(); state.era = null; state.browsePage = 0; reconcileSelection(); syncControls(); renderMap(); renderPane(); saveHistory(true); });
    $("#atlas-detail").addEventListener("change", (ev) => { state.minImp = Number(ev.target.value); reconcileSelection(); renderMap(); renderPane(); saveHistory(true); });
    $("#atlas-quiz").addEventListener("click", (ev) => { state.quiz = !state.quiz; ev.currentTarget.setAttribute("aria-pressed", state.quiz); renderPane(); });
  }
  function syncControls() {
    const s = $("#atlas-detail"); if (s) { const scoped = Boolean(state.query || state.route || state.org); s.value = scoped ? "1" : String(state.minImp); s.disabled = scoped; s.title = scoped ? "Search, routes and organisations include every event in scope." : ""; }
    const quiz = $("#atlas-quiz"); if (quiz) quiz.setAttribute("aria-pressed", state.quiz);
    const q = $("#atlas-search"); if (q && q.value !== state.queryInput) q.value = state.queryInput;
    document.querySelectorAll("[data-lane]").forEach((b) => b.setAttribute("aria-pressed", state.lanes.has(b.dataset.lane)));
  }

  function computeDisclosure() {
    const c = D.compute; if (!c) return "";
    const rows = (points) => `<div class="compute-table"><table><thead><tr><th>Model</th><th>Date</th><th>Estimated FLOP</th><th>Confidence</th></tr></thead><tbody>${points.map((p) => `<tr><td>${esc(p.model)}</td><td class="num">${esc(p.date)}</td><td class="num">${esc(p.flop.toExponential(2))}</td><td>${esc(p.confidence || "Not supplied")}</td></tr>`).join("")}</tbody></table></div>`;
    const method = typeof c.frontier_method === "string" ? c.frontier_method : typeof c.method === "string" ? c.method : c.method && c.method.description ? c.method.description : "The line uses the date-ordered running maximum of documented estimates in the pinned source dataset. It does not establish an absolute world record.";
    return `<details class="compute-method"><summary>Compute data, uncertainty and method</summary><p>${esc(c.uncertainty_note || "Training-compute figures are estimates. Epoch confidence labels describe the source row and are not numerical error bars.")}</p><p>${esc(method)}</p>${c.method && c.method.date_policy ? `<p>${esc(c.method.date_policy)}</p>` : ""}${c.metric && c.metric.comparability_note ? `<p>${esc(c.metric.comparability_note)}</p>` : ""}<p>Snapshot: ${esc(c.retrieved || "see source")}${c.population ? `; ${c.population.eligible_rows} eligible estimates from ${c.population.source_rows} source rows` : ""}. ${c.confidence_note ? esc(c.confidence_note) : ""} <a href="${esc(c.source_url || "https://epoch.ai/data/ai-models")}" target="_blank" rel="noopener">${esc(c.source || "Epoch AI source")}</a>, CC-BY.${c.snapshot && c.snapshot.sha256 ? ` <span class="snapshot-hash">Snapshot SHA-256: <code>${esc(c.snapshot.sha256)}</code></span>` : ""}</p><details><summary>Curated model estimates (${(c.points || []).length})</summary>${rows(c.points || [])}</details>${c.frontier_points ? `<details><summary>Dataset envelope estimates (${c.frontier_points.length})</summary>${rows(c.frontier_points)}</details>` : ""}</details>`;
  }

  function mountMap() {
    const m = mounts.map;
    if (!m) return;
    m.innerHTML = `<div class="controls"></div><div class="context"></div><nav class="workspace-switch" aria-label="Timeline reading"><button type="button" class="text-button" data-act="locate">↑ Map</button><button type="button" class="card-chip" hidden></button></nav><div class="timeline-workspace"><section class="chart-column" aria-label="History map"><div class="era-nav" id="every-event-by-era"></div>
      <div class="navigator"><div class="overview-heading"><span class="eyebrow">All years · linear time scale</span><span class="window-years num"></span></div><svg class="overview" viewBox="0 0 1000 52" preserveAspectRatio="none" role="img" aria-label="Whole timeline and current map window"></svg><div class="overview-axis" aria-hidden="true">${[1960, 1980, 2000, 2020].filter((y) => y >= Y0).map((y) => `<span style="left:${1.2 + (y - Y0) / (2027.1 - Y0) * 97.6}%">${y}</span>`).join("")}</div><div class="overview-range"><label for="atlas-year">Jump to year</label><input id="atlas-year" type="range" min="${Math.ceil(Y0)}" max="2026" step="1" value="2017"><span aria-hidden="true">← →</span></div></div>
      <div class="map"><div class="map-labels"></div><div class="map-scroll" tabindex="0" aria-label="Timeline, scroll sideways"><svg role="group" aria-label="Timeline of AI in four lanes. Use the left and right arrow keys to move between events."></svg></div></div>
      <div class="map-note"><span>Dot size marks importance; hollow dots are details. Drag or scroll sideways. ← → step through time.</span><span>Top band: estimated training compute (log scale). Dots are a curated selection; ${D.compute && D.compute.frontier_points ? "the line is the running maximum of documented estimates in the pinned dataset" : "a complete dataset envelope is unavailable; dots show the curated subset only"}. The time axis widens at 1990, 2010 and 2017 (marked //), so slopes are only comparable within a stretch. ${D.compute ? `<a href="${esc(D.compute.source_url || "https://epoch.ai/data/ai-models")}" target="_blank" rel="noopener">Epoch AI</a>, CC-BY.` : ""}</span></div>
      <div class="compute-legend"><span><i class="confident"></i> Confident</span><span><i class="likely"></i> Likely</span><span><i class="speculative"></i> Speculative</span><span>Epoch row confidence; estimates are not error bars.</span></div>${computeDisclosure()}</section><section class="reader-column" aria-label="Event browser and selected event"><div class="search-results"></div><div class="profile-dock" hidden></div><div class="pane-host"></div></section></div><div class="tip" id="atlas-preview" role="tooltip" hidden></div><div class="sr-only" aria-live="polite"></div>`;
    $(".card-chip", m).addEventListener("click", readSelected);
    let chipRaf = 0; addEventListener("scroll", () => { if (!chipRaf) chipRaf = requestAnimationFrame(() => { chipRaf = 0; updateChip(); }); }, { passive: true });
    mapSvg = $(".map svg", m); overview = $(".overview", m); mapScroll = $(".map-scroll", m); labelsCol = $(".map-labels", m); tip = $(".tip", m);
    renderControls();
    overview.addEventListener("pointerdown", (ev) => { if (ev.button !== 0) return; const r = overview.getBoundingClientRect(); jumpYear(Y0 + Math.max(0, Math.min(1, (ev.clientX - r.left - r.width * .012) / (r.width * .976))) * (2027.1 - Y0)); });
    $("#atlas-year").addEventListener("input", (ev) => jumpYear(Number(ev.target.value)));
    mapScroll.addEventListener("scroll", updateOverview, { passive: true });
    addEventListener("resize", () => { updateOverview(); updateChip(); updateWorkspaceSticky(); });
    if (window.ResizeObserver) new ResizeObserver(updateWorkspaceSticky).observe($(".chart-column", m));
    // drag to pan
    let drag = null;
    mapScroll.addEventListener("pointerdown", (ev) => { if (ev.target.closest(".node, .connection-hit") || ev.pointerType !== "mouse") return; drag = { x: ev.clientX, s: mapScroll.scrollLeft, moved: false }; });
    addEventListener("pointermove", (ev) => { if (!drag) return; const dx = ev.clientX - drag.x; if (Math.abs(dx) > 3) { drag.moved = true; mapScroll.classList.add("dragging"); } mapScroll.scrollLeft = drag.s - dx; });
    addEventListener("pointerup", () => { if (drag && !drag.moved && state.selected) { /* click on empty map keeps selection */ } drag = null; mapScroll.classList.remove("dragging"); });
    renderMap(); renderPane();
    mapScroll.scrollLeft = layout.X(2010) - 30; updateOverview();
  }

  /* ---------- routes ---------- */
  function miniStrip(t) {
    const X = makeX(Y0, 0), w = X(2027), sx = 300 / w;
    const dots = t.event_ids.map((id) => byId.get(id)).map((e) => `<circle cx="${(X(yearOf(e)) * sx).toFixed(1)}" cy="8" r="3.2" style="fill:${lc(e.lane)}"/>`).join("");
    const ticks = [1960, 1990, 2010, 2020].map((y) => `<line x1="${(X(y) * sx).toFixed(1)}" x2="${(X(y) * sx).toFixed(1)}" y1="3" y2="13" style="stroke:var(--rule)"/>`).join("");
    return `<svg viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="300" y1="8" y2="8" style="stroke:var(--rule)"/>${ticks}${dots}</svg>`;
  }
  function renderRoutes() {
    const m = mounts.routes;
    if (!m) return;
    const t = D.threads.find((x) => x.id === state.routeShown) || D.threads[0];
    if (!t) { m.innerHTML = ""; return; }
    const ids = t.event_ids;
    m.innerHTML = `<div class="routes">
      <ul class="route-list">${D.threads.map((r) => `<li><button data-route-show="${esc(r.id)}" aria-current="${r.id === t.id}"><span class="q">${esc(r.question || r.title)}</span>${miniStrip(r)}</button></li>`).join("")}</ul>
      <div class="route-body">
        <h3>${esc(t.question || t.title)}</h3>
        <p class="summary">${esc(t.summary || "")}</p>
        <p><a href="#" data-route="${esc(t.id)}">Trace this route on the map ↑</a></p>
        <ol class="steps">${ids.map((id, i) => {
          const e = byId.get(id), prev = ids[i - 1];
          let rel = "";
          if (prev) {
            const f = (e.links || []).find((l) => l.to === prev);
            const b = (byId.get(prev).links || []).find((l) => l.to === id);
            if (f) rel = `${REL[f.type].toLowerCase()} the step above${f.note ? ": " + f.note : ""}`;
            else if (b) rel = `${REL_IN[b.type].toLowerCase()} the step above${b.note ? ": " + b.note : ""}`;
          }
          return `<li><span class="yr">${e.date_sort.slice(0, 4)}</span><span class="rail"><i style="background:${lc(e.lane)}"></i></span><div class="st">${rel ? `<p class="rel">${esc(rel)}</p>` : ""}<a href="#${esc(id)}" data-ev-reveal="${esc(id)}">${esc(e.title)}</a><p>${esc(e.changed || e.idea || "")}</p></div></li>`;
        }).join("")}</ol>
      </div></div>`;
  }

  /* ---------- people & orgs ---------- */
  const KIND_TONE = { lab: "lm", "nonprofit research": "rl", academic: "gov", government: "safety", funder: "grey", fellowship: "grey" };
  function orgFor(name) { return D.orgs.find((o) => orgMatches({ id: "", orgs: [name] }, o)); }
  const ACADEMIC = /universit|\bmit\b|berkeley|toronto|oxford|alberta|mila|fhi|chai/i, GOVT = /institute.*(nist|security)|caisi|aisi|government|report \(chair\)/i;
  function toneFor(org) {
    const o = orgFor(org);
    if (o && KIND_TONE[o.kind]) return KIND_TONE[o.kind];
    if (GOVT.test(org)) return "safety";
    if (ACADEMIC.test(org)) return "gov";
    if (/openai|anthropic|deepmind|google|baidu|xai|meta|superintelligence|keen/i.test(org)) return "lm";
    return "grey";
  }
  function renderPeople() {
    const m = mounts.people;
    if (!m) return;
    if (!D.people.length && !D.orgs.length) { m.innerHTML = `<p class="eyebrow">Institutional data is still being compiled.</p>`; return; }
    const A = 1995, NOW = 2026.85, NAME = 148, W = Math.max(680, Math.round(m.clientWidth > 1050 ? (m.clientWidth - 25.6) * 1.55 / 2.55 : m.clientWidth || 900)), BAR = 15, GAP = 4;
    const px = (y) => NAME + ((Math.max(A, Math.min(NOW, y)) - A) / (NOW - A)) * (W - NAME - 46);
    const span = (a) => { const f = yearOfStr(a.from || A); let t = a.to ? yearOfStr(a.to) : NOW; if (a.to && /^\d{4}\??$/.test(String(a.to))) t += 1; if (!isFinite(t)) t = NOW; return [isFinite(f) ? f : A, Math.max(t, f + 0.25)]; };
    const people = D.people.map((p) => {
      const roles = (p.affiliations || []).map((a, index) => ({ ...a, index, s: span(a) })).sort((a, b) => a.s[0] - b.s[0]);
      const ends = [];
      roles.forEach((r) => { let k = ends.findIndex((e) => e <= r.s[0] + 0.01); if (k < 0) { k = ends.length; ends.push(0); } ends[k] = r.s[1]; r.track = k; });
      return { ...p, roles, tracks: Math.max(1, ends.length), first: roles.length ? roles[0].s[0] : 2100 };
    }).sort((a, b) => a.first - b.first);
    let y = 30; const rows = people.map((p) => { const top = y; y += p.tracks * (BAR + GAP) + 9; return top; });
    const H = y + 4;
    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Researcher affiliations, 1995 to 2026. Select a name or affiliation to open its profile.">`;
    for (let yr = 2000; yr <= 2025; yr += 5) svg += `<line x1="${px(yr)}" x2="${px(yr)}" y1="20" y2="${H}" class="gl"/><text x="${px(yr)}" y="13" text-anchor="middle" class="yr">${yr}</text>`;
    svg += `<line x1="${px(NOW)}" x2="${px(NOW)}" y1="20" y2="${H}" class="now"/><text x="${px(NOW)}" y="13" text-anchor="middle" class="yr">now</text>`;
    people.forEach((p, i) => {
      const top = rows[i], h = p.tracks * (BAR + GAP) - GAP;
      if (i) svg += `<line x1="0" x2="${W}" y1="${top - 5}" y2="${top - 5}" class="sep"/>`;
      svg += `<text x="0" y="${top + 11.5}" class="nm" tabindex="0" role="button" data-profile="person:${esc(personId(p))}" aria-label="Open profile: ${esc(p.name)}">${esc(p.name)}${p.known_for ? `<title>${esc(p.known_for)}</title>` : ""}</text>`;
      const byTrack = {};
      p.roles.forEach((r) => (byTrack[r.track] = byTrack[r.track] || []).push(r));
      p.roles.forEach((r) => {
        const x1 = px(r.s[0]), x2 = px(r.s[1]), by = top + r.track * (BAR + GAP), tone = toneFor(r.org);
        const open = !r.to, name = r.org.replace(/\s*\(.*?\)\s*/g, " ").trim();
        svg += `<g class="role${r.uncertain ? " unsure" : ""}" tabindex="0" role="button" data-profile="person:${esc(personId(p))}" data-affiliation="${r.index}" aria-label="${esc(p.name)} at ${esc(r.org)}, ${esc(r.from || "start unknown")} to ${esc(r.to || "present")}${r.uncertain ? ", dates uncertain" : ""}. Open affiliation details."><rect class="role-hit" x="${x1 - 4}" y="${by - 3}" width="${Math.max(16, x2 - x1 + 8)}" height="${BAR + 6}"/><rect class="role-bar" x="${x1}" y="${by}" width="${Math.max(3, x2 - x1 - 1.5)}" height="${BAR}" rx="2.5" style="fill:var(--${tone});stroke:var(--${tone})"/>`;
        if (open) svg += `<path d="M${x2 - 1.5},${by} l5,${BAR / 2} l-5,${BAR / 2}" style="fill:var(--${tone})" class="tip-arrow"/>`;
        svg += `<title>${esc(r.org)}: ${esc(r.from || "?")}–${esc(r.to || "present")}${r.uncertain ? " (dates uncertain)" : ""}</title>`;
        const next = (byTrack[r.track] || []).find((o) => o.s[0] >= r.s[1] - 0.01);
        const room = (next ? px(next.s[0]) : W) - x2, w = name.length * 5.9 + 10;
        if (x2 - x1 > w) svg += `<text x="${x1 + 5}" y="${by + 11}" class="lb">${esc(name)}</text>`;
        else if (room > w && !open) svg += `<text x="${x2 + 4}" y="${by + 11}" class="lb out">${esc(name)}</text>`;
        else { const prev = (byTrack[r.track] || []).filter((o) => o.s[1] <= r.s[0] + 0.01).pop(); if (x1 - (prev ? px(prev.s[1]) : NAME + 70) > w) svg += `<text x="${x1 - 4}" y="${by + 11}" text-anchor="end" class="lb out">${esc(name)}</text>`; }
        svg += `</g>`;
      });
    });
    svg += `</svg>`;
    const kinds = [["lm", "Lab"], ["rl", "Nonprofit research"], ["gov", "Academic"], ["safety", "Government"], ["grey", "Other"]];
    m.innerHTML = `<div class="profile-picker"><label for="atlas-org-search">Find a person or organisation</label><input id="atlas-org-search" type="search" placeholder="Name, affiliation or research area" aria-controls="atlas-profile-select"><span id="atlas-org-count" aria-live="polite"></span><div class="profile-choice"><select id="atlas-profile-select" aria-label="Choose a person or organisation"></select><button type="button" class="atlas-btn" data-act="open-profile-choice">Open profile</button></div></div><div class="people-workspace"><div>${people.length ? `<div class="people-chart">${svg}</div><div class="legend">${kinds.map(([t, n]) => `<span><i style="background:color-mix(in srgb, var(--${t}) 17%, transparent);border-color:color-mix(in srgb, var(--${t}) 60%, transparent)"></i>${n}</span>`).join("")}<span>An arrow marks a continuing role; a dashed outline marks uncertain dates. Select a name or bar for details.</span></div>` : ""}</div><div class="people-profile-dock"></div></div>`;
    profilePanel = document.createElement("section"); profilePanel.className = "profile-panel"; profilePanel.setAttribute("aria-label", "Selected profile");
    const filterProfiles = () => {
      const words = $("#atlas-org-search", m).value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const list = (words.length ? allProfileRecords : profileRecords).filter((r) => words.every((w) => r.text.toLowerCase().includes(w)));
      const curated = new Set(profileRecords.map((r) => r.key));
      const select = $("#atlas-profile-select", m);
      select.innerHTML = list.length ? ["Person", "Organisation"].map((kind) => `<optgroup label="${kind === "Person" ? "People" : "Organisations"}">${list.filter((r) => r.kind === kind).sort((a, b) => Number(curated.has(b.key)) - Number(curated.has(a.key)) || a.name.localeCompare(b.name)).map((r) => `<option value="${esc(r.key)}">${esc(r.name)}</option>`).join("")}</optgroup>`).join("") : '<option value="">No matching profiles</option>';
      if (list.some((r) => r.key === state.profile)) select.value = state.profile;
      select.disabled = !list.length; $("[data-act=\"open-profile-choice\"]", m).disabled = !list.length;
      $("#atlas-org-count", m).textContent = `${list.length} profile${list.length === 1 ? "" : "s"}`;
    };
    $("#atlas-org-search", m).addEventListener("input", filterProfiles); filterProfiles(); renderProfile();
  }

  let profilePanel, profileTrigger = null;
  function profileRecord(key) {
    if (!key) return null;
    const split = key.indexOf(":"), kind = key.slice(0, split), id = key.slice(split + 1);
    return kind === "person" ? personById.get(id) : kind === "org" ? orgById.get(id) : null;
  }
  const roleDates = (a) => `${a.from || "start unknown"}–${a.to || "present"}${a.uncertain ? " (dates uncertain)" : ""}`;
  function profilePreview(key, affiliationIndex) {
    const record = profileRecord(key); if (!record) return "";
    if (key.startsWith("person:")) {
      const affiliation = affiliationIndex != null && (record.affiliations || [])[Number(affiliationIndex)];
      return `<b>${esc(record.name)}</b><br>${affiliation ? `${esc(affiliation.org)} · ${esc(roleDates(affiliation))}<br>` : ""}<span class="preview-idea">${esc(record.known_for || "Related work in this atlas")}</span><span class="preview-action">${(record.affiliations || []).length ? "Open affiliations and related work." : "Open related work in this atlas."}</span>`;
    }
    return `<b>${esc(record.name)}</b><br><span class="preview-idea">${esc(record.historical_role || record.kind || "Related work in this atlas")}</span><span class="preview-action">${record.historical_role ? "Open status, sources and related work." : "Open related work in this atlas."}</span>`;
  }
  function relatedEvents(ids) {
    const list = [...new Set(ids)].map((id) => byId.get(id)).filter(Boolean).sort((a, b) => a.date_sort.localeCompare(b.date_sort));
    return list.length ? `<div class="profile-related"><h4>Related events</h4><ul>${list.map((e) => `<li><span class="num">${e.date_sort.slice(0, 4)}</span><a href="#${esc(e.id)}" data-ev-card="${esc(e.id)}">${esc(e.title)}</a></li>`).join("")}</ul></div>` : "";
  }
  function profileSources(sources) { return sources && sources.length ? `<div class="profile-sources"><h4>Sources</h4>${sources.map((source) => `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label || "Source")}</a>`).join("")}</div>` : ""; }
  function renderProfile() {
    if (!profilePanel || !mounts.people) return;
    const timelineDock = mounts.map && $(".profile-dock", mounts.map), peopleDock = $(".people-profile-dock", mounts.people);
    const record = profileRecord(state.profile), active = Boolean(record);
    const dock = active && state.profileDock === "timeline" && timelineDock ? timelineDock : peopleDock;
    dock.appendChild(profilePanel); if (timelineDock) {
      timelineDock.hidden = dock !== timelineDock || !active;
      timelineDock.querySelector(".profile-return")?.remove();
      $(".pane-host", mounts.map).hidden = active && dock === timelineDock;
      if (active && dock === timelineDock) {
        const back = document.createElement("button"); back.type = "button"; back.className = "text-button profile-return"; back.dataset.act = "return-event";
        back.textContent = state.selected ? `← Return to ${byId.get(state.selected).title}` : "← Return to event browser";
        timelineDock.insertBefore(back, profilePanel);
      }
    }
    if (dock !== peopleDock) peopleDock.innerHTML = '<p class="profile-placeholder">The selected profile is open beside the event card. Select a name here to bring it alongside this chart.</p>';
    else peopleDock.querySelector(".profile-placeholder")?.remove();
    document.querySelectorAll("[data-profile]").forEach((n) => {
      const selected = n.dataset.profile === state.profile;
      n.classList.toggle("profile-selected", selected && (n.dataset.affiliation == null || Number(n.dataset.affiliation) === state.affiliationIndex));
      n.setAttribute("aria-expanded", String(selected)); n.setAttribute("aria-controls", "atlas-profile");
    });
    profilePanel.id = "atlas-profile";
    if (!active) { profilePanel.removeAttribute("aria-labelledby"); profilePanel.innerHTML = '<div class="profile-placeholder"><h3>People and organisations</h3><p>Select a name or affiliation to read its profile. The menu above provides the same information without the chart.</p></div>'; return; }
    const isPerson = state.profile.startsWith("person:");
    if (dock === peopleDock && matchMedia("(min-width: 1051px)").matches) {
      const bottom = $(".people-workspace", mounts.people).getBoundingClientRect().bottom;
      profilePanel.style.setProperty("--profile-max", `${Math.max(160, Math.min(innerHeight - workspaceInset() - 16, bottom - workspaceInset()))}px`);
    }
    const body = isPerson ? `${!record.known_for && !(record.affiliations || []).length ? '<p class="profile-kind">Related work in this atlas</p>' : ""}${record.known_for ? `<p>${esc(record.known_for)}</p>` : ""}${(record.affiliations || []).length ? '<h4>Affiliations</h4>' : ""}<ul class="profile-affiliations">${(record.affiliations || []).map((a, i) => `<li${state.affiliationIndex === i ? ' class="current"' : ""}>${orgLink(a.org)}<span class="num">${esc(roleDates(a))}</span></li>`).join("")}</ul>${relatedEvents([...(record.key_event_ids || []), ...D.events.filter((e) => (e.people || []).some((name) => name.toLowerCase() === record.name.toLowerCase())).map((e) => e.id)])}${profileSources(record.sources)}` : `<p class="profile-kind">${esc(record.kind || "Organisation")}${record.founded ? ` · Founded ${esc(record.founded)}` : record.activity_since ? ` · Documented activity since ${esc(record.activity_since)}` : ""}</p>${record.founded_context ? `<p class="date-context">${esc(record.founded_context)}. Founding date not established here.</p>` : ""}${(record.founders || []).length ? `<p class="profile-founders">Founders: ${record.founders.map(personLink).join(", ")}</p>` : ""}${record.historical_role ? `<p>${esc(record.historical_role)}</p>` : ""}${(record.research_focus || []).length ? `<p class="profile-focus">Research: ${record.research_focus.map(esc).join(", ")}.</p>` : ""}${record.status_as_of_2026_11 ? `<p class="now">As of November 2026: ${esc(record.status_as_of_2026_11)}</p>` : ""}${(record.affiliations || []).length ? `<h4>Affiliations recorded here</h4><ul class="profile-affiliations">${record.affiliations.map((a) => `<li>${personLink(a.person)}<span class="num">${esc(roleDates(a))}</span></li>`).join("")}</ul>` : ""}${relatedEvents(record.key_event_ids || [])}${(record.key_event_ids || []).length ? `<button type="button" class="text-button" data-org="${esc(record.id)}">Show related events on the map →</button>` : ""}${profileSources(record.sources)}`;
    profilePanel.innerHTML = `<div class="profile-head"><div><span class="eyebrow">${isPerson ? "Person" : "Organisation"}</span><h3 id="atlas-profile-title" tabindex="-1">${esc(record.name)}</h3></div><button type="button" class="profile-close" data-act="close-profile" aria-label="Close profile">×</button></div><div class="profile-body">${body}</div>`;
    profilePanel.setAttribute("aria-labelledby", "atlas-profile-title"); updateWorkspaceSticky();
  }
  function openProfile(key, options = {}) {
    if (!profileRecord(key)) return;
    if (options.history !== false) saveHistory(true, true);
    const same = state.profile === key, pageY = scrollY;
    const preserveChart = options.trigger && options.trigger.closest(".people-chart") && matchMedia("(min-width: 1051px)").matches;
    state.profile = key; state.affiliationIndex = options.affiliationIndex == null ? null : Number(options.affiliationIndex);
    state.profileDock = options.dock || "people"; if (options.trigger && !options.trigger.closest(".profile-panel")) profileTrigger = options.trigger;
    renderProfile(); profilePanel.scrollTop = 0; hideTip();
    if (preserveChart) scrollTo({ top: pageY, behavior: "auto" });
    if (options.history !== false) saveHistory(same);
    if (options.focus !== false || options.reveal) { const heading = $("h3", profilePanel); if (!preserveChart) profilePanel.scrollIntoView({ behavior: SMOOTH, block: "start" }); if (options.focus !== false) heading.focus({ preventScroll: true }); }
  }
  function closeProfile(options = {}) {
    if (!state.profile) return;
    const pageY = scrollY, preserveChart = state.profileDock === "people" && matchMedia("(min-width: 1051px)").matches;
    state.profile = null; state.affiliationIndex = null; renderProfile(); hideTip();
    if (options.history !== false) saveHistory();
    if (options.focus !== false) { const trigger = profileTrigger && profileTrigger.isConnected ? profileTrigger : $("#atlas-profile-select", mounts.people); if (trigger) trigger.focus({ preventScroll: true }); }
    if (preserveChart) scrollTo({ top: pageY, behavior: "auto" });
  }
  function previewProfile(trigger, ev) {
    if (!trigger || !trigger.closest(".atlas")) return;
    showTip(ev, profilePreview(trigger.dataset.profile, trigger.dataset.affiliation)); trigger.setAttribute("aria-describedby", "atlas-preview");
  }

  /* ---------- index by era & glossary ---------- */
  function renderIndex() {
    // Compatibility for older source posts: the chronological browser now lives beside the map.
    if (mounts.index) mounts.index.innerHTML = '<p><a href="#every-event-by-era">Browse events by era beside the map ↑</a></p>';
  }
  function renderGlossary() {
    const m = mounts.glossary;
    if (!m) return;
    const seen = new Map();
    D.events.forEach((e) => (e.terms || []).forEach((t) => { const k = t.term.toLowerCase(); if (!seen.has(k)) seen.set(k, { ...t, ev: e }); }));
    const q = "";
    const list = [...seen.values()].sort((a, b) => a.term.localeCompare(b.term));
    m.innerHTML = `<details${q ? " open" : ""}><summary>All terms<span class="eyebrow">${list.length}</span></summary><div class="gloss">${list.map((t) => `<div><b>${esc(t.term)}</b><p>${esc(t.def)} <a href="#${esc(t.ev.id)}" data-ev-reveal="${esc(t.ev.id)}">${esc(t.ev.label)}, ${t.ev.date_sort.slice(0, 4)}</a></p></div>`).join("")}</div></details>`;
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-ev],[data-ev-reveal],[data-ev-card],[data-org],[data-route],[data-route-show],[data-route-stop],[data-route-step],.connection-hit,[data-explain-connection],[data-lane],[data-nav],[data-zoom],[data-act],[data-reveal],[data-profile],[data-era],[data-browse-page]");
    if (!t || !t.closest(".atlas")) return;
    if (t.tagName === "A" && (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || t.target === "_blank")) return;
    if (t.tagName === "A") ev.preventDefault();
    const d = t.dataset;
    if (t.classList.contains("connection-hit") || d.explainConnection) inspectConnection(d.connection || d.explainConnection, t);
    else if (d.routeStop || d.routeStep) {
      const available = routeAvailable(), index = available.indexOf(state.selected), next = d.routeStop || available[index < 0 ? 0 : index + Number(d.routeStep)];
      if (!available.includes(next)) return;
      select(next, { keepEra: true });
      const control = d.routeStep ? mounts.map.querySelector(`[data-route-step="${d.routeStep}"]:not(:disabled)`) : [...mounts.map.querySelectorAll(".route-stops [data-route-stop]")].find((n) => n.dataset.routeStop === next);
      (control || $(".pane h3", mounts.map))?.focus({ preventScroll: true });
    }
    else if (d.profile) openProfile(d.profile, { trigger: t, affiliationIndex: d.affiliation, dock: t.closest('[data-atlas="map"]') ? "timeline" : "people" });
    else if (d.era != null) browseEra(d.era === "all" ? null : Number(d.era));
    else if (d.browsePage != null) { state.browsePage = Math.max(0, Number(d.browsePage)); renderSearchResults(); $(".browser-heading h3", mounts.map)?.focus({ preventScroll: true }); saveHistory(true, true); }
    else if (d.ev) select(d.ev, { card: true, dismissProfile: Boolean(t.closest(".profile-panel")) });
    else if (d.evReveal) select(d.evReveal, { card: true, dismissProfile: Boolean(t.closest(".profile-panel")) });
    else if (d.evCard) select(d.evCard, { card: true, dismissProfile: Boolean(t.closest(".profile-panel")) });
    else if (d.reveal) { const answer = document.getElementById(d.reveal); if (answer) { answer.hidden = false; t.setAttribute("aria-expanded", "true"); t.textContent = t.textContent.replace(/^Show /, "Shown: "); } }
    else if (d.nav) step(Number(d.nav), state.selected, { card: true });
    else if (d.lane) {
      state.lanes.has(d.lane) ? state.lanes.delete(d.lane) : state.lanes.add(d.lane);
      if (!state.lanes.size) state.lanes.add(d.lane);
      reconcileSelection(); syncControls(); renderMap(); renderPane(); saveHistory(true);
    } else if (d.zoom) {
      const center = yearAtX(mapScroll.scrollLeft + mapScroll.clientWidth / 2);
      state.zoom = Math.max(0.6, Math.min(2.6, state.zoom * (d.zoom > 0 ? 1.25 : 0.8)));
      renderMap(); jumpYear(center); saveHistory(true);
    } else if (d.routeShow) { state.routeShown = d.routeShow; renderRoutes(); }
    else if (d.route) {
      const route = D.threads.find((x) => x.id === d.route); if (!route) return;
      saveHistory(true, true); state.route = route; state.org = null; state.query = ""; state.queryInput = ""; state.selected = null; state.connection = null; connectionHover = null; connectionFocus = null; state.focus = route.event_ids[0]; state.era = null; state.browsePage = 0; state.profile = null; renderProfile();
      route.event_ids.forEach((id) => { const e = byId.get(id); if (e) state.lanes.add(e.lane); });
      const first = routeAvailable()[0];
      if (first) select(first, { history: false, keepEra: true });
      else { syncControls(); renderMap(); renderPane(); }
      updateOverview(); saveHistory();
      mounts.map.scrollIntoView({ behavior: SMOOTH, block: "start" });
      const firstNode = mapSvg.querySelector('.node[tabindex="0"]'); if (firstNode) firstNode.focus({ preventScroll: true });
      hideTip();
    } else if (d.org) {
      const org = orgById.get(d.org); if (!org) return;
      saveHistory(true, true); state.org = org; state.route = null; state.query = ""; state.queryInput = ""; state.selected = null; state.era = null; state.browsePage = 0; state.profile = null; renderProfile();
      D.events.filter((e) => orgMatches(e, org)).forEach((e) => state.lanes.add(e.lane));
      syncControls(); renderMap(); renderPane(); const first = matches()[0]; if (first) scrollMapTo(first.id, false); updateOverview(); saveHistory();
      mounts.map.scrollIntoView({ behavior: SMOOTH, block: "start" });
    } else if (d.act === "leave-route") {
      saveHistory(true, true); state.route = null;
      if (state.selected) state.minImp = Math.min(state.minImp, byId.get(state.selected).importance || 2);
      syncControls(); renderMap(); renderPane(); saveHistory();
      $(".pane h3", mounts.map)?.focus({ preventScroll: true });
    } else if (d.act === "close-connection") closeConnection();
    else if (d.act === "open-profile-choice") { const picker = $("#atlas-profile-select", mounts.people); if (picker && picker.value) openProfile(picker.value, { trigger: t, dock: "people" }); }
    else if (d.act === "close-profile" || d.act === "return-event") closeProfile();
    else if (d.act === "clear") resetView();
    else if (d.act === "locate") {
      scrollMapTo(state.selected, false); updateOverview();
      $(".chart-column", mounts.map).scrollIntoView({ behavior: SMOOTH, block: "start" });
      const node = mapSvg.querySelector(".node.sel"); if (node) node.focus({ preventScroll: true });
    }
  });
  const connectionControl = (target) => target.closest(".connection-hit, [data-connection-row]");
  document.addEventListener("pointerover", (ev) => { if (ev.pointerType === "touch") return; const n = connectionControl(ev.target); if (n && !n.contains(ev.relatedTarget)) { connectionHover = n.dataset.connection || n.dataset.connectionRow; hideTip(); updateConnectionAccent(); } });
  document.addEventListener("pointerout", (ev) => { const n = connectionControl(ev.target); if (n && !n.contains(ev.relatedTarget)) { connectionHover = null; updateConnectionAccent(); } });
  document.addEventListener("focusin", (ev) => { const n = connectionControl(ev.target); if (n) { connectionFocus = n.dataset.connection || n.dataset.connectionRow; updateConnectionAccent(); } });
  document.addEventListener("focusout", (ev) => { const n = connectionControl(ev.target); if (n && !n.contains(ev.relatedTarget)) { connectionFocus = null; updateConnectionAccent(); } });
  document.addEventListener("pointerover", (ev) => { if (ev.pointerType === "touch") return; const trigger = ev.target.closest("[data-profile]"); if (trigger && !trigger.contains(ev.relatedTarget)) previewProfile(trigger, ev); });
  document.addEventListener("pointerout", (ev) => { const trigger = ev.target.closest("[data-profile]"); if (trigger && !trigger.contains(ev.relatedTarget)) { hideTip(); trigger.removeAttribute("aria-describedby"); } });
  document.addEventListener("focusin", (ev) => { const trigger = ev.target.closest("[data-profile]"); if (trigger) previewProfile(trigger, ev); });
  document.addEventListener("focusout", (ev) => { const trigger = ev.target.closest("[data-profile]"); if (trigger) { hideTip(); trigger.removeAttribute("aria-describedby"); } });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { hideTip(); if (state.profile) { ev.preventDefault(); closeProfile(); return; } if (state.connection) { ev.preventDefault(); closeConnection(); return; } }
    const connection = ev.target.closest(".connection-hit");
    if (connection && ["Enter", " "].includes(ev.key)) { ev.preventDefault(); inspectConnection(connection.dataset.connection, connection); return; }
    const profileControl = ev.target.closest("[data-profile]");
    if (profileControl && !/^(A|BUTTON)$/.test(profileControl.tagName) && ["Enter", " "].includes(ev.key)) { ev.preventDefault(); profileControl.dispatchEvent(new MouseEvent("click", { bubbles: true })); return; }
    if (!mapScroll || !mapScroll.contains(ev.target) || /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
    const node = ev.target.closest(".node"), from = node ? node.dataset.eventId : state.selected || state.focus;
    if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") { ev.preventDefault(); step(ev.key === "ArrowRight" ? 1 : -1, from); }
    if (ev.key === "Home" || ev.key === "End") { const seq = matches(); if (seq.length) { ev.preventDefault(); select(seq[ev.key === "Home" ? 0 : seq.length - 1].id, { focus: true }); } }
    if (ev.key === "Escape") { state.selected = null; renderMap(); renderPane(); saveHistory(); const n = mapSvg.querySelector('.node[tabindex="0"]'); if (n) n.focus({ preventScroll: true }); }
  });

  mountMap(); renderRoutes(); renderPeople(); renderIndex(); renderGlossary();
  function fromHash() {
    let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
    const profile = profileFromHash(id);
    if (profile && profileRecord(profile) && state.profile !== profile) openProfile(profile, { history: false, focus: false, reveal: true, dock: "people" });
    else if (byId.has(id) && (id !== state.selected || state.profile)) { state.profile = null; renderProfile(); select(id, { history: false }); }
  }
  addEventListener("popstate", (ev) => {
    const saved = ev.state && ev.state.atlas;
    if (!saved) { fromHash(); return; }
    state.selected = byId.has(saved.selected) ? saved.selected : null; state.focus = state.selected;
    const connection = connectionByKey.get(saved.connection);
    state.connection = connection && [connection.from, connection.to].includes(state.selected) ? saved.connection : null; connectionHover = null; connectionFocus = null; connectionTrigger = null;
    state.route = D.threads.find((t) => t.id === saved.route) || null; state.org = orgById.get(saved.org) || null;
    state.query = saved.query || ""; state.queryInput = saved.queryInput == null ? state.query : saved.queryInput; state.minImp = saved.minImp || 2; state.zoom = saved.zoom || 1;
    state.lanes = new Set(saved.lanes || D.lanes.map((l) => l.id));
    state.era = Number.isInteger(saved.era) && D.eras[saved.era] ? saved.era : null; state.browsePage = saved.browsePage || 0;
    state.profile = profileRecord(saved.profile) ? saved.profile : null; state.profileDock = saved.profileDock || "people"; state.affiliationIndex = saved.affiliationIndex == null ? null : saved.affiliationIndex;
    state.quiz = Boolean(saved.quiz); state.routeShown = saved.routeShown || state.routeShown;
    syncControls(); renderMap(); renderPane(); renderProfile(); renderRoutes(); mapScroll.scrollLeft = saved.scrollLeft || 0; updateOverview();
  });
  addEventListener("hashchange", fromHash);
  fromHash(); saveHistory(true, true);
})();
