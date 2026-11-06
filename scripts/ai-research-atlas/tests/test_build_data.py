"""Offline regression checks for publication-data integrity."""
import copy
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("atlas_build", ROOT / "build_data.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BuildDataTests(unittest.TestCase):
    def event(self, eid="example-2026-study"):
        return {"id": eid, "date": "2026-11-06", "date_basis": "blog post",
                "date_precision": "day", "sources": [{"url": "https://example.org/study"}], "links": []}

    def test_dates_reject_impossible_days_and_trailing_garbage(self):
        for value in ["2026-02-29", "2026-13", "2026-11-06oops", "not a date"]:
            with self.subTest(value=value):
                self.assertIsNone(build.norm_date({"date": value}))
        self.assertEqual(build.norm_date({"date": "2024-02-29"}), "2024-02-29")
        self.assertEqual(build.norm_date({"date": "1957"}), "1957-01-01")
        self.assertEqual(build.norm_date({"date": "2017-06"}), "2017-06-01")

    def test_graph_rejects_dangling_links_instead_of_dropping_them(self):
        event = self.event()
        event["links"] = [{"to": "missing-study", "type": "enables"}]
        original = copy.deepcopy(event["links"])
        self.assertTrue(any("unknown linked event" in p for p in build.validate_graph([event], [], [])))
        self.assertEqual(event["links"], original)

    def test_graph_rejects_unknown_relations_and_duplicate_ids(self):
        event = self.event()
        event["links"] = [{"to": event["id"], "type": "invented-relation"}]
        problems = build.validate_graph([event, copy.deepcopy(event)], [], [])
        self.assertTrue(any("unknown relation" in p for p in problems))
        self.assertTrue(any("duplicate id" in p for p in problems))

    def test_routes_and_organisations_cannot_reference_absent_events(self):
        problems = build.validate_graph([self.event()], [{"id": "route", "event_ids": ["missing-study"]}],
                                        [{"id": "org", "key_event_ids": ["missing-study"]}])
        self.assertEqual(len(problems), 2)

    def test_valid_cross_lane_graph(self):
        a, b = self.event("safety-2026-a"), self.event("rl-2026-b")
        a["links"] = [{"to": b["id"], "type": "parallel"}]
        self.assertEqual(build.validate_graph([a, b], [{"id": "route", "event_ids": [a["id"], b["id"]]}], []), [])

    def test_section_navigation_stays_in_same_tab(self):
        local = build.md_inline("[The map](#the-map)")
        self.assertIn('href="#the-map"', local)
        self.assertNotIn('target=', local)
        self.assertIn('target="_blank"', build.md_inline("[Source](https://example.org)"))


if __name__ == "__main__":
    unittest.main()
