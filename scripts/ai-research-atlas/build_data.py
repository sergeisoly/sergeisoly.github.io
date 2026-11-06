#!/usr/bin/env python3
"""Merge research/*.json lanes into site/data.js and write research/VALIDATION.md.

Usage: python3 build_data.py
"""
import json
import argparse
import re
import shutil
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
RESEARCH = ROOT / "research"
SITE = ROOT / "site"
LANES = [
    {"id": "safety", "title": "Safety & alignment", "short": "Safety"},
    {"id": "rl", "title": "RL & agents", "short": "RL & agents"},
    {"id": "lm", "title": "ML, deep learning & LLMs", "short": "Models"},
    {"id": "gov", "title": "Institutions & governance", "short": "Institutions"},
]
LINK_TYPES = {"builds_on", "responds_to", "enables", "tests", "critiques", "parallel"}


def load(name):
    p = RESEARCH / f"{name}.json"
    if not p.exists():
        return None
    return json.loads(p.read_text())


def norm_date(ev):
    d = str(ev.get("date", "")).strip()
    m = re.fullmatch(r"(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?", d)
    if not m:
        return None
    y, mo, da = m.group(1), m.group(2) or "01", m.group(3) or "01"
    try:
        date(int(y), int(mo), int(da))
    except ValueError:
        return None
    if not ev.get("date_precision"):
        ev["date_precision"] = "day" if m.group(3) else "month" if m.group(2) else "year"
    return f"{y}-{mo}-{da}"


POST = ROOT / "post"
ASSETS = ["atlas.css", "atlas.js", "diagrams.js", "data.js"]


def md_inline(t):
    def link(m):
        label, href = m.groups()
        external = ' target="_blank" rel="noopener"' if urlsplit(href).scheme in {"https", "http"} else ""
        return f'<a href="{href}"{external}>{label}</a>'
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, t)
    return re.sub(r"\*([^*]+)\*", r"<em>\1</em>", t)


def validate_graph(events, threads, orgs):
    """Reject broken navigation rather than silently omitting it from the site."""
    problems, ids = [], set()
    for ev in events:
        eid = ev.get("id", "")
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", eid):
            problems.append(f"invalid event id {eid!r}")
        if eid in ids:
            problems.append(f"duplicate id {eid}")
        ids.add(eid)
        if not norm_date(ev):
            problems.append(f"{eid}: invalid calendar date {ev.get('date')!r}")
        if ev.get("date_precision") not in {"day", "month", "year"}:
            problems.append(f"{eid}: invalid date precision")
        if not ev.get("date_basis"):
            problems.append(f"{eid}: missing date basis")
        for source in ev.get("sources", []):
            parsed = urlsplit(source.get("url", ""))
            if parsed.scheme not in {"https", "http"} or not parsed.netloc:
                problems.append(f"{eid}: invalid source URL {source.get('url')!r}")
    for ev in events:
        for link in ev.get("links", []):
            if link.get("to") not in ids:
                problems.append(f"{ev['id']}: unknown linked event {link.get('to')}")
            if link.get("type") not in LINK_TYPES:
                problems.append(f"{ev['id']}: unknown relation {link.get('type')}")
    for kind, objects, field in [("route", threads, "event_ids"), ("organisation", orgs, "key_event_ids")]:
        seen = set()
        for obj in objects:
            if obj.get("id") in seen:
                problems.append(f"duplicate {kind} id {obj.get('id')}")
            seen.add(obj.get("id"))
            for eid in obj.get(field, []):
                if eid not in ids:
                    problems.append(f"{kind} {obj.get('id')}: unknown event {eid}")
    return problems


def qmd_to_html(text):
    """Tiny converter for the constructs post/index.qmd uses (front matter, ##, paragraphs, ::: divs, raw html)."""
    fm, body = text.split("---", 2)[1:]
    meta = dict(re.findall(r'^(title|description|date): "?(.*?)"?$', fm, re.M))
    out, para, raw = [], [], False
    def flush():
        if para:
            out.append("<p>" + md_inline(" ".join(para)) + "</p>")
            para.clear()
    for line in body.splitlines():
        if raw:
            if line.strip() == "```":
                raw = False
            else:
                out.append(line)
            continue
        if line.startswith("```{=html}"):
            flush(); raw = True
        elif line.startswith("::: {"):
            flush(); out.append(f'<div class="{line[5:-1].strip().lstrip(".")}">')
        elif line.strip() == ":::":
            flush(); out.append("</div>")
        elif line.startswith("## "):
            flush(); h = line[3:].strip()
            out.append(f'<h2 id="{re.sub(r"[^a-z0-9]+", "-", h.lower()).strip("-")}">{h}</h2>')
        elif not line.strip():
            flush()
        else:
            para.append(line.strip())
    flush()
    return meta, "\n".join(out)


