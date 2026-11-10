/* Paths to Alignment — renders into mount points: <div class="atlas" data-atlas="map|routes|people|index">.
   Data: window.TIMELINE_DATA (build_data.py). Diagrams: window.DIAGRAMS (diagrams.js). Formulas: MathJax 3 from jsDelivr, loaded by the page; without it they show as plain text. */
(function () {
  "use strict";
  const D = window.TIMELINE_DATA || {};
  D.events = D.events || []; D.lanes = D.lanes || []; D.threads = D.threads || [];
  D.eras = D.eras || []; D.orgs = D.orgs || []; D.people = D.people || [];
  const NS = "http://www.w3.org/2000/svg";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* ---------- math ----------
     Card text and captions write formulas as TeX between \( and \); diagrams carry <g class="tex-slot"> placeholders.
     MathJax (loaded by the page) typesets both as SVG. Until it is ready, or if it never loads, readable plain text shows. */
  const mathReady = () => Boolean(window.MathJax && MathJax.tex2svg && MathJax.startup && MathJax.startup.document);
  const TEX_PLAIN = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", varepsilon: "ε", epsilon: "ε", theta: "θ", lambda: "λ", pi: "π", rho: "ρ", sigma: "σ", Phi: "Φ",
    nabla: "∇", leftarrow: "←", le: "≤", cdot: "·", mid: "|", succ: "≻", prime: "′", max: "max", min: "min", log: "log", ",": " ", " ": " ", "!": "" };
  const texPlain = (tex) => tex
    .replace(/\\(?:mathrm|text|mathbb|operatorname)\{([^{}]*)\}/g, "$1")
    .replace(/\\([A-Za-z]+|[,! ])/g, (m, w) => TEX_PLAIN[w] ?? w)
    .replace(/\^\{([^{}]*)\}|\^(\w)/g, (m, a, b) => "^" + (a || b)).replace(/_\{([^{}]*)\}|_(\w)/g, (m, a, b) => a || b)
    .replace(/'/g, "′").replace(/[{}]/g, "");
  function texInline(tex) {
    if (!mathReady()) return `<span class="tex-fallback">${esc(texPlain(tex))}</span>`;
    try { return MathJax.tex2svg(tex, { display: false }).outerHTML; } catch (err) { return `<span class="tex-fallback">${esc(texPlain(tex))}</span>`; }
  }
  // Escaped text with every \(…\) span typeset.
  const prose = (s) => String(s == null ? "" : s).split(/\\\((.+?)\\\)/s).map((part, i) => (i % 2 ? texInline(part) : esc(part))).join("");
  // First sentence of a paragraph, for route steps. A full stop ends a sentence only before a capital or digit,
  // and not after an initial, "et al." or a common abbreviation; TeX spans are never split.
  const NOT_END = /(?:\b[A-Z]|\bal|\be\.g|\bi\.e|\bvs|\bcf|\bNo|\bDr|\bSt|\bU\.S|\bInc|\bLtd|\bJr)\.$/;
  function firstSentence(s) {
    // A very short opener ("They set up a small game.") takes the next sentence with it.
    const t = String(s || ""); const re = /[.!?](?=\s+(?:["'“(]?[A-Z0-9]|\\\())/g; let m;
    while ((m = re.exec(t))) {
      const head = t.slice(0, m.index + 1);
      if ((head.match(/\\\(/g) || []).length !== (head.match(/\\\)/g) || []).length) continue;
      if (NOT_END.test(head) || head.length < 60) continue;
      return head;
    }
    return t;
  }
  // Text for search and plain contexts: TeX spans reduced to readable symbols.
  const plainText = (s) => String(s == null ? "" : s).replace(/\\\((.+?)\\\)/gs, (m, tex) => texPlain(tex));
  // Fill diagram placeholders. A slot's TeX is split into runs: words in \text{…} are drawn as SVG text in the
  // diagram's own font (measured with a canvas), the rest is typeset by MathJax. MathJax sizes its SVG in ex with
  // 1ex = 0.5em, so ex × 0.5 × font size gives diagram units.
  const TEX_GAPS = /\\ |\\quad|\\qquad|\\,/g, TEX_GAP_EM = { "\\ ": 0.27, "\\quad": 1, "\\qquad": 2, "\\,": 0.17 };
  const gapEm = (w) => (w.match(TEX_GAPS) || []).reduce((n, g) => n + TEX_GAP_EM[g], 0);
  // A relation at the edge of a math run that borders a word (\text{loss} = …) has no left/right atom once the
  // run is typeset alone, so TeX drops its spacing; an empty {} atom on that side restores it.
  const TEX_REL = String.raw`(?:=|<|>|\\le|\\ge|\\approx|\\succ|\\prec|\\gets|\\leftarrow|\\to|\\rightarrow)`;
  const relStart = new RegExp("^" + TEX_REL), relEnd = new RegExp(TEX_REL + "$");
  function texRuns(tex) {
    const runs = [], lead = /^(?:\s*(?:\\ |\\quad|\\qquad|\\,))+\s*/, trail = /(?:\s*(?:\\ |\\quad|\\qquad|\\,))+\s*$/;
    const addMath = (m) => {
      const a = m.match(lead); if (a) { runs.push({ gap: gapEm(a[0]) }); m = m.slice(a[0].length); }
      const b = m.match(trail), rest = b ? m.slice(0, b.index) : m;
      let math = rest.trim();
      if (relStart.test(math)) math = "{}" + math;
      if (relEnd.test(math)) math += "{}";
      if (math) runs.push({ math });
      if (b && rest.trim()) runs.push({ gap: gapEm(b[0]) });
    };
    let last = 0;
    for (const m of tex.matchAll(/\\text\{([^{}]*)\}/g)) { addMath(tex.slice(last, m.index)); runs.push({ text: m[1] }); last = m.index + m[0].length; }
    addMath(tex.slice(last));
    return runs;
  }
  const canvasCtx = document.createElement("canvas").getContext("2d");
  const textWidth = (s, size, family, weight) => { canvasCtx.font = `${weight || 400} ${size}px ${family}`; return canvasCtx.measureText(s).width; };
  function fillMath(root) {
    if (!root || !mathReady()) return;
    root.querySelectorAll("g.tex-slot:not(.typeset)").forEach((g) => {
      const size = Number(g.dataset.size) || 11, k = size * 0.5, weight = g.dataset.weight || "";
      const family = g.closest("svg[font-family]")?.getAttribute("font-family") || "sans-serif";
      let parts;
      try {
        parts = texRuns(g.dataset.tex).map((r) => {
          if (r.gap) return { w: r.gap * size };
          if (r.text != null) return { text: r.text, w: textWidth(r.text, size, family, weight) };
          const svg = MathJax.tex2svg(r.math, { display: false }).querySelector("svg");
          return { svg, w: parseFloat(svg.getAttribute("width")) * k, h: parseFloat(svg.getAttribute("height")) * k, depth: -parseFloat(svg.style.verticalAlign || "0") * k };
        });
      } catch (err) { return; }
      const total = parts.reduce((n, p) => n + p.w, 0), maxW = Number(g.dataset.max) || 440, f = total > maxW ? maxW / total : 1;
      const anchor = g.dataset.anchor || "middle", y = Number(g.dataset.y), fill = `var(--${g.dataset.tone || "ink-2"})`;
      let x = Number(g.dataset.x) - (anchor === "middle" ? total * f / 2 : anchor === "end" ? total * f : 0);
      const label = g.textContent.trim(), nodes = [];
      for (const p of parts) {
        if (p.text != null) {
          const tx = document.createElementNS(NS, "text");
          tx.setAttribute("x", x.toFixed(1)); tx.setAttribute("y", y); tx.setAttribute("font-size", (size * f).toFixed(2));
          if (weight) tx.setAttribute("font-weight", weight);
          tx.setAttribute("style", `fill:${fill};white-space:pre`); tx.textContent = p.text; nodes.push(tx);
        } else if (p.svg) {
          const w = p.w * f, h = p.h * f, svg = p.svg;
          svg.setAttribute("x", x.toFixed(1)); svg.setAttribute("y", (y - h + p.depth * f).toFixed(1));
          svg.setAttribute("width", w.toFixed(1)); svg.setAttribute("height", h.toFixed(1));
          svg.setAttribute("style", `width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;min-width:0;max-width:none;display:inline;overflow:visible;color:${fill}`);
          svg.removeAttribute("role"); svg.removeAttribute("focusable"); nodes.push(svg);
        }
        x += p.w * f;
      }
      g.replaceChildren(...nodes); g.classList.add("typeset");
      g.setAttribute("role", "img"); g.setAttribute("aria-label", label);
      nodes.forEach((n) => n.setAttribute("aria-hidden", "true"));
    });
  }

  const lc = (l) => `var(--${l})`;
  const REL = { builds_on: "Builds on", responds_to: "Responds to", enables: "Enables", tests: "Tests", critiques: "Critiques", parallel: "Compare with" };
  const REL_IN = { builds_on: "Built on by", responds_to: "Answered by", enables: "Enabled by", tests: "Tested by", critiques: "Critiqued by", parallel: "Compare with" };
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // The map places events in exactly three importance bands; anything else in the data falls back to the middle band.
  D.events.forEach((e) => { const n = Math.round(Number(e.importance)); e.importance = n >= 1 && n <= 3 ? n : 2; });
  const byId = new Map(D.events.map((e) => [e.id, e]));
  const personId = (p) => p.id || p.name.toLowerCase().replace(/\u0142/g, "l").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const personById = new Map(D.people.map((p) => [personId(p), p]));
  D.events.forEach((e) => (e.people || []).forEach((name) => { const id = personId({ name }); if (!personById.has(id)) personById.set(id, { name, key_event_ids: D.events.filter((event) => (event.people || []).includes(name)).map((event) => event.id) }); }));
  const orgById = new Map(D.orgs.map((o) => [o.id, o]));
  // "Safe Superintelligence (co-founder)" and "Safe Superintelligence" are one organisation; the role stays in the text.
  const baseName = (s) => String(s).replace(/\s*\([^)]*\)\s*$/, "").trim();
  // "Independent" in a career is a gap between organisations, not an organisation with a profile.
  const notOrg = (name) => /^independent$/i.test(baseName(name));
  [...new Set([...D.events.flatMap((e) => e.orgs || []), ...D.people.flatMap((p) => (p.affiliations || []).map((a) => a.org))].map(baseName))].forEach((name) => {
    if (notOrg(name)) return;
    if (!D.orgs.some((o) => orgMatches({ id: "", orgs: [name] }, o))) {
      const id = `unlisted-${personId({ name })}`;
      orgById.set(id, { id, name, key_event_ids: D.events.filter((e) => (e.orgs || []).some((o) => baseName(o) === name)).map((e) => e.id), affiliations: D.people.flatMap((p) => (p.affiliations || []).filter((a) => baseName(a.org) === name).map((a) => ({ ...a, person: p.name }))) });
    }
  });
  // The organisation profile an affiliation or card name opens: a curated record when one fits, else the generated stub.
  const orgKeyFor = (name) => { if (notOrg(name)) return null; const o = orgForName(name) || [...orgById.values()].find((x) => x.name === baseName(name)); return o ? `org:${o.id}` : null; };
  // Curated organisations list the people whose affiliation bars open them, so the profile and the chart agree.
  D.orgs.forEach((o) => { o.affiliations = D.people.flatMap((p) => (p.affiliations || []).filter((a) => orgKeyFor(a.org) === `org:${o.id}`).map((a) => ({ ...a, person: p.name }))); });
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

  const state = { tab: "map", selected: null, connection: null, route: null, org: null, query: "", queryInput: "", zoom: 1, lanes: new Set(D.lanes.map((l) => l.id)), focus: null, era: null, profile: null, profileDock: "people", affiliationIndex: null, routeShown: (D.threads[0] || {}).id };
  let connectionHover = null, connectionFocus = null, connectionTrigger = null;
  const mounts = {};
  document.querySelectorAll("[data-atlas]").forEach((m) => { m.classList.add("atlas"); mounts[m.dataset.atlas] = m; });

  let preservedMapScroll = 0;
  const tabIds = { map: "the-map", routes: "reading-routes", people: "institutions-and-people" };
  function setPanel(name) {
    if (!tabIds[name]) return;
    if (state.tab === "map" && mapScroll) preservedMapScroll = mapScroll.scrollLeft;
    const shown = state.tab === name; state.tab = name;
    document.querySelectorAll("[data-atlas-panel]").forEach(p => { p.hidden = p.dataset.atlasPanel !== name; });
    document.querySelectorAll("[data-atlas-tab]").forEach(b => {
      const active = b.dataset.atlasTab === name;
      b.setAttribute("aria-selected", String(active)); b.tabIndex = active ? 0 : -1;
    });
    hideTip();
    // The chart is measured while visible; once it is on screen, profile changes update it in place.
    if (name === "people" && profilePanel) { if (String(mounts.people.clientWidth) !== mounts.people.dataset.width) renderPeople(); else renderProfile(); }
    if (name === "map" && layout) { mapScroll.scrollLeft = preservedMapScroll; updateOverview(); updateDiagramHints(); }
    updateWorkspaceSticky();
  }
  function choosePanel(name, replace = false) {
    saveHistory(true, true); setPanel(name); saveHistory(replace);
    document.getElementById(`tab-${name}`)?.focus({preventScroll:true});
    // A switch shows the new panel from its top; the old tab's scroll position means nothing here.
    const panel = document.getElementById(tabIds[name]);
    if (panel && panel.getBoundingClientRect().top < workspaceInset()) scrollTo({ top: scrollY + panel.getBoundingClientRect().top - workspaceInset(), behavior: "auto" });
  }
  document.querySelectorAll("[data-atlas-tab]").forEach(button => {
    button.addEventListener("click", () => choosePanel(button.dataset.atlasTab));
    button.addEventListener("keydown", ev => {
      const keys = Object.keys(tabIds), i = keys.indexOf(button.dataset.atlasTab);
      const next = ev.key === "Home" ? 0 : ev.key === "End" ? keys.length - 1 : ev.key === "ArrowRight" ? (i + 1) % keys.length : ev.key === "ArrowLeft" ? (i + keys.length - 1) % keys.length : null;
      if (next !== null) { ev.preventDefault(); choosePanel(keys[next], true); }
    });
  });

  /* ---------- helpers ---------- */
  const yearOf = (e) => { const [y, m, d] = e.date_sort.split("-").map(Number); return y + (m - 1) / 12 + (d - 1) / 365; };
  const yearOfStr = (s) => { const m = String(s).match(/(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/); if (!m) return NaN; return +m[1] + ((+m[2] || 1) - 1) / 12 + ((+m[3] || 1) - 1) / 365; };
  // Role dates are stored as 2017, 2023-11 or 2026-09-09; profiles show years or "Nov 2023".
  const roleDate = (v) => { const m = /^(\d{4})(?:-(\d{2}))?/.exec(String(v || "")); return !v ? "" : !m ? String(v) : m[2] ? `${MON[+m[2] - 1]} ${m[1]}` : m[1]; };
  function fmtDate(e) {
    const [y, m, d] = e.date_sort.split("-").map(Number);
    if (e.date_precision === "year") return String(y);
    if (e.date_precision === "month") return `${MON[m - 1]} ${y}`;
    return `${d} ${MON[m - 1]} ${y}`;
  }
  const laneTitle = (l) => { const lane = laneById.get(l); return lane ? lane.short || lane.title : l; };
  // How well an organisation name written on a card fits a record: 2 exact, 1 whole words inside it, 0 no match.
  // Whole-word matching keeps short aliases such as "ARC" out of words like "Research".
  // The pattern cache lives on the function: orgMatches runs during start-up, before later consts exist.
  function orgNameFit(text, org) {
    const s = text.toLowerCase(), names = [org.name, ...(org.aliases || [])].map((n) => n.toLowerCase());
    if (names.includes(s)) return 2;
    const cache = orgNameFit.cache || (orgNameFit.cache = new Map());
    if (!cache.has(org)) cache.set(org, names.map((n) => new RegExp(`(?<![a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`)));
    return cache.get(org).some((re) => re.test(s)) ? 1 : 0;
  }
  function orgForName(text) { return D.orgs.find((o) => orgNameFit(text, o) === 2) || D.orgs.find((o) => orgNameFit(text, o) === 1); }
  function orgMatches(e, org) {
    if (!org) return true;
    if ((org.key_event_ids || []).includes(e.id)) return true;
    return (e.orgs || []).some((o) => orgNameFit(o, org) > 0);
  }
  function textMatches(e, q) {
    if (!q) return true;
    const organisations = D.orgs.filter((o) => orgMatches(e, o)).flatMap((o) => [o.name, ...(o.aliases || []), o.historical_role]);
    const researchers = D.people.filter((p) => (p.key_event_ids || []).includes(e.id)).map((p) => p.name);
    const hay = [e.title, e.label, plainText(e.problem), plainText(e.idea), plainText(e.changed), plainText(e.limits),
      ...(e.people || []), ...(e.orgs || []), ...(e.tags || []), ...(e.terms || []).flatMap((t) => [plainText(t.term), plainText(t.def)]),
      ...organisations, ...researchers].filter(Boolean).join(" ").toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  }
  const SMOOTH = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  const inScope = (e) => (!state.route || state.route.event_ids.includes(e.id)) && orgMatches(e, state.org);
  // Every event in the switched-on lanes is shown; importance only sets dot size and which dots carry a label.
  const visible = () => D.events.filter((e) => state.lanes.has(e.lane));
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
  // The map opens where RL, language models and safety meet; earlier history is a scroll to the left.
  const DEFAULT_START = 2016;
  const ZOOM_STEPS = [0.6, 0.8, 1, 1.25, 1.6, 2, 2.6], ZOOM_MIN = ZOOM_STEPS[0], ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];
  function makeX(y0, pad) {
    const raw = (y) => { let x = 0; for (const [a, b, p] of SEG) { if (y <= a) break; x += (Math.min(y, b) - a) * p * state.zoom; if (y <= b) break; } return x; };
    const o = raw(y0);
    return (y) => pad + raw(y) - o;
  }
  const Y0 = (() => { const ys = [...D.events.map(yearOf), ...((D.compute && D.compute.frontier_points) || []).map((p) => yearOfStr(p.date))].filter(Number.isFinite); return Math.max(1940, Math.floor(Math.min(1955, ...ys)) - 2); })();

  /* ---------- MAP ---------- */
  // FLOP are also read as H100 time: 40% of the H100 SXM dense BF16 peak (989 TFLOP/s; NVIDIA lists 1,979 with
  // sparsity). Llama 3.1 405B reports 3.8e25 FLOP and 30.84M H100 hours, which is about 35%.
  const H100_FLOPS = 989e12 * 0.4;
  const h100 = (flop) => {
    const sec = flop / H100_FLOPS, h = sec / 3600, r = (n) => (n >= 10 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, ""));
    if (h >= 1e6) return r(h / 1e6) + "M h";
    if (h >= 1e3) return r(h / 1e3) + "k h";
    if (h >= 1) return r(h) + " h";
    if (sec >= 60) return r(sec / 60) + " min";
    if (sec >= 1) return r(sec) + " s";
    if (sec >= 1e-3) return r(sec * 1e3) + " ms";
    if (sec >= 1e-6) return r(sec * 1e6) + " µs";
    return r(sec * 1e9) + " ns";
  };
  let layout = null, mapSvg, mapScroll, labelsCol, tip, overview;
  const ERA_H = 22, CMP_TOP = 26, CMP_H = 96, AX_H = 22, ROW = 22;

  function eraRange(i) {
    const era = D.eras[i], next = D.eras[i + 1];
    return [yearOfStr(era.start), next ? yearOfStr(next.start) : yearOfStr(era.end) + 1];
  }
  const inEra = (e) => state.era == null || (() => { const [a, b] = eraRange(state.era); return yearOf(e) >= a && yearOf(e) < b; })();
  const browseEvents = () => D.events.filter((e) => state.lanes.has(e.lane) && lit(e) && inEra(e));
  function renderEraNav() {
    const host = $(".era-nav", mounts.map); if (!host) return;
    const focusedEra = host.contains(document.activeElement) ? document.activeElement.dataset.era : null;
    host.innerHTML = `<div class="era-buttons" role="group" aria-label="Timeline eras"><button type="button" data-era="all" aria-pressed="${state.era == null}">All eras</button>${D.eras.map((era, i) => `<button type="button" data-era="${i}" aria-pressed="${state.era === i}" title="${esc(era.title)}" aria-label="${String(era.start).slice(0, 4)}–${String(era.end).slice(0, 4)}: ${esc(era.title)}"><span class="num">${String(era.start).slice(0, 4)}–${String(era.end).slice(0, 4)}</span></button>`).join("")}</div>`;
    if (focusedEra != null) host.querySelector(`[data-era="${focusedEra}"]`)?.focus({ preventScroll: true });
  }
  function browseEra(index) {
    saveHistory(true, true); state.era = index;
    const list = browseEvents();
    // Choosing an era moves the window and lists its events; it opens a card only inside a route, where the era's first stop is the next thing to read.
    if (!list.some((e) => e.id === state.selected)) {
      state.selected = null; state.focus = null;
      if (state.route && list.length) select(list[0].id, { history: false, keepEra: true });
      else { renderMap(); renderPane(); }
    } else renderMap();
    if (index != null && layout) { const [a, b] = eraRange(index); mapScroll.scrollLeft = Math.max(0, layout.X(a) - 12); if (layout.X(b) - layout.X(a) < mapScroll.clientWidth) jumpYear((a + b) / 2); }
    updateOverview(); saveHistory();
  }
  // Shorten a label with an ellipsis so it stops before the next dot; the full title stays in the tooltip and the card.
  function fitLabel(label, room, bold) {
    if (textW(label, 12, bold) <= room) return label;
    let t = label;
    while (t.length > 3 && textW(t + "…", 12, bold) > room) t = t.slice(0, -1);
    return t.length > 3 ? t.trimEnd() + "…" : "";
  }
  function computeLayout() {
    const evs = visible();
    const X = makeX(Y0, 24);
    const width = Math.ceil(X(2027.1) + 40);
    const labelMin = state.zoom >= 1.5 ? 2 : 3;
    const lanesTop = CMP_TOP + CMP_H + AX_H + 6;
    let y = lanesTop;
    const lanes = [], pos = new Map();
    let labelsEnd = 0;
    const routeIds = state.route ? new Set(state.route.event_ids) : null;
    const selectedIds = state.selected && !state.query && !state.route && !state.org ? new Set([
      state.selected, ...(byId.get(state.selected).links || []).map((l) => l.to), ...(incoming.get(state.selected) || []).map((l) => l.from),
    ]) : null;
    for (const lane of D.lanes) {
      if (!state.lanes.has(lane.id)) continue;
      const items = evs.filter((e) => e.lane === lane.id).sort((a, b) => yearOf(a) - yearOf(b));
      // Height inside a lane reads as importance: key events fill the top band, standard ones the middle,
      // details the bottom. Each band packs its own rows by date and keeps at least one row, so every
      // lane shows the same order even when a band is empty.
      const bands = [];
      let offset = 0;
      for (const level of [3, 2, 1]) {
        const rows = [];
        for (const e of items) {
          const imp = e.importance || 2;
          if (imp !== level) continue;
          const x = X(yearOf(e));
          const label = e.id === state.selected || (routeIds ? routeIds.has(e.id) : selectedIds ? selectedIds.has(e.id) : (state.query || state.org ? lit(e) : true) && imp >= labelMin);
          // Rows are packed for the labels the map shows with no card open, so opening or closing a card
          // never moves a dot or changes the map's height; it only changes which labels are drawn.
          const reserve = routeIds ? routeIds.has(e.id) : (state.query || state.org ? lit(e) : true) && imp >= labelMin;
          const w = reserve ? textW(e.label, 12, imp === 3) + 20 : 14;
          let r = rows.findIndex((end) => end < x - 4);
          if (r === -1) { if (rows.length < 9) { r = rows.length; rows.push(0); } else r = rows.indexOf(Math.min(...rows)); }
          rows[r] = x + w;
          labelsEnd = Math.max(labelsEnd, x + w);
          pos.set(e.id, { x, row: offset + r, label, reserve, room: Infinity });
        }
        const n = Math.max(rows.length, 1);
        bands.push({ level, first: offset, rows: n });
        offset += n;
      }
      // Room before the next dot in the same row, for labels drawn without reserved space (a card's neighbours).
      const lastInRow = new Map();
      for (const e of items) { const p = pos.get(e.id), prev = lastInRow.get(p.row); if (prev) prev.room = p.x - prev.x; lastInRow.set(p.row, p); }
      const h = offset * ROW + 26;
      lanes.push({ lane, top: y, h, bands });
      items.forEach((e) => { const p = pos.get(e.id); p.y = y + 18 + p.row * ROW; });
      y += h;
    }
    // Widen the map when the latest labels run past the end of the time scale.
    return { evs, X, width: Math.max(width, Math.ceil(labelsEnd + 8)), height: y + 6, lanes, pos, lanesTop };
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
    const shown = (p) => p.flop > 0 && yearOfStr(p.date) >= Y0;
    const latest = C.reduce((m, p) => (!m || p.date > m.date ? p : m), null);
    const LABELED = new Set(["AlexNet", "AlphaGo Zero", "GPT-3 175B (davinci)", "GPT-3 175B", "GPT-4", "GPT-4 (Mar 2023)", "Perceptron Mark I", "TD-Gammon", latest && latest.model]);
    // The compute band is clipped so points outside the fitted range do not spill into the year axis.
    const clip = el("clipPath", { id: "cmp-clip" }, el("defs", {}, svg));
    el("rect", { x: 0, y: CMP_TOP - 6, width, height: CMP_H + 12 }, clip);
    const cmpG = el("g", { "clip-path": "url(#cmp-clip)" }, svg);
    cmp = { grid: el("g", {}, cmpG), path: null, front: [], pts: [], lo: null, hi: null, target: null };
    // Legal compute thresholds start at the date of the measure that set them.
    cmp.th = [
      ["gov-2023-eo-14110", 26, "10²⁶ FLOP · US EO 14110, SB 53", "Training runs above 10²⁶ FLOP had to be reported to the US government under Executive Order 14110 (October 2023, revoked January 2025). California's SB 53 (2025) uses the same threshold for frontier developers."],
      ["gov-2024-eu-ai-act", 25, "10²⁵ FLOP · EU AI Act", "Under the EU AI Act, a general-purpose model trained with more than 10²⁵ FLOP is presumed to have systemic risk."],
    ].map(([id, lg, label, tip]) => {
      const ev = D.events.find((e) => e.id === id);
      if (!ev) return null;
      const t = { x: X(yearOfStr(ev.date)), lg, line: el("line", { class: "cmp-threshold" }, cmpG), text: el("text", { class: "cmp-threshold-text" }, cmpG, label) };
      t.text.addEventListener("mouseenter", (e2) => showTip(e2, esc(tip)));
      t.text.addEventListener("mousemove", moveTip); t.text.addEventListener("mouseleave", hideTip);
      return t;
    }).filter(Boolean);
    const front = F.filter(shown).map((p) => ({ p, x: X(yearOfStr(p.date)), lg: Math.log10(p.flop) }));
    if (front.length > 1) {
      cmp.path = el("path", { class: "cmp-trend" }, cmpG);
      el("title", {}, cmp.path, compute.frontier_label || "Running maximum of documented estimates");
      front.forEach((f) => {
        f.el = el("circle", { cx: f.x, r: 5, class: "cmp-frontier-hit" }, cmpG);
        // No SVG <title> here: the browser would show it as a second tooltip next to ours.
        f.el.addEventListener("mouseenter", (ev) => showTip(ev, `${esc(f.p.model)} · envelope estimate<br>${esc(f.p.flop.toExponential(1))} FLOP · ${esc(f.p.confidence || "confidence not supplied")}<br>≈ ${h100(f.p.flop)} on one H100`));
        f.el.addEventListener("mousemove", moveTip); f.el.addEventListener("mouseleave", hideTip);
      });
      cmp.front = front;
    }
    cmp.pts = C.filter(shown).map((p) => {
      const q = { p, x: X(yearOfStr(p.date)), lg: Math.log10(p.flop) };
      const lab = [...LABELED].some((n) => n && p.model.startsWith(n.replace(/ \(.*?$/, "")) && (n === p.model || p.model.startsWith(n)));
      q.el = el("circle", { cx: q.x, r: lab ? 3.4 : 2.6, class: "cmp-dot conf-" + String(p.confidence || "unknown").toLowerCase().replace(/[^a-z]/g, "") + (lab ? " lab" : "") }, cmpG);
      q.el.addEventListener("mouseenter", (ev) => showTip(ev, `<b>${esc(p.model)}</b><br>${esc(p.date.slice(0, 7))} · ${esc(p.flop.toExponential(1))} estimated FLOP<br>≈ ${h100(p.flop)} on one H100<br>Epoch confidence: ${esc(p.confidence || "not supplied")}`));
      q.el.addEventListener("mousemove", moveTip); q.el.addEventListener("mouseleave", hideTip);
      if (lab) {
        const text = p.model.replace(/ \(.*\)$/, "").replace(" 175B", "") + " · " + h100(p.flop), w = textW(text, 12), left = q.x + 6 + w > width - 4;
        q.x1 = left ? q.x - 6 - w : q.x + 6; q.w = w;
        q.text = el("text", { x: left ? q.x - 6 : q.x + 6, class: "cmp-text", ...(left ? { "text-anchor": "end" } : {}) }, cmpG, text);
      }
      return q;
    });
    SEG.slice(1).forEach(([yr]) => {
      if (yr <= Y0) return;
      const x = X(yr), y = CMP_TOP + CMP_H + 4;
      el("path", { d: `M${x - 5},${y + 4} l4,-8 M${x},${y + 4} l4,-8`, class: "ax-break" }, svg);
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
    labelsCol.insertAdjacentHTML("beforeend", `<div class="lab compute-heading" style="top:0px"><b>Compute</b><span class="compute-unit">FLOP<i class="h100"> · H100 h</i></span></div><div class="cmp-ticks"></div>`);
    cmp.ticks = labelsCol.querySelector(".cmp-ticks");
    labelsCol.querySelector(".compute-heading").addEventListener("mouseenter", (ev) => showTip(ev, "Training compute as estimated FLOP and as time on one H100 GPU; the note under the map gives the assumption. Divide by the number of GPUs for wall-clock time. Epoch AI has no estimate for many frontier models from 2025 on, so the most recent part of the line rests on few models."));
    labelsCol.querySelector(".compute-heading").addEventListener("mousemove", moveTip);
    labelsCol.querySelector(".compute-heading").addEventListener("mouseleave", hideTip);
    const BAND_NAMES = { 3: "Key events", 2: "Standard events", 1: "Details" };
    lanes.forEach((L) => {
      el("line", { x1: 0, x2: width, y1: L.top, y2: L.top, class: "lane-rule" }, svg);
      labelsCol.insertAdjacentHTML("beforeend", `<div class="lab" style="top:${L.top + 8}px"><b style="color:${lc(L.lane.id)}">${esc(L.lane.short || L.lane.title)}</b></div>`);
      L.bands.forEach((B, i) => {
        // A faint rule between bands, and a dot of the band's size at the right edge of the labels column.
        const mid = L.top + 18 + B.first * ROW;
        if (i) el("line", { x1: 0, x2: width, y1: mid - ROW / 2, y2: mid - ROW / 2, class: "band-rule" }, svg);
        const r = [0, 3, 4.2, 5.6][B.level];
        labelsCol.insertAdjacentHTML("beforeend", `<span class="band-key imp${B.level}" style="top:${mid - r}px;--r:${r}px;--c:${lc(L.lane.id)}" title="${BAND_NAMES[B.level]}" aria-hidden="true"></span>`);
      });
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
    const focusId = [state.focus, state.selected].find((id) => pos.has(id) && lit(byId.get(id))) || (evs.find((e) => lit(e) && e.importance === 3 && yearOf(e) >= DEFAULT_START) || evs.find(lit) || evs[0] || {}).id;
    for (const e of evs) {
      const p = pos.get(e.id), imp = e.importance || 2;
      let dim = !lit(e);
      if (state.selected && !state.query && !state.route && !state.org) dim = !related.has(e.id);
      const g = el("g", { class: `node imp${imp}${dim ? " dim" : ""}${state.selected === e.id ? " sel" : ""}`, transform: `translate(${p.x},${p.y})`, tabindex: e.id === focusId ? 0 : -1, role: "button", "aria-label": `${e.title}, ${fmtDate(e)}` }, gN);
      const r = [0, 3, 4.2, 5.6][imp];
      el("circle", { r: r + 3.5, class: "ring" }, g);
      el("circle", { r, style: imp === 1 ? `fill:var(--paper);stroke:${lc(e.lane)};stroke-width:1.5` : `fill:${lc(e.lane)}` }, g);
      // A route number (radius 7.5) covers the dot, so its label starts clear of the number.
      const lx = routeIds && routeIds.includes(e.id) ? 12 : r + 5;
      if (p.label) { const text = p.reserve ? e.label : fitLabel(e.label, p.room - lx - 7, imp === 3); if (text) el("text", { x: lx, y: 4 }, g, text); }
      else if (state.route && related.has(e.id)) el("text", { x: lx, y: 4, class: "connection-label" }, g, e.label);
      g.dataset.eventId = e.id;
      g.addEventListener("focus", () => { state.focus = e.id; });
      g.addEventListener("click", (ev) => { ev.stopPropagation(); select(e.id); });
      g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(e.id); } });
      g.addEventListener("mouseenter", (ev) => showTip(ev, `<b>${esc(e.title)}</b><br>${esc(fmtDate(e))}<span class="preview-idea">${prose(e.idea || e.problem || "")}</span>`));
      g.addEventListener("focus", (ev) => { if (!g.matches(":focus-visible")) return; showTip(ev, `<b>${esc(e.title)}</b><br>${esc(fmtDate(e))}<span class="preview-idea">${prose(e.idea || e.problem || "")}</span>`); g.setAttribute("aria-describedby", "atlas-preview"); });
      g.addEventListener("blur", hideTip);
      g.addEventListener("mousemove", moveTip);
      g.addEventListener("mouseleave", hideTip);
    }
    if (routeIds) routeIds.forEach((id) => {
      const p = pos.get(id);
      // The number covers its own dot (ringed in the lane colour); placed above, it hid the labels of the row above.
      const g = el("g", { class: "badge", transform: `translate(${p.x},${p.y})` }, gN);
      el("circle", { r: 7.5, style: `stroke:${lc(byId.get(id).lane)}` }, g);
      el("text", { "text-anchor": "middle", y: 3.5 }, g, state.route.event_ids.indexOf(id) + 1);
    });
    renderContext(); renderOverview(); renderEraNav(); renderSearchResults(); updateConnectionAccent(); updateWorkspaceSticky();
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
    // An opened explanation unfolds the card's Connections list so its row stays visible.
    if (state.connection) mounts.map?.querySelector(`[data-connection-row="${CSS.escape(state.connection)}"]`)?.closest("details.conn-group")?.setAttribute("open", "");
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
    const record = (item) => `<div class="connection-record" data-relation="${esc(item.key)}"><p class="connection-direction"><a href="#${esc(item.from)}" data-ev="${esc(item.from)}">${esc(byId.get(item.from).title)}</a><span class="connection-relation">${esc(REL[item.type] || item.type)}</span><a href="#${esc(item.to)}" data-ev="${esc(item.to)}">${esc(byId.get(item.to).title)}</a></p>${item.note ? `<p class="connection-note">${prose(item.note)}</p>` : ""}</div>`;
    const sources = [from, to].filter((e) => (e.sources || []).length).map((e) => `<div><span>${esc(e.label)}</span>${e.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label || s.url)}</a>`).join("")}</div>`).join("");
    host.innerHTML = `<div class="connection-detail-head"><h4 id="atlas-connection-title" tabindex="-1">Connection</h4><button type="button" class="text-button" data-act="close-connection" aria-label="Close connection explanation">Close ×</button></div>${record(c)}${pair.length ? `<details class="connection-other"><summary>${pair.length} other recorded relation${pair.length === 1 ? "" : "s"} between these events</summary>${pair.map(record).join("")}</details>` : ""}${sources ? `<details class="connection-sources"><summary>Sources for these events</summary>${sources}</details>` : ""}`;
    updateConnectionAccent(); updateWorkspaceSticky();
  }
  function inspectConnection(key, trigger) {
    if (!connectionByKey.has(key)) return;
    const c = connectionByKey.get(key); if (![c.from, c.to].includes(state.selected)) return;
    // The explanation lives in the event card, which a timeline profile covers; close the profile so it can be seen.
    const coveringProfile = state.profile && state.profileDock === "timeline";
    if (state.connection !== key || coveringProfile) {
      saveHistory(true, true);
      if (coveringProfile) { state.profile = null; state.affiliationIndex = null; renderProfile(); }
      state.connection = key; saveHistory();
    }
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
    // The search box and lane buttons already show their own state; only an organisation filter needs a line.
    c.hidden = !state.org;
    c.innerHTML = state.org ? `<span>${esc(`Organisation: ${state.org.name}`)}</span>` : "";
    const reset = $(".reset-view", mounts.map);
    if (reset) reset.style.visibility = state.route || state.org || state.query || state.lanes.size < D.lanes.length || state.zoom !== 1 ? "visible" : "hidden";
  }

  function renderSearchResults() {
    const host = $(".search-results", mounts.map); if (!host) return;
    const list = browseEvents(), era = state.era == null ? null : D.eras[state.era];
    const previousScroll = $(".event-scroll-list", host)?.scrollTop || 0;
    const listKey = list.map(e => e.id).join("|");
    const sameList = host.dataset.listKey === listKey;
    host.dataset.listKey = listKey;
    const scoped = Boolean(state.query || state.route || state.org);
    const globalCount = D.events.filter((e) => state.lanes.has(e.lane) && lit(e)).length;
    host.dataset.total = list.length; host.dataset.globalTotal = globalCount;
    if (state.route) { renderRouteStepper(host); return; }
    host.innerHTML = `<div class="browser-heading"><h3 tabindex="-1">${era ? esc(era.title) : "Events across the history"}</h3>${list.length > 1 ? `<span class="num">${list.length} events</span>` : ""}</div>${era && era.summary ? `<details class="era-summary"><summary>About this era</summary><p>${esc(era.summary)}</p></details>` : ""}${state.query && era ? `<p>${globalCount} search match${globalCount === 1 ? "" : "es"} across all eras. <button class="text-button" data-era="all">Show all matches</button></p>` : ""}${list.length ? `<ol class="event-scroll-list" tabindex="0" aria-label="Events in the selected scope">${list.map((e) => `<li${state.selected === e.id ? ' class="current"' : ""}><span class="num result-date">${esc(fmtDate(e))}</span><a href="#${esc(e.id)}" data-ev-card="${esc(e.id)}"${state.selected === e.id ? ' aria-current="true"' : ""}>${esc(e.title)}</a><span class="result-lane" style="color:${lc(e.lane)}">${esc(laneTitle(e.lane))}</span></li>`).join("")}</ol>` : `<p>No events ${era ? "in this era " : ""}match the active lanes${scoped ? " and search or scope" : ""}. ${scoped ? '<button type="button" class="text-button" data-act="clear">Reset view</button>' : '<button type="button" class="text-button" data-era="all">Browse all eras</button>'}</p>`}`;
    const scroller = $(".event-scroll-list", host);
    if (scroller) {
      scroller.scrollTop = sameList ? previousScroll : 0;
      const current = $("li.current", scroller);
      if (current) {
        const top = current.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
        if (top < scroller.scrollTop) scroller.scrollTop = top;
        else if (top + current.offsetHeight > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top + current.offsetHeight - scroller.clientHeight;
      }
      // Fade the edge that has more rows behind it, so the list reads as scrollable.
      const edges = () => {
        const max = scroller.scrollHeight - scroller.clientHeight;
        scroller.classList.toggle("more-above", scroller.scrollTop > 2);
        scroller.classList.toggle("more-below", scroller.scrollTop < max - 2);
      };
      edges();
      scroller.addEventListener("scroll", edges, { passive: true });
    }
  }

  function routeAvailable() {
    return state.route ? state.route.event_ids.filter((id) => { const e = byId.get(id); return e && state.lanes.has(e.lane) && lit(e) && inEra(e); }) : [];
  }
  function renderRouteStepper(host) {
    const t = state.route, ids = t.event_ids, available = routeAvailable(), current = ids.indexOf(state.selected), index = available.indexOf(state.selected);
    const previous = index > 0 ? available[index - 1] : null, next = index >= 0 ? available[index + 1] : available[0];
    const control = (id, dir, label) => `<button type="button" class="route-step-control" data-route-step="${dir}"${id ? ` aria-label="${label}: ${esc(byId.get(id).title)}, ${byId.get(id).date_sort.slice(0, 4)}"` : " disabled"}><span>${dir < 0 ? "← " : ""}${label}${dir > 0 ? " →" : ""}</span><strong>${id ? `${esc(byId.get(id).label)} <span class="num">${byId.get(id).date_sort.slice(0, 4)}</span>` : dir < 0 ? "Start of route" : "End of route"}</strong></button>`;
    host.innerHTML = `<nav class="route-stepper" data-route-id="${esc(t.id)}" aria-label="Active question route"><div class="route-stepper-head"><span class="eyebrow">Follow a question</span><button type="button" class="text-button" data-act="leave-route">Exit route</button></div><h3>${esc(t.question || t.title)}</h3><div class="route-position-row"><span class="route-position num">${current >= 0 ? `Step ${current + 1} of ${ids.length}` : `Choose a step · ${ids.length} in this route`}</span>${available.length < ids.length ? `<span>${available.length} available with these filters</span>` : ""}</div><progress class="route-progress" max="${ids.length}" value="${current + 1}" aria-label="Position in the curated route"></progress><ol class="route-stops" aria-label="Route steps">${ids.map((id, i) => { const e = byId.get(id), active = id === state.selected; return `<li><button type="button" data-route-stop="${esc(id)}"${active ? ' aria-current="step"' : ""}${available.includes(id) ? "" : " disabled"} title="${i + 1}. ${esc(e.label)}, ${e.date_sort.slice(0, 4)}${available.includes(id) ? "" : " · unavailable with these filters"}" aria-label="Step ${i + 1}: ${esc(e.title)}, ${e.date_sort.slice(0, 4)}" style="--stop-color:${lc(e.lane)}"><span class="num">${i + 1}</span></button></li>`; }).join("")}</ol>${current >= 0 ? `<p class="route-step-current"><span class="dot" style="background:${lc(byId.get(state.selected).lane)}"></span>${esc(byId.get(state.selected).label)} <span class="num">${byId.get(state.selected).date_sort.slice(0, 4)}</span></p>` : ""}${!available.length ? '<p class="route-empty">No events in this route match the active lanes, search and era. Adjust the filters or <button type="button" class="text-button" data-era="all">browse all eras</button>.</p>' : `<div class="route-step-controls">${control(previous, -1, "Previous")}${control(next, 1, "Next")}</div>`}<details class="route-stop-list"><summary>All steps</summary><ol>${ids.map((id, i) => { const e = byId.get(id); return `<li value="${i + 1}"><button type="button" class="text-button" data-route-stop="${esc(id)}"${available.includes(id) ? "" : " disabled"}${id === state.selected ? ' aria-current="step"' : ""}>${esc(e.label)} <span class="num">${e.date_sort.slice(0, 4)}</span></button>${available.includes(id) ? "" : '<span class="route-unavailable">Unavailable with these filters</span>'}</li>`; }).join("")}</ol></details></nav>`;
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
  // The compute axis is fitted to the years in view, so the growth inside the window uses the band's full
  // height. The fitted range eases into place while the map scrolls.
  let cmp = null, cmpAnim = 0;
  function placeCompute(lo, hi) {
    cmp.lo = lo; cmp.hi = hi;
    const cy = (lg) => CMP_TOP + CMP_H - ((lg - lo) / (hi - lo)) * CMP_H;
    const step = [1, 2, 5, 10].find((s) => (s * CMP_H) / (hi - lo) >= 22) || 10, ticks = [];
    for (let n = Math.ceil(lo / step) * step; n <= hi; n += step) if (cy(n) >= CMP_TOP + 6) ticks.push(n);
    cmp.grid.innerHTML = "";
    ticks.forEach((n) => el("line", { x1: 0, x2: mapSvg.getAttribute("width"), y1: cy(n), y2: cy(n), class: "cmp-grid" }, cmp.grid));
    cmp.ticks.innerHTML = ticks.map((n) => `<div class="lab num" style="top:${cy(n) - 8}px;text-align:right"><span>10<sup>${n}</sup><i class="h100"> · ${h100(10 ** n)}</i></span></div>`).join("");
    cmp.th.forEach((t) => {
      const y = cy(t.lg), shown = t.lg >= lo && t.lg <= hi;
      t.line.style.display = t.text.style.display = shown ? "" : "none";
      t.line.setAttribute("x1", t.x); t.line.setAttribute("x2", mapSvg.getAttribute("width"));
      t.line.setAttribute("y1", y); t.line.setAttribute("y2", y);
      t.text.setAttribute("y", y + 11);
      t.text.parentNode.appendChild(t.text); // drawn last, above the frontier line
    });
    placeThresholdLabels();
    cmp.front.forEach((f) => { f.y = cy(f.lg); f.el.setAttribute("cy", f.y); });
    if (cmp.path) cmp.path.setAttribute("d", "M" + cmp.front.map((f, i) => (i ? `H${f.x.toFixed(1)} V${f.y.toFixed(1)}` : `${f.x.toFixed(1)},${f.y.toFixed(1)}`)).join(" "));
    // Labels that would run past the right edge sit to the left of their dot; one that would cover an
    // earlier label moves down a line.
    const placed = [];
    cmp.pts.forEach((q) => {
      q.el.setAttribute("cy", cy(q.lg));
      if (!q.text) return;
      let y = cy(q.lg) + 4;
      while (placed.some((r) => q.x1 < r.x2 && q.x1 + q.w > r.x1 && Math.abs(y - r.y) < 12)) y += 13;
      placed.push({ x1: q.x1, x2: q.x1 + q.w, y });
      q.text.setAttribute("y", y);
    });
  }
  // Threshold labels sit under the visible right end of their line, clear of the frontier steps and model
  // labels, and follow the window as the map scrolls; they never start before the line does.
  function placeThresholdLabels() {
    if (!cmp || !cmp.th) return;
    const right = Math.min(+mapSvg.getAttribute("width"), mapScroll.scrollLeft + mapScroll.clientWidth) - 6;
    cmp.th.forEach((t) => {
      t.w = t.w || t.text.getComputedTextLength();
      t.text.setAttribute("x", Math.max(right, t.x + 4 + t.w));
    });
  }
  function computeTarget() {
    const a = mapScroll.scrollLeft, b = a + mapScroll.clientWidth, all = [...cmp.pts, ...cmp.front];
    const lgs = all.filter((q) => q.x >= a && q.x <= b).map((q) => q.lg);
    // The envelope entering the window from the left is part of what the window shows.
    const before = cmp.front.filter((f) => f.x < a).pop();
    if (before) lgs.push(before.lg);
    if (!lgs.length) { const next = all.filter((q) => q.x > b).sort((p, q) => p.x - q.x)[0]; if (next) lgs.push(next.lg); }
    if (!lgs.length) return [0, 27];
    let lo = Math.min(...lgs) - 0.6, hi = Math.max(...lgs) + 0.6;
    if (hi - lo < 4) { const mid = (lo + hi) / 2; lo = mid - 2; hi = mid + 2; }
    return [lo, hi];
  }
  function updateCompute(animate) {
    if (!cmp || !cmp.ticks) return;
    const target = computeTarget();
    if (cmp.target && Math.abs(target[0] - cmp.target[0]) < 0.01 && Math.abs(target[1] - cmp.target[1]) < 0.01) return;
    cmp.target = target;
    cancelAnimationFrame(cmpAnim);
    if (!animate || cmp.lo == null || SMOOTH === "auto") { placeCompute(...target); return; }
    const from = [cmp.lo, cmp.hi], t0 = performance.now();
    const frame = (now) => {
      const k = Math.min(1, (now - t0) / 240), e = 1 - (1 - k) ** 3;
      placeCompute(from[0] + (target[0] - from[0]) * e, from[1] + (target[1] - from[1]) * e);
      if (k < 1) cmpAnim = requestAnimationFrame(frame);
    };
    cmpAnim = requestAnimationFrame(frame);
  }
  function updateOverview(animate = false) {
    if (!overview || !layout) return;
    updateCompute(animate === true);
    placeThresholdLabels();
    const a = yearAtX(mapScroll.scrollLeft), b = yearAtX(mapScroll.scrollLeft + mapScroll.clientWidth);
    const ox = (y) => 12 + ((y - Y0) / (2027.1 - Y0)) * 976;
    const rect = $(".overview-window", overview);
    if (rect) { rect.setAttribute("x", ox(a)); rect.setAttribute("width", Math.max(4, ox(b) - ox(a))); }
    const range = $("#atlas-year");
    if (range) {
      // Use the inverse of panToSliderYear, including the viewport's actual width.
      // Averaging the visible years drifts on the nonlinear axis and traps the thumb at the edges.
      const travel = mapScroll.scrollWidth - mapScroll.clientWidth;
      if (travel > 0) {
        const start = layout.X(Number(range.min)), span = layout.X(Number(range.max)) - start;
        range.value = Math.round(yearAtX(start + span * mapScroll.scrollLeft / travel));
      }
      range.setAttribute("aria-valuetext", `${range.value}; map shows ${Math.floor(a)} to ${Math.min(2026, Math.ceil(b))}`);
    }
    const label = $(".window-years", mounts.map); if (label) label.textContent = `Map window: ${Math.floor(a)}–${Math.min(2026, Math.ceil(b))}`;
  }
  function jumpYear(year) {
    if (!layout) return;
    mapScroll.scrollLeft = layout.X(Math.max(Y0, Math.min(2026.99, year))) - mapScroll.clientWidth / 2;
    updateOverview();
  }
  function panToSliderYear(year) {
    const range = $("#atlas-year");
    if (!range || !layout) return;
    const min = Number(range.min), max = Number(range.max);
    const start = layout.X(min), span = layout.X(max) - start;
    // Align the full year range with the available pan range. Every target year
    // remains in view, while the first and last years reach the two map edges.
    mapScroll.scrollLeft = (layout.X(Math.max(min, Math.min(max, year))) - start) / span * Math.max(0, mapScroll.scrollWidth - mapScroll.clientWidth);
    updateOverview(true);
  }

  function workspaceInset() {
    const header = document.getElementById("quarto-header");
    return 16 + (document.querySelector(".atlas-tabs")?.offsetHeight || 0) + (header && getComputedStyle(header).position === "fixed" ? header.offsetHeight : 0);
  }
  function updateSwitchInset() {
    const header = document.getElementById("quarto-header");
    const bottom = header && getComputedStyle(header).position === "fixed" ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    document.querySelector(".atlas-tabs")?.style.setProperty("--tabs-top", `${bottom}px`);
    mounts.map.style.setProperty("--workspace-top", `${bottom + (document.querySelector(".atlas-tabs")?.offsetHeight || 0)}px`);
  }
  function updateWorkspaceSticky() {
    const chart = $(".chart-column", mounts.map); if (!chart) return;
    updateSwitchInset();
    chart.style.setProperty("--chart-top", `${Math.min(workspaceInset(), innerHeight - chart.offsetHeight - 16)}px`);
    const profileDock = mounts.people && $(".people-profile-dock", mounts.people); if (profileDock) profileDock.style.setProperty("--profile-top", `${Math.min(workspaceInset(), innerHeight - profileDock.offsetHeight - 16)}px`);
  }
  function updateChip() {
    const chip = $(".card-chip", mounts.map); if (!chip) return;
    // While a timeline profile covers the card, the chip has nothing visible to jump to.
    const e = state.selected && byId.get(state.selected), covered = state.profile && state.profileDock === "timeline";
    chip.hidden = !e || covered;
    if (e) chip.textContent = `Read: ${e.label} ↓`;
  }
  function revealReaderTarget(target) {
    if (!target) return;
    const workspaceSwitch = target.closest('[data-atlas="map"]') && $(".workspace-switch", mounts.map);
    const switchHeight = workspaceSwitch && getComputedStyle(workspaceSwitch).display !== "none" ? workspaceSwitch.getBoundingClientRect().height : 0;
    scrollTo({ top: scrollY + target.getBoundingClientRect().top - workspaceInset() - switchHeight, behavior: SMOOTH });
  }
  function readSelected() {
    const heading = $(".pane h3", mounts.map), target = $(".pane .head", mounts.map) || $(".pane-host", mounts.map);
    revealReaderTarget(target);
    if (heading) heading.focus({ preventScroll: true });
  }
  function updateDiagramHints() {
    mounts.map.querySelectorAll(".diagram-viewport").forEach((viewport) => {
      const hint = $(".diagram-pan-hint", viewport.parentElement);
      const overflows = viewport.clientWidth > 0 && viewport.scrollWidth > viewport.clientWidth + 1;
      hint.hidden = !overflows;
      viewport.tabIndex = overflows ? 0 : -1;
      if (overflows) viewport.setAttribute("aria-describedby", hint.id);
      else viewport.removeAttribute("aria-describedby");
    });
  }
  function scrollMapTo(id, smooth = true) {
    const p = layout && layout.pos.get(id);
    if (!p) return;
    const sc = mapScroll;
    if (p.x < sc.scrollLeft + 60 || p.x > sc.scrollLeft + sc.clientWidth - 200) sc.scrollTo({ left: p.x - sc.clientWidth * 0.4, behavior: smooth ? SMOOTH : "auto" });
  }

  /* ---------- tooltip ---------- */
  function showTip(ev, html) { if (!tip) return; if (matchMedia("(hover: none)").matches) { hideTip(); return; } tip.innerHTML = html; tip.hidden = false; moveTip(ev); }
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
      if (state.profile && state.profileDock === "timeline") { state.profile = null; state.affiliationIndex = null; renderProfile(); }
      pane.innerHTML = `<div class="pane-empty"><p>Select an event on the map to read it here.</p></div>`;
      return;
    }
    const conns = connectionsFor(e.id).map((c) => ({ ...c, id: c.from === e.id ? c.to : c.from, rel: (c.from === e.id ? REL : REL_IN)[c.type] || c.type })).sort((a, b) => byId.get(a.id).date_sort.localeCompare(byId.get(b.id).date_sort));
    const dg = window.DIAGRAMS && window.DIAGRAMS.forEvent(e);
    // The card reads as a short note: problem, idea, consequence and limits are paragraphs, not labelled sections.
    const para = (t, cls = "") => t ? `<p${cls ? ` class="${cls}"` : ""}>${prose(t)}</p>` : "";
    const routes = D.threads.filter((t) => t.event_ids.includes(e.id));
    pane.innerHTML = `<article class="pane">
      <div class="head">
        <div class="meta eyebrow"><span class="dot" style="background:${lc(e.lane)}"></span>${esc(laneTitle(e.lane))} · <span class="num">${esc(fmtDate(e))}</span>${e.kind ? " · " + esc(e.kind) : ""}<button type="button" class="text-button pane-close" data-act="deselect" title="Close (Esc)" aria-label="Close this event and show the whole map">Close</button></div>
        <h3 tabindex="-1">${esc(e.title)}</h3>
        ${(e.people || []).length || (e.orgs || []).length ? `<div class="people">${(e.people || []).map(personLink).join(", ")}${(e.people || []).length && (e.orgs || []).length ? " · " : ""}${(e.orgs || []).map(orgLink).join(", ")}</div>` : ""}
      </div>
      <section class="connection-detail" id="atlas-connection-detail" aria-labelledby="atlas-connection-title" hidden></section>
      <div class="qa">
        <div class="prose">${para(e.problem)}${para(e.idea)}</div>
        ${dg ? `<figure class="diagram"><div class="diagram-viewport" role="group" aria-label="Diagram">${dg.svg}</div><p class="diagram-pan-hint" id="diagram-pan-${esc(e.id)}" hidden>Swipe to see the full diagram →</p><figcaption>${prose(dg.caption)}</figcaption></figure>` : ""}
        ${e.changed || e.limits ? `<div class="prose">${para(e.changed)}${para(e.limits, "limits")}</div>` : ""}
        ${(e.terms || []).length ? `<div><div class="eyebrow">Terms</div><dl class="terms">${e.terms.map((t) => `<dt>${prose(t.term)}</dt><dd>${prose(t.def)}</dd>`).join("")}</dl></div>` : ""}
      </div>
      <div class="side">
        ${(e.sources || []).length ? `<div class="reads"><div class="eyebrow">Read next</div>${e.developer_report ? '<p class="source-note">The main evidence is the developer\'s own report.</p>' : ""}${e.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label || s.url)}</a>`).join("")}</div>` : ""}
        ${routes.length ? `<div class="reads"><div class="eyebrow">On the routes</div>${routes.map((t) => `<a href="#${esc(t.id)}" data-route="${esc(t.id)}">${esc(t.question || t.title)}</a>`).join("")}</div>` : ""}
        ${conns.length ? `<details class="conn-group"${conns.some((c) => c.key === state.connection) ? " open" : ""}><summary><span class="eyebrow">Connections</span><span class="conn-count num">${conns.length}</span></summary><ul class="conn">${conns.map((c) => { const o = byId.get(c.id); return `<li data-connection-row="${esc(c.key)}"><span class="rel">${esc(c.rel)}</span><span><a href="#${esc(c.id)}" data-ev="${esc(c.id)}">${esc(o.title)}</a> <span class="num" style="color:var(--muted)">${o.date_sort.slice(0, 4)}</span>${c.note ? `<span class="why">${prose(c.note)}</span>` : ""}<button type="button" class="text-button connection-explain" data-explain-connection="${esc(c.key)}" aria-expanded="${state.connection === c.key}" aria-controls="atlas-connection-detail" aria-label="Explain: ${esc(connectionLabel(c))}">Explain this connection</button></span></li>`; }).join("")}</ul></details>` : ""}
      </div>
      <div class="foot"><span><button type="button" class="text-button" data-nav="-1">← Earlier</button> &nbsp; <button type="button" class="text-button" data-nav="1">Later →</button></span><button type="button" class="text-button" data-act="locate">Show on map ↑</button></div>
    </article>`;
    fillMath(pane); renderConnectionDetail(); updateDiagramHints();
  }
  function orgLink(name) {
    if (notOrg(name)) return esc(name);
    const o = orgForName(name) || [...orgById.values()].find((x) => x.name === baseName(name));
    return o ? `<a href="#${profileHash(`org:${o.id}`)}" data-profile="org:${esc(o.id)}" aria-controls="atlas-profile" aria-expanded="${state.profile === `org:${o.id}`}">${esc(name)}</a>` : esc(name);
  }

  function personLink(name) {
    const p = [...personById.values()].find((x) => x.name.toLowerCase() === baseName(name).toLowerCase());
    return p ? `<a href="#${profileHash(`person:${personId(p)}`)}" data-profile="person:${esc(personId(p))}" aria-controls="atlas-profile" aria-expanded="${state.profile === `person:${personId(p)}`}">${esc(name)}</a>` : esc(name);
  }
  function snapshot() {
    return { tab: state.tab, selected: state.selected, connection: state.connection, route: state.route && state.route.id, org: state.org && state.org.id,
      query: state.query, queryInput: state.queryInput, zoom: state.zoom, lanes: [...state.lanes], scrollLeft: state.tab === "map" && mapScroll ? mapScroll.scrollLeft : preservedMapScroll,
      listScrollTop: $(".event-scroll-list", mounts.map)?.scrollTop || 0, era: state.era, profile: state.profile, profileDock: state.profileDock, affiliationIndex: state.affiliationIndex, routeShown: state.routeShown };
  }
  function saveHistory(replace = false, preserveUrl = false) {
    const url = preserveUrl ? location.href : `${location.pathname}${location.search}${state.tab === "people" && state.profile && state.profileDock === "people" ? "#" + profileHash(state.profile) : state.tab !== "map" ? "#" + tabIds[state.tab] : state.profile && state.profileDock === "timeline" ? "#" + profileHash(state.profile) : state.route ? "#" + state.route.id + (state.selected ? "/" + state.selected : "") : state.selected ? "#" + state.selected : "#the-map"}`;
    const snap = snapshot();
    // A transition that changed nothing (the active tab clicked again, a second reset) would leave a Back step that does nothing.
    if (!replace && new URL(url, location.href).href === location.href && JSON.stringify(history.state?.atlas) === JSON.stringify(snap)) return;
    history[replace ? "replaceState" : "pushState"]({ ...(history.state || {}), atlas: snap }, "", url);
  }
  function select(id, opts = {}) {
    if (!byId.has(id)) return;
    // A card still open behind another tab is not the current view: opening it again from there gets its own history entry.
    const previous = state.tab === "map" ? state.selected : null;
    if (opts.history !== false) saveHistory(true, true);
    setPanel("map");
    state.selected = id; state.focus = id; state.connection = null; connectionHover = null; connectionFocus = null; connectionTrigger = null;
    const e = byId.get(id);
    // Opening an event never picks an era by itself; an era the reader chose is dropped only when the event lies outside it.
    if (!opts.keepEra && state.era != null && !inEra(e)) state.era = null;
    // A timeline profile covers the card; a people-tab profile stays unless the click came from it.
    if (state.profile && (state.profileDock === "timeline" || opts.dismissProfile)) { state.profile = null; state.affiliationIndex = null; renderProfile(); }
    if (state.route && !state.route.event_ids.includes(id)) state.route = null;
    if (state.org && !orgMatches(e, state.org)) state.org = null;
    if (state.query && !textMatches(e, state.query)) { state.query = ""; state.queryInput = ""; }
    state.lanes.add(e.lane);
    const hadFocus = mapSvg && mapSvg.contains(document.activeElement);
    syncControls(); renderMap(); renderPane();
    scrollMapTo(id, false); updateOverview();
    if (hadFocus || opts.focus) { const n = mapSvg.querySelector(".node.sel"); if (n) n.focus({ preventScroll: true }); }
    if (opts.history !== false) saveHistory(previous === id || Boolean(opts.replace && previous));
    if (opts.card) readSelected();
    else if (opts.reveal) mounts.map.scrollIntoView({ behavior: SMOOTH, block: "start" });
  }
  const stepSequence = () => state.route ? routeAvailable() : matches().map((e) => e.id);
  function step(dir, fromId = state.selected || state.focus, opts = { focus: true }) {
    const seq = stepSequence();
    if (!seq.length) return;
    const index = seq.indexOf(fromId);
    const next = index < 0 ? (dir > 0 ? 0 : seq.length - 1) : index + dir;
    if (next >= 0 && next < seq.length) select(seq[next], { ...opts, keepEra: Boolean(state.route) });
  }
  // Back to the unselected map: every event lit, no connection arc, no card in the reader column.
  function clearSelection(focusMap = false) {
    if (!state.selected) return;
    state.selected = null;
    renderMap(); renderPane(); saveHistory();
    if (focusMap) mapSvg.querySelector('.node[tabindex="0"]')?.focus({ preventScroll: true });
  }
  // Returns true when the edit closed the open card; that step gets its own history entry so Back can reopen it.
  function reconcileSelection() {
    if (state.selected && !matches().some((e) => e.id === state.selected)) { state.selected = null; state.focus = null; state.connection = null; connectionHover = null; connectionFocus = null; return true; }
    return false;
  }
  function resetView() {
    state.selected = null; state.focus = null; state.connection = null; connectionHover = null; connectionFocus = null; state.route = null; state.org = null; state.query = ""; state.queryInput = "";
    state.era = null; if (state.profileDock === "timeline") { state.profile = null; state.affiliationIndex = null; renderProfile(); } state.zoom = 1; state.lanes = new Set(D.lanes.map((l) => l.id));
    syncControls(); renderMap(); renderPane();
    mapScroll.scrollLeft = layout.X(DEFAULT_START) - 30; updateOverview(); saveHistory();
  }

  /* ---------- controls ---------- */
  function renderControls() {
    const c = $(".controls", mounts.map);
    c.innerHTML = `
      <input class="search" id="atlas-search" type="search" placeholder="Search events" aria-label="Search events" value="${esc(state.queryInput)}">
      <div class="group" role="group" aria-label="Lanes">${D.lanes.map((l) => `<button class="atlas-btn" data-lane="${l.id}" aria-pressed="${state.lanes.has(l.id)}"><span class="dot" style="background:${lc(l.id)}"></span>${esc(l.short || l.title)}</button>`).join("")}</div>
      <div class="group" role="group" aria-label="Zoom"><button class="atlas-btn" data-zoom="-1" aria-label="Zoom out">−</button><button class="atlas-btn" data-zoom="1" aria-label="Zoom in">+</button></div>
      <button type="button" class="text-button reset-view" data-act="clear" style="visibility:hidden">Reset view</button>
      `;
    syncControls();
    $("#atlas-search").addEventListener("input", (ev) => { state.queryInput = ev.target.value; state.query = state.queryInput.trim(); state.era = null; const closed = reconcileSelection(); syncControls(); renderMap(); renderPane(); saveHistory(!closed); });
  }
  function syncControls() {
    const q = $("#atlas-search"); if (q && q.value !== state.queryInput) q.value = state.queryInput;
    document.querySelectorAll("[data-lane]").forEach((b) => b.setAttribute("aria-pressed", state.lanes.has(b.dataset.lane)));
    // aria-disabled keeps the button focusable at a limit, so keyboard focus does not drop out of the toolbar.
    mounts.map?.querySelectorAll("[data-zoom]").forEach((b) => b.setAttribute("aria-disabled", String(Number(b.dataset.zoom) > 0 ? state.zoom >= ZOOM_MAX : state.zoom <= ZOOM_MIN)));
  }

  function mountMap() {
    const m = mounts.map;
    if (!m) return;
    m.innerHTML = `<div class="controls"></div><div class="context"></div><nav class="workspace-switch" aria-label="Timeline reading"><button type="button" class="text-button" data-act="locate">↑ Map</button><button type="button" class="card-chip" hidden></button></nav><div class="timeline-workspace"><section class="chart-column" aria-label="History map">
      <div class="era-nav" id="every-event-by-era"></div><div class="navigator"><span class="window-years sr-only"></span><svg class="overview" viewBox="0 0 1000 52" preserveAspectRatio="none" role="img" aria-label="Whole timeline and current map window"></svg><div class="overview-axis" aria-hidden="true">${[1960, 1980, 2000, 2020].filter((y) => y >= Y0).map((y) => `<span style="left:${1.2 + (y - Y0) / (2027.1 - Y0) * 97.6}%">${y}</span>`).join("")}</div><div class="overview-range"><label for="atlas-year" class="sr-only">Jump to year</label><input id="atlas-year" type="range" min="${Math.ceil(Y0)}" max="2026" step="1" value="2017"></div></div>
      <div class="map"><div class="map-labels"></div><div class="map-scroll" tabindex="0" aria-label="Timeline, scroll sideways"><svg role="group" aria-label="Timeline of AI in four lanes. Use the left and right arrow keys to move between events."></svg></div></div>
      ${D.compute ? `<p class="map-credit">Compute estimates: <a href="${esc(D.compute.source_url || "https://epoch.ai/data/ai-models")}" target="_blank" rel="noopener">Epoch AI</a>, CC BY 4.0. H100 time assumes 40% of the H100 SXM dense BF16 peak of 989 TFLOP/s; real runs reach roughly 30–45% (Llama 3.1 405B: 3.8×10<sup>25</sup> FLOP in 30.84M H100 hours, about 35%).</p>` : ""}</section><section class="reader-column" aria-label="Event browser and selected event"><div class="search-results"></div><div class="profile-dock" hidden></div><div class="pane-host"></div></section></div><div class="tip" id="atlas-preview" role="tooltip" hidden></div><div class="sr-only" aria-live="polite"></div>`;
    $(".card-chip", m).addEventListener("click", readSelected);
    let chipRaf = 0; addEventListener("scroll", () => { if (!chipRaf) chipRaf = requestAnimationFrame(() => { chipRaf = 0; updateChip(); updateSwitchInset(); }); }, { passive: true });
    document.getElementById("quarto-header")?.addEventListener("transitionend", updateSwitchInset);
    mapSvg = $(".map svg", m); overview = $(".overview", m); mapScroll = $(".map-scroll", m); labelsCol = $(".map-labels", m); tip = $(".tip", m);
    renderControls();
    overview.addEventListener("pointerdown", (ev) => { if (ev.button !== 0) return; const r = overview.getBoundingClientRect(); jumpYear(Y0 + Math.max(0, Math.min(1, (ev.clientX - r.left - r.width * .012) / (r.width * .976))) * (2027.1 - Y0)); });
    $("#atlas-year").addEventListener("input", (ev) => panToSliderYear(Number(ev.target.value)));
    mapScroll.addEventListener("scroll", () => updateOverview(true), { passive: true });
    // Mobile browsers fire resize when the address bar or keyboard moves; the people chart depends on width only,
    // and rebuilding it then would drop the search field's focus and the chart's scroll position.
    let peopleWidth = innerWidth, peopleResize = 0;
    addEventListener("resize", () => { updateOverview(); updateChip(); updateWorkspaceSticky(); updateDiagramHints(); if (innerWidth !== peopleWidth && mounts.people?.clientWidth) { clearTimeout(peopleResize); peopleResize = setTimeout(() => { peopleWidth = innerWidth; renderPeople(); }, 120); } });
    if (window.ResizeObserver) new ResizeObserver(updateWorkspaceSticky).observe($(".chart-column", m));
    // drag to pan
    let drag = null;
    mapScroll.addEventListener("pointerdown", (ev) => { dragMoved = false; if (ev.target.closest(".node, .connection-hit") || ev.pointerType !== "mouse") return; drag = { x: ev.clientX, s: mapScroll.scrollLeft, moved: false }; });
    // A button released outside the window sends no pointerup; end the drag on the next plain move.
    addEventListener("pointermove", (ev) => { if (!drag) return; if (!(ev.buttons & 1)) { drag = null; mapScroll.classList.remove("dragging"); return; } const dx = ev.clientX - drag.x; if (Math.abs(dx) > 3) { drag.moved = true; mapScroll.classList.add("dragging"); } mapScroll.scrollLeft = drag.s - dx; });
    let dragMoved = false;
    const endDrag = () => { dragMoved = Boolean(drag && drag.moved); drag = null; mapScroll.classList.remove("dragging"); };
    addEventListener("pointerup", endDrag); addEventListener("pointercancel", endDrag);
    // A click on empty map space (not the end of a drag) clears the selection.
    mapScroll.addEventListener("click", (ev) => { if (dragMoved) { dragMoved = false; return; } if (!ev.target.closest(".node, .connection-hit, a, button")) clearSelection(); });
    renderMap(); renderPane();
    mapScroll.scrollLeft = layout.X(DEFAULT_START) - 30; updateOverview();
  }

  /* ---------- routes ---------- */
  // A route step opens with what the work was, then what it changed, so a step never starts mid-thought.
  function routeStepText(e) {
    const lead = firstSentence(e.idea || e.problem);
    return `${lead ? `<p class="step-idea">${prose(lead)}</p>` : ""}${e.changed ? `<p>${prose(e.changed)}</p>` : ""}`;
  }
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
        <h3 tabindex="-1">${esc(t.question || t.title)}</h3>
        <p class="summary">${esc(t.summary || "")}</p>
        <p><a href="#${esc(t.id)}" data-route="${esc(t.id)}">Trace this route on the map ↑</a></p>
        <ol class="steps">${ids.map((id, i) => {
          const e = byId.get(id), prev = ids[i - 1];
          let rel = "";
          if (prev) {
            const f = (e.links || []).find((l) => l.to === prev);
            const b = (byId.get(prev).links || []).find((l) => l.to === id);
            if (f) rel = `${REL[f.type].toLowerCase()} the step above${f.note ? ": " + f.note : ""}`;
            else if (b) rel = `${REL_IN[b.type].toLowerCase()} the step above${b.note ? ": " + b.note : ""}`;
          }
          return `<li><span class="yr">${e.date_sort.slice(0, 4)}</span><span class="rail"><i style="background:${lc(e.lane)}"></i></span><div class="st">${rel ? `<p class="rel">${prose(rel)}</p>` : ""}<a href="#${esc(id)}" data-ev-reveal="${esc(id)}">${esc(e.title)}</a>${routeStepText(e)}</div></li>`;
        }).join("")}</ol>
      </div></div>`;
  }

  /* ---------- people & orgs ---------- */
  // Organisation kind is drawn in one neutral colour (fill strength and hatching), so lane colours mean lanes only.
  const KIND_TONE = { lab: "lab", "nonprofit research": "nonprofit", academic: "academic", government: "government", funder: "other", fellowship: "other" };
  function orgFor(name) { return orgForName(name); }
  const ACADEMIC = /universit|\bmit\b|berkeley|toronto|oxford|alberta|mila|fhi|chai/i, GOVT = /institute.*(nist|security)|caisi|aisi|government|report \(chair\)/i;
  function toneFor(org) {
    const o = orgFor(org);
    if (o && KIND_TONE[o.kind]) return KIND_TONE[o.kind];
    if (GOVT.test(org)) return "government";
    if (ACADEMIC.test(org)) return "academic";
    if (/openai|anthropic|deepmind|google|baidu|xai|meta|superintelligence|keen/i.test(org)) return "lab";
    return "other";
  }
  // Chart labels are 11px in the page's sans face (atlas.css .people-chart .lb); measure them rather than guess.
  let labelCtx = null;
  function measureLabel(text) {
    if (!labelCtx) { labelCtx = document.createElement("canvas").getContext("2d"); if (labelCtx) labelCtx.font = `11px ${getComputedStyle(mounts.people || document.body).getPropertyValue("--sans").trim() || "sans-serif"}`; }
    return labelCtx ? labelCtx.measureText(text).width : text.length * 5.9;
  }
  function shortenLabel(text, room) {
    if (measureLabel(text) <= room) return text;
    let n = text.length - 1;
    while (n >= 3 && measureLabel(`${text.slice(0, n).trimEnd()}…`) > room) n--;
    return n >= 3 ? `${text.slice(0, n).trimEnd()}…` : "";
  }
  function renderPeople() {
    const m = mounts.people;
    if (!m) return;
    if (!D.people.length && !D.orgs.length) { m.innerHTML = ""; return; }
    const previousQuery = $("#atlas-org-search", m)?.value || "";
    const pendingChoice = $("#atlas-profile-select", m)?.dataset.choice || "";
    const chartScroll = $(".people-chart", m)?.scrollLeft || 0, searchFocused = document.activeElement === $("#atlas-org-search", m);
    // On wide screens the profile column is always reserved, so opening or closing a profile never reflows the chart.
    const split = innerWidth > 1050;
    // A hidden panel measures 0 wide; size it from the map's mount, which shares the column, and redraw when the tab opens.
    const mountWidth = m.clientWidth || mounts.map?.clientWidth || innerWidth; m.dataset.width = m.clientWidth ? String(m.clientWidth) : "";
    const available = mountWidth - 25.6;
    const chartWidth = split ? available - Math.max(368, available / 2.55) : mountWidth;
    const A = 1995, NOW = 2026.85, NAME = 148, W = Math.round(innerWidth > 1050 ? chartWidth : Math.max(680, chartWidth)), BAR = 15, GAP = 4;
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
    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Researcher affiliations, 1995 to 2026. Select a name or affiliation to open its profile."><defs><pattern id="atlas-kind-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" style="fill:var(--ink-2);fill-opacity:.06"/><line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--ink-2);stroke-opacity:.5;stroke-width:1.2"/></pattern></defs>`;
    for (let yr = 2000; yr <= 2025; yr += 5) svg += `<line x1="${px(yr)}" x2="${px(yr)}" y1="20" y2="${H}" class="gl"/><text x="${px(yr)}" y="13" text-anchor="middle" class="yr">${yr}</text>`;
    svg += `<line x1="${px(NOW)}" x2="${px(NOW)}" y1="20" y2="${H}" class="now"/><text x="${px(NOW)}" y="13" text-anchor="middle" class="yr">now</text>`;
    people.forEach((p, i) => {
      const top = rows[i], h = p.tracks * (BAR + GAP) - GAP;
      if (i) svg += `<line x1="0" x2="${W}" y1="${top - 5}" y2="${top - 5}" class="sep"/>`;
      svg += `<text x="0" y="${top + 11.5}" class="nm" tabindex="0" role="button" data-profile="person:${esc(personId(p))}" aria-label="Open profile: ${esc(p.name)}">${esc(p.name)}</text>`;
      const byTrack = {};
      p.roles.forEach((r) => {
        r.x1 = px(r.s[0]); r.x2 = px(r.s[1]); r.open = !r.to; r.end = r.x2 + (r.open ? 3.5 : 0); r.barW = Math.max(3, r.x2 - r.x1 - 1.5);
        // A role that began before the axis starts says its real start year, and its bar gets a notch on the left.
        r.clipped = r.s[0] < A;
        r.name = `${r.clipped ? `from ${Math.floor(r.s[0])} · ` : ""}${r.org.replace(/\s*\(.*?\)\s*/g, " ").trim()}`; r.textW = measureLabel(r.name);
        (byTrack[r.track] = byTrack[r.track] || []).push(r);
      });
      // Labels never cross another bar or label on their track: inside the bar, else beside it where the
      // track is free, else shortened into the widest free gap. The full name stays in the title and aria-label.
      Object.values(byTrack).forEach((track) => {
        const occupied = track.map((r) => (r.box = [r.x1, r.end]));
        const free = (a, b) => a >= NAME + 2 && b <= W - 2 && occupied.every(([l, rr]) => b + 3 <= l || a - 3 >= rr);
        const place = (r, label) => { r.label = label; if (label.out) occupied.push([label.a, label.b]); };
        track.forEach((r) => { if (r.textW + 10 <= r.barW) place(r, { text: r.name, x: r.x1 + 5 }); });
        // Open-ended bars can only take a label on their left, so they claim space first.
        [...track.filter((r) => !r.label && r.open), ...track.filter((r) => !r.label && !r.open)].forEach((r) => {
          const w = r.textW;
          if (!r.open && free(r.x2 + 4, r.x2 + 4 + w)) return place(r, { text: r.name, x: r.x2 + 4, out: true, a: r.x2 + 4, b: r.x2 + 4 + w });
          if (free(r.x1 - 4 - w, r.x1 - 4)) return place(r, { text: r.name, x: r.x1 - 4, anchor: "end", out: true, a: r.x1 - 4 - w, b: r.x1 - 4 });
          // Bars on a track touch end to start, so neighbours are told apart by side, not by a coordinate margin.
          const others = occupied.filter((o) => o !== r.box), mid = (r.x1 + r.end) / 2;
          const rightEdge = r.open ? r.x2 + 4 : Math.min(W - 2, ...others.filter(([l, rr]) => l + rr > 2 * mid).map(([l]) => l - 3));
          const leftEdge = Math.max(NAME + 2, ...others.filter(([l, rr]) => l + rr < 2 * mid).map(([, rr]) => rr + 3));
          const slots = [{ room: r.barW - 9, x: r.x1 + 5 }, { room: rightEdge - (r.x2 + 4), x: r.x2 + 4, out: true }, { room: r.x1 - 4 - leftEdge, x: r.x1 - 4, anchor: "end", out: true }].sort((s1, s2) => s2.room - s1.room);
          const text = shortenLabel(r.name, slots[0].room);
          if (text) { const tw = measureLabel(text), s = slots[0]; place(r, { ...s, text, a: s.anchor ? s.x - tw : s.x, b: s.anchor ? s.x : s.x + tw }); }
        });
      });
      p.roles.forEach((r) => {
        const { x1, x2, open } = r, by = top + r.track * (BAR + GAP), tone = toneFor(r.org);
        // Hit areas stop halfway to the neighbouring bars, so a click always selects the bar under the pointer.
        const track = byTrack[r.track], i = track.indexOf(r), prev = track[i - 1], next = track[i + 1], mid = (x1 + r.end) / 2;
        const hitL = Math.max(Math.min(x1 - 4, mid - 8), prev ? (prev.end + x1) / 2 : -Infinity), hitR = Math.min(Math.max(r.end + 4, mid + 8), next ? (r.end + next.x1) / 2 : Infinity);
        svg += `<g class="role${r.uncertain ? " unsure" : ""}" tabindex="0" role="button" data-profile="person:${esc(personId(p))}" data-affiliation="${r.index}" data-org-key="${esc(orgKeyFor(r.org) || "")}" aria-label="${esc(p.name)} at ${esc(r.org)}, ${esc(roleDate(r.from) || "start unknown")} to ${esc(roleDate(r.to) || "present")}${r.uncertain ? ", dates uncertain" : ""}. Open affiliation details."><rect class="role-hit" x="${hitL}" y="${by - GAP / 2}" width="${Math.max(1, hitR - hitL)}" height="${BAR + GAP}"/><rect class="role-bar k-${tone}" x="${x1}" y="${by}" width="${r.barW}" height="${BAR}" rx="2.5"/>`;
        if (open) svg += `<path d="M${x2 - 1.5},${by} l5,${BAR / 2} l-5,${BAR / 2}" class="tip-arrow"/>`;
        if (r.clipped) svg += `<path d="M${x1 + 1.5},${by} l-5,${BAR / 2} l5,${BAR / 2}" class="tip-arrow"/>`;
        if (r.label) svg += `<text x="${r.label.x}" y="${by + 11}"${r.label.anchor ? ` text-anchor="${r.label.anchor}"` : ""} class="lb${r.label.out ? " out" : ""}">${esc(r.label.text)}</text>`;
        svg += `</g>`;
      });
    });
    svg += `</svg>`;
    const kinds = [["lab", "Lab"], ["nonprofit", "Nonprofit research"], ["academic", "Academic"], ["government", "Government"], ["other", "Other"]];
    m.innerHTML = `<div class="profile-picker"><label for="atlas-org-search">Find a person or organisation</label><input id="atlas-org-search" type="search" placeholder="Name, affiliation or research area" aria-controls="atlas-profile-select"><span id="atlas-org-count" aria-live="polite"></span><div class="profile-choice"><select id="atlas-profile-select" aria-label="Choose a person or organisation"></select><button type="button" class="atlas-btn" data-act="open-profile-choice">Open profile</button></div></div><div class="people-workspace${split ? " has-profile" : ""}"><div>${people.length ? `<div class="people-chart">${svg}</div><div class="legend">${kinds.map(([t, n]) => `<span><i class="k-${t}"></i>${n}</span>`).join("")}</div>` : ""}</div><div class="people-profile-dock"></div></div>`;
    // Reuse the single inspector even when it is docked outside this mount.
    profilePanel ||= document.createElement("section"); profilePanel.className = "profile-panel"; profilePanel.setAttribute("aria-label", "Selected profile");
    const filterProfiles = () => {
      const words = $("#atlas-org-search", m).value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const list = (words.length ? allProfileRecords : profileRecords).filter((r) => words.every((w) => r.text.toLowerCase().includes(w)));
      const curated = new Set(profileRecords.map((r) => r.key));
      const select = $("#atlas-profile-select", m);
      select.innerHTML = list.length ? '<option value="">Choose a profile…</option>' + ["Person", "Organisation"].map((kind) => `<optgroup label="${kind === "Person" ? "People" : "Organisations"}">${list.filter((r) => r.kind === kind).sort((a, b) => Number(curated.has(b.key)) - Number(curated.has(a.key)) || a.name.localeCompare(b.name)).map((r) => `<option value="${esc(r.key)}">${esc(r.name)}</option>`).join("")}</optgroup>`).join("") : '<option value="">No matching profiles</option>';
      // The picker shows the open profile, or the reader's unopened choice; with neither it shows its prompt, not a stale name.
      const choice = select.dataset.choice || state.profile || "";
      select.value = list.some((r) => r.key === choice) ? choice : "";
      select.disabled = !list.length; $("[data-act=\"open-profile-choice\"]", m).disabled = !list.length;
      $("#atlas-org-count", m).textContent = `${list.length} profile${list.length === 1 ? "" : "s"}`;
    };
    $("#atlas-profile-select", m).dataset.choice = pendingChoice;
    $("#atlas-profile-select", m).addEventListener("change", (ev) => { ev.target.dataset.choice = ev.target.value; });
    $("#atlas-org-search", m).value = previousQuery;
    $("#atlas-org-search", m).addEventListener("input", filterProfiles); filterProfiles(); renderProfile();
    const chart = $(".people-chart", m); if (chart) chart.scrollLeft = chartScroll;
    if (searchFocused) $("#atlas-org-search", m).focus({ preventScroll: true });
  }

  let profilePanel, profileTrigger = null;
  function profileRecord(key) {
    if (!key) return null;
    const split = key.indexOf(":"), kind = key.slice(0, split), id = key.slice(split + 1);
    return kind === "person" ? personById.get(id) : kind === "org" ? orgById.get(id) : null;
  }
  const roleDates = (a) => `${roleDate(a.from) || "start unknown"}–${roleDate(a.to) || "present"}${a.uncertain ? " (dates uncertain)" : ""}`;
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
    const workspace = $(".people-workspace", mounts.people);
    if (workspace && workspace.classList.contains("has-profile") !== innerWidth > 1050) { renderPeople(); return; }
    const dock = active && state.profileDock === "timeline" && timelineDock ? timelineDock : peopleDock;
    // The dock stays visible beside the chart on wide screens; on narrow ones it shows only when there is something to say,
    // including the note that the profile is open beside the event card.
    peopleDock.hidden = !(active || innerWidth > 1050);
    // Below the split width the profile opens as a sheet over the chart instead of below all its rows, so nothing scrolls away.
    const sheet = active && dock === peopleDock && innerWidth <= 1050;
    peopleDock.classList.toggle("is-sheet", sheet); workspace?.classList.toggle("sheet-open", sheet);
    dock.appendChild(profilePanel); if (timelineDock) {
      timelineDock.hidden = dock !== timelineDock || !active;
      timelineDock.querySelector(".profile-return")?.remove();
      $(".pane-host", mounts.map).hidden = active && dock === timelineDock; updateChip();
      if (active && dock === timelineDock) {
        const back = document.createElement("button"); back.type = "button"; back.className = "text-button profile-return"; back.dataset.act = "return-event";
        back.textContent = state.selected ? `← Return to ${byId.get(state.selected).title}` : "← Return to event browser";
        timelineDock.insertBefore(back, profilePanel);
      }
    }
    if (dock !== peopleDock) peopleDock.innerHTML = '<p class="profile-placeholder">The selected profile is open beside the event card. Select a name here to bring it alongside this chart.</p>';
    else peopleDock.querySelector(":scope > .profile-placeholder")?.remove();
    document.querySelectorAll("[data-profile]").forEach((n) => {
      const selected = n.dataset.profile === state.profile;
      n.classList.toggle("profile-selected", selected && (n.dataset.affiliation == null || Number(n.dataset.affiliation) === state.affiliationIndex));
      n.setAttribute("aria-expanded", String(selected)); n.setAttribute("aria-controls", "atlas-profile");
    });
    // An open organisation lights every affiliation bar that opens it.
    mounts.people.querySelectorAll(".people-chart [data-org-key]").forEach((n) => n.classList.toggle("org-selected", Boolean(state.profile) && n.dataset.orgKey === state.profile));
    profilePanel.id = "atlas-profile";
    if (!active) { profilePanel.removeAttribute("aria-labelledby"); profilePanel.innerHTML = '<div class="profile-placeholder"><h3>People and organisations</h3><p>Select a name or bar to open a profile.</p></div>'; return; }
    const isPerson = state.profile.startsWith("person:");
    if (dock === peopleDock && matchMedia("(min-width: 1051px)").matches) {
      const bottom = $(".people-workspace", mounts.people).getBoundingClientRect().bottom;
      profilePanel.style.setProperty("--profile-max", `${Math.max(160, Math.min(innerHeight - workspaceInset() - 16, bottom - workspaceInset()))}px`);
    }
    const body = isPerson ? `${!record.known_for && !(record.affiliations || []).length ? '<p class="profile-kind">Related work in this atlas</p>' : ""}${record.known_for ? `<p>${esc(record.known_for)}</p>` : ""}${(record.affiliations || []).length ? '<h4>Affiliations</h4>' : ""}<ul class="profile-affiliations">${(record.affiliations || []).map((a, i) => `<li${state.affiliationIndex === i ? ' class="current"' : ""}>${orgLink(a.org)}<span class="num">${esc(roleDates(a))}</span></li>`).join("")}</ul>${relatedEvents([...(record.key_event_ids || []), ...D.events.filter((e) => (e.people || []).some((name) => name.toLowerCase() === record.name.toLowerCase())).map((e) => e.id)])}${profileSources(record.sources)}` : `<p class="profile-kind">${esc(record.kind || "Organisation")}${record.founded ? ` · Founded ${esc(roleDate(record.founded))}` : record.activity_since ? ` · Active since ${esc(record.activity_since)}` : ""}</p>${record.founded_context ? `<p class="date-context">${esc(record.founded_context)}</p>` : ""}${(record.founders || []).length ? `<p class="profile-founders">Founders: ${record.founders.map(personLink).join(", ")}</p>` : ""}${record.historical_role ? `<p>${esc(record.historical_role)}</p>` : ""}${(record.research_focus || []).length ? `<p class="profile-focus">Research: ${record.research_focus.map(esc).join(", ")}.</p>` : ""}${record.status_as_of_2026_11 ? `<p class="now">As of November 2026: ${esc(record.status_as_of_2026_11)}</p>` : ""}${(record.affiliations || []).length ? `<h4>People in this atlas</h4><ul class="profile-affiliations">${[...record.affiliations].sort((a, b) => (yearOfStr(a.from) || 9999) - (yearOfStr(b.from) || 9999) || a.person.localeCompare(b.person)).map((a) => { const role = (String(a.org).match(/\(([^)]*)\)\s*$/) || [])[1]; return `<li>${personLink(a.person)}${role ? ` <span class="profile-role">${esc(role)}</span>` : ""}<span class="num">${esc(roleDates(a))}</span></li>`; }).join("")}</ul>` : ""}${relatedEvents(record.key_event_ids || [])}${(record.key_event_ids || []).length ? `<button type="button" class="text-button" data-org="${esc(record.id)}">Show related events on the map →</button>` : ""}${profileSources(record.sources)}`;
    profilePanel.innerHTML = `<div class="profile-head"><div><span class="eyebrow">${isPerson ? "Person" : "Organisation"}</span><h3 id="atlas-profile-title" tabindex="-1">${esc(record.name)}</h3></div><button type="button" class="profile-close" data-act="close-profile" aria-label="Close profile">×</button></div><div class="profile-body">${body}</div>`;
    profilePanel.setAttribute("aria-labelledby", "atlas-profile-title"); updateWorkspaceSticky();
  }
  function openProfile(key, options = {}) {
    if (!profileRecord(key)) return;
    if (options.history !== false) saveHistory(true, true);
    // The same profile in another dock (beside a card instead of the chart) is a new view and gets its own history entry.
    const same = state.profile === key && state.profileDock === (options.dock || "people"), pageY = scrollY, fromTab = state.tab;
    const picker = $("#atlas-profile-select", mounts.people); if (picker) { picker.dataset.choice = key; picker.value = [...picker.options].some((o) => o.value === key) ? key : ""; }
    state.profile = key; state.affiliationIndex = options.affiliationIndex == null ? null : Number(options.affiliationIndex);
    state.profileDock = options.dock || "people"; setPanel(state.profileDock === "people" ? "people" : "map"); if (options.trigger && !options.trigger.closest(".profile-panel")) profileTrigger = options.trigger;
    // Only the panel and the selection marks change; rebuilding the chart here moved bars under the pointer and reset its scroll.
    renderProfile();
    profilePanel.scrollTop = 0; hideTip();
    // On the people tab the profile sits beside the chart or, on narrow screens, in a sheet over it. Opening one from the tab
    // (a bar, a name, a link inside another profile) keeps the page where it is; it scrolls only if the side panel is out of view.
    const inPeople = state.profileDock === "people", sheet = inPeople && innerWidth <= 1050;
    if (inPeople && fromTab === "people") scrollTo({ top: pageY, behavior: "auto" });
    if (options.history !== false) saveHistory(same);
    if (options.focus !== false || options.reveal) {
      const heading = $("h3", profilePanel), box = profilePanel.getBoundingClientRect();
      if (sheet) {
        if (fromTab !== "people") revealReaderTarget(document.getElementById(tabIds.people));
        // A bar low on the screen moves up just enough to stay visible above the sheet.
        else if (options.trigger?.closest(".people-chart")) { const below = options.trigger.getBoundingClientRect().bottom - profilePanel.getBoundingClientRect().top + 16; if (below > 0) scrollBy({ top: below, behavior: SMOOTH }); }
      }
      else if (!(inPeople && box.top < innerHeight && box.bottom > workspaceInset())) revealReaderTarget(profilePanel);
      if (options.focus !== false) heading.focus({ preventScroll: true });
    }
  }
  function closeProfile(options = {}) {
    if (!state.profile) return;
    const pageY = scrollY, returnToEvent = state.profileDock === "timeline" && state.selected, preserveChart = state.profileDock === "people";
    state.profile = null; state.affiliationIndex = null;
    const picker = $("#atlas-profile-select", mounts.people); if (picker) { picker.dataset.choice = ""; picker.value = ""; }
    renderProfile();
    hideTip();
    if (options.history !== false) saveHistory();
    if (options.focus !== false) {
      const trigger = profileTrigger && profileTrigger.isConnected ? profileTrigger : profileTrigger?.dataset.profile ? [...mounts.people.querySelectorAll("[data-profile]")].find(n => n.dataset.profile === profileTrigger.dataset.profile && n.dataset.affiliation === profileTrigger.dataset.affiliation) : null;
      if (returnToEvent) {
        revealReaderTarget($(".pane .head", mounts.map));
        (trigger || $(".pane h3", mounts.map))?.focus({ preventScroll: true });
      } else (trigger || $("#atlas-profile-select", mounts.people))?.focus({ preventScroll: true });
    }
    if (preserveChart) scrollTo({ top: pageY, behavior: "auto" });
    hideTip();
  }
  function previewProfile(trigger, ev) {
    if (!trigger || !trigger.closest(".atlas")) return;
    showTip(ev, profilePreview(trigger.dataset.profile, trigger.dataset.affiliation)); trigger.setAttribute("aria-describedby", "atlas-preview");
  }

  /* ---------- index by era ---------- */
  function renderIndex() {
    // Compatibility for older source posts: the chronological browser now lives beside the map.
    if (mounts.index) mounts.index.innerHTML = '<p><a href="#every-event-by-era">Browse events by era above the map ↑</a></p>';
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-ev],[data-ev-reveal],[data-ev-card],[data-org],[data-route],[data-route-show],[data-route-stop],[data-route-step],.connection-hit,[data-explain-connection],[data-lane],[data-nav],[data-zoom],[data-act],[data-profile],[data-era]");
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
    // A people-tab profile stays open when one of its events opens on the map, so the tab shows it again on return.
    else if (d.ev || d.evReveal || d.evCard) select(d.ev || d.evReveal || d.evCard, { card: true });
    else if (d.nav) step(Number(d.nav), state.selected, { card: true });
    else if (d.lane) {
      state.lanes.has(d.lane) ? state.lanes.delete(d.lane) : state.lanes.add(d.lane);
      if (!state.lanes.size) state.lanes.add(d.lane);
      const closed = reconcileSelection(); syncControls(); renderMap(); renderPane(); saveHistory(!closed);
    } else if (d.zoom) {
      if (t.getAttribute("aria-disabled") === "true") return;
      const center = yearAtX(mapScroll.scrollLeft + mapScroll.clientWidth / 2);
      state.zoom = d.zoom > 0 ? ZOOM_STEPS.find((z) => z > state.zoom + 1e-9) ?? ZOOM_MAX : [...ZOOM_STEPS].reverse().find((z) => z < state.zoom - 1e-9) ?? ZOOM_MIN;
      renderMap(); syncControls(); jumpYear(center); saveHistory(true);
    } else if (d.routeShow) {
      state.routeShown = d.routeShow; renderRoutes(); saveHistory(true, true);
      const heading = $(".route-body h3", mounts.routes), rect = heading.getBoundingClientRect();
      if (matchMedia("(max-width: 860px)").matches || rect.top < workspaceInset() || rect.bottom > innerHeight) {
        revealReaderTarget($(".route-body", mounts.routes));
        heading.focus({ preventScroll: true });
      }
    }
    else if (d.route) {
      const route = D.threads.find((x) => x.id === d.route); if (!route) return;
      traceRoute(route);
    } else if (d.org) {
      const org = orgById.get(d.org); if (!org) return;
      saveHistory(true, true); setPanel("map"); state.org = org; state.route = null; state.query = ""; state.queryInput = ""; state.selected = null; state.era = null; state.profile = null; renderProfile();
      D.events.filter((e) => orgMatches(e, org)).forEach((e) => state.lanes.add(e.lane));
      syncControls(); renderMap(); renderPane(); const first = matches()[0]; if (first) scrollMapTo(first.id, false); updateOverview(); saveHistory();
      $(".context", mounts.map).scrollIntoView({ behavior: SMOOTH, block: "start" });
    } else if (d.act === "leave-route") {
      saveHistory(true, true); state.route = null;
      syncControls(); renderMap(); renderPane(); saveHistory();
      $(".pane h3", mounts.map)?.focus({ preventScroll: true });
    } else if (d.act === "close-connection") closeConnection();
    else if (d.act === "open-profile-choice") { const picker = $("#atlas-profile-select", mounts.people); if (picker && picker.value) openProfile(picker.value, { trigger: t, dock: "people" }); }
    else if (d.act === "close-profile" || d.act === "return-event") closeProfile();
    else if (d.act === "clear") resetView();
    else if (d.act === "deselect") clearSelection(true);
    else if (d.act === "locate") {
      scrollMapTo(state.selected, false); updateOverview();
      $(".chart-column", mounts.map).scrollIntoView({ behavior: SMOOTH, block: "start" });
      const node = mapSvg.querySelector(".node.sel"); if (node) node.focus({ preventScroll: true });
    }
  });
  // A route lights its events on the map and opens its first stop. From a link it scrolls to the map; from the URL it only sets state.
  function traceRoute(route, opts = {}) {
    if (opts.history !== false) saveHistory(true, true);
    state.route = route; state.org = null; state.query = ""; state.queryInput = ""; state.selected = null; state.connection = null; connectionHover = null; connectionFocus = null; state.focus = route.event_ids[0]; state.era = null;
    if (state.profile && state.profileDock === "timeline") { state.profile = null; state.affiliationIndex = null; renderProfile(); }
    route.event_ids.forEach((id) => { const e = byId.get(id); if (e) state.lanes.add(e.lane); });
    const first = routeAvailable()[0];
    if (first) select(first, { history: false, keepEra: true });
    else { syncControls(); renderMap(); renderPane(); }
    updateOverview(); if (opts.history !== false) saveHistory();
    if (opts.scroll === false) return;
    $(".controls", mounts.map).scrollIntoView({ behavior: SMOOTH, block: "start" });
    const firstNode = mapSvg.querySelector('.node[tabindex="0"]'); if (firstNode) firstNode.focus({ preventScroll: true });
    hideTip();
  }
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
    if (ev.key === "Escape") {
      hideTip();
      // In a field with text, Escape first clears the field (the browser does this for search inputs) and nothing else. A slider always has a value, so it is exempt.
      if (/INPUT|TEXTAREA/.test(ev.target.tagName) && ev.target.type !== "range" && ev.target.value) return;
      // Escape acts only on what is on screen: the profile's own tab, and connections on the map tab.
      const profileShown = state.profile && state.tab === (state.profileDock === "timeline" ? "map" : "people");
      if (profileShown) { ev.preventDefault(); closeProfile(); return; }
      if (state.connection && state.tab === "map") { ev.preventDefault(); closeConnection(); return; }
      if (state.selected && state.tab === "map" && !/INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) { ev.preventDefault(); clearSelection(true); return; }
    }
    const connection = ev.target.closest(".connection-hit");
    if (connection && ["Enter", " "].includes(ev.key)) { ev.preventDefault(); inspectConnection(connection.dataset.connection, connection); return; }
    const profileControl = ev.target.closest("[data-profile]");
    if (profileControl && !/^(A|BUTTON)$/.test(profileControl.tagName) && ["Enter", " "].includes(ev.key)) { ev.preventDefault(); profileControl.dispatchEvent(new MouseEvent("click", { bubbles: true })); return; }
    if (!mapScroll || !mapScroll.contains(ev.target) || /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
    const node = ev.target.closest(".node"), from = node ? node.dataset.eventId : state.selected || state.focus;
    // Arrow keys walk the map one event at a time; after the first open card they rewrite one history entry, so Back skips the walk.
    if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") { ev.preventDefault(); step(ev.key === "ArrowRight" ? 1 : -1, from, { focus: true, replace: true }); }
    if (ev.key === "Home" || ev.key === "End") { const seq = stepSequence(); if (seq.length) { ev.preventDefault(); select(seq[ev.key === "Home" ? 0 : seq.length - 1], { focus: true, keepEra: Boolean(state.route), replace: true }); } }
  });

  mountMap(); renderRoutes(); renderPeople(); renderIndex();
  function fromHash() {
    let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
    const section = Object.keys(tabIds).find(k => tabIds[k] === id);
    if (section) { setPanel(section); return; }
    const [routeId, stop] = id.split("/");
    const route = D.threads.find((t) => t.id === routeId);
    if (route) {
      // "#thread-id" starts the route (again); "#thread-id/event-id" opens that stop of it.
      if (state.route !== route || (!stop && state.selected !== routeAvailable()[0])) traceRoute(route, { history: false, scroll: false });
      if (stop && route.event_ids.includes(stop) && state.selected !== stop) select(stop, { history: false, keepEra: true, card: true });
      return;
    }
    const profile = profileFromHash(id);
    if (profile && profileRecord(profile) && state.profile !== profile) openProfile(profile, { history: false, focus: false, reveal: true, dock: "people" });
    else if (byId.has(id) && (id !== state.selected || (state.profile && state.profileDock === "timeline") || state.tab !== "map")) select(id, { history: false, card: true });
  }
  function restoreSnapshot(saved) {
    if (!saved) return false;
    state.selected = byId.has(saved.selected) ? saved.selected : null; state.focus = state.selected;
    const connection = connectionByKey.get(saved.connection);
    state.connection = connection && [connection.from, connection.to].includes(state.selected) ? saved.connection : null; connectionHover = null; connectionFocus = null; connectionTrigger = null;
    state.route = D.threads.find((t) => t.id === saved.route) || null; state.org = orgById.get(saved.org) || null;
    state.query = saved.query || ""; state.queryInput = saved.queryInput == null ? state.query : saved.queryInput; state.zoom = saved.zoom || 1;
    state.lanes = new Set(saved.lanes || D.lanes.map((l) => l.id));
    state.era = Number.isInteger(saved.era) && D.eras[saved.era] ? saved.era : null;
    state.profile = profileRecord(saved.profile) ? saved.profile : null; state.profileDock = saved.profileDock || "people"; state.affiliationIndex = saved.affiliationIndex == null ? null : saved.affiliationIndex;
    state.routeShown = saved.routeShown || state.routeShown;
    preservedMapScroll = saved.scrollLeft || 0;
    setPanel(saved.tab || (state.profile && state.profileDock === "people" ? "people" : "map"));
    preservedMapScroll = saved.scrollLeft || 0;
    const picker = $("#atlas-profile-select", mounts.people); if (picker) { picker.dataset.choice = ""; picker.value = [...picker.options].some((o) => o.value === state.profile) ? state.profile : ""; }
    syncControls(); renderMap(); renderPane(); renderProfile(); renderRoutes(); mapScroll.scrollLeft = saved.scrollLeft || 0; updateOverview();
    const list = $(".event-scroll-list", mounts.map); if (list) list.scrollTop = saved.listScrollTop || 0;
    return true;
  }
  // Back and Forward fire popstate and then hashchange; once the snapshot is restored, the hash has nothing left to do.
  let restoredHash = null;
  addEventListener("popstate", (ev) => { restoredHash = restoreSnapshot(ev.state && ev.state.atlas) ? location.hash : (fromHash(), null); });
  addEventListener("hashchange", () => { if (restoredHash === location.hash) { restoredHash = null; return; } restoredHash = null; fromHash(); saveHistory(true, true); });
  // MathJax loads after this script: once it is ready, redraw the parts that show formulas.
  addEventListener("atlas-math-ready", () => {
    document.head.appendChild(MathJax.svgStylesheet());
    const inPane = $(".pane-host", mounts.map)?.contains(document.activeElement);
    renderPane(); renderRoutes();
    if (inPane) $(".pane h3", mounts.map)?.focus({ preventScroll: true });
  });
  setPanel("map");
  const restoredOnLoad = restoreSnapshot(history.state && history.state.atlas);
  fromHash(); saveHistory(true, true);
  // A fresh load of "#thread-id" has no scroll position to restore, so bring the route's map into view.
  if (!restoredOnLoad && state.route && state.tab === "map" && location.hash.slice(1) === state.route.id) $(".controls", mounts.map).scrollIntoView({ block: "start" });
})();
