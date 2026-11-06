# AI Research Atlas source

This package owns the source data and interactive assets for
`posts/ai-research-atlas/`. The Quarto post is a draft; rebuilding does not publish it.

## Edit and build

Run from the repository root with Python 3.9 or later:

```bash
python3 scripts/ai-research-atlas/refresh_compute.py --check --test
python3 -m unittest discover -s scripts/ai-research-atlas/tests -p 'test_build_data.py' -v
python3 scripts/ai-research-atlas/build_data.py --post-dir posts/ai-research-atlas --skip-standalone
quarto render
```

Edit event prose and relations in `research/{safety,rl,lm,gov}.json`, diagrams in
`site/diagrams.js`, interactions in `site/atlas.js`, styles in `site/atlas.css`, and
article text directly in `posts/ai-research-atlas/index.qmd`. The builder copies
assets and produces `data.js`; do not edit those generated post assets independently.
It rejects broken event references, relation types and calendar dates before writing.
The local validation report checks structure, not historical truth or live source availability.

The timeline combines era selection, event browsing and an adjacent reading panel.
People, organisations and affiliation bars offer hover/focus previews and open a
selected profile. Mobile readers switch between the map and reading area. The
browser suite covers these transitions, history and focus restoration, source
access, chart bounds and actual-theme layout in 26 scenarios.

Use `quarto preview` to inspect the draft. A release render deliberately omits draft
posts from the published site. Keep `draft: true` until the author chooses to publish.

The browser regressions use an existing Playwright installation and Chrome. Point
`ATLAS_URL` at the running draft preview and run
`node scripts/ai-research-atlas/tests/navigation.cjs`. Set `PLAYWRIGHT_MODULE` and
`CHROME_PATH` when those dependencies are outside the normal module/browser paths.
`ATLAS_SCREENSHOT_DIR` optionally records desktop, mobile and diagram captures.

## Evidence and compute

`research/SCHEMA.md` describes date anchors, sources and relations. A relation can be
a supported historical dependency or an explicitly thematic comparison. Source checks
are bounded; visible date context and limitations should be retained when editing.

The pinned Epoch CSV and its metadata live in `research/sources/`. `compute.json`
preserves selected labelled examples and a running maximum across all eligible
documented estimates, with population, selection, confidence and date policies.
`refresh_compute.py --write` reproduces it offline from that snapshot. It does not
silently fetch a new dataset. Updating the snapshot requires reviewing its date,
hash, licensing, inclusion criteria and changed estimates. Epoch data is credited
under CC BY 4.0; see the metadata and the post's source section.

The public package contains research facts and source provenance. Private interview
preparation and author drafting notes are not part of this package.