def publish_post(standalone=True):
    for name in ASSETS:
        shutil.copyfile(SITE / name, POST / name)
    if standalone:
        meta, body = qmd_to_html((POST / "index.qmd").read_text())
        tpl = (SITE / "page.template.html").read_text()
        page = tpl.replace("{{title}}", meta.get("title", "")).replace("{{description}}", meta.get("description", "")).replace("{{body}}", body)
        (SITE / "index.html").write_text(page)


def main(standalone=True):
    events, threads, eras, orgs, people, pivotal = [], [], [], [], [], None
    problems, notes = [], {}
    for lane in [l["id"] for l in LANES]:
        data = load(lane)
        if data is None:
            problems.append(f"missing research/{lane}.json")
            continue
        notes[lane] = data.get("notes", "")
        for ev in data.get("events", []):
            ev.setdefault("lane", lane)
            if ev["lane"] != lane:
                problems.append(f"{ev.get('id')}: lane {ev['lane']} in {lane}.json")
            ev["date_sort"] = norm_date(ev)
            if not ev["date_sort"]:
                problems.append(f"{ev.get('id')}: bad date {ev.get('date')!r}")
                continue
            ev.setdefault("importance", 2)
            ev.setdefault("label", ev.get("title", ev["id"])[:40])
            for k in ("people", "orgs", "sources", "links", "tags", "terms"):
                ev.setdefault(k, [])
            events.append(ev)
        for t in data.get("threads", []):
            t.setdefault("lane", lane)
            threads.append(t)
        eras += data.get("eras", [])
        orgs += data.get("orgs", [])
        people += data.get("people", [])
        if data.get("pivotal"):
            pivotal = data["pivotal"]

    problems.extend(validate_graph(events, threads, orgs))
    if problems:
        raise SystemExit("Data validation failed; generated assets were not changed:\n" + "\n".join(f"- {p}" for p in problems))

    events.sort(key=lambda e: e["date_sort"])
    out = {
        "generated": date.today().isoformat(),
        "lanes": LANES,
        "events": events,
        "threads": threads,
        "eras": sorted(eras, key=lambda e: str(e.get("start"))),
        "orgs": orgs,
        "people": people,
        # The Pivotal mentor mapping is interview prep; it stays in research/gov.json and out of the public post.
        "compute": load("compute"),
    }
    (SITE / "data.js").write_text(
        "window.TIMELINE_DATA = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n"
    )
    publish_post(standalone=standalone)
    unverified = [e["id"] for e in events if not (e.get("verified") or {}).get("date")]
    by_lane = {l["id"]: sum(e["lane"] == l["id"] for e in events) for l in LANES}
    report = [
        "# Data validation",
        "",
        f"Built {out['generated']}. Events by lane: {by_lane}. Threads {len(threads)}, eras {len(eras)}, orgs {len(orgs)}, people {len(people)}.",
        "",
        "## Problems",
        *([f"- {p}" for p in problems] or ["- none"]),
        "",
        "## Graph integrity",
        "- Event IDs, calendar dates, source URL syntax, relation types and referenced event IDs passed structural validation. No links were silently dropped. This does not verify the historical claims or external link availability.",
        "",
        "## Dates not marked verified",
        *([f"- {u}" for u in unverified] or ["- none"]),
        "",
        "## Agent notes",
        *[f"- **{k}**: {v}" for k, v in notes.items() if v],
    ]
    (RESEARCH / "VALIDATION.md").write_text("\n".join(report) + "\n")
    print("\n".join(report[:4]))
    print(f"problems={len(problems)} unverified={len(unverified)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--post-dir", type=Path, help="Quarto post directory; defaults to post/ beside this builder")
    parser.add_argument("--skip-standalone", action="store_true", help="Build the Quarto assets without the standalone HTML preview")
    args = parser.parse_args()
    if args.post_dir:
        POST = args.post_dir.resolve()
    if not (POST / "index.qmd").is_file():
        parser.error(f"Post source not found: {POST / 'index.qmd'}")
    main(standalone=not args.skip_standalone)
