#!/usr/bin/env python3
"""Reproduce the compute envelope from the pinned Epoch CSV, without network access.

Run with --write to regenerate research/compute.json, or --check --test to validate.
The curated examples are preserved; their selection does not define the envelope.
"""

import argparse
from collections import Counter, defaultdict
import csv
from datetime import date
import hashlib
import io
import json
import math
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parent
RESEARCH = ROOT / "research"
COMPUTE = RESEARCH / "compute.json"
MANIFEST = RESEARCH / "sources/epoch-notable_ai_models-2026-11-06.meta.json"
CUTOFF = "2026-11-06"
CURATED_SHA256 = "7523361ee20ddf87975d662c84e6af9ff1988ee03ba4f1bb8e7efcd1c3b3f86e"
FIELDS = ("model", "date", "flop", "confidence", "domain")
EXCLUSIONS = ("invalid_date", "after_cutoff", "missing_compute", "nonnumeric_compute", "nonpositive_or_nonfinite_compute")


def digest_points(points):
    return hashlib.sha256(json.dumps(points, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def select_rows(rows, cutoff):
    """Return every eligible row, with mutually exclusive exclusion counts.

    Dates must be complete ISO calendar dates. Labels, domains, and confidence
    never determine eligibility. Source order is only the final tie breaker.
    """
    cutoff_date = date.fromisoformat(cutoff)
    counts = dict.fromkeys(EXCLUSIONS, 0)
    eligible = []
    for source_index, row in enumerate(rows):
        raw_date = row.get("Publication date", "").strip()
        try:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_date):
                raise ValueError("not a complete ISO date")
            parsed_date = date.fromisoformat(raw_date)
        except ValueError:
            counts["invalid_date"] += 1
            continue
        if parsed_date > cutoff_date:
            counts["after_cutoff"] += 1
            continue
        raw_compute = row.get("Training compute (FLOP)", "").strip()
        if not raw_compute:
            counts["missing_compute"] += 1
            continue
        try:
            flop = float(raw_compute)
        except ValueError:
            counts["nonnumeric_compute"] += 1
            continue
        if not math.isfinite(flop) or flop <= 0:
            counts["nonpositive_or_nonfinite_compute"] += 1
            continue
        eligible.append({
            "model": row.get("Model", ""), "date": raw_date, "flop": flop,
            "confidence": row.get("Confidence", ""), "domain": row.get("Domain", ""),
            "_source_index": source_index,
        })
    return eligible, counts


def envelope(eligible):
    """Daily maximum first, then strict cumulative maximum; no intraday ordering."""
    days = defaultdict(list)
    for point in eligible:
        days[point["date"]].append(point)
    points = []
    high = -math.inf
    for day in sorted(days):
        winner = min(days[day], key=lambda p: (-p["flop"], p["model"], p["_source_index"]))
        if winner["flop"] > high:
            points.append({key: winner[key] for key in FIELDS})
            high = winner["flop"]
    return points


def load_snapshot():
    manifest = json.loads(MANIFEST.read_text())
    payload = (RESEARCH / manifest["path"]).read_bytes()
    if hashlib.sha256(payload).hexdigest() != manifest["sha256"]:
        raise ValueError("Pinned Epoch snapshot SHA-256 mismatch")
    if len(payload) != manifest["bytes"]:
        raise ValueError("Pinned Epoch snapshot byte count mismatch")
    reader = csv.DictReader(io.StringIO(payload.decode("utf-8-sig"), newline=""))
    required = {"Model", "Publication date", "Training compute (FLOP)", "Confidence", "Domain"}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError("Epoch CSV does not have the required source columns")
    rows = list(reader)
    if len(rows) != manifest["row_count"]:
        raise ValueError("Pinned Epoch snapshot row count mismatch")
    return manifest, rows


def regenerate(current):
    manifest, rows = load_snapshot()
    curated = current["points"]
    if digest_points(curated) != CURATED_SHA256:
        raise ValueError("Curated points changed; review that selection explicitly")
    eligible, exclusions = select_rows(rows, CUTOFF)
    selected_by_name = defaultdict(list)
    for point in eligible:
        selected_by_name[point["model"]].append({key: point[key] for key in FIELDS})
    if any(point not in selected_by_name[point["model"]] for point in curated):
        raise ValueError("A curated point no longer matches its pinned source row")
    days = Counter(point["date"] for point in eligible)
    return {
        "source": "Epoch AI, Data on AI models (CC BY 4.0)",
        "source_url": manifest["source_url"],
        "source_page_url": manifest["source_page_url"],
        "retrieved": manifest["retrieved"],
        "cutoff_date": CUTOFF,
        "snapshot": {key: manifest[key] for key in ("path", "metadata_path", "sha256", "bytes", "row_count", "upstream_updated", "retrieved_at_utc")},
        "license": manifest["license"],
        "metric": {
            "source_column": "Training compute (FLOP)",
            "unit": "FLOP, following Epoch's convention",
            "description": "Total training compute as recorded by Epoch, including pretrained components; not inference compute, training cost, capability, or safety.",
            "comparability_note": "Epoch uses operation counts for some early systems and does not normalize arithmetic precision. Training recipes and accounting differ across systems; these estimates are not a homogeneous measurement series.",
            "documentation_url": "https://epoch.ai/data/ai-models-documentation/estimation",
        },
        "points_label": "Curated examples; labels do not define the envelope population",
        "frontier_label": "Running maximum of documented estimates",
        "population": {
            "description": "Every row in the pinned notable_ai_models.csv with a complete valid publication date on or before the cutoff and a positive finite numeric training-compute value.",
            "source_rows": len(rows), "eligible_rows": len(eligible), "eligible_dates": len(days),
            "excluded_rows": sum(exclusions.values()), "exclusions": exclusions,
            "dates_with_multiple_eligible_rows": sum(count > 1 for count in days.values()),
        },
        "method": {
            "description": "For each eligible publication date, take the largest training-compute estimate; emit a point only when that daily maximum strictly exceeds every earlier eligible estimate.",
            "date_policy": "Use Epoch's Publication date as supplied, not training completion or the date a compute estimate became public. No historical as-known-at-the-time inference is made.",
            "same_date_policy": "Same-day rows are simultaneous: take their maximum before updating the envelope. For exact ties, choose the lexicographically first model name, then the first row in the pinned CSV; this changes only the displayed label, not the maximum.",
            "equal_compute_policy": "A later estimate equal to the existing maximum does not create another envelope change.",
            "no_other_filters": "No domain, organization, era, confidence, notability-field, or source Frontier model flag filter is applied; no outliers are removed. Missing compute is not imputed. Duplicate source rows cannot change the maximum.",
            "fit_policy": "No local growth regression, doubling time, interpolation-based estimate, or extrapolation is calculated. This strict maximum is distinct from Epoch's published running-top-N frontier definitions.",
        },
        "uncertainty_note": "This envelope summarizes central estimates documented in one non-exhaustive Epoch snapshot, not the absolute world record. Missing models and compute values, uncertain estimates, and retrospective revisions can change its level and apparent leaders. Uncertainty is not propagated into an envelope confidence interval.",
        "confidence_note": "Confidence retains Epoch's row-level label. It describes the least certain of nonempty training compute, parameter count, and training dataset size, rather than a compute-specific error bar. Likely and Speculative points remain eligible; exact source precision does not imply measurement precision.",
        "points": curated,
        "frontier_points": envelope(eligible),
    }


class ComputeValidation(unittest.TestCase):
    @staticmethod
    def row(model, day, flop, confidence="Confident", domain="Other"):
        return {"Model": model, "Publication date": day, "Training compute (FLOP)": str(flop), "Confidence": confidence, "Domain": domain}

    def test_eligibility_boundaries(self):
        rows = [self.row("cutoff", CUTOFF, 5), self.row("unknown confidence", "1950-01-01", 2, "Unknown", ""),
                self.row("future", "2026-11-07", 1000), self.row("incomplete", "2026-11", 4),
                self.row("invalid", "2026-02-30", 4), self.row("compact", "20261106", 4),
                self.row("blank", CUTOFF, ""), self.row("text", CUTOFF, "not known"),
                *[self.row(str(x), CUTOFF, x) for x in (0, -1, "nan", "inf", "-inf", "1e999")]]
        eligible, counts = select_rows(rows, CUTOFF)
        self.assertEqual([p["model"] for p in eligible], ["cutoff", "unknown confidence"])
        self.assertEqual(counts, dict(zip(EXCLUSIONS, (3, 1, 1, 1, 6))))
        self.assertEqual(len(rows), len(eligible) + sum(counts.values()))

    def test_simultaneous_dates_ties_and_later_equal_values(self):
        rows = [self.row("Z", "2000-01-01", 8), self.row("A", "2000-01-01", 8, "Speculative"),
                self.row("low same day", "2000-01-01", 2), self.row("later equal", "2000-02-01", 8),
                self.row("new", "2000-03-01", 9), self.row("new", "2000-03-01", 9)]
        points = envelope(select_rows(rows, CUTOFF)[0])
        self.assertEqual([(p["model"], p["flop"]) for p in points], [("A", 8), ("new", 9)])
        self.assertEqual(points[0]["confidence"], "Speculative")
        self.assertEqual(points, envelope(select_rows(list(reversed(rows)), CUTOFF)[0]))

    def test_pinned_counts_and_curated_provenance(self):
        current = json.loads(COMPUTE.read_text())
        rebuilt = regenerate(current)
        self.assertEqual(digest_points(current["points"]), CURATED_SHA256)
        self.assertEqual(len(current["points"]), 31)
        self.assertEqual(rebuilt, current)
        self.assertEqual(rebuilt["population"]["source_rows"], 1092)
        self.assertEqual(rebuilt["population"]["eligible_rows"], 543)
        self.assertEqual(rebuilt["population"]["exclusions"], dict(zip(EXCLUSIONS, (0, 0, 549, 0, 0))))
        self.assertEqual(len(rebuilt["frontier_points"]), 36)

    def test_envelope_against_independent_brute_force_maximum(self):
        _, rows = load_snapshot()
        eligible, _ = select_rows(rows, CUTOFF)
        actual = json.loads(COMPUTE.read_text())["frontier_points"]
        self.assertEqual(len({p["date"] for p in actual}), len(actual))
        self.assertTrue(all(a["date"] < b["date"] and a["flop"] < b["flop"] for a, b in zip(actual, actual[1:])))
        for day in sorted({p["date"] for p in eligible}):
            expected = max(p["flop"] for p in eligible if p["date"] <= day)
            self.assertEqual(max(p["flop"] for p in actual if p["date"] <= day), expected, day)

    def test_review_counterexamples_are_not_false_envelope_leaders(self):
        points = json.loads(COMPUTE.read_text())["frontier_points"]
        names = {p["model"] for p in points}
        self.assertTrue({"SB-LM", "DistBelief NNLM", "ResNeXt-101 32x48d", "FLAN 137B"}.issubset(names))
        self.assertTrue({"AlexNet", "GANs", "GPT-2 (1.5B)", "Gopher (280B)"}.isdisjoint(names))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help="regenerate compute.json from the local pinned snapshot")
    mode.add_argument("--check", action="store_true", help="check byte-reproducible output (default)")
    parser.add_argument("--test", action="store_true", help="also run deterministic boundary and pinned-data validation")
    args = parser.parse_args()
    current = json.loads(COMPUTE.read_text())
    rebuilt = regenerate(current)
    encoded = json.dumps(rebuilt, ensure_ascii=False, indent=1, allow_nan=False) + "\n"
    if args.write:
        COMPUTE.write_text(encoded)
    elif COMPUTE.read_text() != encoded:
        raise SystemExit("compute.json differs from pinned-source regeneration; run --write after review")
    if args.test:
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ComputeValidation))
        if not result.wasSuccessful():
            raise SystemExit(1)
    print(f"Verified {len(rebuilt['points'])} curated points; {len(rebuilt['frontier_points'])} envelope changes from {rebuilt['population']['eligible_rows']} eligible / {rebuilt['population']['source_rows']} source rows.")


if __name__ == "__main__":
    main()
