#!/usr/bin/env python3
"""Contract smoke test for the AI Career Navigator API.

Runs against the reference API or the real backend:

    python docs/backend-integration/smoke_test.py --base http://127.0.0.1:8000/api/v1

Exits non-zero if a required shape or behaviour is missing. It creates one
profile (and leaves it in the database) so the matching endpoints can be
exercised end to end.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

PROFILE = {
    "name": "Smoke Test Candidate",
    "currentRole": "Operations Coordinator",
    "sector": "Public sector",
    "region": "Singapore",
    "yearsExperience": 7,
    "education": "Diploma / vocational",
    "goal": "Move into an AI-facing role",
    "interests": ["ai", "public"],
    "constraints": {"hoursPerWeek": 8, "budget": 300, "remoteOnly": False},
    "skills": [
        {"skillId": "data-literacy", "level": 3},
        {"skillId": "stakeholder-comms", "level": 4},
        {"skillId": "critical-evaluation", "level": 3},
        {"skillId": "process-design", "level": 3},
        {"skillId": "prompt-engineering", "level": 2},
        {"skillId": "model-evaluation", "level": 2},
        {"skillId": "ai-governance", "level": 1},
        {"skillId": "project-management", "level": 3},
    ],
}

failures: list[str] = []
checks = 0


def check(condition: bool, label: str, detail: str = "") -> None:
    global checks
    checks += 1
    if condition:
        print("  ok   " + label)
    else:
        failures.append(label + ((" — " + detail) if detail else ""))
        print("  FAIL " + label + ((" — " + detail) if detail else ""))


def call(base: str, path: str, method: str = "GET", payload: dict | None = None, timeout: float = 20):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        base + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"raw": raw.decode("utf-8", "replace")}
        return error.code, body


def stream_events(base: str, profile_id: str, limit: int = 400) -> list[tuple[str, dict]]:
    url = base + "/analysis/stream?profileId=" + urllib.parse.quote(profile_id) + "&scenarioId=acceleration"
    request = urllib.request.Request(url, headers={"Accept": "text/event-stream"})
    events: list[tuple[str, dict]] = []
    with urllib.request.urlopen(request, timeout=30) as response:
        event = None
        data_lines: list[str] = []
        for line in response:
            text = line.decode("utf-8").rstrip("\n")
            if text.startswith("event:"):
                event = text[6:].strip()
            elif text.startswith("data:"):
                data_lines.append(text[5:].strip())
            elif text == "":
                if event and data_lines:
                    events.append((event, json.loads("\n".join(data_lines))))
                event, data_lines = None, []
                if events and events[-1][0] == "done":
                    break
                if len(events) > limit:
                    break
    return events


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test the AI Career Navigator API")
    parser.add_argument("--base", default="http://127.0.0.1:8000/api/v1")
    args = parser.parse_args()
    base = args.base.rstrip("/")

    print("Contract smoke test against " + base)

    print("\n[1] health & metadata")
    status, health = call(base, "/health")
    check(status == 200, "health returns 200", str(status))
    check(health.get("status") == "ok", "health.status is ok", str(health.get("status")))
    check(bool(health.get("version")), "health includes a version")

    status, meta = call(base, "/meta")
    check(status == 200, "meta returns 200")
    counts = meta.get("counts") or {}
    check(counts.get("roles", 0) >= 1 and counts.get("sdgs") == 17, "meta counts expose roles and 17 SDGs", str(counts))

    print("\n[2] catalogue")
    status, catalog = call(base, "/catalog")
    check(status == 200, "catalog returns 200")
    check(len(catalog.get("skills", [])) >= 10, "catalog has skills")
    check(len(catalog.get("roles", [])) >= 5, "catalog has roles")
    check(len(catalog.get("scenarios", [])) >= 2, "catalog has more than one scenario")
    check(all(len(role.get("requiredSkills", [])) > 0 for role in catalog.get("roles", [])), "every role lists skills")

    print("\n[3] signal layer")
    status, signals = call(base, "/signals?limit=5&sort=recent")
    check(status == 200, "signals returns 200")
    check(len(signals.get("items", [])) <= 5, "limit is respected")
    sample = (signals.get("items") or [{}])[0]
    check(bool(sample.get("publishedAt")), "signals are dated")
    check(bool(sample.get("sourceUrl")), "signals link to a source")
    check(bool(signals.get("lastRefreshedAt")), "signals expose a refresh timestamp")
    check("pipeline" in signals, "signals expose pipeline metadata")

    status, filtered = call(base, "/signals?momentum=rising&limit=50")
    check(status == 200 and filtered.get("total", 0) > 0, "momentum filter returns rows")
    check(
        all(item["momentum"] == "rising" for item in filtered.get("items", [])),
        "momentum filter is applied",
    )

    print("\n[4] profile intake")
    status, created = call(base, "/profiles", "POST", PROFILE)
    profile = created.get("profile") or {}
    check(status == 201, "profile creation returns 201", str(status))
    check(bool(profile.get("id")), "profile has an id")
    check(len(profile.get("skills", [])) == len(PROFILE["skills"]), "skills are stored")
    check(profile.get("constraints", {}).get("hoursPerWeek") == 8, "constraints are stored")
    profile_id = profile.get("id", "")

    status, fetched = call(base, "/profiles/" + profile_id)
    check(status == 200 and fetched.get("profile", {}).get("name") == PROFILE["name"], "profile can be read back")

    status, patched = call(base, "/profiles/" + profile_id, "PATCH", {"headline": "Smoke tested"})
    check(status == 200 and patched.get("profile", {}).get("headline") == "Smoke tested", "profile can be patched")

    print("\n[5] matching")
    status, match = call(base, "/profiles/" + profile_id + "/match", "POST", {"scenarioId": "baseline"})
    check(status == 200, "match returns 200", str(status))
    matches = match.get("matches", [])
    check(len(matches) == len(catalog.get("roles", [])), "every role is scored", str(len(matches)))
    check(all(0 <= item.get("fitScore", -1) <= 100 for item in matches), "fit scores stay within 0-100")
    check(
        all(matches[i]["fitScore"] >= matches[i + 1]["fitScore"] for i in range(len(matches) - 1)),
        "matches are sorted by fit",
    )
    check(match.get("summary", {}).get("topRoleId") == matches[0].get("roleId"), "summary matches the top role")
    gap = (matches[0].get("skillsGap") or [{}])[0]
    check(all(key in gap for key in ("skillId", "name", "currentLevel", "requiredLevel", "gap")), "gap rows are complete")
    check(bool(matches[0].get("reasons")), "matches explain themselves")

    status, accelerated = call(base, "/profiles/" + profile_id + "/match", "POST", {"scenarioId": "acceleration"})
    check(status == 200, "scenario switching returns 200")
    check(accelerated.get("scenarioId") == "acceleration", "scenario id is echoed")

    print("\n[6] pathway")
    top_role = matches[0].get("roleId")
    status, pathway = call(
        base, "/profiles/" + profile_id + "/pathway", "POST", {"scenarioId": "baseline", "roleId": top_role}
    )
    check(status == 200, "pathway returns 200", str(status))
    check(pathway.get("roleId") == top_role, "pathway targets the requested role")
    check(pathway.get("horizonWeeks", 0) > 0, "pathway has a horizon")
    check(len(pathway.get("phases", [])) == 3, "pathway has three phases")
    check(any(phase.get("modules") for phase in pathway.get("phases", [])), "pathway has modules")
    check(bool(pathway.get("covers")), "pathway reports skill coverage")
    check(isinstance(pathway.get("totalCost"), int), "pathway reports a cost")

    print("\n[7] SDG mapping")
    status, sdg_map = call(base, "/profiles/" + profile_id + "/sdg-map?scenarioId=baseline")
    check(status == 200, "sdg map returns 200", str(status))
    goals = sdg_map.get("goals", [])
    check(len(goals) == 17, "all 17 goals are returned", str(len(goals)))
    check(all(goal.get("rationale") for goal in goals), "every goal carries a rationale")
    check(sdg_map.get("summary", {}).get("topGoal") in range(1, 18), "summary names a top goal")

    print("\n[8] narrative")
    status, analysis = call(
        base, "/analysis", "POST", {"profileId": profile_id, "scenarioId": "baseline"}, timeout=60
    )
    check(status == 200, "analysis returns 200", str(status))
    check(len((analysis.get("analysis") or {}).get("narrative", "")) > 80, "narrative has content")

    events = stream_events(base, profile_id)
    kinds = [kind for kind, _ in events]
    check("meta" in kinds, "stream emits meta")
    check("token" in kinds, "stream emits tokens")
    check("done" in kinds, "stream emits done")
    done = next((payload for kind, payload in events if kind == "done"), {})
    check(len((done.get("analysis") or {}).get("narrative", "")) > 80, "stream finishes with the full analysis")

    print("\n[9] error model")
    status, error = call(base, "/profiles/does-not-exist")
    check(status == 404, "missing profile returns 404", str(status))
    check(error.get("error", {}).get("code") == "profile_not_found", "error uses the error envelope", str(error))
    status, invalid = call(base, "/profiles", "POST", {"name": ""})
    check(status == 422, "invalid profile returns 422", str(status))

    print("")
    if failures:
        print(str(len(failures)) + " of " + str(checks) + " checks failed:")
        for failure in failures:
            print("  - " + failure)
        return 1
    print("All " + str(checks) + " checks passed.")
    print("Profile created for inspection: " + profile_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
