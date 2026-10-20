#!/usr/bin/env python3
"""Capture example responses from a running API into docs/backend-integration/fixtures/.

Usage:
    python docs/backend-integration/reference_api.py --port 8000   # terminal 1
    python docs/backend-integration/export_fixtures.py --base http://127.0.0.1:8000/api/v1

Fixtures are illustrative examples of the contract, generated from the demo dataset.
"""

from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent / "fixtures"

PROFILE = {
    "name": "Aisha Rahman",
    "headline": "Operations coordinator moving into AI-enabled public services",
    "currentRole": "Operations Coordinator",
    "sector": "Public sector",
    "region": "Singapore",
    "yearsExperience": 7,
    "education": "Diploma / vocational",
    "goal": "Move into an AI-facing role without leaving public service",
    "interests": ["ai", "public", "people"],
    "constraints": {"hoursPerWeek": 8, "budget": 300, "remoteOnly": False},
    "skills": [
        {"skillId": "data-literacy", "level": 3},
        {"skillId": "stakeholder-comms", "level": 4},
        {"skillId": "critical-evaluation", "level": 3},
        {"skillId": "process-design", "level": 3},
        {"skillId": "sql", "level": 2},
        {"skillId": "automation", "level": 3},
        {"skillId": "prompt-engineering", "level": 2},
        {"skillId": "model-evaluation", "level": 2},
        {"skillId": "ai-governance", "level": 1},
        {"skillId": "project-management", "level": 3},
        {"skillId": "change-facilitation", "level": 2},
        {"skillId": "systems-thinking", "level": 3},
    ],
    "source": "docs-fixture",
}


def call(base: str, path: str, method: str = "GET", payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        base + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def save(name: str, payload: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / name
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote " + str(target))


def main() -> int:
    parser = argparse.ArgumentParser(description="Export contract fixtures")
    parser.add_argument("--base", default="http://127.0.0.1:8000/api/v1")
    args = parser.parse_args()
    base = args.base.rstrip("/")

    save("health.json", call(base, "/health"))
    save("meta.json", call(base, "/meta"))
    save("signals.json", call(base, "/signals?limit=3&sort=impact"))

    created = call(base, "/profiles", "POST", PROFILE)
    profile = created["profile"]
    profile_id = profile["id"]
    save("profile.json", created)

    match = call(base, "/profiles/" + profile_id + "/match", "POST", {"scenarioId": "baseline"})
    save("match.json", match)

    pathway = call(
        base,
        "/profiles/" + profile_id + "/pathway",
        "POST",
        {"scenarioId": "baseline", "roleId": match["matches"][0]["roleId"]},
    )
    save("pathway.json", pathway)

    save("sdg-map.json", call(base, "/profiles/" + profile_id + "/sdg-map?scenarioId=baseline"))
    save("analysis.json", call(base, "/analysis", "POST", {"profileId": profile_id, "scenarioId": "baseline"}))

    try:
        call(base, "/profiles/does-not-exist")
    except urllib.error.HTTPError as error:  # type: ignore[name-defined]
        save("error-404.json", json.loads(error.read()))

    print("Fixtures captured for profile " + profile_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
