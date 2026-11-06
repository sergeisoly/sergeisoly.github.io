# Event schema for the AI history timeline

Shared by all research agents. Output is one JSON file per lane: `{"lane": "...", "as_of": "2026-11-06", "events": [...], "notes": "..."}`.

The site is a research navigator for readers learning how alignment, reinforcement learning, language models and institutions developed. Content is in English, plain and precise. Each card explains the problem, idea, contribution and limitations. Its selection is strongest in alignment, agent reliability and catastrophic-risk research, with US/UK institutional coverage; it is not a complete history of AI safety.

## Event object

```json
{
  "id": "safety-2016-concrete-problems",
  "lane": "safety | rl | lm | gov",
  "date": "2016-06-21",
  "date_precision": "day | month | year",
  "date_basis": "arXiv v1 | blog post | conference | press release | book publication | founding announcement | journal publication | thesis | report",
  "date_context": "Optional reader-facing explanation of the dated milestone, later developments or source uncertainty.",
  "title": "Concrete Problems in AI Safety",
  "label": "Concrete Problems in AI Safety",
  "kind": "paper | blog | system | book | org | policy | event | benchmark",
  "importance": 3,
  "problem": "1-2 sentences: what was unclear or not working then.",
  "idea": "1-2 sentences: what was proposed or shown.",
  "changed": "1-2 sentences: why it matters for what came later.",
  "limits": "1-2 sentences: what it did not solve, caveats, criticism.",
  "people": ["Dario Amodei", "Chris Olah"],
  "orgs": ["Google Brain", "OpenAI"],
  "sources": [
    {"label": "Paper (arXiv)", "url": "https://arxiv.org/abs/1606.06565", "kind": "primary"},
    {"label": "Author blog post", "url": "...", "kind": "explainer"}
  ],
  "links": [{"to": "rl-2017-deep-rl-human-prefs", "type": "builds_on | responds_to | enables | tests | critiques | parallel", "note": "short reason"}],
  "tags": ["reward hacking", "side effects"],
  "terms": [{"term": "reward hacking", "def": "one-sentence definition"}],
  "verified": {"date": true, "urls": true, "note": "what you checked or what remains uncertain"}
}
```

Rules:

- `importance`: 3 = anchor shown on the overview map (aim for about a third of events), 2 = standard, 1 = detail.
- `label`: at most 5 words, for a node on the map.
- Dates identify the milestone named by `date_basis`; they are not universally first appearances. A journal publication, preprint, launch and demonstration may have different dates. For compound cards, identify which part anchors the position and date later developments in the text. `date_basis` is a descriptive string, not a closed enum; use an accurate term rather than an inaccurate existing value.
- `date_precision` controls the displayed day/month/year; `date` must be a valid ISO calendar date or partial year/month. `verified.date` means its date was checked, not that all historical claims are proven. Retain checking evidence in `verified.note`; put meaningful reader-facing qualifications in `date_context`.
- URLs: prefer arXiv abs pages, official blogs, conference proceedings. Check each URL resolves. Never invent a URL.
- `links` may point to any existing event ID in the four canonical lane files. The anchor list below is historical orientation, not an exhaustive allowlist. Resolve actual IDs before editing; the builder fails on dangling references and unknown relation types. A thematic connection is not evidence of direct influence: use `parallel` for comparison and a causal relation only when supported. Explain compound-event dependencies in the link note.
- Be truthful about contested claims. Write "authors claim", "critics argue" where appropriate. No hype.
- Do not copy long passages from sources; write in your own words.

## Cross-lane anchor ids (owned by the named lane; reference freely)

lm: `lm-2017-transformer`, `lm-2018-gpt1`, `lm-2018-bert`, `lm-2019-gpt2`, `lm-2020-gpt3`, `lm-2020-scaling-laws`, `lm-2022-chinchilla`, `lm-2022-cot-prompting`, `lm-2022-chatgpt`, `lm-2023-gpt4`, `lm-2023-llama`
rl: `rl-1988-td-learning`, `rl-1992-q-learning`, `rl-2013-dqn`, `rl-2016-alphago`, `rl-2017-ppo`, `rl-2017-alphazero`, `rl-2022-react`, `rl-2023-dpo`, `rl-2023-toolformer`, `rl-2024-o1`, `rl-2025-deepseek-r1`, `rl-2023-swe-bench`
safety: `safety-2014-superintelligence`, `safety-2016-concrete-problems`, `safety-2017-deep-rl-human-prefs`, `safety-2018-debate`, `safety-2018-ida`, `safety-2019-mesa-optimization`, `safety-2022-instructgpt`, `safety-2022-constitutional-ai`, `safety-2023-ai-control`, `safety-2023-weak-to-strong`, `safety-2024-sleeper-agents`, `safety-2024-alignment-faking`, `safety-2022-toy-models-superposition`, `safety-2023-towards-monosemanticity`, `safety-2025-emergent-misalignment`
gov: `gov-2023-cais-statement`, `gov-2023-bletchley`, `gov-2023-rsp`, `gov-2024-eu-ai-act`, `gov-2025-intl-ai-safety-report`

Ownership of borderline items: Christiano et al. 2017 human preferences, InstructGPT, Constitutional AI → safety. PPO, DPO, GRPO, RL-for-reasoning (o1, R1), agents and tool use → rl. Instruction tuning (FLAN, T0), chain-of-thought prompting, ChatGPT launch → lm. Organisations, policy, summits, labs' safety frameworks → gov.

## Structural validation and publication

`build_data.py` validates calendar dates, stable IDs, relation types, source URL syntax and graph references before generating assets. It does not silently delete broken links or reinterpret unknown relations. Source availability, factual correctness and historical causality need separate checks. The public data includes research events, routes, organisations, people and compute; the Pivotal mentor dossier stays in `research/gov.json` and is omitted from `site/data.js`.
