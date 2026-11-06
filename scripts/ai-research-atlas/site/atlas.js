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
  const laneById = new Map(D.lanes.map((l) => [l.id, l]));
  const incoming = new Map();
  D.events.forEach((e) => (e.links || []).forEach((ln) => {
    if (!incoming.has(ln.to)) incoming.set(ln.to, []);
    incoming.get(ln.to).push({ from: e.id, type: ln.type, note: ln.note });
  }));

  const state = { selected: null, route: null, org: null, query: "", queryInput: "", minImp: 2, zoom: 1, lanes: new Set(D.lanes.map((l) => l.id)), quiz: false, focus: null, routeShown: (D.threads[0] || {}).id };
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
      const pairs = [...(s.links || []).map((l) => [s.id, l.to, l.type]), ...(incoming.get(s.id) || []).map((l) => [l.from, s.id, l.type])];
      const seenPair = new Set();
      pairs.filter(([a, b]) => { const k = a === s.id ? b : a; if (seenPair.has(k)) return false; seenPair.add(k); return true; }).forEach(([a, b, t]) => {
        related.add(a); related.add(b);
        if (pos.has(a) && pos.has(b)) arc(gArc, pos.get(a), pos.get(b), t, a, b);
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
      g.dataset.eventId = e.id;
      g.addEventListener("focus", () => { state.focus = e.id; });
      g.addEventListener("click", (ev) => { ev.stopPropagation(); select(e.id); });
      g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(e.id); } });
      g.addEventListener("mouseenter", (ev) => showTip(ev, `<b>${esc(e.title)}</b><br>${esc(fmtDate(e))}`));
      g.addEventListener("mousemove", moveTip);
      g.addEventListener("mouseleave", hideTip);
    }
    if (routeIds) routeIds.forEach((id, i) => {
      const p = pos.get(id);
      const g = el("g", { class: "badge", transform: `translate(${p.x},${p.y - 15})` }, gN);
      el("circle", { r: 7.5 }, g);
      el("text", { "text-anchor": "middle", y: 3.5 }, g, i + 1);
    });
    renderContext(); renderOverview(); renderSearchResults();
    const cnt = $("#atlas-count");
    if (cnt) { const n = state.query ? matches().length : 0; cnt.textContent = !state.query ? "" : n ? `${n} match${n > 1 ? "es" : ""}` : "No matches"; }
  }

  let stubCount = {};
  function arc(g, a, b, type, aId, bId) {
    // Far-apart links become short stubs pointing the way; the pane lists them in full.
    if (Math.abs(b.x - a.x) > 460) {
      const fromSel = layout.pos.get(state.selected) === a ? a : b, other = fromSel === a ? b : a;
      const dir = Math.sign(other.x - fromSel.x), len = 30;
      // fan stubs out above and below the node so their labels never stack
      const k = (stubCount[dir] = (stubCount[dir] || 0) + 1), off = (k % 2 ? -1 : 1) * (14 + Math.floor((k - 1) / 2) * 15);
      const ex = fromSel.x + dir * len, ey = fromSel.y + off;
      el("path", { d: `M${fromSel.x},${fromSel.y} L${ex},${ey}`, class: "arc stub" + (type === "parallel" ? " parallel" : "") }, g);
      el("path", { d: `M${ex - dir * 5},${ey - 4} L${ex},${ey} L${ex - dir * 5},${ey + 4}`, class: "arc stub" }, g);
      const o = byId.get(fromSel === a ? bId : aId);
      if (o) el("text", { x: ex + dir * 5, y: ey + 4, "text-anchor": dir > 0 ? "start" : "end", class: "stub-label" }, g, `${o.label}, ${o.date_sort.slice(0, 4)}`);
      return;
    }
    const mx = (a.x + b.x) / 2;
    const lift = Math.min(70, Math.abs(b.x - a.x) * 0.22) + 12;
    const my = Math.min(a.y, b.y) - lift;
    el("path", { d: `M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`, class: "arc" + (type === "parallel" ? " parallel" : "") }, g);
    const ang = Math.atan2(b.y - my, b.x - mx), r = 8;
    el("path", { d: `M${b.x - 6 * Math.cos(ang)},${b.y - 6 * Math.sin(ang)} l${-r * Math.cos(ang - 0.42)},${-r * Math.sin(ang - 0.42)} m${r * Math.cos(ang - 0.42)},${r * Math.sin(ang - 0.42)} l${-r * Math.cos(ang + 0.42)},${-r * Math.sin(ang + 0.42)}`, class: "arc" }, g);
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
    const host = $(".search-results", mounts.map);
    if (!host) return;
    host.hidden = !state.query;
    if (!state.query) { host.innerHTML = ""; return; }
    const results = matches();
    host.innerHTML = `<p>${results.length ? `${results.length} matching event${results.length === 1 ? "" : "s"}. Select a title to read its card.` : "No matching events in this scope. Try a broader term or reset the view."}</p>${results.length ? `<ol>${results.map((e) => `<li><span class="num result-date">${esc(fmtDate(e))}</span><a href="#${esc(e.id)}" data-ev-card="${esc(e.id)}">${esc(e.title)}</a><span class="result-lane" style="color:${lc(e.lane)}">${esc(laneTitle(e.lane))}</span></li>`).join("")}</ol>` : ""}`;
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

  function updateChip() {
    const chip = $(".card-chip", mounts.map), host = $(".pane-host", mounts.map);
    if (!chip || !host) return;
    const e = state.selected && byId.get(state.selected);
    const r = host.getBoundingClientRect(), mr = $(".map", mounts.map).getBoundingClientRect();
    chip.hidden = !e || r.top < innerHeight - 80 || mr.bottom < 0;
    if (e) chip.textContent = `Read the card: ${e.label} ↓`;
  }
  function scrollMapTo(id, smooth = true) {
    const p = layout && layout.pos.get(id);
    if (!p) return;
    const sc = mapScroll;
    if (p.x < sc.scrollLeft + 60 || p.x > sc.scrollLeft + sc.clientWidth - 200) sc.scrollTo({ left: p.x - sc.clientWidth * 0.4, behavior: smooth ? SMOOTH : "auto" });
  }

  /* ---------- tooltip ---------- */
  function showTip(ev, html) { tip.innerHTML = html; tip.hidden = false; moveTip(ev); }
  function moveTip(ev) { tip.style.left = Math.min(ev.clientX + 14, innerWidth - 300) + "px"; tip.style.top = ev.clientY + 14 + "px"; }
  function hideTip() { tip.hidden = true; }

  /* ---------- reading pane ---------- */
  function renderPane() {
    const pane = $(".pane-host", mounts.map);
    if (!pane) return;
    const e = state.selected && byId.get(state.selected);
    const sr = $(".sr-only", mounts.map); if (sr) sr.textContent = e ? `${e.title}, ${fmtDate(e)}` : "";
    updateChip();
    if (!e) {
      const anchors = D.events.filter((x) => x.importance === 3);
      const pick = ["safety-2017-deep-rl-human-prefs", "safety-2023-ai-control", "lm-2017-transformer"].filter((i) => byId.has(i));
      pane.innerHTML = `<div class="pane-empty"><p>Select any event on the map to read it here: the problem it faced, the idea, what changed afterwards, and what it left unsolved.</p><p>${anchors.length} anchor events are labelled. Some places to start: ${pick.map((i) => `<a href="#${i}" data-ev="${i}">${esc(byId.get(i).title)}</a>`).join(", ")}.</p><div class="start-routes"><span class="eyebrow">Start with a question</span>${["thread-human-feedback", "thread-interpretability", "thread-rl-agents"].map((id) => D.threads.find((t) => t.id === id)).filter(Boolean).map((t) => `<button type="button" class="text-button" data-route="${esc(t.id)}">${esc(t.question || t.title)} →</button>`).join("")}</div></div>`;
      return;
    }
    const conns = [
      ...(e.links || []).map((l) => ({ id: l.to, rel: REL[l.type], note: l.note })),
      ...(incoming.get(e.id) || []).map((l) => ({ id: l.from, rel: REL_IN[l.type], note: l.note })),
    ].filter((c) => byId.has(c.id)).reduce((acc, c) => {
      const prev = acc.find((x) => x.id === c.id);
      if (!prev) acc.push({ ...c });
      else { if (!prev.rel.includes(c.rel)) prev.rel += " · " + c.rel.toLowerCase(); if (!prev.note) prev.note = c.note; }
      return acc;
    }, []).sort((a, b) => byId.get(a.id).date_sort.localeCompare(byId.get(b.id).date_sort));
    const dg = window.DIAGRAMS && window.DIAGRAMS.forEvent(e);
    const answer = (key, title, html, cls = "") => `<div class="reveal ${cls}">${state.quiz ? `<button type="button" class="reveal-button" aria-expanded="false" aria-controls="answer-${esc(e.id)}-${key}" data-reveal="answer-${esc(e.id)}-${key}">Show ${esc(title.toLowerCase())}</button>` : `<div class="eyebrow">${esc(title)}</div>`}<div class="answer-content" id="answer-${esc(e.id)}-${key}"${state.quiz ? " hidden" : ""}>${html}</div></div>`;
    const block = (cls, h, t) => !t ? "" : cls.includes("reveal") ? answer(h.toLowerCase().replace(/[^a-z]+/g, "-"), h, `<p>${esc(t)}</p>`, cls) : `<div><div class="eyebrow">${h}</div><p>${esc(t)}</p></div>`;
    const routes = D.threads.filter((t) => t.event_ids.includes(e.id));
    pane.innerHTML = `<article class="pane${state.quiz ? " quiz" : ""}">
      <div class="head">
        <div class="meta eyebrow"><span class="dot" style="background:${lc(e.lane)}"></span>${esc(laneTitle(e.lane))} · <span class="num">${esc(fmtDate(e))}</span>${e.kind ? " · " + esc(e.kind) : ""}</div>
        <h3 tabindex="-1">${esc(e.title)}</h3>
        ${e.date_context || e.date_basis ? `<p class="date-context">${esc(e.date_context || `Date basis: ${e.date_basis}.`)}</p>` : ""}
        ${(e.people || []).length || (e.orgs || []).length ? `<div class="people">${esc((e.people || []).join(", "))}${(e.people || []).length && (e.orgs || []).length ? " · " : ""}${(e.orgs || []).map(orgLink).join(", ")}</div>` : ""}
      </div>
      <div class="qa">
        ${block("", "The problem", e.problem)}
        ${block("reveal", "The idea", e.idea)}
        ${block("reveal", "What changed", e.changed)}
        ${block("reveal limits", "What it did not solve", e.limits)}
        ${(e.terms || []).length ? `<div><div class="eyebrow">Terms</div><dl class="terms">${e.terms.map((t) => `<dt>${esc(t.term)}</dt><dd>${esc(t.def)}</dd>`).join("")}</dl></div>` : ""}
      </div>
      <div class="side">
        ${dg ? answer("diagram", "Diagram", `<figure class="diagram">${dg.svg}<figcaption>${esc(dg.caption)}</figcaption></figure>`, "diagram-answer") : ""}
        ${conns.length ? `<div><div class="eyebrow">Connections</div><ul class="conn">${conns.map((c) => { const o = byId.get(c.id); return `<li><span class="rel">${esc(c.rel)}</span><span><a href="#${esc(c.id)}" data-ev="${esc(c.id)}">${esc(o.title)}</a> <span class="num" style="color:var(--muted)">${o.date_sort.slice(0, 4)}</span>${c.note ? `<span class="why">${esc(c.note)}</span>` : ""}</span></li>`; }).join("")}</ul></div>` : ""}
        ${(e.sources || []).length ? `<div class="reads"><div class="eyebrow">Read next</div>${e.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label || s.url)}</a>`).join("")}</div>` : ""}
        ${routes.length ? `<div class="reads"><div class="eyebrow">On the routes</div>${routes.map((t) => `<a href="#" data-route="${esc(t.id)}">${esc(t.question || t.title)}</a>`).join("")}</div>` : ""}
      </div>
      <div class="foot"><span><button type="button" class="text-button" data-nav="-1">← Earlier</button> &nbsp; <button type="button" class="text-button" data-nav="1">Later →</button></span><button type="button" class="text-button" data-act="locate">Back to selected event ↑</button><span class="verify">${e.verified && e.verified.date ? "" : "This date is not yet confirmed against a primary source."}</span></div>
    </article>`;
  }
  function orgLink(name) {
    const o = D.orgs.find((x) => orgMatches({ id: "", orgs: [name] }, x));
    return o ? `<a href="#" data-org="${esc(o.id)}">${esc(name)}</a>` : esc(name);
  }

  function snapshot() {
    return { selected: state.selected, route: state.route && state.route.id, org: state.org && state.org.id,
      query: state.query, queryInput: state.queryInput, minImp: state.minImp, zoom: state.zoom, lanes: [...state.lanes], scrollLeft: mapScroll ? mapScroll.scrollLeft : 0 };
  }
  function saveHistory(replace = false, preserveUrl = false) {
    const url = preserveUrl ? location.href : `${location.pathname}${location.search}${state.selected ? "#" + state.selected : "#the-map"}`;
    history[replace ? "replaceState" : "pushState"]({ ...(history.state || {}), atlas: snapshot() }, "", url);
  }
  function select(id, opts = {}) {
    if (!byId.has(id)) return;
    const previous = state.selected;
    if (opts.history !== false) saveHistory(true, true);
    state.selected = id; state.focus = id;
    const e = byId.get(id);
    if (state.route && !state.route.event_ids.includes(id)) state.route = null;
    if (state.org && !orgMatches(e, state.org)) state.org = null;
    if (state.query && !textMatches(e, state.query)) { state.query = ""; state.queryInput = ""; }
    state.lanes.add(e.lane);
    if (!state.query && !state.route && !state.org && (e.importance || 2) < state.minImp) state.minImp = e.importance || 2;
    const hadFocus = mapSvg && mapSvg.contains(document.activeElement);
    syncControls(); renderMap(); renderPane();
    scrollMapTo(id, false); updateOverview();
    if (hadFocus || opts.focus) { const n = mapSvg.querySelector(".node.sel"); if (n) n.focus({ preventScroll: true }); }
    if (opts.history !== false) saveHistory(previous === id);
    if (opts.card) { $(".pane-host", mounts.map).scrollIntoView({ behavior: SMOOTH, block: "start" }); const h = $(".pane h3", mounts.map); if (h) h.focus({ preventScroll: true }); }
    else if (opts.reveal) mounts.map.scrollIntoView({ behavior: SMOOTH, block: "start" });
  }
  function step(dir, fromId = state.selected || state.focus, opts = { focus: true }) {
    const seq = state.route ? state.route.event_ids.filter((id) => layout.pos.has(id) && lit(byId.get(id))) : matches().map((e) => e.id);
    if (!seq.length) return;
    const index = seq.indexOf(fromId);
    const next = index < 0 ? (dir > 0 ? 0 : seq.length - 1) : index + dir;
    if (next >= 0 && next < seq.length) select(seq[next], opts);
  }
  function reconcileSelection() {
    if (state.selected && !matches().some((e) => e.id === state.selected)) { state.selected = null; state.focus = null; }
  }
  function resetView() {
    state.selected = null; state.focus = null; state.route = null; state.org = null; state.query = ""; state.queryInput = "";
    state.minImp = 2; state.zoom = 1; state.lanes = new Set(D.lanes.map((l) => l.id));
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
    $("#atlas-search").addEventListener("input", (ev) => { state.queryInput = ev.target.value; state.query = state.queryInput.trim(); reconcileSelection(); syncControls(); renderMap(); renderPane(); saveHistory(true); });
    $("#atlas-detail").addEventListener("change", (ev) => { state.minImp = Number(ev.target.value); reconcileSelection(); renderMap(); renderPane(); saveHistory(true); });
    $("#atlas-quiz").addEventListener("click", (ev) => { state.quiz = !state.quiz; ev.currentTarget.setAttribute("aria-pressed", state.quiz); renderPane(); });
  }
  function syncControls() {
    const s = $("#atlas-detail"); if (s) { const scoped = Boolean(state.query || state.route || state.org); s.value = scoped ? "1" : String(state.minImp); s.disabled = scoped; s.title = scoped ? "Search, routes and organisations include every event in scope." : ""; }
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
    m.innerHTML = `<div class="controls"></div><div class="context"></div><div class="search-results" hidden></div>
      <div class="navigator"><div class="overview-heading"><span class="eyebrow">Whole history · linear time scale</span><span class="window-years num"></span></div><svg class="overview" viewBox="0 0 1000 52" preserveAspectRatio="none" role="img" aria-label="Whole timeline and current map window"></svg><div class="overview-axis" aria-hidden="true">${[1960, 1980, 2000, 2020].filter((y) => y >= Y0).map((y) => `<span style="left:${1.2 + (y - Y0) / (2027.1 - Y0) * 97.6}%">${y}</span>`).join("")}</div><div class="overview-range"><label for="atlas-year">Jump to year</label><input id="atlas-year" type="range" min="${Math.ceil(Y0)}" max="2026" step="1" value="2017"><span aria-hidden="true">← →</span></div></div>
      <div class="map"><div class="map-labels"></div><div class="map-scroll" tabindex="0" aria-label="Timeline, scroll sideways"><svg role="group" aria-label="Timeline of AI in four lanes. Use the left and right arrow keys to move between events."></svg></div></div>
      <div class="map-note"><span>Dot size marks importance; hollow dots are details. Drag or scroll sideways. ← → step through time.</span><span>Top band: estimated training compute (log scale). Dots are a curated selection; ${D.compute && D.compute.frontier_points ? "the line is the running maximum of documented estimates in the pinned dataset" : "a complete dataset envelope is unavailable; dots show the curated subset only"}. The time axis widens at 1990, 2010 and 2017 (marked //), so slopes are only comparable within a stretch. ${D.compute ? `<a href="${esc(D.compute.source_url || "https://epoch.ai/data/ai-models")}" target="_blank" rel="noopener">Epoch AI</a>, CC-BY.` : ""}</span></div>
      <div class="compute-legend"><span><i class="confident"></i> Confident</span><span><i class="likely"></i> Likely</span><span><i class="speculative"></i> Speculative</span><span>Epoch row confidence; estimates are not error bars.</span></div>${computeDisclosure()}<div class="pane-host"></div><div class="tip" hidden></div><div class="sr-only" aria-live="polite"></div><button type="button" class="card-chip" hidden></button>`;
    $(".card-chip", m).addEventListener("click", () => $(".pane-host", m).scrollIntoView({ behavior: SMOOTH, block: "start" }));
    let chipRaf = 0; addEventListener("scroll", () => { if (!chipRaf) chipRaf = requestAnimationFrame(() => { chipRaf = 0; updateChip(); }); }, { passive: true });
    mapSvg = $(".map svg", m); overview = $(".overview", m); mapScroll = $(".map-scroll", m); labelsCol = $(".map-labels", m); tip = $(".tip", m);
    renderControls();
    overview.addEventListener("pointerdown", (ev) => { if (ev.button !== 0) return; const r = overview.getBoundingClientRect(); jumpYear(Y0 + Math.max(0, Math.min(1, (ev.clientX - r.left - r.width * .012) / (r.width * .976))) * (2027.1 - Y0)); });
    $("#atlas-year").addEventListener("input", (ev) => jumpYear(Number(ev.target.value)));
    mapScroll.addEventListener("scroll", updateOverview, { passive: true });
    addEventListener("resize", () => { updateOverview(); updateChip(); });
    // drag to pan
    let drag = null;
    mapScroll.addEventListener("pointerdown", (ev) => { if (ev.target.closest(".node") || ev.pointerType !== "mouse") return; drag = { x: ev.clientX, s: mapScroll.scrollLeft, moved: false }; });
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
    const A = 1995, NOW = 2026.85, NAME = 148, W = Math.max(760, Math.min(1180, m.clientWidth || 900)), BAR = 15, GAP = 4;
    const px = (y) => NAME + ((Math.max(A, Math.min(NOW, y)) - A) / (NOW - A)) * (W - NAME - 46);
    const span = (a) => { const f = yearOfStr(a.from || A); let t = a.to ? yearOfStr(a.to) : NOW; if (a.to && /^\d{4}\??$/.test(String(a.to))) t += 1; if (!isFinite(t)) t = NOW; return [isFinite(f) ? f : A, Math.max(t, f + 0.25)]; };
    const people = D.people.map((p) => {
      const roles = (p.affiliations || []).map((a) => ({ ...a, s: span(a) })).sort((a, b) => a.s[0] - b.s[0]);
      const ends = [];
      roles.forEach((r) => { let k = ends.findIndex((e) => e <= r.s[0] + 0.01); if (k < 0) { k = ends.length; ends.push(0); } ends[k] = r.s[1]; r.track = k; });
      return { ...p, roles, tracks: Math.max(1, ends.length), first: roles.length ? roles[0].s[0] : 2100 };
    }).sort((a, b) => a.first - b.first);
    let y = 30; const rows = people.map((p) => { const top = y; y += p.tracks * (BAR + GAP) + 9; return top; });
    const H = y + 4;
    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Where ${people.length} researchers worked, 1995 to 2026">`;
    for (let yr = 2000; yr <= 2025; yr += 5) svg += `<line x1="${px(yr)}" x2="${px(yr)}" y1="20" y2="${H}" class="gl"/><text x="${px(yr)}" y="13" text-anchor="middle" class="yr">${yr}</text>`;
    svg += `<line x1="${px(NOW)}" x2="${px(NOW)}" y1="20" y2="${H}" class="now"/><text x="${px(NOW)}" y="13" text-anchor="middle" class="yr">now</text>`;
    people.forEach((p, i) => {
      const top = rows[i], h = p.tracks * (BAR + GAP) - GAP;
      if (i) svg += `<line x1="0" x2="${W}" y1="${top - 5}" y2="${top - 5}" class="sep"/>`;
      svg += `<text x="0" y="${top + 11.5}" class="nm">${esc(p.name)}${p.known_for ? `<title>${esc(p.known_for)}</title>` : ""}</text>`;
      const byTrack = {};
      p.roles.forEach((r) => (byTrack[r.track] = byTrack[r.track] || []).push(r));
      p.roles.forEach((r) => {
        const x1 = px(r.s[0]), x2 = px(r.s[1]), by = top + r.track * (BAR + GAP), tone = toneFor(r.org);
        const open = !r.to, name = r.org.replace(/\s*\(.*?\)\s*/g, " ").trim();
        svg += `<g class="role${r.uncertain ? " unsure" : ""}"><rect x="${x1}" y="${by}" width="${Math.max(3, x2 - x1 - 1.5)}" height="${BAR}" rx="2.5" style="fill:var(--${tone});stroke:var(--${tone})"/>`;
        if (open) svg += `<path d="M${x2 - 1.5},${by} l5,${BAR / 2} l-5,${BAR / 2}" style="fill:var(--${tone})" class="tip-arrow"/>`;
        svg += `<title>${esc(r.org)}: ${esc(r.from || "?")}–${esc(r.to || "present")}${r.uncertain ? " (dates uncertain)" : ""}</title></g>`;
        const next = (byTrack[r.track] || []).find((o) => o.s[0] >= r.s[1] - 0.01);
        const room = (next ? px(next.s[0]) : W) - x2, w = name.length * 5.9 + 10;
        if (x2 - x1 > w) svg += `<text x="${x1 + 5}" y="${by + 11}" class="lb">${esc(name)}</text>`;
        else if (room > w && !open) svg += `<text x="${x2 + 4}" y="${by + 11}" class="lb out">${esc(name)}</text>`;
        else { const prev = (byTrack[r.track] || []).filter((o) => o.s[1] <= r.s[0] + 0.01).pop(); if (x1 - (prev ? px(prev.s[1]) : NAME + 70) > w) svg += `<text x="${x1 - 4}" y="${by + 11}" text-anchor="end" class="lb out">${esc(name)}</text>`; }
      });
    });
    svg += `</svg>`;
    const kinds = [["lm", "Lab"], ["rl", "Nonprofit research"], ["gov", "Academic"], ["safety", "Government"], ["grey", "Other"]];
    const orgYear = (o) => String(o.founded || o.activity_since || "");
    const orgs = D.orgs.slice().sort((a, b) => (orgYear(a) || "9999").localeCompare(orgYear(b) || "9999"));
    m.innerHTML = `${people.length ? `<div class="people-chart">${svg}</div><div class="legend">${kinds.map(([t, n]) => `<span><i style="background:color-mix(in srgb, var(--${t}) 17%, transparent);border-color:color-mix(in srgb, var(--${t}) 60%, transparent)"></i>${n}</span>`).join("")}<span>An arrow means the role continues; a dashed outline marks uncertain dates. Hover a bar for details.</span></div>` : ""}
      ${people.length ? `<details class="people-text"><summary>Researcher roles and related events, in text</summary>${people.map((p) => `<section><h3>${esc(p.name)}</h3>${p.known_for ? `<p>${esc(p.known_for)}</p>` : ""}<ul>${p.roles.map((r) => `<li>${orgLink(r.org)}: ${esc(r.from || "start unknown")}–${esc(r.to || "present")}${r.uncertain ? " (dates uncertain)" : ""}</li>`).join("")}</ul>${(p.key_event_ids || []).filter((id) => byId.has(id)).map((id) => `<a href="#${esc(id)}" data-ev-card="${esc(id)}">${esc(byId.get(id).title)}</a>`).join(" · ")}</section>`).join("")}</details>` : ""}
      <div class="org-search"><label for="atlas-org-search">Find an organisation</label><input id="atlas-org-search" type="search" placeholder="Name, founder or research area"><span id="atlas-org-count" aria-live="polite">${orgs.length} organisations</span></div><div class="orgs">${orgs.map((o) => `<div class="org" data-org-name="${esc([o.name, ...(o.aliases || []), ...(o.founders || []), o.historical_role, o.kind].join(" ").toLowerCase())}"><span class="yr">${esc(orgYear(o).slice(0, 4) || "—")}${!o.founded && o.activity_since ? "<small>activity</small>" : ""}</span><div class="nm">${esc(o.name)}<span class="kind">${esc(o.kind || "")}${(o.founders || []).length ? " · " + esc(o.founders.slice(0, 4).join(", ")) : ""}</span></div><div>${o.founded_context ? `<p class="date-context">${esc(o.founded_context)}. Founding date not established here.</p>` : ""}<p>${esc(o.historical_role || "")}</p>${o.status_as_of_2026_11 ? `<p class="now">As of November 2026: ${esc(o.status_as_of_2026_11)}</p>` : ""}<div class="acts">${(o.key_event_ids || []).length ? `<a href="#" data-org="${esc(o.id)}">Show its work on the map ↑</a>` : ""}${(o.sources || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label || "Source")}</a>`).join("")}</div></div></div>`).join("")}</div>`;
    $("#atlas-org-search", m).addEventListener("input", (ev) => {
      const words = ev.target.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let count = 0;
      m.querySelectorAll("[data-org-name]").forEach((n) => { n.hidden = !words.every((w) => n.dataset.orgName.includes(w)); if (!n.hidden) count++; });
      $("#atlas-org-count", m).textContent = `${count} organisation${count === 1 ? "" : "s"}`;
    });
  }

  /* ---------- index by era & glossary ---------- */
  function renderIndex() {
    const m = mounts.index;
    if (!m) return;
    const evs = D.events;
    m.innerHTML = D.eras.map((era, i) => {
      const [a, b] = eraRange(i);
      const list = evs.filter((e) => { const y = yearOf(e); return y >= a && y < b; });
      if (!list.length) return "";
      return `<details><summary>${esc(era.title)}<span class="eyebrow num">${String(era.start).slice(0, 4)}–${String(era.end).slice(0, 4)} · ${list.length} events</span></summary>
        <p>${esc(era.summary || "")}</p>
        <ul class="idx">${list.map((e) => `<li><span class="d">${esc(fmtDate(e))}</span><span class="dot" style="background:${lc(e.lane)}"></span><span><a href="#${esc(e.id)}" data-ev-reveal="${esc(e.id)}">${esc(e.title)}</a> <span class="s">${esc(e.idea || "")}</span></span></li>`).join("")}</ul></details>`;
    }).join("");
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
    const t = ev.target.closest("[data-ev],[data-ev-reveal],[data-ev-card],[data-org],[data-route],[data-route-show],[data-lane],[data-nav],[data-zoom],[data-act],[data-reveal]");
    if (!t || !t.closest(".atlas")) return;
    if (t.tagName === "A" && (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || t.target === "_blank")) return;
    if (t.tagName === "A") ev.preventDefault();
    const d = t.dataset;
    if (d.ev) select(d.ev, { card: true });
    else if (d.evReveal) select(d.evReveal, { card: true });
    else if (d.evCard) select(d.evCard, { card: true });
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
      saveHistory(true, true); state.route = route; state.org = null; state.query = ""; state.queryInput = ""; state.selected = null; state.focus = route.event_ids[0];
      route.event_ids.forEach((id) => { const e = byId.get(id); if (e) state.lanes.add(e.lane); });
      syncControls(); renderMap(); renderPane(); scrollMapTo(route.event_ids[0], false); updateOverview(); saveHistory();
      mounts.map.scrollIntoView({ behavior: SMOOTH, block: "start" });
      const firstNode = mapSvg.querySelector('.node[tabindex="0"]'); if (firstNode) firstNode.focus({ preventScroll: true });
    } else if (d.org) {
      const org = D.orgs.find((x) => x.id === d.org); if (!org) return;
      saveHistory(true, true); state.org = org; state.route = null; state.query = ""; state.queryInput = ""; state.selected = null;
      D.events.filter((e) => orgMatches(e, org)).forEach((e) => state.lanes.add(e.lane));
      syncControls(); renderMap(); renderPane(); const first = matches()[0]; if (first) scrollMapTo(first.id, false); updateOverview(); saveHistory();
      mounts.map.scrollIntoView({ behavior: SMOOTH, block: "start" });
    } else if (d.act === "clear") resetView();
    else if (d.act === "locate") {
      scrollMapTo(state.selected, false); updateOverview();
      mounts.map.scrollIntoView({ behavior: SMOOTH, block: "start" });
      const node = mapSvg.querySelector(".node.sel"); if (node) node.focus({ preventScroll: true });
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (!mapScroll || !mapScroll.contains(ev.target) || /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
    const node = ev.target.closest(".node"), from = node ? node.dataset.eventId : state.selected || state.focus;
    if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") { ev.preventDefault(); step(ev.key === "ArrowRight" ? 1 : -1, from); }
    if (ev.key === "Home" || ev.key === "End") { const seq = matches(); if (seq.length) { ev.preventDefault(); select(seq[ev.key === "Home" ? 0 : seq.length - 1].id, { focus: true }); } }
    if (ev.key === "Escape") { state.selected = null; renderMap(); renderPane(); saveHistory(); const n = mapSvg.querySelector('.node[tabindex="0"]'); if (n) n.focus({ preventScroll: true }); }
  });

  mountMap(); renderRoutes(); renderPeople(); renderIndex(); renderGlossary();
  function fromHash() {
    let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
    if (byId.has(id) && id !== state.selected) select(id, { history: false });
  }
  addEventListener("popstate", (ev) => {
    const saved = ev.state && ev.state.atlas;
    if (!saved) { fromHash(); return; }
    state.selected = byId.has(saved.selected) ? saved.selected : null; state.focus = state.selected;
    state.route = D.threads.find((t) => t.id === saved.route) || null; state.org = D.orgs.find((o) => o.id === saved.org) || null;
    state.query = saved.query || ""; state.queryInput = saved.queryInput == null ? state.query : saved.queryInput; state.minImp = saved.minImp || 2; state.zoom = saved.zoom || 1;
    state.lanes = new Set(saved.lanes || D.lanes.map((l) => l.id));
    syncControls(); renderMap(); renderPane(); mapScroll.scrollLeft = saved.scrollLeft || 0; updateOverview();
  });
  addEventListener("hashchange", fromHash);
  fromHash(); saveHistory(true, true);
})();
