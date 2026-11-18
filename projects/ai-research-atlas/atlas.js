/* AI Research Atlas — renders into mount points: <div class="atlas" data-atlas="map|routes|people|index">.
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

  // Events use three marker sizes. Unknown importance defaults to the middle size.
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
  const curatedProfileKeys = new Set([
    ...D.people.map((p) => `person:${personId(p)}`),
    ...D.orgs.map((o) => `org:${o.id}`),
  ]);
  const profileRecords = [
    ...[...personById].map(([id, p]) => ({ key: `person:${id}`, name: p.name, kind: "Person", indexText: [p.name, p.known_for, ...(p.affiliations || []).map((a) => a.org)] })),
    ...[...orgById].map(([id, o]) => ({ key: `org:${id}`, name: o.name, kind: "Organisation", indexText: [o.name, ...(o.aliases || []), ...(o.founders || []), o.historical_role, ...(o.research_focus || []), o.kind] })),
  ];
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
  if (D.events.length) mounts.map?.closest(".atlas-tabs-workspace")?.removeAttribute("hidden");

  let preservedMapScroll = 0;
  const tabIds = { map: "the-map", routes: "reading-routes", people: "institutions-and-people" };
  function setPanel(name) {
    if (!tabIds[name]) return;
    if (state.tab === "map" && mapScroll) preservedMapScroll = mapScroll.scrollLeft;
    state.tab = name;
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
    if (panel && panel.getBoundingClientRect().top < workspaceInset()) revealReaderTarget(panel, "instant");
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
  function normalizeSearch(text) {
    return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l")
      .replace(/[‐‑‒–—]/g, "-").replace(/[’‘]/g, "'");
  }

  // Index on first search. Redrawing the map and its overview consults each card several times.
  const eventSearchIndex = new Map();
  function eventSearchText(e) {
    if (eventSearchIndex.has(e.id)) return eventSearchIndex.get(e.id);
    const organisations = D.orgs.filter((o) => orgMatches(e, o)).flatMap((o) => [o.name, ...(o.aliases || [])]);
    const researchers = D.people.filter((p) => (p.key_event_ids || []).includes(e.id)).map((p) => p.name);
    const fields = [e.title, e.label, fmtDate(e), e.date, plainText(e.problem), plainText(e.idea), plainText(e.changed), plainText(e.limits),
      ...(e.people || []), ...(e.orgs || []), ...(e.tags || []), ...(e.terms || []).flatMap((t) => [plainText(t.term), plainText(t.def)]),
      ...organisations, ...researchers];
    const text = normalizeSearch(fields.filter(Boolean).join(" "));
    eventSearchIndex.set(e.id, text);
    return text;
  }

  let previousQuery, queryWords;
  function textMatches(e, query) {
    if (!query) return true;
    if (previousQuery !== query) {
      previousQuery = query;
      queryWords = normalizeSearch(query).trim().split(/\s+/);
    }
    const text = eventSearchText(e);
    return queryWords.every((word) => text.includes(word));
  }
  const SMOOTH = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  const splitWorkspace = matchMedia("(min-width: 1051px)");
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
  const SEG = [[1940, 1990, 8], [1990, 2010, 20], [2010, 2017, 56], [2017, 2022, 138], [2022, 2027, 220]];
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
  const CMP_TOP = 26, CMP_H = 96, AX_TOP = CMP_TOP + CMP_H + 6, LANES_TOP = AX_TOP + 32;
  const NODE_RADII = [0, 3, 4.2, 5.6];

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
      if (state.route && list.length) select(routeAvailable()[0], { history: false, keepEra: true });
      else { renderMap(); renderPane(); }
    } else { renderMap(); renderPane(); }
    if (index != null && layout) { const [a, b] = eraRange(index); mapScroll.scrollLeft = Math.max(0, layout.X(a) - 12); if (layout.X(b) - layout.X(a) < mapScroll.clientWidth) jumpYear((a + b) / 2); }
    updateOverview(); saveHistory();
  }
  // Only labels for an opened event and its neighbors may need to fit around already packed marks.
  function fitLabel(label, room, measure) {
    if (measure(label) <= room) return label;
    let t = label;
    while (t.length > 3 && measure(t + "…") > room) t = t.slice(0, -1);
    return t.length > 3 ? t.trimEnd() + "…" : "";
  }
  const mapLabelMeasure = document.createElement("canvas").getContext("2d");
  const mapLabelWidths = new Map();
  function mapLabelWidth(label, font) {
    if (!mapLabelMeasure) return textW(label, 12, font.startsWith("600"));
    const key = font + ":" + label;
    if (!mapLabelWidths.has(key)) {
      mapLabelMeasure.font = font;
      mapLabelWidths.set(key, mapLabelMeasure.measureText(label).width);
    }
    return mapLabelWidths.get(key);
  }
  function computeLayout() {
    const evs = visible();
    const X = makeX(Y0, 24);
    let width = Math.ceil(X(2027.1) + 40);
    const labelMin = state.zoom >= 1.5 ? 2 : 3;
    const fontFamily = getComputedStyle(mapSvg).getPropertyValue("--sans").trim() || "sans-serif";
    let y = LANES_TOP;
    const lanes = [], pos = new Map();
    const routeIds = state.route ? new Set(state.route.event_ids) : null;
    const selectedIds = state.selected && !state.query && !state.route && !state.org ? new Set([
      state.selected, ...(byId.get(state.selected).links || []).map((l) => l.to), ...(incoming.get(state.selected) || []).map((l) => l.from),
    ]) : null;
    for (const lane of D.lanes) {
      if (!state.lanes.has(lane.id)) continue;
      const items = evs.filter((e) => e.lane === lane.id).map((e) => {
        const onRoute = routeIds?.has(e.id);
        const reserve = routeIds ? onRoute : lit(e) && e.importance >= labelMin;
        const label = e.id === state.selected || (selectedIds ? selectedIds.has(e.id) : reserve);
        const x = X(yearOf(e)), radius = onRoute ? 7.5 : NODE_RADII[e.importance];
        const font = `${e.importance === 3 ? 600 : 400} 12px ${fontFamily}`;
        return { e, x, radius, measure: (s) => mapLabelWidth(s, font), reserve, label };
      }).sort((a, b) => Number(b.reserve) - Number(a.reserve) || a.x - b.x);
      // Reserve the default labels first, then place other markers in the gaps. Card selection
      // changes which labels are visible without moving any dots.
      const rows = [];
      for (const p of items) {
        const { e, x, radius, reserve, measure } = p;
        const mark = radius + 2;
        const labelEnd = reserve ? radius + 5 + measure(e.label) + 2 : mark;
        const right = { lo: x - mark, hi: x + labelEnd, side: 1 };
        const left = { lo: x - labelEnd, hi: x + mark, side: -1 };
        const fits = (row, bounds) => row.every((q) => q.hi + 3 <= bounds.lo || bounds.hi + 3 <= q.lo);
        let row, bounds;
        for (const candidate of rows) {
          if (fits(candidate, right)) { row = candidate; bounds = right; break; }
          if (reserve && left.lo >= 4 && fits(candidate, left)) { row = candidate; bounds = left; break; }
        }
        if (!row) { row = []; rows.push(row); bounds = right; }
        Object.assign(p, bounds);
        row.push(p);
        width = Math.max(width, Math.ceil(p.hi + 8));
        pos.set(e.id, p);
      }
      const top = y;
      y += 5;
      for (const row of rows) {
        const pitch = row.some((p) => p.reserve) ? 19 : 16;
        row.sort((a, b) => a.x - b.x).forEach((p, i) => {
          p.y = y + pitch / 2;
          p.prev = row[i - 1];
          p.next = row[i + 1];
        });
        y += pitch;
      }
      y = Math.max(top + 44, y + 5);
      lanes.push({ lane, top });
    }
    return { evs, X, width, height: y + 6, lanes, pos, labels: [], axisLabels: [] };
  }

  function renderMap() {
    if (!mapSvg) return;
    if (tipOwner && mapSvg.contains(tipOwner)) hideTip();
    layout = computeLayout();
    const { X, width, height, lanes, pos, evs } = layout;
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
        const text = p.model.replace(/ \(.*\)$/, "").replace(" 175B", "") + " · " + h100(p.flop);
        q.text = el("text", { class: "cmp-text" }, cmpG, text);
      }
      return q;
    });
    // Break marks identify changes in pixels per year. Keep their years even at the widest zoom.
    const breakYears = SEG.slice(1).map(([year]) => year).filter((year) => year > Y0);
    const axis = el("g", { class: "ax", "aria-hidden": "true" }, svg);
    const ticks = [];
    for (let yr = Math.ceil(Y0); yr <= 2026; yr++) {
      const x = X(yr);
      const yearSpan = X(yr + 1) - x;
      const preferredStep = yr < 1990 ? 10 : yr < 2010 ? 5 : 1;
      const step = [10, 5, 2].find((n) => n <= preferredStep && n * yearSpan <= 140) || 1;
      if (yr % step) continue;
      if (!breakYears.includes(yr) && breakYears.some((year) => Math.abs(X(year) - x) < 38)) continue;
      if (ticks.length && x - ticks.at(-1).x < 38) continue;
      ticks.push({ x, yr, yearSpan });
    }
    for (const { x, yr, yearSpan } of ticks) {
      el("line", { x1: x, x2: x, y1: CMP_TOP, y2: AX_TOP - 5, "stroke-dasharray": "1 4" }, axis);
      el("line", { x1: x, x2: x, y1: LANES_TOP, y2: height, "stroke-dasharray": "1 4" }, axis);
      const yearLabel = el("text", { x, y: AX_TOP + 20, "text-anchor": "middle" }, axis, yr);
      layout.axisLabels.push({ x, extent: 18, el: yearLabel, shown: true });
      // Long years need calendar ticks between January labels to fit in a narrow scrolling window.
      if (yearSpan <= 140 && yr < 2022) continue;
      const monthStep = [6, 3, 2].find((n) => n * yearSpan / 12 <= 130) || 1;
      for (let month = monthStep; month < 12; month += monthStep) {
        const monthX = X(yr + month / 12);
        el("line", { x1: monthX, x2: monthX, y1: AX_TOP, y2: AX_TOP + 4 }, axis);
        const label = el("text", { x: monthX, y: AX_TOP + 20, "text-anchor": "middle", style: "font-size:11px;font-weight:400" }, axis, `${MON[month]} ${yr}`);
        layout.axisLabels.push({ x: monthX, extent: 25, el: label, shown: true });
      }
    }
    let previousX = 0;
    for (const x of [...breakYears.map(X), width + 6]) {
      el("line", { x1: previousX, x2: x - 6, y1: AX_TOP, y2: AX_TOP }, axis);
      previousX = x + 6;
    }
    for (const { x, yr } of ticks) {
      if (breakYears.includes(yr)) {
        el("path", { d: `M${x - 5},${AX_TOP + 4} l4,-8 M${x + 1},${AX_TOP + 4} l4,-8`, class: "ax-break" }, axis);
      } else {
        el("line", { x1: x, x2: x, y1: AX_TOP, y2: AX_TOP + 5 }, axis);
      }
    }

    // lane rules + labels column
    labelsCol.innerHTML = "";
    labelsCol.style.height = height + "px";
    labelsCol.insertAdjacentHTML("beforeend", `<div class="lab compute-heading" style="top:0px"><b>Compute</b><span class="compute-unit">FLOP<i class="h100"> · H100 h</i></span></div><div class="cmp-ticks"></div>`);
    cmp.ticks = labelsCol.querySelector(".cmp-ticks");
    labelsCol.querySelector(".compute-heading").addEventListener("mouseenter", (ev) => showTip(ev, "Training compute as estimated FLOP and as time on one H100 GPU; open “Training compute · data and scale” under the map for the values and conversion. Divide by the number of GPUs for wall-clock time. Epoch AI has no estimate for many frontier models from 2025 on, so the most recent part of the line rests on few models."));
    labelsCol.querySelector(".compute-heading").addEventListener("mousemove", moveTip);
    labelsCol.querySelector(".compute-heading").addEventListener("mouseleave", hideTip);
    labelsCol.insertAdjacentHTML("beforeend", `<div class="lab time-heading" style="top:${AX_TOP + 2}px" title="Slashes mark changes in the spacing between years"><b>Years</b><span>// Break</span></div>`);
    lanes.forEach((L) => {
      el("line", { x1: 0, x2: width, y1: L.top, y2: L.top, class: "lane-rule" }, svg);
      labelsCol.insertAdjacentHTML("beforeend", `<div class="lab lane-label" style="top:${L.top + 6}px"><b style="color:${lc(L.lane.id)}">${esc(L.lane.short || L.lane.title)}</b></div>`);
    });
    labelsCol.insertAdjacentHTML("beforeend", `<div style="position:absolute;left:0;right:0;top:${LANES_TOP - 1}px;border-top:1px solid var(--rule)"></div>`);

    // connections
    const gArc = el("g", {}, svg);
    const related = new Set();
    if (state.selected && pos.has(state.selected)) {
      const s = byId.get(state.selected);
      related.add(s.id);
      const pairSlots = new Map();
      // Fan distant connections around the selected marker, inside the plotted lanes.
      const origin = pos.get(s.id), ends = [];
      for (let d = 14; d < height - LANES_TOP; d += 15) {
        if (origin.y - d >= LANES_TOP + 12) ends.push(origin.y - d);
        if (origin.y + d <= height - 12) ends.push(origin.y + d);
      }
      const stubEnds = { left: [...ends], right: [...ends] };
      connectionsFor(s.id).forEach((c) => {
        related.add(c.from); related.add(c.to);
        const other = c.from === s.id ? c.to : c.from, slot = pairSlots.get(other) || 0;
        pairSlots.set(other, slot + 1);
        if (pos.has(c.from) && pos.has(c.to)) arc(gArc, pos.get(c.from), pos.get(c.to), c, slot, stubEnds);
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

    // Temporary labels have the space between already packed marks. Place the selected label first.
    const labelOrder = [pos.get(state.selected), ...pos.values()].filter(Boolean);
    for (const p of labelOrder) {
      if (p.text !== undefined) continue;
      p.routeNeighbor = !p.label && state.route && related.has(p.e.id);
      p.text = "";
      if (!p.label && !p.routeNeighbor) continue;
      if (p.reserve) { p.text = p.e.label; continue; }
      const offset = p.radius + 5;
      const roomLeft = p.x - (p.prev?.hi ?? 4) - offset - 5;
      const roomRight = (p.next?.lo ?? width - 4) - p.x - offset - 5;
      p.side = roomRight >= p.measure(p.e.label) || roomRight >= roomLeft ? 1 : -1;
      p.text = fitLabel(p.e.label, p.side === 1 ? roomRight : roomLeft, p.measure);
      if (!p.text) continue;
      const extent = offset + p.measure(p.text) + 2;
      if (p.side === 1) p.hi = p.x + extent;
      else p.lo = p.x - extent;
    }

    // nodes
    const gN = el("g", {}, svg);
    const focusId = [state.focus, state.selected].find((id) => pos.has(id) && lit(byId.get(id))) || (evs.find((e) => lit(e) && e.importance === 3 && yearOf(e) >= DEFAULT_START) || evs.find(lit) || evs[0] || {}).id;
    for (const e of evs) {
      const p = pos.get(e.id), imp = e.importance || 2;
      let dim = !lit(e);
      if (state.selected && !state.query && !state.route && !state.org) dim = !related.has(e.id);
      const g = el("g", { class: `node imp${imp}${dim ? " dim" : ""}${state.selected === e.id ? " sel" : ""}`, transform: `translate(${p.x},${p.y})`, tabindex: e.id === focusId ? 0 : -1, role: "button", "aria-label": `${e.title}, ${fmtDate(e)}` }, gN);
      const r = NODE_RADII[imp];
      el("circle", { r: r + 3.5, class: "ring" }, g);
      el("circle", { r, style: imp === 1 ? `fill:var(--paper);stroke:${lc(e.lane)};stroke-width:1.5` : `fill:${lc(e.lane)}` }, g);
      if (p.text) {
        const attrs = { x: p.side * (p.radius + 5), y: 4, "text-anchor": p.side === -1 ? "end" : "start", class: p.routeNeighbor ? "connection-label" : "" };
        layout.labels.push({ point: p, el: el("text", attrs, g, p.text), side: p.side, shown: true });
      }
      g.dataset.eventId = e.id;
      g.addEventListener("focus", () => { state.focus = e.id; });
      g.addEventListener("click", (ev) => { ev.stopPropagation(); hideTip(); select(e.id, { mapActivation: true }); });
      g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(e.id, { mapActivation: true }); } });
      const preview = (ev) => showTip(ev, `<b>${esc(e.title)}</b><br>${esc(fmtDate(e))}<span class="preview-idea">${prose(e.idea || e.problem || "")}</span>`);
      g.addEventListener("focus", (ev) => { if (!g.matches(":focus-visible")) return; preview(ev); g.setAttribute("aria-describedby", "atlas-preview"); });
      g.addEventListener("blur", () => { if (tipOwner === g) hideTip(); });
      // Recentering can move a different node under a stationary pointer and fire an enter event.
      g.addEventListener("pointermove", (ev) => {
        if (ev.pointerType === "touch") return;
        if (tipOwner === g) moveTip(ev);
        else preview(ev);
      });
      g.addEventListener("pointerleave", () => { if (tipOwner === g) hideTip(); });
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

  function arc(parent, a, b, connection, slot, stubEnds) {
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
      const ex = fromSel.x + dir * len;
      const ey = (dir < 0 ? stubEnds.left : stubEnds.right).shift() ?? fromSel.y;
      draw(`M${fromSel.x},${fromSel.y} L${ex},${ey}`, " stub");
      // This end mark points towards the offscreen event, not the relation direction.
      el("path", { d: `M${ex - dir * 4},${ey - 4} L${ex},${ey} L${ex - dir * 4},${ey + 4}`, class: "arc stub stub-direction" }, g);
      const o = byId.get(fromSel === a ? bId : aId);
      if (o) el("text", { x: ex + dir * 5, y: ey + 4, "text-anchor": dir > 0 ? "start" : "end", class: "stub-label" }, g, `${o.label}, ${o.date_sort.slice(0, 4)}`);
      return;
    }
    const mx = (a.x + b.x) / 2;
    const lift = Math.min(70, Math.abs(b.x - a.x) * 0.22) + 12 + slot * 15;
    const my = Math.max(LANES_TOP + 2, Math.min(a.y, b.y) - lift);
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
    const host = $(".connection-detail", mounts.map), rect = host.getBoundingClientRect(), inset = readerInset(host);
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
      if (trigger) {
        const rect = trigger.getBoundingClientRect();
        if (rect.top < readerInset(trigger) || rect.bottom > innerHeight) revealReaderTarget(trigger.closest(".chart-column") || trigger);
        trigger.focus({ preventScroll: true });
      } else readSelected();
    }
  }

  function renderContext() {
    const c = $(".context", mounts.map);
    if (!c) return;
    // The search box and lane buttons already show their own state; only an organisation filter needs a line.
    c.hidden = !state.org;
    c.innerHTML = state.org ? `<span>${esc(`Organisation: ${state.org.name}`)}</span>` : "";
    const reset = $(".reset-view", mounts.map);
    if (reset) reset.hidden = !(state.route || state.org || state.query || state.era != null || state.lanes.size < D.lanes.length || state.zoom !== 1);
  }

  function renderSearchResults() {
    const host = $(".search-results", mounts.map); if (!host) return;
    const list = browseEvents(), era = state.era == null ? null : D.eras[state.era];
    const title = era?.title || (state.query ? "Search results" : state.lanes.size === D.lanes.length && !state.org ? "Browse all events" : "Browse events");
    const previousScroll = $(".event-scroll-list", host)?.scrollTop || 0;
    const listKey = list.map(e => e.id).join("|");
    const sameList = host.dataset.listKey === listKey;
    host.dataset.listKey = listKey;
    const scoped = Boolean(state.query || state.route || state.org);
    const globalCount = D.events.filter((e) => state.lanes.has(e.lane) && lit(e)).length;
    host.dataset.total = list.length; host.dataset.globalTotal = globalCount;
    if (state.route) { renderRouteStepper(host); return; }
    host.innerHTML = `<div class="browser-heading"><h3 tabindex="-1">${esc(title)}</h3>${list.length > 1 ? `<span class="num">${list.length} events</span>` : ""}</div>${era && era.summary ? `<details class="era-summary"><summary>About this era</summary><p>${esc(era.summary)}</p></details>` : ""}${state.query && era ? `<p>${globalCount} search match${globalCount === 1 ? "" : "es"} across all eras. <button class="text-button" data-era="all">Show all matches</button></p>` : ""}${list.length ? `<ol class="event-scroll-list" tabindex="0" aria-label="Events in the selected scope">${list.map((e) => `<li${state.selected === e.id ? ' class="current"' : ""}><span class="num result-date">${esc(fmtDate(e))}</span><a href="#${esc(e.id)}" data-ev-card="${esc(e.id)}"${state.selected === e.id ? ' aria-current="true"' : ""}>${esc(e.title)}</a><span class="result-lane" style="color:${lc(e.lane)}">${esc(laneTitle(e.lane))}</span></li>`).join("")}</ol>` : `<p>No events ${era ? "in this era " : ""}match the active lanes${scoped ? " and search or scope" : ""}. ${scoped ? '<button type="button" class="text-button" data-act="clear">Reset view</button>' : '<button type="button" class="text-button" data-era="all">Browse all eras</button>'}</p>`}`;
    const scroller = $(".event-scroll-list", host);
    if (scroller) {
      scroller.scrollTop = sameList ? previousScroll : 0;
      const current = $("li.current", scroller);
      if (current) {
        const top = current.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
        if (top < scroller.scrollTop) scroller.scrollTop = top;
        else if (top + current.offsetHeight > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top + current.offsetHeight - scroller.clientHeight;
      }
    }
  }

  function routeAvailable() {
    return state.route ? state.route.event_ids.filter((id) => { const e = byId.get(id); return e && state.lanes.has(e.lane) && lit(e) && inEra(e); }) : [];
  }
  function renderRouteStepper(host) {
    const route = state.route, ids = route.event_ids, available = routeAvailable();
    const current = ids.indexOf(state.selected), index = available.indexOf(state.selected);
    const openList = $(".route-stepper", host)?.dataset.routeId === route.id &&
      $(".route-stop-list", host)?.open &&
      $("[aria-current=step]", host)?.dataset.routeStop === (state.selected || undefined);
    const previous = index > 0 ? available[index - 1] : null, next = available[index + 1];
    const control = (id, dir, label) => {
      const event = byId.get(id);
      const target = event ? ` aria-label="${label}: ${esc(event.title)}" title="${esc(event.title)}"` : " disabled";
      return `<button type="button" class="text-button" data-route-step="${dir}"${target}>${dir < 0 ? "← " : ""}${label}${dir > 0 ? " →" : ""}</button>`;
    };
    host.innerHTML = `<nav class="route-stepper" data-route-id="${esc(route.id)}" aria-labelledby="atlas-route-question">
      <div class="route-stepper-head">
        <h3 id="atlas-route-question">${esc(route.question || route.title)}</h3>
        <button type="button" class="text-button" data-act="leave-route">Exit route</button>
      </div>
      <div class="route-position-row">
        <span class="route-position num" id="atlas-route-position">${current >= 0 ? `Step ${current + 1} of ${ids.length}` : `${ids.length} steps`}</span>
        <div class="route-step-controls">${control(previous, -1, "Previous")}${control(next, 1, "Next")}</div>
      </div>
      ${!available.length ? '<p class="route-filter-status">No steps match the active filters. <button type="button" class="text-button" data-act="restore-route">Show every step</button></p>' : available.length < ids.length ? `<p class="route-filter-status">${available.length} available with these filters</p>` : ""}
      <details class="route-stop-list"${openList ? " open" : ""}>
        <summary>All steps</summary>
        <ol>${ids.map((id, i) => {
          const e = byId.get(id), enabled = available.includes(id);
          return `<li value="${i + 1}"><button type="button" class="text-button" data-route-stop="${esc(id)}"${enabled ? "" : " disabled"}${id === state.selected ? ' aria-current="step"' : ""}>${esc(e.label)} <span class="num">${e.date_sort.slice(0, 4)}</span></button>${enabled ? "" : '<span class="route-unavailable">Unavailable with these filters</span>'}</li>`;
        }).join("")}</ol>
      </details>
    </nav>`;
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
    const thresholdOffset = cmp.th.some((t) => t.lg >= lo && t.lg <= hi && cy(t.lg) + 11 > CMP_TOP + CMP_H + 4) ? -4 : 11;
    cmp.th.forEach((t) => {
      const y = cy(t.lg), shown = t.lg >= lo && t.lg <= hi;
      t.line.style.display = t.text.style.display = shown ? "" : "none";
      t.line.setAttribute("x1", t.x); t.line.setAttribute("x2", mapSvg.getAttribute("width"));
      t.line.setAttribute("y1", y); t.line.setAttribute("y2", y);
      t.text.setAttribute("y", y + thresholdOffset);
      t.text.parentNode.appendChild(t.text); // drawn last, above the frontier line
    });
    placeThresholdLabels();
    cmp.front.forEach((f) => { f.y = cy(f.lg); f.el.setAttribute("cy", f.y); });
    if (cmp.path) cmp.path.setAttribute("d", "M" + cmp.front.map((f, i) => (i ? `H${f.x.toFixed(1)} V${f.y.toFixed(1)}` : `${f.x.toFixed(1)},${f.y.toFixed(1)}`)).join(" "));
    cmp.pts.forEach((q) => {
      q.y = cy(q.lg);
      q.el.setAttribute("cy", q.y);
    });
  }
  // Keep each label beside its dot. Flip labels near the window edge and stagger nearby baselines.
  function placeComputeLabels(left, right) {
    const placed = [];
    for (const q of cmp.pts) {
      if (!q.text) continue;
      const shown = q.x >= left && q.x <= right && q.lg >= cmp.lo && q.lg <= cmp.hi;
      q.text.setAttribute("visibility", shown ? "visible" : "hidden");
      if (!shown) continue;
      const width = q.labelWidth ||= q.text.getComputedTextLength();
      const after = right - q.x - 6, before = q.x - left - 6;
      const flipped = after < width && before > after;
      const x = q.x + (flipped ? -6 : 6);
      const x1 = flipped ? x - width : x, x2 = x1 + width;
      let y = q.y + 4;
      while (placed.some((r) => x1 < r.x2 && x2 > r.x1 && Math.abs(y - r.y) < 12)) y += 13;
      placed.push({ x1, x2, y });
      q.text.setAttribute("x", x);
      q.text.setAttribute("y", y);
      q.text.setAttribute("text-anchor", flipped ? "end" : "start");
    }
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
      placeComputeLabels(mapScroll.scrollLeft, mapScroll.scrollLeft + mapScroll.clientWidth);
      if (k < 1) cmpAnim = requestAnimationFrame(frame);
    };
    cmpAnim = requestAnimationFrame(frame);
  }
  function setMapLabel(label, side, text) {
    if (label.side !== side) {
      label.side = side;
      label.el.setAttribute("x", side * (label.point.radius + 5));
      label.el.setAttribute("text-anchor", side === -1 ? "end" : "start");
    }
    if (text && label.el.textContent !== text) label.el.textContent = text;
    const shown = Boolean(text);
    if (label.shown === shown) return;
    label.shown = shown;
    label.el.setAttribute("visibility", shown ? "visible" : "hidden");
  }
  function placeMapLabels(left, right) {
    const clipped = [];
    if (state.route) for (const p of layout.pos.values()) { p.viewLo = p.lo; p.viewHi = p.hi; }
    for (const label of layout.labels) {
      const p = label.point;
      const shown = p.x + p.radius > left && p.x - p.radius < right;
      if (state.route && (!shown || p.lo < left + 2 || p.hi > right - 2)) {
        // Free the clipped label's space while keeping its marker in the packed row.
        p.viewLo = p.x - p.radius - 2; p.viewHi = p.x + p.radius + 2;
        if (shown) { clipped.push(label); continue; }
      }
      setMapLabel(label, p.side, shown ? p.text : "");
    }
    // For a stop at either edge, use the free space on that row without moving its dot.
    for (const label of clipped) {
      const p = label.point, offset = p.radius + 5;
      const roomLeft = p.x - offset - Math.max(left + 4, (p.prev?.viewHi ?? left) + 5);
      const roomRight = Math.min(right - 4, (p.next?.viewLo ?? right) - 5) - p.x - offset;
      const side = roomRight >= roomLeft ? 1 : -1;
      const text = fitLabel(p.text, side === 1 ? roomRight : roomLeft, p.measure);
      setMapLabel(label, side, text);
      if (!text) continue;
      const extent = offset + p.measure(text) + 2;
      if (side === 1) p.viewHi = p.x + extent;
      else p.viewLo = p.x - extent;
    }
  }
  function updateOverview(animate = false) {
    if (!overview || !layout) return;
    updateCompute(animate === true);
    placeThresholdLabels();
    const left = mapScroll.scrollLeft, right = left + mapScroll.clientWidth;
    if (cmp) placeComputeLabels(left, right);
    placeMapLabels(left, right);
    for (const label of layout.axisLabels) {
      const shown = label.x - label.extent >= left && label.x + label.extent <= right;
      if (shown === label.shown) continue;
      label.shown = shown;
      label.el.setAttribute("visibility", shown ? "visible" : "hidden");
    }
    const a = yearAtX(left), b = yearAtX(right);
    const first = Math.min(2026, Math.floor(a)), last = Math.min(2026, Math.floor(b));
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
      range.setAttribute("aria-valuetext", `${range.value}; map shows ${first === last ? first : `${first} to ${last}`}`);
    }
    const label = $(".window-years", mounts.map); if (label) label.textContent = `Map window: ${first === last ? first : `${first}–${last}`}`;
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

  function visibleHeaderBottom() {
    const header = document.getElementById("quarto-header");
    return header && getComputedStyle(header).position === "fixed" ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
  }
  function workspaceInset() {
    return 16 + (document.querySelector(".atlas-tabs")?.offsetHeight || 0) + visibleHeaderBottom();
  }
  function updateSwitchInset() {
    const bottom = visibleHeaderBottom();
    document.querySelector(".atlas-tabs")?.style.setProperty("--tabs-top", `${bottom}px`);
    mounts.map.style.setProperty("--workspace-top", `${bottom + (document.querySelector(".atlas-tabs")?.offsetHeight || 0)}px`);
  }
  function updateWorkspaceSticky() {
    const chart = $(".chart-column", mounts.map); if (!chart) return;
    updateSwitchInset();
    const inset = workspaceInset(), map = $(".map", chart);
    let top = Math.min(inset, innerHeight - chart.offsetHeight - 16);
    // When the plot itself fits beside a card, keep its compute scale below the site and tab bars.
    if (state.selected && !$(".compute-guide[open]", chart) && map.offsetHeight <= innerHeight - inset) {
      top = Math.max(top, inset - map.offsetTop);
    }
    chart.style.setProperty("--chart-top", `${top}px`);
    const profileDock = mounts.people && $(".people-profile-dock", mounts.people); if (profileDock) profileDock.style.setProperty("--profile-top", `${Math.min(inset, innerHeight - profileDock.offsetHeight - 16)}px`);
  }
  function updateChip() {
    const chip = $(".card-chip", mounts.map); if (!chip) return;
    // While a timeline profile covers the card, the chip has nothing visible to jump to.
    const e = state.selected && byId.get(state.selected), covered = state.profile && state.profileDock === "timeline";
    chip.hidden = !e || covered;
    chip.parentElement.classList.toggle("idle", !e && !state.profile);
    if (e) chip.textContent = `Read: ${e.label} ↓`;
  }
  function readerInset(target) {
    const workspaceSwitch = target.closest('[data-atlas="map"]') && $(".workspace-switch", mounts.map);
    const switchHeight = workspaceSwitch && getComputedStyle(workspaceSwitch).display !== "none" ? workspaceSwitch.getBoundingClientRect().height : 0;
    return workspaceInset() + switchHeight;
  }
  let readerReveal = null, revealTimer;
  function cancelReaderReveal() {
    clearTimeout(revealTimer);
    readerReveal = null;
  }
  function settleReaderReveal() {
    if (!readerReveal) return;
    clearTimeout(revealTimer);
    // Quarto can finish moving its header after the last scroll event.
    revealTimer = setTimeout(() => {
      const { target, top, inset } = readerReveal;
      cancelReaderReveal();
      if (!target.isConnected || !target.getClientRects().length || Math.abs(scrollY - top) > 2) return;
      const adjustment = inset - readerInset(target);
      if (Math.abs(adjustment) > 1) scrollBy({ top: adjustment, behavior: "instant" });
    }, 220);
  }
  function revealReaderTarget(target, behavior = SMOOTH) {
    cancelReaderReveal();
    if (!target) return;
    const inset = readerInset(target);
    const max = document.scrollingElement.scrollHeight - innerHeight;
    const top = Math.max(0, Math.min(max, scrollY + target.getBoundingClientRect().top - inset));
    readerReveal = { target, top, inset };
    scrollTo({ top, behavior });
    settleReaderReveal();
  }
  function readSelected() {
    const heading = $(".pane h3", mounts.map), target = $(".route-stepper", mounts.map) || $(".pane .head", mounts.map) || $(".pane-host", mounts.map);
    revealReaderTarget(target);
    if (heading) heading.focus({ preventScroll: true });
  }
  function revealMap() {
    const heading = $(".chart-column", mounts.map);
    scrollMapTo(state.selected, false); updateOverview();
    revealReaderTarget(heading);
    (mapSvg.querySelector(".node.sel") || mapScroll).focus({ preventScroll: true });
  }
  function updateDiagramHints() {
    mounts.map.querySelectorAll(".diagram-viewport").forEach((viewport) => {
      const overflows = viewport.clientWidth > 0 && viewport.scrollWidth > viewport.clientWidth + 1;
      viewport.tabIndex = overflows ? 0 : -1;
      // A cut diagram fades at its right edge until it has been scrolled to the end.
      const mark = () => viewport.classList.toggle("cut", viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1);
      if (!viewport.dataset.fade) { viewport.dataset.fade = "1"; viewport.addEventListener("scroll", mark, { passive: true }); }
      mark();
    });
  }
  function scrollMapTo(id, smooth = true) {
    const p = layout && layout.pos.get(id);
    if (!p) return;
    const sc = mapScroll;
    if (p.x < sc.scrollLeft + 60 || p.x > sc.scrollLeft + sc.clientWidth - 200) sc.scrollTo({ left: p.x - sc.clientWidth * 0.4, behavior: smooth ? SMOOTH : "auto" });
  }

  /* ---------- tooltip ---------- */
  let tipOwner = null;
  function showTip(ev, html) { if (!tip) return; if (matchMedia("(hover: none)").matches) { hideTip(); return; } tipOwner = ev.currentTarget; tip.innerHTML = html; tip.hidden = false; moveTip(ev); }
  function moveTip(ev) { if (!tip) return; const r = ev.target && ev.target.getBoundingClientRect ? ev.target.getBoundingClientRect() : { left: 0, bottom: 0 }; const x = Number.isFinite(ev.clientX) ? ev.clientX : r.left, y = Number.isFinite(ev.clientY) ? ev.clientY : r.bottom; tip.style.left = Math.max(8, Math.min(x + 14, innerWidth - tip.offsetWidth - 8)) + "px"; tip.style.top = Math.max(8, Math.min(y + 14, innerHeight - tip.offsetHeight - 8)) + "px"; }
  function hideTip() { tipOwner = null; if (tip) tip.hidden = true; }

  /* ---------- reading pane ---------- */
  function renderPane() {
    const pane = $(".pane-host", mounts.map);
    if (!pane) return;
    const e = state.selected && byId.get(state.selected);
    const announcement = $(".sr-only[aria-live]", mounts.map);
    const label = e ? `${e.title}, ${fmtDate(e)}` : "";
    if (announcement && announcement.textContent !== label) announcement.textContent = label;
    updateChip();
    if (!e) {
      state.connection = null; connectionHover = null; connectionFocus = null;
      if (state.profile && state.profileDock === "timeline") { state.profile = null; state.affiliationIndex = null; renderProfile(); }
      pane.innerHTML = "";
      return;
    }
    const conns = connectionsFor(e.id).map((c) => ({ ...c, id: c.from === e.id ? c.to : c.from, rel: (c.from === e.id ? REL : REL_IN)[c.type] || c.type })).sort((a, b) => byId.get(a.id).date_sort.localeCompare(byId.get(b.id).date_sort));
    const dg = window.DIAGRAMS && window.DIAGRAMS.forEvent(e);
    // The card reads as a short note: problem, idea, consequence and limits are paragraphs, not labelled sections.
    const para = (t, cls = "") => t ? `<p${cls ? ` class="${cls}"` : ""}>${prose(t)}</p>` : "";
    const route = state.route;
    const routes = D.threads.filter((t) => t.id !== route?.id && t.event_ids.includes(e.id));
    const sequence = stepSequence(), position = sequence.indexOf(e.id);
    const navigation = (direction, label) => {
      const target = position >= 0 && byId.get(sequence[position + direction]);
      const title = target ? ` aria-label="${label}: ${esc(target.title)}" title="${esc(target.title)}"` : " disabled";
      return `<button type="button" class="text-button" data-nav="${direction}"${title}>${direction < 0 ? "← " : ""}${label}${direction > 0 ? " →" : ""}</button>`;
    };
    const hasSources = Boolean(e.sources?.length);
    pane.innerHTML = `<article class="pane">
      <div class="head">
        <div class="meta eyebrow"><span class="dot" style="background:${lc(e.lane)}"></span>${esc(laneTitle(e.lane))} · <span class="num">${esc(fmtDate(e))}</span>${e.kind ? " · " + esc(e.kind) : ""}<span class="pane-actions">${hasSources ? '<button type="button" class="text-button pane-sources" data-act="show-sources">Sources ↓</button>' : ""}<button type="button" class="text-button pane-close" data-act="deselect" title="Close (Esc)" aria-label="Close this event and show the map">Close</button></span></div>
        <h3 tabindex="-1"${route ? ' aria-describedby="atlas-route-question atlas-route-position"' : ""}>${esc(e.title)}</h3>
        ${(e.people || []).length || (e.orgs || []).length ? `<div class="people">${(e.people || []).map(personLink).join(", ")}${(e.people || []).length && (e.orgs || []).length ? " · " : ""}${(e.orgs || []).map(orgLink).join(", ")}</div>` : ""}
      </div>
      <section class="connection-detail" id="atlas-connection-detail" aria-labelledby="atlas-connection-title" hidden></section>
      <div class="qa">
        <div class="prose">${para(e.problem)}${para(e.idea)}</div>
        ${dg ? `<figure class="diagram"><div class="diagram-viewport" role="group" aria-label="Diagram">${dg.svg}</div><figcaption>${prose(dg.caption)}</figcaption></figure>` : ""}
        ${e.changed || e.limits ? `<div class="prose">${para(e.changed)}${para(e.limits, "limits")}</div>` : ""}
        ${(e.terms || []).length ? `<div><div class="eyebrow">Terms</div><dl class="terms">${e.terms.map((t) => `<dt>${prose(t.term)}</dt><dd>${prose(t.def)}</dd>`).join("")}</dl></div>` : ""}
      </div>
      <div class="side">
        ${hasSources ? `<div class="reads"><div class="eyebrow" id="atlas-event-sources" role="heading" aria-level="4" tabindex="-1">Sources</div>${e.developer_report ? '<p class="source-note">The main evidence is the developer\'s own report.</p>' : ""}${e.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label || s.url)}</a>`).join("")}</div>` : ""}
        ${routes.length ? `<div class="reads"><div class="eyebrow">On the routes</div>${routes.map((t) => `<a href="#${esc(t.id)}" data-route="${esc(t.id)}">${esc(t.question || t.title)}</a>`).join("")}</div>` : ""}
        ${conns.length ? `<details class="conn-group"${conns.some((c) => c.key === state.connection) ? " open" : ""}><summary><span class="eyebrow">Connections</span><span class="conn-count num">${conns.length}</span></summary><ul class="conn">${conns.map((c) => { const o = byId.get(c.id); return `<li data-connection-row="${esc(c.key)}"><span class="rel">${esc(c.rel)}</span><span><a href="#${esc(c.id)}" data-ev="${esc(c.id)}">${esc(o.title)}</a> <span class="num" style="color:var(--muted)">${o.date_sort.slice(0, 4)}</span>${c.note ? `<span class="why">${prose(c.note)}</span>` : ""}<button type="button" class="text-button connection-explain" data-explain-connection="${esc(c.key)}" aria-expanded="${state.connection === c.key}" aria-controls="atlas-connection-detail" aria-label="Explain: ${esc(connectionLabel(c))}">Explain this connection</button></span></li>`; }).join("")}</ul></details>` : ""}
      </div>
      <div class="foot">${route ? "" : `<span>${navigation(-1, "Earlier")} &nbsp; ${navigation(1, "Later")}</span>`}<button type="button" class="text-button" data-act="locate">Show on map ↑</button></div>
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
  // Identify the reader's place by destination so it survives a rerender or a change in row order.
  const returnLists = {
    connection: [".conn-group", "data-ev"],
    profile: [".profile-related", "data-ev-card"],
    catalog: [".route-body", "data-route-entry"],
    stops: [".route-stop-list", "data-route-stop"],
  };
  function returnLinkFor(trigger) {
    if (!trigger) return null;
    for (const [list, [selector, attribute]] of Object.entries(returnLists)) {
      if (trigger.closest(selector) && trigger.hasAttribute(attribute)) {
        return { list, event: trigger.getAttribute(attribute) };
      }
    }
    return null;
  }
  function snapshot(trigger) {
    return { tab: state.tab, selected: state.selected, connection: state.connection, route: state.route && state.route.id, org: state.org && state.org.id,
      query: state.query, queryInput: state.queryInput, zoom: state.zoom, lanes: [...state.lanes], scrollLeft: state.tab === "map" && mapScroll ? mapScroll.scrollLeft : preservedMapScroll,
      listScrollTop: $(".event-scroll-list", mounts.map)?.scrollTop || 0, era: state.era, profile: state.profile, profileDock: state.profileDock, affiliationIndex: state.affiliationIndex, routeShown: state.routeShown,
      connectionsOpen: Boolean($(".conn-group", mounts.map)?.open), stepsOpen: Boolean($(".route-stop-list", mounts.map)?.open),
      computeGuideOpen: Boolean($(".compute-guide", mounts.map)?.open),
      profileScrollTop: profilePanel?.scrollTop || 0, returnLink: returnLinkFor(trigger) };
  }
  function saveHistory(replace = false, preserveUrl = false, trigger) {
    const url = preserveUrl ? location.href : `${location.pathname}${location.search}${state.tab === "people" && state.profile && state.profileDock === "people" ? "#" + profileHash(state.profile) : state.tab !== "map" ? "#" + tabIds[state.tab] : state.profile && state.profileDock === "timeline" ? "#" + profileHash(state.profile) : state.route ? "#" + state.route.id + (state.selected ? "/" + state.selected : "") : state.selected ? "#" + state.selected : "#the-map"}`;
    const snap = snapshot(trigger);
    // A transition that changed nothing (the active tab clicked again, a second reset) would leave a Back step that does nothing.
    if (!replace && new URL(url, location.href).href === location.href && JSON.stringify(history.state?.atlas) === JSON.stringify(snap)) return;
    history[replace ? "replaceState" : "pushState"]({ ...(history.state || {}), atlas: snap }, "", url);
  }
  function select(id, opts = {}) {
    if (!byId.has(id)) return;
    // A card still open behind another tab is not the current view: opening it again from there gets its own history entry.
    const previous = state.tab === "map" ? state.selected : null;
    const desktopActivation = opts.history !== false && (opts.card || opts.mapActivation) && splitWorkspace.matches;
    if (opts.history !== false) saveHistory(true, true, opts.trigger);
    setPanel("map");
    if (desktopActivation) collapseComputeGuide();
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
    else if (opts.mapActivation && desktopActivation) {
      const heading = $(".pane h3", mounts.map);
      const box = heading.getBoundingClientRect();
      if (box.top < readerInset(heading) || box.bottom > innerHeight) revealReaderTarget($(".pane .head", mounts.map));
    }
    else if (opts.reveal) mounts.map.scrollIntoView({ behavior: SMOOTH, block: "start" });
  }
  const stepSequence = () => state.route ? routeAvailable() : browseEvents().map((e) => e.id);
  function step(dir, fromId = state.selected || state.focus, opts = { focus: true }) {
    const seq = stepSequence();
    if (!seq.length) return;
    const index = seq.indexOf(fromId);
    const next = index < 0 ? (dir > 0 ? 0 : seq.length - 1) : index + dir;
    if (next >= 0 && next < seq.length) select(seq[next], { ...opts, keepEra: true });
  }
  // Keep the current scope when leaving an event or connection.
  function clearSelection(showMap = false) {
    if (!state.selected) return;
    saveHistory(true, true);
    state.selected = null;
    renderMap(); renderPane(); saveHistory();
    if (showMap) revealMap();
  }
  // Returns true when the edit closed the open card; that step gets its own history entry so Back can reopen it.
  function reconcileSelection() {
    if (state.selected && !matches().some((e) => e.id === state.selected)) { state.selected = null; state.focus = null; state.connection = null; connectionHover = null; connectionFocus = null; return true; }
    return false;
  }
  function resetView() {
    const resetFocused = document.activeElement.dataset.act === "clear";
    saveHistory(true, true);
    state.selected = null; state.focus = null; state.connection = null; connectionHover = null; connectionFocus = null; state.route = null; state.org = null; state.query = ""; state.queryInput = "";
    state.era = null; if (state.profileDock === "timeline") { state.profile = null; state.affiliationIndex = null; renderProfile(); } state.zoom = 1; state.lanes = new Set(D.lanes.map((l) => l.id));
    syncControls(); renderMap(); renderPane();
    mapScroll.scrollLeft = layout.X(DEFAULT_START) - 30; updateOverview(); saveHistory();
    if (resetFocused) {
      revealReaderTarget($(".controls", mounts.map));
      $("#atlas-search")?.focus({ preventScroll: true });
    }
  }

  /* ---------- controls ---------- */
  function renderControls() {
    const c = $(".controls", mounts.map);
    c.innerHTML = `
      <input class="search" id="atlas-search" type="search" placeholder="Search events" aria-label="Search events" value="${esc(state.queryInput)}">
      <details class="lane-filter">
        <summary class="atlas-btn">Lanes<span class="lane-filter-count" aria-hidden="true" hidden></span></summary>
        <div class="group" role="group" aria-label="Lanes">${D.lanes.map((l) => `<button type="button" class="atlas-btn" data-lane="${l.id}" aria-pressed="${state.lanes.has(l.id)}"><span class="dot" style="background:${lc(l.id)}"></span>${esc(l.short || l.title)}</button>`).join("")}</div>
      </details>
      <div class="group" role="group" aria-label="Zoom"><button class="atlas-btn" data-zoom="-1" aria-label="Zoom out">−</button><button class="atlas-btn" data-zoom="1" aria-label="Zoom in">+</button></div>
      <button type="button" class="text-button reset-view" data-act="clear" hidden>Reset view</button>
      `;
    const laneFilter = $(".lane-filter", c), summary = $("summary", laneFilter);
    const compactLanes = matchMedia("(max-width: 560px)");
    const syncLaneDisclosure = () => {
      const focused = document.activeElement;
      laneFilter.open = !compactLanes.matches;
      if (compactLanes.matches && laneFilter.contains(focused)) summary.focus({ preventScroll: true });
      if (!compactLanes.matches && focused === summary) $("[data-lane]", laneFilter)?.focus({ preventScroll: true });
    };
    syncLaneDisclosure();
    compactLanes.addEventListener("change", syncLaneDisclosure);
    syncControls();
    $("#atlas-search").addEventListener("input", (ev) => { state.queryInput = ev.target.value; state.query = state.queryInput.trim(); state.era = null; const closed = reconcileSelection(); syncControls(); renderMap(); renderPane(); saveHistory(!closed); });
  }
  function syncControls() {
    const q = $("#atlas-search"); if (q && q.value !== state.queryInput) q.value = state.queryInput;
    document.querySelectorAll("[data-lane]").forEach((b) => b.setAttribute("aria-pressed", state.lanes.has(b.dataset.lane)));
    const laneCount = $(".lane-filter-count", mounts.map);
    const totalLanes = D.lanes.length, visibleLanes = state.lanes.size;
    laneCount.hidden = visibleLanes === totalLanes;
    laneCount.textContent = `${visibleLanes}/${totalLanes}`;
    laneCount.parentElement.setAttribute("aria-label", laneCount.hidden ? "Lanes" : `Lanes, ${visibleLanes} of ${totalLanes} visible`);
    // aria-disabled keeps the button focusable at a limit, so keyboard focus does not drop out of the toolbar.
    mounts.map?.querySelectorAll("[data-zoom]").forEach((b) => b.setAttribute("aria-disabled", String(Number(b.dataset.zoom) > 0 ? state.zoom >= ZOOM_MAX : state.zoom <= ZOOM_MIN)));
  }

  function collapseComputeGuide() {
    // The expanded table can pull the sticky plot above the viewport while the reader is open.
    const guide = $(".compute-guide[open]", mounts.map);
    if (guide) guide.open = false;
  }
  function computeGuide(compute) {
    if (!compute) return "";
    // A model can be both a selected dot and a step on the running maximum.
    const records = new Map();
    for (const [points, series] of [[compute.points, "Selected model"], [compute.frontier_points, "Running maximum"]]) {
      for (const point of points || []) {
        const key = JSON.stringify([point.date, point.model, point.flop]);
        if (!records.has(key)) records.set(key, { ...point, series: [] });
        records.get(key).series.push(series);
      }
    }
    const rows = [...records.values()].sort((a, b) => a.date.localeCompare(b.date) || a.model.localeCompare(b.model));
    return `<details class="compute-guide">
      <summary>Training compute · data and scale</summary>
      <p>Dots mark selected models. The line steps up when a training run exceeds every earlier estimate in the November 2026 snapshot. The series excludes models with no estimate.</p>
      <p>Each tick on the vertical axis is a power of ten. The range adjusts as you pan. Slashes on the time axis mark a change in the space given to each year.</p>
      <div class="compute-table-scroll" role="region" aria-label="Training compute estimates" tabindex="0">
        <table><caption class="sr-only">Documented training compute by publication date. Each row identifies its mark on the chart.</caption>
        <thead><tr><th scope="col">Model</th><th scope="col">Publication date</th><th scope="col">Estimated FLOP</th></tr></thead>
        <tbody>${rows.map(point => {
          const [base, exponent] = point.flop.toExponential(2).split("e");
          return `<tr><th scope="row">${esc(point.model)}<small>${point.series.join(" · ")}</small></th>
            <td>${esc(point.date)}</td><td><span aria-hidden="true">${Number(base)} × 10<sup>${Number(exponent)}</sup></span><span class="sr-only">${Number(base)} times ten to the power ${Number(exponent)}</span><small>${esc(point.confidence || "")}</small></td></tr>`;
        }).join("")}</tbody></table>
      </div>
      <p>Confidence labels come from Epoch AI and can reflect uncertainty in compute, parameter count or dataset size. H100 hours assume 40% of one H100 SXM GPU’s dense BF16 peak of 989 TFLOP/s.</p>
      <p><a href="${esc(compute.source_url || "https://epoch.ai/data/ai-models")}" target="_blank" rel="noopener">Epoch AI model data</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a></p>
    </details>`;
  }

  function mountMap() {
    const m = mounts.map;
    if (!m) return;
    m.innerHTML = `<div class="controls"></div><div class="context"></div><nav class="workspace-switch" aria-label="Timeline reading"><button type="button" class="text-button" data-act="locate">↑ Map</button><button type="button" class="card-chip" hidden></button></nav><div class="timeline-workspace"><section class="chart-column" aria-label="History map">
      <div class="era-nav" id="every-event-by-era"></div><div class="navigator"><span class="window-years sr-only"></span><svg class="overview" viewBox="0 0 1000 52" preserveAspectRatio="none" role="img" aria-label="Whole timeline and current map window"></svg><div class="overview-axis" aria-hidden="true">${[1960, 1980, 2000, 2020].filter((y) => y >= Y0).map((y) => `<span style="left:${1.2 + (y - Y0) / (2027.1 - Y0) * 97.6}%">${y}</span>`).join("")}</div><div class="overview-range"><label for="atlas-year" class="sr-only">Jump to year</label><input id="atlas-year" type="range" min="${Math.ceil(Y0)}" max="2026" step="1" value="2017"></div></div>
      <div class="map"><div class="map-labels"></div><div class="map-scroll" tabindex="0" aria-label="Timeline, scroll sideways"><svg role="group" aria-label="Timeline of AI in four lanes. Use the left and right arrow keys to move between events."></svg></div></div>
      ${computeGuide(D.compute)}</section><section class="reader-column" aria-label="Event browser and selected event"><div class="search-results"></div><div class="profile-dock" hidden></div><div class="pane-host"></div></section></div><div class="tip" id="atlas-preview" role="tooltip" hidden></div><div class="sr-only" aria-live="polite"></div>`;
    $(".card-chip", m).addEventListener("click", readSelected);
    let chipRaf = 0; addEventListener("scroll", () => { if (!chipRaf) chipRaf = requestAnimationFrame(() => { chipRaf = 0; updateChip(); updateSwitchInset(); settleReaderReveal(); }); }, { passive: true });
    document.getElementById("quarto-header")?.addEventListener("transitionend", updateWorkspaceSticky);
    for (const input of ["wheel", "pointerdown", "keydown"]) addEventListener(input, cancelReaderReveal, { passive: true, capture: true });
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
          return `<li><span class="yr">${e.date_sort.slice(0, 4)}</span><span class="rail"><i style="background:${lc(e.lane)}"></i></span><div class="st">${rel ? `<p class="rel">${prose(rel)}</p>` : ""}<a href="#${esc(t.id)}/${esc(id)}" data-route="${esc(t.id)}" data-route-entry="${esc(id)}">${esc(e.title)}</a>${routeStepText(e)}</div></li>`;
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
  // Chart labels are 12px in the page's sans face (atlas.css .people-chart .lb); measure them rather than guess.
  let labelCtx = null;
  function measureLabel(text) {
    if (!labelCtx) { labelCtx = document.createElement("canvas").getContext("2d"); if (labelCtx) labelCtx.font = `12px ${getComputedStyle(mounts.people || document.body).getPropertyValue("--sans").trim() || "sans-serif"}`; }
    return labelCtx ? labelCtx.measureText(text).width : text.length * 5.9;
  }
  function shortenLabel(text, room) {
    if (measureLabel(text) <= room) return text;
    let first = 3, last = text.length - 1, visible = "";
    while (first <= last) {
      const length = (first + last) >> 1, shortened = `${text.slice(0, length).trimEnd()}…`;
      if (measureLabel(shortened) <= room) { visible = shortened; first = length + 1; }
      else last = length - 1;
    }
    return visible;
  }
  function mountProfilePicker(picker) {
    const search = $("input", picker), results = $(".profile-results", picker), status = $(".sr-only", picker);
    const index = profileRecords.map((r) => ({
      ...r, nameKey: normalizeSearch(r.name), matchText: normalizeSearch(r.indexText.join(" ")), curated: curatedProfileKeys.has(r.key),
    }));
    let previousQuery;
    const showResults = () => {
      const query = normalizeSearch(search.value.trim()), words = query.split(/\s+/).filter(Boolean);
      if (query !== previousQuery) {
        const rank = (r) => r.nameKey === query ? 0 : r.nameKey.startsWith(query) ? 1 : r.nameKey.includes(query) ? 2 : 3;
        const list = index.filter((r) => words.length ? words.every((word) => r.matchText.includes(word)) : r.curated)
          .sort((a, b) => rank(a) - rank(b) || Number(b.curated) - Number(a.curated) || a.name.localeCompare(b.name));
        results.innerHTML = list.length ? list.map((r) => `<button type="button" class="profile-result" data-profile="${esc(r.key)}" aria-controls="atlas-profile"><span>${esc(r.name)}</span><small>${r.kind}</small></button>`).join("")
          : '<p>No matching profiles.</p>';
        previousQuery = query;
      }
      results.hidden = false;
      status.textContent = `${results.querySelectorAll("button").length} matching profiles.`;
    };
    search.addEventListener("focus", showResults);
    search.addEventListener("click", showResults);
    search.addEventListener("input", showResults);
    // Keep the results open until a mouse click reaches the selected button.
    results.addEventListener("mousedown", (ev) => { if (ev.target.closest("button")) ev.preventDefault(); });
    picker.addEventListener("focusout", (ev) => { if (!picker.contains(ev.relatedTarget)) results.hidden = true; });
    picker.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !results.hidden) {
        ev.preventDefault(); ev.stopPropagation();
        if (document.activeElement !== search) search.focus({ preventScroll: true });
        results.hidden = true;
      } else if ((ev.key === "Enter" || ev.key === "ArrowDown") && ev.target === search && !ev.isComposing) {
        showResults();
        const first = $("button", results);
        if (first) { ev.preventDefault(); if (ev.key === "Enter") first.click(); else first.focus(); }
      }
    });
  }

  function renderPeople() {
    const m = mounts.people;
    if (!m || (!D.people.length && !D.orgs.length)) return;
    if (!$(".people-workspace", m)) {
      m.innerHTML = `<div class="profile-picker"><label for="atlas-org-search">Find a person or organisation</label><input id="atlas-org-search" class="search" type="search" placeholder="Name, affiliation or research area" aria-controls="atlas-profile-results" autocomplete="off"><div id="atlas-profile-results" class="profile-results" role="group" aria-label="Matching profiles" hidden></div><span class="sr-only" role="status"></span></div><div class="people-workspace"><div class="people-chart-column"></div><div class="people-profile-dock"></div></div>`;
      mountProfilePicker($(".profile-picker", m));
      const dock = $(".people-profile-dock", m);
      new IntersectionObserver(() => updateProfileSheetVisibility(m, dock)).observe(m);
      // Reuse the inspector when it is docked beside a map card.
      profilePanel = document.createElement("section"); profilePanel.className = "profile-panel";
    }
    renderProfile();
  }

  function updateProfileSheetVisibility(people, dock) {
    if (!dock.classList.contains("is-sheet")) return;
    const box = people.getBoundingClientRect();
    // Observer entries can lag a tab switch. Use the current geometry before focusing the profile.
    dock.classList.toggle("offscreen", state.tab !== "people" || box.bottom <= 0 || box.top >= innerHeight);
  }

  let peopleChartFocus, peopleChartWidth = 0;
  function bindPeopleChart(chart) {
    const controls = [...chart.querySelectorAll("[data-chart-row]")];
    const rows = new Map();
    controls.forEach((control) => {
      const row = control.dataset.chartRow;
      if (!rows.has(row)) rows.set(row, []);
      rows.get(row).push(control);
    });
    const setFocus = (control) => {
      if (!control) return;
      for (const item of controls) item.tabIndex = item === control ? 0 : -1;
      peopleChartFocus = { profile: control.dataset.profile, affiliation: control.dataset.affiliation };
    };
    const previous = controls.find((c) => c.dataset.profile === peopleChartFocus?.profile && c.dataset.affiliation === peopleChartFocus?.affiliation);
    setFocus(previous || controls[0]);
    chart.addEventListener("focusin", (ev) => { if (ev.target.dataset.chartRow != null) setFocus(ev.target); });
    chart.addEventListener("keydown", (ev) => {
      const row = ev.target.dataset.chartRow, items = rows.get(row);
      if (!items || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(ev.key)) return;
      ev.preventDefault();
      const next = ev.key === "ArrowUp" || ev.key === "ArrowDown"
        ? rows.get(String(Number(row) + (ev.key === "ArrowUp" ? -1 : 1)))?.[0]
        : items[items.indexOf(ev.target) + (ev.key === "ArrowLeft" ? -1 : 1)];
      if (!next) return;
      if (next.dataset.affiliation != null) {
        const scroller = $(".people-scroll", chart).getBoundingClientRect(), target = next.querySelector(".role-bar").getBoundingClientRect();
        if (target.left < scroller.left || target.right > scroller.right) $(".people-scroll", chart).scrollLeft += (target.left + target.right - scroller.left - scroller.right) / 2;
      }
      next.focus();
    });
    return previous;
  }

  function keepAffiliationLabelsVisible(scroller, initialLeft) {
    const labels = [...scroller.querySelectorAll(".lb:not(.out)")].map((label) => {
      const bar = $(".role-bar", label.parentElement), x = Number(label.getAttribute("x"));
      return { label, x, end: Number(bar.getAttribute("x")) + Number(bar.getAttribute("width")), text: label.textContent, width: measureLabel(label.textContent) };
    });
    const update = (left) => {
      const right = left + scroller.clientWidth;
      for (const { label, x, end, text, width } of labels) {
        if (end <= left || x >= right) continue;
        const start = Math.max(x, left + 5), room = Math.min(end, right) - start - 4;
        label.setAttribute("x", start);
        const visible = room >= width ? text : shortenLabel(text, room);
        if (label.textContent !== visible) label.textContent = visible;
      }
    };
    let frame;
    scroller.addEventListener("scroll", () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = null; update(scroller.scrollLeft); });
    }, { passive: true });
    update(initialLeft);
  }

  function renderPeopleChart() {
    const m = mounts.people, column = $(".people-chart-column", m), width = column.clientWidth;
    if (!width || !D.people.length || (width === peopleChartWidth && String(m.clientWidth) === m.dataset.width)) return;
    peopleChartWidth = width; m.dataset.width = String(m.clientWidth);
    const oldChart = $(".people-chart", column), oldScroll = $(".people-scroll", column);
    const chartHadFocus = oldChart?.contains(document.activeElement);
    const previousScroll = oldScroll?.scrollLeft || 0;
    const atRecent = !oldScroll || oldScroll.scrollWidth - oldScroll.clientWidth - previousScroll < 2;
    const compact = matchMedia("(max-width: 560px)").matches, touch = matchMedia("(pointer: coarse)").matches;
    const namesWidth = compact ? Math.round(Math.min(112, width * .32)) : 146;
    const A = 1995, NOW = 2026.85, START = 17, W = Math.max(570, width - namesWidth), BAR = touch ? 18 : 16, GAP = touch ? 6 : 4;
    const px = (y) => START + ((Math.max(A, Math.min(NOW, y)) - A) / (NOW - A)) * (W - START - 30);
    const span = (a) => { const f = yearOfStr(a.from || A); let t = a.to ? yearOfStr(a.to) : NOW; if (a.to && /^\d{4}\??$/.test(String(a.to))) t += 1; if (!isFinite(t)) t = NOW; return [isFinite(f) ? f : A, Math.max(t, f + 0.25)]; };
    const people = D.people.map((p) => {
      const roles = (p.affiliations || []).map((a, index) => ({ ...a, index, s: span(a) })).sort((a, b) => a.s[0] - b.s[0]);
      const ends = [];
      roles.forEach((r) => { let k = ends.findIndex((e) => e <= r.s[0] + 0.01); if (k < 0) { k = ends.length; ends.push(0); } ends[k] = r.s[1]; r.track = k; });
      return { ...p, roles, tracks: Math.max(1, ends.length), first: roles.length ? roles[0].s[0] : 2100 };
    }).sort((a, b) => a.first - b.first);
    let y = 30;
    const rows = people.map((p) => { const top = y; y += Math.max(compact || touch ? 44 : 29, p.tracks * (BAR + GAP) + 9); return { top, height: y - top }; });
    const H = y + 4;
    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Affiliation periods"><defs><pattern id="atlas-kind-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" style="fill:var(--ink-2);fill-opacity:.06"/><line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--ink-2);stroke-opacity:.5;stroke-width:1.2"/></pattern><pattern id="atlas-kind-dots" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".75" style="fill:var(--ink-2);fill-opacity:.55"/></pattern></defs>`;
    for (let yr = A; yr <= 2025 && px(NOW) - px(yr) >= 38; yr += 5) svg += `<line x1="${px(yr)}" x2="${px(yr)}" y1="20" y2="${H}" class="gl"/><text x="${px(yr)}" y="13" text-anchor="middle" class="yr">${yr}</text>`;
    svg += `<line x1="${px(NOW)}" x2="${px(NOW)}" y1="20" y2="${H}" class="now"/><text x="${px(NOW)}" y="13" text-anchor="middle" class="yr">2026</text>`;
    const names = people.map((p, i) => `<button type="button" class="nm" data-profile="person:${esc(personId(p))}" data-chart-row="${i}" aria-label="Open profile for ${esc(p.name)}" style="top:${rows[i].top - 5}px;height:${rows[i].height}px">${esc(p.name)}</button>`).join("");
    people.forEach((p, row) => {
      const { top } = rows[row];
      if (row) svg += `<line x1="0" x2="${W}" y1="${top - 5}" y2="${top - 5}" class="sep"/>`;
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
        const free = (a, b) => a >= START + 2 && b <= px(NOW) - 2 && occupied.every(([l, rr]) => b + 3 <= l || a - 3 >= rr);
        const place = (r, label) => { r.label = label; if (label.out) occupied.push([label.a, label.b]); };
        track.forEach((r) => { if (r.textW + 10 <= r.barW) place(r, { text: r.name, x: r.x1 + 5 }); });
        // Open-ended bars can only take a label on their left, so they claim space first.
        [...track.filter((r) => !r.label && r.open), ...track.filter((r) => !r.label && !r.open)].forEach((r) => {
          const w = r.textW;
          if (!r.open && free(r.x2 + 4, r.x2 + 4 + w)) return place(r, { text: r.name, x: r.x2 + 4, out: true, a: r.x2 + 4, b: r.x2 + 4 + w });
          if (free(r.x1 - 4 - w, r.x1 - 4)) return place(r, { text: r.name, x: r.x1 - 4, anchor: "end", out: true, a: r.x1 - 4 - w, b: r.x1 - 4 });
          // Bars on a track touch end to start, so neighbours are told apart by side, not by a coordinate margin.
          const others = occupied.filter((o) => o !== r.box), mid = (r.x1 + r.end) / 2;
          const rightEdge = r.open ? r.x2 + 4 : Math.min(px(NOW) - 2, ...others.filter(([l, rr]) => l + rr > 2 * mid).map(([l]) => l - 3));
          const leftEdge = Math.max(START + 2, ...others.filter(([l, rr]) => l + rr < 2 * mid).map(([, rr]) => rr + 3));
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
        svg += `<g class="role${r.uncertain ? " unsure" : ""}" tabindex="-1" role="button" data-chart-row="${row}" data-profile="person:${esc(personId(p))}" data-affiliation="${r.index}" data-org-key="${esc(orgKeyFor(r.org) || "")}" aria-label="${esc(p.name)} at ${esc(r.org)}, ${esc(roleDate(r.from) || "start unknown")} to ${esc(roleDate(r.to) || "present")}${r.uncertain ? ", dates uncertain" : ""}. Open affiliation details."><rect class="role-hit" x="${hitL}" y="${by - GAP / 2}" width="${Math.max(1, hitR - hitL)}" height="${BAR + GAP}"/><rect class="role-bar k-${tone}" x="${x1}" y="${by}" width="${r.barW}" height="${BAR}" rx="2.5"/>`;
        if (open) svg += `<path d="M${x2 - 1.5},${by} l5,${BAR / 2} l-5,${BAR / 2}" class="tip-arrow"/>`;
        if (r.clipped) svg += `<path d="M${x1 + 1.5},${by} l-5,${BAR / 2} l5,${BAR / 2}" class="tip-arrow"/>`;
        if (r.label) svg += `<text aria-hidden="true" x="${r.label.x}" y="${by + 11}"${r.label.anchor ? ` text-anchor="${r.label.anchor}"` : ""} class="lb${r.label.out ? " out" : ""}">${esc(r.label.text)}</text>`;
        svg += `</g>`;
      });
    });
    svg += `</svg>`;
    const kinds = [["lab", "Lab"], ["nonprofit", "Nonprofit research"], ["academic", "Academic"], ["government", "Government"], ["other", "Other"], ["uncertain", "Dates uncertain"]];
    column.innerHTML = `<div class="people-chart-head"><h3 id="atlas-people-heading">Researcher affiliations</h3><div class="people-range" role="group" aria-label="Years in view" hidden><button type="button" class="text-button" data-years="earlier" aria-label="Show earlier years" aria-controls="atlas-people-years">← Earlier</button><button type="button" class="text-button" data-years="recent" aria-label="Show recent years" aria-controls="atlas-people-years">Recent →</button></div></div><div class="legend" aria-label="Affiliation chart legend">${kinds.map(([t, n]) => `<span><i class="k-${t}" aria-hidden="true"></i>${n}</span>`).join("")}</div><p id="atlas-people-keys" class="sr-only">Use the up and down arrow keys to move between researchers and the left and right arrow keys for their affiliations.</p><div class="people-chart" role="group" aria-labelledby="atlas-people-heading" aria-describedby="atlas-people-keys" style="--name-width:${namesWidth}px"><div class="people-names">${names}</div><div class="people-scroll" id="atlas-people-years" tabindex="-1">${svg}</div></div>`;
    const chart = $(".people-chart", column), scroller = $(".people-scroll", column), range = $(".people-range", column);
    const previous = bindPeopleChart(chart);
    if (chartHadFocus) previous?.focus({ preventScroll: true });
    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    range.hidden = maxScroll < 2;
    range.addEventListener("click", (ev) => {
      const button = ev.target.closest("[data-years]");
      if (button) scroller.scrollTo({ left: button.dataset.years === "recent" ? maxScroll : 0, behavior: SMOOTH });
    });
    const initialLeft = atRecent ? maxScroll : Math.min(maxScroll, previousScroll);
    scroller.scrollLeft = initialLeft;
    if (maxScroll > 0) keepAffiliationLabelsVisible(scroller, initialLeft);
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
    const dock = active && state.profileDock === "timeline" && timelineDock ? timelineDock : peopleDock;
    const sheet = active && dock === peopleDock && innerWidth <= 1050;
    workspace.classList.toggle("has-profile", active && dock === peopleDock && !sheet);
    peopleDock.hidden = !active || dock !== peopleDock;
    renderPeopleChart();
    peopleDock.classList.toggle("is-sheet", sheet); workspace?.classList.toggle("sheet-open", sheet);
    updateProfileSheetVisibility(mounts.people, peopleDock);
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
    if (dock !== peopleDock) peopleDock.innerHTML = "";
    else peopleDock.querySelector(":scope > .profile-placeholder")?.remove();
    document.querySelectorAll("[data-profile]").forEach((n) => {
      const selected = n.dataset.profile === state.profile && (n.dataset.affiliation == null || Number(n.dataset.affiliation) === state.affiliationIndex);
      n.classList.toggle("profile-selected", selected);
      n.setAttribute("aria-expanded", String(selected)); n.setAttribute("aria-controls", "atlas-profile");
    });
    // An open organisation lights every affiliation bar that opens it.
    mounts.people.querySelectorAll(".people-chart [data-org-key]").forEach((n) => n.classList.toggle("org-selected", Boolean(state.profile) && n.dataset.orgKey === state.profile));
    profilePanel.id = "atlas-profile";
    if (!active) { profilePanel.removeAttribute("aria-labelledby"); profilePanel.innerHTML = ""; return; }
    const isPerson = state.profile.startsWith("person:");
    if (dock === peopleDock && matchMedia("(min-width: 1051px)").matches) {
      const bottom = $(".people-workspace", mounts.people).getBoundingClientRect().bottom;
      profilePanel.style.setProperty("--profile-max", `${Math.max(160, Math.min(innerHeight - workspaceInset() - 16, bottom - workspaceInset()))}px`);
    }
    const body = isPerson ? `${!record.known_for && !(record.affiliations || []).length ? '<p class="profile-kind">Related work in this atlas</p>' : ""}${record.known_for ? `<p>${esc(record.known_for)}</p>` : ""}${(record.affiliations || []).length ? '<h4>Affiliations</h4>' : ""}<ul class="profile-affiliations">${(record.affiliations || []).map((a, i) => `<li${state.affiliationIndex === i ? ' class="current"' : ""}>${orgLink(a.org)}<span class="num">${esc(roleDates(a))}</span></li>`).join("")}</ul>${relatedEvents([...(record.key_event_ids || []), ...D.events.filter((e) => (e.people || []).some((name) => name.toLowerCase() === record.name.toLowerCase())).map((e) => e.id)])}${profileSources(record.sources)}` : `<p class="profile-kind">${esc(record.kind || "Organisation")}${record.founded ? ` · Founded ${esc(roleDate(record.founded))}` : record.activity_since ? ` · Active since ${esc(record.activity_since)}` : ""}</p>${record.founded_context ? `<p class="date-context">${esc(record.founded_context)}</p>` : ""}${(record.founders || []).length ? `<p class="profile-founders">Founders: ${record.founders.map(personLink).join(", ")}</p>` : ""}${record.historical_role ? `<p>${esc(record.historical_role)}</p>` : ""}${(record.research_focus || []).length ? `<p class="profile-focus">Research: ${record.research_focus.map(esc).join(", ")}.</p>` : ""}${record.status_as_of_2026_11 ? `<p class="now">As of November 2026: ${esc(record.status_as_of_2026_11)}</p>` : ""}${(record.affiliations || []).length ? `<h4>People in this atlas</h4><ul class="profile-affiliations">${[...record.affiliations].sort((a, b) => (yearOfStr(a.from) || 9999) - (yearOfStr(b.from) || 9999) || a.person.localeCompare(b.person)).map((a) => { const role = (String(a.org).match(/\(([^)]*)\)\s*$/) || [])[1]; return `<li>${personLink(a.person)}${role ? ` <span class="profile-role">${esc(role)}</span>` : ""}<span class="num">${esc(roleDates(a))}</span></li>`; }).join("")}</ul>` : ""}${relatedEvents(record.key_event_ids || [])}${(record.key_event_ids || []).length ? `<button type="button" class="text-button" data-org="${esc(record.id)}">Show related events on the map →</button>` : ""}${profileSources(record.sources)}`;
    const affiliation = isPerson && record.affiliations?.[state.affiliationIndex];
    const affiliationSummary = affiliation ? `<p class="profile-kind profile-affiliation-summary">${orgLink(affiliation.org)} · ${esc(roleDates(affiliation))}</p>` : "";
    profilePanel.innerHTML = `<div class="profile-head"><div><span class="eyebrow">${isPerson ? "Person" : "Organisation"}</span><h3 id="atlas-profile-title" tabindex="-1">${esc(record.name)}</h3></div><button type="button" class="text-button profile-close" data-act="close-profile" aria-label="Close profile">Close</button></div><div class="profile-body">${affiliationSummary}${body}</div>`;
    profilePanel.setAttribute("aria-labelledby", "atlas-profile-title"); updateWorkspaceSticky();
  }
  function openProfile(key, options = {}) {
    if (!profileRecord(key)) return;
    if (options.history !== false) saveHistory(true, true);
    // Preserve the previous view when the dock or selected affiliation changes.
    const affiliation = options.affiliationIndex == null ? null : Number(options.affiliationIndex);
    const same = state.profile === key && state.profileDock === (options.dock || "people") && state.affiliationIndex === affiliation, pageY = scrollY, fromTab = state.tab;
    state.profile = key; state.affiliationIndex = affiliation;
    state.profileDock = options.dock || "people"; setPanel(state.profileDock === "people" ? "people" : "map");
    if (!options.trigger || !options.trigger.closest(".profile-panel")) profileTrigger = options.trigger || null;
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
      }
      else if (!(inPeople && box.top < innerHeight && box.bottom > workspaceInset())) revealReaderTarget(profilePanel);
      if (options.focus !== false) heading.focus({ preventScroll: true });
    }
  }
  function closeProfile(options = {}) {
    if (!state.profile) return;
    const pageY = scrollY, returnToEvent = state.profileDock === "timeline" && state.selected, preserveChart = state.profileDock === "people";
    state.profile = null; state.affiliationIndex = null;
    renderProfile();
    hideTip();
    if (options.history !== false) saveHistory();
    if (options.focus !== false) {
      const source = preserveChart ? mounts.people : $(".pane-host", mounts.map);
      let trigger = source?.contains(profileTrigger) && !profileTrigger.closest("[hidden]") ? profileTrigger : null;
      if (!trigger && preserveChart && profileTrigger?.hasAttribute("data-chart-row")) {
        trigger = [...source.querySelectorAll(".people-chart [data-profile]")].find(n => n.dataset.profile === profileTrigger.dataset.profile && n.dataset.affiliation === profileTrigger.dataset.affiliation);
      }
      if (returnToEvent) revealReaderTarget($(".pane .head", mounts.map));
      const fallback = preserveChart ? $("#atlas-org-search", mounts.people) : $(".pane h3", mounts.map) || $("#atlas-search", mounts.map);
      (trigger || fallback)?.focus({ preventScroll: true });
    }
    if (preserveChart) scrollTo({ top: pageY, behavior: "auto" });
    hideTip();
  }
  function previewProfile(trigger, ev) {
    if (!trigger || !trigger.closest(".atlas") || trigger.closest(".profile-results")) return;
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
    const isStartLink = t?.hasAttribute("data-route") && t.closest(".atlas-start");
    if (!t || (!t.closest(".atlas") && !isStartLink)) return;
    if (t.tagName === "A" && (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || t.target === "_blank")) return;
    if (t.tagName === "A") ev.preventDefault();
    const d = t.dataset;
    if (t.classList.contains("connection-hit") || d.explainConnection) inspectConnection(d.connection || d.explainConnection, t);
    else if (d.routeStop || d.routeStep) {
      const available = routeAvailable(), index = available.indexOf(state.selected), next = d.routeStop || available[index < 0 ? 0 : index + Number(d.routeStep)];
      if (!available.includes(next)) return;
      if (d.routeStop && d.routeStop === state.selected) {
        t.closest(".route-stop-list").open = false;
        readSelected();
        return;
      }
      select(next, { keepEra: true, card: true, trigger: t });
    }
    else if (d.profile) openProfile(d.profile, { trigger: t, affiliationIndex: d.affiliation, dock: t.closest('[data-atlas="map"]') ? "timeline" : "people" });
    else if (d.era != null) browseEra(d.era === "all" ? null : Number(d.era));
    // A people-tab profile stays open when one of its events opens on the map, so the tab shows it again on return.
    else if (d.ev || d.evReveal || d.evCard) select(d.ev || d.evReveal || d.evCard, { card: true, trigger: t });
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
      } else $(`[data-route-show="${CSS.escape(d.routeShow)}"]`, mounts.routes)?.focus({ preventScroll: true });
    }
    else if (d.route) {
      const route = D.threads.find((x) => x.id === d.route); if (!route) return;
      traceRoute(route, { stop: d.routeEntry, read: Boolean(isStartLink || d.routeEntry), trigger: t });
    } else if (d.org) {
      const org = orgById.get(d.org); if (!org) return;
      saveHistory(true, true); setPanel("map"); state.org = org; state.route = null; state.query = ""; state.queryInput = ""; state.selected = null; state.era = null; state.profile = null; renderProfile();
      D.events.filter((e) => orgMatches(e, org)).forEach((e) => state.lanes.add(e.lane));
      syncControls(); renderMap(); renderPane(); const first = matches()[0]; if (first) scrollMapTo(first.id, false); updateOverview(); saveHistory();
      $(".context", mounts.map).scrollIntoView({ behavior: SMOOTH, block: "start" });
    } else if (d.act === "leave-route") {
      saveHistory(true, true, t); state.route = null;
      syncControls(); renderMap(); renderPane(); saveHistory();
      if (state.selected) readSelected();
      else {
        const heading = $(".browser-heading h3", mounts.map);
        revealReaderTarget(heading);
        heading?.focus({ preventScroll: true });
      }
    } else if (d.act === "restore-route" && state.route) traceRoute(state.route, { read: true, trigger: t });
    else if (d.act === "close-connection") closeConnection();
    else if (d.act === "close-profile" || d.act === "return-event") closeProfile();
    else if (d.act === "clear") resetView();
    else if (d.act === "deselect") clearSelection(true);
    else if (d.act === "locate") revealMap();
    else if (d.act === "show-sources") {
      const heading = $("#atlas-event-sources", mounts.map);
      revealReaderTarget(heading);
      heading?.focus({ preventScroll: true });
    }
  });
  // A route lights its events on the map and opens its first stop, or the stop linked from the URL.
  function traceRoute(route, opts = {}) {
    if (opts.history !== false) saveHistory(true, true, opts.trigger);
    state.route = route; state.org = null; state.query = ""; state.queryInput = ""; state.selected = null; state.connection = null; connectionHover = null; connectionFocus = null; state.focus = route.event_ids[0]; state.era = null;
    if (state.routeShown !== route.id) { state.routeShown = route.id; renderRoutes(); }
    if (state.profile && state.profileDock === "timeline") { state.profile = null; state.affiliationIndex = null; renderProfile(); }
    route.event_ids.forEach((id) => { const e = byId.get(id); if (e) state.lanes.add(e.lane); });
    const available = routeAvailable();
    const stop = available.includes(opts.stop) ? opts.stop : available[0];
    if (stop && opts.read && opts.history !== false && splitWorkspace.matches) collapseComputeGuide();
    if (stop) select(stop, { history: false, keepEra: true });
    else { syncControls(); renderMap(); renderPane(); }
    updateOverview(); if (opts.history !== false) saveHistory();
    if (opts.read && stop) readSelected();
    else revealMap();
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
      if (ev.defaultPrevented || !ev.target.closest(".atlas")) return;
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
    if (ev.key === "Home" || ev.key === "End") { const seq = stepSequence(); if (seq.length) { ev.preventDefault(); select(seq[ev.key === "Home" ? 0 : seq.length - 1], { focus: true, keepEra: true, replace: true }); } }
  });

  mountMap(); renderRoutes(); renderPeople(); renderIndex();
  function fromHash() {
    let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
    const section = Object.keys(tabIds).find(k => tabIds[k] === id);
    if (section) { setPanel(section); revealReaderTarget(document.getElementById(id)); return; }
    const [routeId, stop] = id.split("/");
    const route = D.threads.find((t) => t.id === routeId);
    if (route) {
      // "#thread-id" starts the route (again); "#thread-id/event-id" opens that stop of it.
      traceRoute(route, { history: false, read: true, stop });
      return;
    }
    const profile = profileFromHash(id);
    if (profile && profileRecord(profile)) openProfile(profile, { history: false, focus: false, reveal: true, dock: "people" });
    else if (byId.has(id)) select(id, { history: false, card: true });
  }
  function restoreSnapshot(saved, fromHistory = false) {
    if (!saved) return false;
    state.selected = byId.has(saved.selected) ? saved.selected : null; state.focus = state.selected;
    const connection = connectionByKey.get(saved.connection);
    state.connection = connection && [connection.from, connection.to].includes(state.selected) ? saved.connection : null; connectionHover = null; connectionFocus = null; connectionTrigger = null;
    state.route = D.threads.find((t) => t.id === saved.route) || null; state.org = orgById.get(saved.org) || null;
    state.query = saved.query || ""; state.queryInput = saved.queryInput == null ? state.query : saved.queryInput; state.zoom = saved.zoom || 1;
    state.lanes = new Set(saved.lanes || D.lanes.map((l) => l.id));
    state.era = Number.isInteger(saved.era) && D.eras[saved.era] ? saved.era : null;
    state.profile = profileRecord(saved.profile) ? saved.profile : null; state.profileDock = saved.profileDock || "people"; state.affiliationIndex = saved.affiliationIndex == null ? null : saved.affiliationIndex;
    profileTrigger = null;
    state.routeShown = saved.routeShown || state.routeShown;
    preservedMapScroll = saved.scrollLeft || 0;
    setPanel(saved.tab || (state.profile && state.profileDock === "people" ? "people" : "map"));
    preservedMapScroll = saved.scrollLeft || 0;
    syncControls(); renderMap(); renderPane(); renderProfile(); renderRoutes(); mapScroll.scrollLeft = saved.scrollLeft || 0; updateOverview();
    const list = $(".event-scroll-list", mounts.map); if (list) list.scrollTop = saved.listScrollTop || 0;
    const connections = $(".conn-group", mounts.map), steps = $(".route-stop-list", mounts.map);
    if (connections && saved.connectionsOpen != null) connections.open = saved.connectionsOpen;
    if (steps && saved.stepsOpen != null) steps.open = saved.stepsOpen;
    const guide = $(".compute-guide", mounts.map);
    if (guide && saved.computeGuideOpen != null) guide.open = saved.computeGuideOpen;
    if (state.profile && profilePanel) profilePanel.scrollTop = saved.profileScrollTop || 0;
    if (fromHistory) restoreReadingPosition(saved);
    return true;
  }
  function restoreReadingPosition(saved) {
    const link = saved.returnLink;
    const list = link && Object.hasOwn(returnLists, link.list) && returnLists[link.list];
    const origin = list && $(`${list[0]} [${list[1]}="${CSS.escape(link.event)}"]`);
    const heading = saved.tab === "map" && saved.route && $(".pane h3", mounts.map);
    const target = origin || heading;
    if (!target) return;
    // The browser restores its fragment position and focus after popstate.
    const previousFocus = document.activeElement;
    requestAnimationFrame(() => {
      const focus = document.activeElement;
      if (!target.isConnected || (focus !== previousFocus && focus !== document.body && focus !== document.getElementById(tabIds[saved.tab]))) return;
      target.focus({ preventScroll: true });
      const box = target.getBoundingClientRect();
      if (box.top < readerInset(target) - 2 || box.bottom > innerHeight) {
        if (origin) {
          target.scrollIntoView({ block: "nearest", behavior: "instant" });
          if (target.getBoundingClientRect().top < readerInset(target)) revealReaderTarget(target, "instant");
        } else {
          revealReaderTarget($(".route-stepper", mounts.map) || target, "instant");
        }
      }
    });
  }
  // A fragment navigation may fire both events. Apply the saved entry or parse its URL once.
  let appliedHash = null;
  function applyHash() { fromHash(); saveHistory(true, true); }
  addEventListener("popstate", (ev) => {
    if (!restoreSnapshot(ev.state?.atlas, true)) applyHash();
    appliedHash = location.hash;
  });
  addEventListener("hashchange", () => {
    if (appliedHash !== location.hash) applyHash();
    appliedHash = null;
  });
  // MathJax loads after this script: once it is ready, redraw the parts that show formulas.
  addEventListener("atlas-math-ready", () => {
    document.head.appendChild(MathJax.svgStylesheet());
    const inPane = $(".pane-host", mounts.map)?.contains(document.activeElement);
    renderPane(); renderRoutes();
    if (inPane) $(".pane h3", mounts.map)?.focus({ preventScroll: true });
  });
  setPanel("map");
  if (!restoreSnapshot(history.state?.atlas)) applyHash();
})();
