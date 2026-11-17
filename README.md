# Personal site

Quarto source for Sergei Solovev's personal site. The source repository and the rendered site are public.
Site address: `https://sergeisoly.github.io/`.

## Structure

- `index.qmd`: selected research, interactive projects and up to three recent posts.
- `research.qmd`: research catalogue entries with a project description and a link to each project's overview.
- `projects.qmd`: standalone tools and interactive explainers. The project list also appears on Home.
- `posts.qmd`: all essays, notes, and observations in reverse chronological order.
- `about.qmd`: the author's chosen personal introduction and contact links.
- `posts/<slug>/index.qmd`: one entry, with any supporting images beside it.

The separate `interesearch` repository owns the code, exported measurements, papers, PDFs, and short summaries.
This site links to `/interesearch/`; it does not copy paper sources or run experiments. Future research
projects can have their own repositories and appear in the same Research catalogue.

## Work locally

Run the following commands from the personal-site repository root, where `_quarto.yml` is located:

```bash
quarto preview
```

Preview may display draft posts. A release render excludes them from listings, search, sitemap, and RSS. The post-render script also removes their empty HTML placeholders:

```bash
quarto render
```

Links to `/interesearch/` need the two sites served under one root to work locally. From the separate
`interesearch` repository root, run `quarto render papers --profile publish`, then place its `papers/_site/` at `interesearch/` inside a
temporary copy of this site's `_site/`. Serve that temporary root with a local HTTP server. Do not copy
research content into this repository's source.

## Update PIRAMID Observatory

The Projects page opens the presentation at `/piramid-observatory/`. Before rendering, Quarto builds the pinned commit of [PIRAMID Observatory](https://github.com/sergeisoly/piramid-observatory). This requires Git, Node.js 22.12 or newer, npm and rsync. The first build fetches the sources and dependencies. Subsequent renders reuse the local build for that revision.

To update the presentation, set `revision` in `scripts/build-observatory.sh` to the full published commit SHA and run `quarto render`. The blog tracks the build instruction. Generated assets are published with the rendered site in `gh-pages`.

## Add an entry

Create `posts/<descriptive-slug>/index.qmd`:

```yaml
---
title: "A title that says what the entry is about"
description: "One sentence for the listing."
date: 2026-10-13
kind: Note
categories: [evaluation]
draft: true
---
```

Use `kind: Note`, `Essay`, or `Observation` when helpful. Categories describe topics, and can be omitted.
These labels do not require separate sections or a minimum length. Write the entry below the metadata.
Keep `draft: true` until author review is complete; then remove it and use the actual publication date.

The posts archive and home page update automatically. `_writing-list.ejs.md` handles both empty and
populated listings without client-side filtering. The home page shows recent writing only when there is
a published entry. `posts.xml` is the RSS feed; the old `writing.html` address redirects to `posts.html`. Add filters or topic pages only when the archive needs them.

## Add a project

Add its title, preview, one-sentence description and direct link to `_project-list.qmd`. A project can be a Quarto page under `projects/<slug>/` or a standalone app served as a site resource. The Posts listing and its RSS feed are reserved for writing.

## Add a research study

Add a section to `research.qmd` with the question, a short description, and a link to the project overview.
Update the selected work on `index.qmd` if appropriate. Keep study-specific format links with the project
overview; Home may link directly to featured summaries. Keep full results with their project.

## Hosting

A custom domain belongs to this personal site; project sites can inherit it without copying their content.
When choosing a domain, update `website.site-url` here and the research project's publication URLs and
cross-site navigation links.

Publishing is a separate step after author approval. For Quarto's GitHub Pages publishing method, configure
Pages to serve the `gh-pages` branch (root). See the
[Quarto GitHub Pages guide](https://quarto.org/docs/publishing/github-pages.html).
