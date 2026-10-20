"""Static integrity checks for the frontend, dataset and API contract.

These tests run without a browser or a server, so they are safe in CI:

    python -m unittest discover tests
"""

import json
import re
import sys
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "src" / "frontend"
DOCS = ROOT / "docs"
MOCK = FRONTEND / "mock"


def read_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


class FrontendAssetTests(unittest.TestCase):
    def test_referenced_assets_exist(self):
        html = (FRONTEND / "index.html").read_text(encoding="utf-8")
        references = re.findall(r'(?:href|src)="([^"]+)"', html)
        local = [ref for ref in references if not ref.startswith(("http", "#", "mailto:", "data:"))]
        self.assertTrue(local, "index.html should reference local css and js files")
        for ref in local:
            self.assertTrue((FRONTEND / ref).is_file(), "missing asset referenced by index.html: " + ref)

    def test_module_graph_resolves(self):
        entry = FRONTEND / "js" / "app.js"
        self.assertTrue(entry.is_file(), "app.js is missing")
        visited = set()
        pending = [entry]
        import_pattern = re.compile(r'(?:from|import\s*\()\s*["\'](\.[^"\']+)["\']')
        while pending:
            current = pending.pop()
            if current in visited:
                continue
            visited.add(current)
            source = current.read_text(encoding="utf-8")
            for spec in import_pattern.findall(source):
                target = (current.parent / spec).resolve()
                self.assertTrue(
                    target.is_file(),
                    "unresolved import " + spec + " in " + str(current.relative_to(ROOT)),
                )
                pending.append(target)
        self.assertGreater(len(visited), 15, "expected the full module graph to be reachable")

    def test_views_are_registered(self):
        index = (FRONTEND / "js" / "views" / "index.js").read_text(encoding="utf-8")
        app = (FRONTEND / "js" / "app.js").read_text(encoding="utf-8")
        for route in ("overview", "intake", "signals", "matches", "pathway", "sdg", "scenarios", "connect"):
            self.assertIn('"/' + route + '"', index, "route not registered: " + route)
            self.assertIn('"/' + route + '"', app, "route missing from the sidebar: " + route)

    def test_api_facade_is_exported(self):
        source = (FRONTEND / "js" / "core" / "api.js").read_text(encoding="utf-8")
        self.assertRegex(source, r"export\s+const\s+api\s*=")
        for method in ("saveProfile", "match", "pathway", "sdgMap", "listSignals", "refreshSignals", "analysis"):
            self.assertIn(method, source, "api facade is missing " + method)

    def test_no_secrets_in_frontend_bundle(self):
        forbidden = ("LLM_API_KEY", "OPENAI_API_KEY", "sk-", "Bearer ey", "AWS_SECRET")
        for path in FRONTEND.rglob("*.js"):
            source = path.read_text(encoding="utf-8")
            for marker in forbidden:
                self.assertNotIn(marker, source, "possible secret in " + str(path.relative_to(ROOT)))


class DatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = read_json(MOCK / "catalog.json")
        cls.signals = read_json(MOCK / "signals.json")
        cls.modules = read_json(MOCK / "modules.json")["items"]
        cls.skill_ids = {skill["id"] for skill in cls.catalog["skills"]}
        cls.role_ids = {role["id"] for role in cls.catalog["roles"]}
        cls.scenario_ids = {scenario["id"] for scenario in cls.catalog["scenarios"]}

    def test_catalog_has_required_depth(self):
        self.assertGreaterEqual(len(self.catalog["skills"]), 15)
        self.assertGreaterEqual(len(self.catalog["roles"]), 8)
        self.assertEqual(len(self.catalog["sdgs"]), 17)
        self.assertGreaterEqual(len(self.catalog["scenarios"]), 2, "more than one future scenario is required")
        self.assertEqual(sorted(sdg["number"] for sdg in self.catalog["sdgs"]), list(range(1, 18)))

    def test_roles_reference_known_skills_and_sdgs(self):
        for role in self.catalog["roles"]:
            self.assertTrue(role["requiredSkills"], role["id"] + " has no required skills")
            for requirement in role["requiredSkills"]:
                self.assertIn(requirement["skillId"], self.skill_ids, role["id"] + " references an unknown skill")
                self.assertIn(requirement["level"], range(1, 6))
                self.assertIn(requirement["importance"], range(1, 6))
            self.assertTrue(role["sdgs"], role["id"] + " has no SDG mapping")
            for relation in role["sdgs"]:
                self.assertIn(relation["number"], range(1, 18))
                self.assertIn(relation["tier"], ("primary", "secondary"))
                self.assertTrue(relation["rationale"].strip(), role["id"] + " has an SDG without rationale")

    def test_scenarios_are_consistent(self):
        for scenario in self.catalog["scenarios"]:
            self.assertTrue(0 < scenario["confidence"] <= 1)
            for role_id in list(scenario["rolesRising"]) + list(scenario["rolesDeclining"]):
                self.assertIn(role_id, self.role_ids, scenario["id"] + " references an unknown role")
            for role_id, adjustment in scenario["roleAdjustments"].items():
                self.assertIn(role_id, self.role_ids)
                self.assertIn("fitDelta", adjustment)
            for metric in ("netEmploymentChangePct", "taskAutomationPct", "reskillingDemandIndex", "wagePolarisationIndex"):
                self.assertIn(metric, scenario["metrics"])

    def test_signals_are_dated_and_sourced(self):
        items = self.signals["items"]
        self.assertGreaterEqual(len(items), 15)
        for signal in items:
            self.assertTrue(signal["sourceUrl"].startswith("http"), signal["id"] + " has no source URL")
            date.fromisoformat(signal["publishedAt"])
            self.assertIn(signal["momentum"], ("rising", "stable", "declining"))
            self.assertIn(signal["type"], ("labour-market", "technology", "policy", "skills-framework", "research"))
            self.assertTrue(0 < signal["confidence"] <= 1)
            for affected in signal["affectedSkills"]:
                self.assertIn(affected["skillId"], self.skill_ids)
            for affected in signal["affectedRoles"]:
                self.assertIn(affected["roleId"], self.role_ids)

    def test_modules_cover_every_skill(self):
        taught = set()
        for module in self.modules:
            self.assertIn(module["level"], ("foundation", "intermediate", "advanced"))
            self.assertIn(module["kind"], ("module", "project", "assessment"))
            self.assertGreater(module["hours"], 0)
            for skill_id in module["teaches"]:
                self.assertIn(skill_id, self.skill_ids, module["id"] + " teaches an unknown skill")
                taught.add(skill_id)
        missing = self.skill_ids - taught
        self.assertFalse(missing, "no learning module teaches: " + ", ".join(sorted(missing)))

    def test_catalog_metadata(self):
        meta = self.catalog["meta"]
        self.assertTrue(meta["datasetVersion"])
        self.assertTrue(meta["generatedAt"])
        self.assertIn("from", meta["signalWindow"])
        self.assertIn("to", meta["signalWindow"])


class ContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec = read_json(DOCS / "openapi.json")

    def test_openapi_is_valid_and_complete(self):
        self.assertEqual(self.spec["openapi"], "3.1.0")
        paths = self.spec["paths"]
        for path in (
            "/health",
            "/meta",
            "/catalog",
            "/signals",
            "/signals/refresh",
            "/profiles",
            "/profiles/{id}",
            "/profiles/{id}/match",
            "/profiles/{id}/pathway",
            "/profiles/{id}/sdg-map",
            "/scenarios",
            "/analysis",
            "/analysis/stream",
        ):
            self.assertIn(path, paths, "OpenAPI is missing " + path)

        schemas = self.spec["components"]["schemas"]
        for name in ("Profile", "ProfileDraft", "Role", "Scenario", "Signal", "MatchResult", "Pathway", "SdgMap", "Analysis", "ErrorEnvelope"):
            self.assertIn(name, schemas, "OpenAPI is missing the " + name + " schema")

    def test_frontend_calls_documented_endpoints(self):
        source = (FRONTEND / "js" / "core" / "api.js").read_text(encoding="utf-8")
        for fragment in ('"health"', '"meta"', '"catalog"', '"signals"', '"signals/refresh"', '"scenarios"', '"analysis"', '"analysis/stream"'):
            self.assertIn(fragment, source, "api.js does not call " + fragment)
        for fragment in ("/match", "/pathway", "/sdg-map", "profiles/"):
            self.assertIn(fragment, source, "api.js does not call an endpoint containing " + fragment)

        paths = self.spec["paths"]
        self.assertIn("/profiles/{id}/match", paths)
        self.assertIn("/profiles/{id}/pathway", paths)
        self.assertIn("/profiles/{id}/sdg-map", paths)

    def test_reference_scripts_compile(self):
        import py_compile

        for path in (
            DOCS / "backend-integration" / "reference_api.py",
            DOCS / "backend-integration" / "smoke_test.py",
            DOCS / "backend-integration" / "export_fixtures.py",
            ROOT / "tools" / "serve_frontend.py",
        ):
            self.assertTrue(path.is_file(), "missing script " + str(path))
            py_compile.compile(str(path), doraise=True)

    def test_fixtures_parse(self):
        fixture_dir = DOCS / "backend-integration" / "fixtures"
        fixtures = sorted(fixture_dir.glob("*.json"))
        self.assertGreaterEqual(len(fixtures), 6, "expected captured contract fixtures")
        for path in fixtures:
            payload = read_json(path)
            self.assertIsInstance(payload, dict, path.name + " should contain a JSON object")
        match = read_json(fixture_dir / "match.json")
        self.assertIn("matches", match)
        self.assertTrue(match["matches"], "match fixture has no rows")
        pathway = read_json(fixture_dir / "pathway.json")
        self.assertEqual(len(pathway["phases"]), 3)
        sdg_map = read_json(fixture_dir / "sdg-map.json")
        self.assertEqual(len(sdg_map["goals"]), 17)

    def test_docs_exist(self):
        for name in ("API.md", "BACKEND_INTEGRATION.md", "openapi.json"):
            self.assertTrue((DOCS / name).is_file(), "missing docs/" + name)
        api_text = (DOCS / "API.md").read_text(encoding="utf-8")
        for must_have in ("Skills profile intake", "AI-trend signal layer", "Future-role matching", "Personalised reskilling pathway", "SDG mapping", "More than one future scenario"):
            self.assertIn(must_have, api_text, "API.md does not trace the must-have: " + must_have)

    def test_requirement_traceability(self):
        index = (FRONTEND / "index.html").read_text(encoding="utf-8")
        self.assertIn("AI Career Navigator", index)
        self.assertIn("SDC 2026", index)


if __name__ == "__main__":
    unittest.main()
