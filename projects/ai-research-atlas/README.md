# AI Research Atlas

How did a method for teaching a simulated robot become part of the training recipe for ChatGPT? The Atlas follows questions like this across four timelines covering safety, learning agents, language models and institutions. Each event card links to its sources.

[Explore the map](https://sergeisoly.github.io/projects/ai-research-atlas/) · [Follow the human feedback route](https://sergeisoly.github.io/projects/ai-research-atlas/#thread-human-feedback)

## How the page works

| File | Role |
| --- | --- |
| [index.qmd](index.qmd) | Quarto page, entry questions, reading list and author’s notes on selection and coverage |
| [data.js](data.js) | Public snapshot of events, typed connections, reading routes, profiles and compute estimates |
| [atlas.js](atlas.js) | Renders the map and readers, handles search and keyboard input, and restores views from URLs and browser history |
| [diagrams.js](diagrams.js) | Builds the explanatory SVGs and maps them to the cards they illustrate |
| [atlas.css](atlas.css) | Atlas typography, lane colours and responsive layouts inside the blog |

A route is an ordered list of event IDs. Cards can appear on several routes. An event’s connections record a relationship and an editorial note, so a reader can follow the same relationship from either endpoint. Keep the IDs stable when editing titles or dates. Bookmarks use `#event-id` for a card and `#thread-id/event-id` for a stop on a route.

The compute line tracks the running maximum of documented training-compute estimates in the November 2026 snapshot. The labelled dots are individual models. The line depends on which estimates were available in the dataset. [Epoch AI model data](https://epoch.ai/data/ai-models) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Local development

From the site root, run `node --test tests/atlas-links.test.cjs` to check internal reading paths. Start `quarto preview` and open `/projects/ai-research-atlas/` to test the page in its blog layout. The site README describes the requirements for the Quarto build.
