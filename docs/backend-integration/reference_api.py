#!/usr/bin/env python3
"""Reference implementation of the AI Career Navigator API.

This is a *contract reference* for the backend team, not the production service:

* Python standard library only (no pip install, runs on Replit as-is)
* serves src/frontend at / so the UI is same-origin
* implements every endpoint in docs/API.md, including SSE streaming
* persists profiles in a local SQLite database (data/reference.db)
* uses the same demo catalogue that ships with the frontend

Run:
    python docs/backend-integration/reference_api.py --port 8000
    open http://127.0.0.1:8000/

Porting to FastAPI is mechanical: keep the response shapes, swap the handler
functions for route decorators, and move the SQLite calls into a repository.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "src" / "frontend"
MOCK = FRONTEND / "mock"
DB_PATH = ROOT / "data" / "reference.db"

CATALOG = json.loads((MOCK / "catalog.json").read_text(encoding="utf-8"))
SIGNALS = json.loads((MOCK / "signals.json").read_text(encoding="utf-8"))
MODULES = json.loads((MOCK / "modules.json").read_text(encoding="utf-8"))["items"]

SKILLS = {item["id"]: item for item in CATALOG["skills"]}
ROLES = {item["id"]: item for item in CATALOG["roles"]}
SCENARIOS = {item["id"]: item for item in CATALOG["scenarios"]}
SDGS = {item["number"]: item for item in CATALOG["sdgs"]}

INTEREST_ROLES = {
    "ai": ["ai-ops-analyst", "ai-product-owner", "ai-ethics-officer", "human-ai-interaction-designer", "data-governance-specialist"],
    "public": ["civic-tech-program-manager", "workforce-transition-coach", "data-governance-specialist", "ai-ethics-officer"],
    "climate": ["green-supply-chain-analyst", "climate-data-steward", "energy-systems-analyst"],
    "health": ["healthcare-automation-specialist", "ai-ethics-officer"],
    "design": ["human-ai-interaction-designer", "ai-product-owner", "civic-tech-program-manager"],
    "data": ["data-governance-specialist", "climate-data-steward", "energy-systems-analyst", "ai-ops-analyst"],
    "security": ["cyber-resilience-analyst", "data-governance-specialist"],
    "people": ["workforce-transition-coach", "human-ai-interaction-designer"],
    "governance": ["ai-ethics-officer", "data-governance-specialist", "civic-tech-program-manager"],
}

LAST_REFRESHED = SIGNALS.get("lastRefreshedAt") or CATALOG["meta"]["generatedAt"]
STARTED_AT = time.time()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def level_of(profile: dict, skill_id: str) -> int:
    for skill in profile.get("skills", []):
        if skill.get("skillId") == skill_id:
            return int(skill.get("level") or 1)
    return 1


def score_role(profile: dict, role: dict, delta: float = 0) -> tuple[int, int, list[dict]]:
    covered = 0.0
    total = 0.0
    gap_weighted = 0.0
    required_weighted = 0.0
    gaps: list[dict] = []

    for req in role["requiredSkills"]:
        current = level_of(profile, req["skillId"])
        gap = max(0, req["level"] - current)
        covered += min(current / req["level"], 1.0) * req["importance"]
        total += req["importance"]
        gap_weighted += gap * req["importance"]
        required_weighted += req["level"] * req["importance"]
        gaps.append(
            {
                "skillId": req["skillId"],
                "currentLevel": current,
                "requiredLevel": req["level"],
                "importance": req["importance"],
                "gap": gap,
                "priority": gap * req["importance"],
            }
        )

    coverage = covered / total if total else 0.0
    experience = clamp(float(profile.get("yearsExperience") or 0) / 12.0, 0, 1)
    if profile.get("sector") == role["sector"]:
        sector = 1.0
    elif role["sector"] == "Cross-sector" or profile.get("sector") == "Other":
        sector = 0.5
    else:
        sector = 0.0
    interest = 0.0
    for key in profile.get("interests", []):
        if role["id"] in INTEREST_ROLES.get(key, []):
            interest = 1.0
            break

    fit = int(round(clamp(coverage * 86 + experience * 5 + sector * 4 + interest * 5 + delta, 3, 99)))
    gap_score = int(round((gap_weighted / required_weighted) * 100)) if required_weighted else 0
    return fit, gap_score, gaps


def build_reasons(gaps: list[dict], scenario: dict, adjustment: dict) -> list[str]:
    reasons = []
    strong = sorted([g for g in gaps if g["gap"] == 0], key=lambda g: -g["importance"])[:2]
    if strong:
        reasons.append(" and ".join(g["name"] for g in strong) + " already meet this role's requirement.")
    critical = sorted([g for g in gaps if g["gap"] > 0], key=lambda g: -g["priority"])[:2]
    if critical:
        reasons.append(
            "Largest gaps: "
            + ", ".join(f'{g["name"]} ({g["currentLevel"]} of {g["requiredLevel"]})' for g in critical)
            + "."
        )
    if scenario.get("id") != "baseline" and adjustment.get("note"):
        reasons.append(adjustment["note"])
    return reasons


def build_matches(profile: dict, scenario_id: str) -> dict:
    scenario = SCENARIOS.get(scenario_id) or CATALOG["scenarios"][0]
    matches = []

    for role in CATALOG["roles"]:
        adjustment = scenario.get("roleAdjustments", {}).get(role["id"], {})
        fit, gap_score, raw_gaps = score_role(profile, role, adjustment.get("fitDelta", 0))
        baseline_fit, _, _ = score_role(profile, role, 0)

        gaps = []
        for item in raw_gaps:
            meta = SKILLS.get(item["skillId"], {})
            gaps.append(
                {
                    "skillId": item["skillId"],
                    "name": meta.get("name", item["skillId"]),
                    "category": meta.get("category", "Other"),
                    "currentLevel": item["currentLevel"],
                    "requiredLevel": item["requiredLevel"],
                    "importance": item["importance"],
                    "gap": item["gap"],
                    "priority": item["priority"],
                }
            )
        gaps.sort(key=lambda g: (-g["priority"], g["name"]))

        matches.append(
            {
                "roleId": role["id"],
                "title": role["title"],
                "family": role["family"],
                "sector": role["sector"],
                "summary": role["summary"],
                "outlook": role["outlook"],
                "demandIndex": role["demandIndex"],
                "demandTrend": role["demandTrend"],
                "automationRisk": role["automationRisk"],
                "salary": role["salary"],
                "fitScore": fit,
                "baselineFit": baseline_fit,
                "fitDelta": fit - baseline_fit,
                "gapScore": gap_score,
                "skillsGap": [g for g in gaps if g["gap"] > 0],
                "matchedSkills": [g for g in gaps if g["gap"] == 0],
                "sdgs": role["sdgs"],
                "scenarioNote": adjustment.get("note", ""),
                "reasons": build_reasons(gaps, scenario, adjustment),
            }
        )

    matches.sort(key=lambda item: (-item["fitScore"], -item["demandIndex"]))
    top = matches[:3]
    readiness = sum(match["fitScore"] * weight for match, weight in zip(top, [0.5, 0.3, 0.2]))
    gap_skills = {gap["skillId"] for match in top for gap in match["skillsGap"]}

    return {
        "profileId": profile["id"],
        "scenarioId": scenario["id"],
        "generatedAt": now_iso(),
        "model": "career-match:v1.3",
        "matches": matches,
        "summary": {
            "readinessScore": int(round(readiness)),
            "topRoleId": top[0]["roleId"] if top else None,
            "topRoleTitle": top[0]["title"] if top else None,
            "topFit": top[0]["fitScore"] if top else 0,
            "skillsToClose": len(gap_skills),
            "coveragePct": int(
                round(
                    100
                    * sum(len(match["matchedSkills"]) for match in top)
                    / max(
                        1,
                        sum(len(match["matchedSkills"]) + len(match["skillsGap"]) for match in top),
                    )
                )
            ),
            "topMatches": [
                {"roleId": match["roleId"], "title": match["title"], "fitScore": match["fitScore"]} for match in top
            ],
        },
    }


# Profiles & SQLite -------------------------------------------------

def db_connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    return conn


def db_save(profile: dict) -> None:
    with db_connect() as conn:
        conn.execute(
            "INSERT INTO profiles (id, payload, created_at, updated_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
            (profile["id"], json.dumps(profile, ensure_ascii=False), profile["createdAt"], profile["updatedAt"]),
        )


def db_get(profile_id: str) -> dict | None:
    with db_connect() as conn:
        row = conn.execute("SELECT payload FROM profiles WHERE id = ?", (profile_id,)).fetchone()
    return json.loads(row[0]) if row else None


def db_count() -> int:
    with db_connect() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM profiles").fetchone()[0])


def normalise_profile(payload: dict, existing: dict | None = None) -> dict:
    name = str(payload.get("name") or "").strip()
    if not name:
        raise ApiError(422, "validation_error", "A name is required to create a profile.", {"field": "name"})
    raw_skills = payload.get("skills")
    if not isinstance(raw_skills, list) or not raw_skills:
        raise ApiError(422, "validation_error", "At least one skill is required.", {"field": "skills"})

    skills = []
    for item in raw_skills:
        if not isinstance(item, dict):
            continue
        skill_id = item.get("skillId")
        if skill_id not in SKILLS:
            continue
        skills.append(
            {
                "skillId": skill_id,
                "name": SKILLS[skill_id]["name"],
                "category": SKILLS[skill_id]["category"],
                "level": int(clamp(int(item.get("level") or 1), 1, 5)),
            }
        )
    if not skills:
        raise ApiError(422, "validation_error", "No known skill identifiers were supplied.", {"field": "skills"})

    constraints = payload.get("constraints") or {}
    stamp = now_iso()
    return {
        "id": (existing or {}).get("id") or "prof-" + uuid.uuid4().hex[:8],
        "name": name,
        "headline": str(payload.get("headline") or "").strip(),
        "currentRole": str(payload.get("currentRole") or "").strip(),
        "sector": payload.get("sector") or "Other",
        "region": payload.get("region") or "Global",
        "yearsExperience": int(clamp(int(payload.get("yearsExperience") or 0), 0, 50)),
        "education": payload.get("education") or "Other",
        "skills": skills,
        "interests": [str(item) for item in (payload.get("interests") or [])][:6],
        "constraints": {
            "hoursPerWeek": int(clamp(int(constraints.get("hoursPerWeek") or 8), 1, 40)),
            "budget": max(0, int(constraints.get("budget") or 0)),
            "remoteOnly": bool(constraints.get("remoteOnly")),
        },
        "goal": str(payload.get("goal") or "").strip(),
        "createdAt": (existing or {}).get("createdAt") or stamp,
        "updatedAt": stamp,
        "source": payload.get("source") or "api",
    }


# Pathway -----------------------------------------------------------

def pick_module(skill_id: str, current_level: int) -> dict | None:
    candidates = [m for m in MODULES if m.get("kind") == "module" and skill_id in m.get("teaches", [])]
    if not candidates:
        return None
    target = "foundation" if current_level <= 2 else "intermediate"
    rank = {"foundation": 0, "intermediate": 1, "advanced": 2}
    return sorted(candidates, key=lambda m: (abs(rank[m["level"]] - rank[target]), m["hours"], m["cost"]))[0]


def generic_module(module_id: str, title: str, teaches: list[str], hours: int, level: str) -> dict:
    return {
        "id": module_id,
        "title": title,
        "provider": "AI Career Navigator",
        "url": "",
        "format": "workshop",
        "kind": "module",
        "hours": hours,
        "cost": 0,
        "currency": "USD",
        "level": level,
        "teaches": teaches,
        "credential": "Internal record",
        "outcome": "Mentor-led practice with a reviewed artefact.",
    }


def build_pathway(profile: dict, matches: dict, scenario_id: str, role_id: str | None) -> dict:
    match = next((item for item in matches["matches"] if item["roleId"] == role_id), matches["matches"][0])
    role = ROLES[match["roleId"]]
    hours_per_week = int(profile["constraints"]["hoursPerWeek"])
    gaps = sorted(match["skillsGap"], key=lambda gap: -gap["priority"])
    selected = gaps[:9]

    buckets = {"foundation": [], "intermediate": [], "advanced": []}
    used = set()
    for gap in selected:
        module = pick_module(gap["skillId"], gap["currentLevel"])
        if not module or module["id"] in used:
            continue
        used.add(module["id"])
        buckets[module["level"]].append(module)

    if not buckets["foundation"]:
        if buckets["intermediate"]:
            buckets["foundation"].append(buckets["intermediate"].pop(0))
        else:
            buckets["foundation"].append(
                generic_module(
                    "mod-orientation",
                    "Orientation sprint",
                    [gap["skillId"] for gap in selected[:2]],
                    4,
                    "foundation",
                )
            )

    for extra in ("mod-portfolio-1", "mod-capstone-1"):
        module = next((item for item in MODULES if item["id"] == extra), None)
        if module:
            buckets["advanced"].append(dict(module))

    phase_meta = [
        {
            "id": "phase-1",
            "title": "Foundations & orientation",
            "goal": "Close the baseline gaps that every later step depends on.",
            "modules": buckets["foundation"],
            "milestones": [
                {"title": "Starting-level diagnostic", "detail": "Confirm your real level with a short practical task, not self-report.", "week": 1},
                {"title": "First artefact", "detail": "Produce one small piece of evidence from the foundation module.", "week": None},
            ],
        },
        {
            "id": "phase-2",
            "title": "Role-specific capability",
            "goal": "Build the capabilities this role is actually hired for.",
            "modules": buckets["intermediate"],
            "milestones": [
                {"title": "Peer review", "detail": "Have a practitioner review one output against the role's bar.", "week": None},
                {"title": "Role simulation", "detail": "Complete a task that mirrors the target role's weekly work.", "week": None},
            ],
        },
        {
            "id": "phase-3",
            "title": "Evidence & transition",
            "goal": "Turn learning into artefacts a hiring panel can verify.",
            "modules": buckets["advanced"],
            "milestones": [
                {"title": "Portfolio published", "detail": "Two artefacts, each with a short decision memo.", "week": None},
                {"title": "Interview-ready", "detail": "Defend a scenario decision with evidence and trade-offs.", "week": None},
            ],
        },
    ]

    phases = []
    cursor = 0
    for meta in phase_meta:
        items = []
        for module in meta["modules"]:
            teaches = module.get("teaches", [])
            matched = [gap for gap in gaps if gap["skillId"] in teaches]
            item = dict(module)
            item["targets"] = [
                {
                    "skillId": gap["skillId"],
                    "name": gap["name"],
                    "fromLevel": gap["currentLevel"],
                    "toLevel": gap["requiredLevel"],
                }
                for gap in matched
            ]
            items.append(item)
        hours = sum(int(item.get("hours") or 0) for item in items)
        cost = sum(int(item.get("cost") or 0) for item in items)
        weeks = max(1, -(-hours // max(1, hours_per_week)))
        start = cursor + 1
        cursor += weeks
        milestones = []
        for index, milestone in enumerate(meta["milestones"]):
            item = dict(milestone)
            if not item.get("week"):
                item["week"] = start if index == 0 else start + weeks - 1
            milestones.append(item)
        phases.append(
            {
                "id": meta["id"],
                "title": meta["title"],
                "goal": meta["goal"],
                "weeks": weeks,
                "hours": hours,
                "cost": cost,
                "startWeek": start,
                "endWeek": cursor,
                "modules": items,
                "milestones": milestones,
            }
        )

    covered_ids = {skill for phase in phases for module in phase["modules"] for skill in module.get("teaches", [])}
    covers = []
    for gap in gaps:
        covered = gap["skillId"] in covered_ids
        covers.append(
            {
                "skillId": gap["skillId"],
                "name": gap["name"],
                "fromLevel": gap["currentLevel"],
                "requiredLevel": gap["requiredLevel"],
                "toLevel": min(gap["requiredLevel"], gap["currentLevel"] + 2) if covered else gap["currentLevel"],
                "covered": covered,
                "moduleIds": [
                    module["id"]
                    for phase in phases
                    for module in phase["modules"]
                    if gap["skillId"] in module.get("teaches", [])
                ],
            }
        )

    total_hours = sum(phase["hours"] for phase in phases)
    total_cost = sum(phase["cost"] for phase in phases)
    covered_count = sum(1 for cover in covers if cover["covered"])
    covered_pct = (covered_count / len(covers)) if covers else 1.0
    readiness_from = matches["summary"]["readinessScore"]
    readiness_to = min(95, int(round(readiness_from + 8 + covered_pct * 18)))

    notes = []
    uncovered = [cover for cover in covers if not cover["covered"]]
    if uncovered:
        notes.append(
            f"{len(uncovered)} gap skill(s) are not covered by the curated catalogue: "
            + ", ".join(item["name"] for item in uncovered)
            + ". Add a work-based rotation or mentor review."
        )
    scenario = SCENARIOS.get(scenario_id)
    adjustment = (scenario or {}).get("roleAdjustments", {}).get(role["id"], {})
    if adjustment.get("note"):
        notes.append("Scenario note: " + adjustment["note"])

    return {
        "profileId": profile["id"],
        "roleId": role["id"],
        "roleTitle": role["title"],
        "scenarioId": scenario_id,
        "generatedAt": now_iso(),
        "model": "pathway-builder:v1.2",
        "horizonWeeks": cursor,
        "hoursPerWeek": hours_per_week,
        "totalHours": total_hours,
        "totalCost": total_cost,
        "currency": "USD",
        "readinessFrom": readiness_from,
        "readinessTo": readiness_to,
        "phases": phases,
        "covers": covers,
        "notes": notes,
        "rationale": (
            f"Built for {role['title']} by sequencing {len(gaps)} identified gaps against a catalogue of open "
            f"and low-cost modules. The plan assumes {hours_per_week} study hours per week."
        ),
    }

# SDG mapping -------------------------------------------------------

def build_sdg_map(profile: dict, matches: dict, scenario_id: str) -> dict:
    top = matches["matches"][:6]
    goals = []
    for goal in CATALOG["sdgs"]:
        contributions = []
        for match in top:
            relation = next(
                (item for item in ROLES[match["roleId"]]["sdgs"] if item["number"] == goal["number"]), None
            )
            if not relation:
                continue
            contributions.append(
                {
                    "roleId": match["roleId"],
                    "contribution": (match["fitScore"] / 100.0) * (relation["weight"] / 5.0),
                    "rationale": relation["rationale"],
                }
            )
        contributions.sort(key=lambda item: -item["contribution"])
        role_ids = [item["roleId"] for item in contributions]

        evidence = []
        for signal in sorted(SIGNALS["items"], key=lambda item: -item["impact"]):
            if any(role["roleId"] in role_ids for role in signal.get("affectedRoles", [])):
                evidence.append(
                    {
                        "signalId": signal["id"],
                        "title": signal["title"],
                        "publisher": signal["publisher"],
                        "publishedAt": signal["publishedAt"],
                    }
                )
            if len(evidence) == 2:
                break

        best = contributions[0]["contribution"] if contributions else 0.0
        breadth = min(max(0, len(contributions) - 1) * 2, 6)
        score = int(round(clamp(best * 92 + breadth + min(len(evidence) * 1.5, 4), 0, 100)))
        top_relation = None
        if top:
            top_relation = next(
                (item for item in ROLES[top[0]["roleId"]]["sdgs"] if item["number"] == goal["number"]), None
            )
        tier = (
            "primary"
            if top_relation and top_relation["tier"] == "primary"
            else ("secondary" if score >= 34 else "contextual")
        )

        skill_ids = []
        for role_id in role_ids:
            for skill in ROLES[role_id]["requiredSkills"]:
                if skill["skillId"] not in skill_ids:
                    skill_ids.append(skill["skillId"])

        goals.append(
            {
                "number": goal["number"],
                "name": goal["name"],
                "shortName": goal["shortName"],
                "color": goal["color"],
                "focus": goal["focus"],
                "score": score,
                "tier": tier,
                "roleIds": role_ids,
                "skillIds": skill_ids[:6],
                "rationale": contributions[0]["rationale"]
                if contributions
                else "No direct role link yet. This goal stays contextual for the selected pathway.",
                "evidence": evidence,
            }
        )

    ranked = sorted(goals, key=lambda item: -item["score"])
    return {
        "profileId": profile["id"],
        "scenarioId": scenario_id,
        "generatedAt": now_iso(),
        "goals": goals,
        "summary": {
            "topGoal": ranked[0]["number"] if ranked else None,
            "primaryGoals": [goal["number"] for goal in ranked if goal["tier"] == "primary"],
            "secondaryGoals": [goal["number"] for goal in ranked if goal["tier"] == "secondary"],
            "strongestScore": ranked[0]["score"] if ranked else 0,
            "note": (
                "Scores combine the fit of your top roles with each role's SDG contribution weight. "
                "They describe where your work would land, not a formal impact measurement."
            ),
        },
    }


# Narrative ---------------------------------------------------------

def build_analysis(profile: dict, matches: dict, scenario: dict, pathway: dict) -> dict:
    top = matches["matches"][:3]
    lead = top[0]
    gaps = lead["skillsGap"][:3]
    paragraphs = []

    others = " and ".join(f"{match['title']} ({match['fitScore']})" for match in top[1:])
    paragraphs.append(
        f"{profile['name']}, your strongest adjacent role is {lead['title']} (fit {lead['fitScore']}/100) "
        f"under the {scenario['name']} scenario. {others} follow, which gives you more than one credible route."
    )
    if gaps:
        gap_text = ", ".join(f"{gap['name']} {gap['currentLevel']} to {gap['requiredLevel']}" for gap in gaps)
        note = (lead.get("scenarioNote") + " ") if lead.get("scenarioNote") else ""
        anchor = lead["matchedSkills"][0]["name"] if lead["matchedSkills"] else "transferable experience"
        paragraphs.append(
            f"The gap is narrow: {gap_text}. {note}"
            f"Your existing {anchor} is the reason the jump is plausible."
        )
    paragraphs.append(
        f"A {pathway['horizonWeeks']}-week plan at {pathway['hoursPerWeek']} hours per week reaches an estimated "
        f"readiness of {pathway['readinessTo']}/100, across {len(pathway['phases'])} phases and "
        f"USD {pathway['totalCost']} of catalogue cost. It ends with evidence: a portfolio artefact and a defended case."
    )
    paragraphs.append(
        "Re-run the analysis when the scenario changes. Under acceleration the same profile scores differently, "
        "because agentic deployment changes what employers hire for."
    )
    return {
        "provider": "reference-api",
        "model": "narrative-v1",
        "generatedAt": now_iso(),
        "scenarioId": scenario["id"],
        "narrative": "\n\n".join(paragraphs),
    }


# Signals -----------------------------------------------------------

def list_signals(query: dict) -> dict:
    items = SIGNALS["items"]
    text = (query.get("query") or "").strip().lower()
    momentum = query.get("momentum") or ""
    region = query.get("region") or ""
    kind = query.get("type") or ""
    role_id = query.get("roleId") or ""
    sort = query.get("sort") or "recent"
    limit = int(clamp(int(query.get("limit") or 50), 1, 200))
    offset = max(0, int(query.get("offset") or 0))

    def matches(item: dict) -> bool:
        if momentum and item["momentum"] != momentum:
            return False
        if region and item["region"] != region:
            return False
        if kind and item["type"] != kind:
            return False
        if role_id and not any(role["roleId"] == role_id for role in item.get("affectedRoles", [])):
            return False
        if text:
            haystack = " ".join(
                [item["title"], item["summary"], item["publisher"]] + [tag for tag in item.get("tags", [])]
            ).lower()
            if text not in haystack:
                return False
        return True

    filtered = [item for item in items if matches(item)]
    if sort == "impact":
        filtered.sort(key=lambda item: (-item["impact"], item["publishedAt"]))
    else:
        filtered.sort(key=lambda item: (item["publishedAt"], item["impact"]), reverse=True)

    def count_by(key: str) -> dict:
        counts: dict = {}
        for item in items:
            counts[item[key]] = counts.get(item[key], 0) + 1
        return counts

    return {
        "items": filtered[offset : offset + limit],
        "total": len(filtered),
        "limit": limit,
        "offset": offset,
        "lastRefreshedAt": LAST_REFRESHED,
        "window": SIGNALS["window"],
        "pipeline": SIGNALS.get("pipeline", {}),
        "facets": {"momentum": count_by("momentum"), "region": count_by("region"), "type": count_by("type")},
    }

# HTTP API ----------------------------------------------------------

class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details


CAPABILITIES = ["catalog", "signals", "profiles", "matching", "pathway", "sdg-map", "scenarios", "streaming"]


def meta_payload() -> dict:
    return {
        "service": "ai-career-navigator-reference",
        "version": "1.0.0",
        "mode": "live",
        "datasetVersion": CATALOG["meta"]["datasetVersion"],
        "generatedAt": CATALOG["meta"]["generatedAt"],
        "lastRefreshedAt": LAST_REFRESHED,
        "signalWindow": SIGNALS["window"],
        "llm": {"provider": "reference", "model": "narrative-v1", "configured": False},
        "capabilities": CAPABILITIES,
        "counts": {
            "skills": len(SKILLS),
            "roles": len(ROLES),
            "sdgs": len(SDGS),
            "signals": len(SIGNALS["items"]),
        },
    }


class Handler(SimpleHTTPRequestHandler):
    server_version = "AICareerNavigatorReference/1.0"
    protocol_version = "HTTP/1.1"
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webp": "image/webp"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND), **kwargs)

    # -- plumbing ---------------------------------------------------
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[api] " + (fmt % args) + "\n")

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        if length > 2_000_000:
            raise ApiError(413, "payload_too_large", "Request body exceeds 2 MB.")
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiError(400, "invalid_json", "Request body must be valid JSON.")
        if not isinstance(payload, dict):
            raise ApiError(400, "invalid_body", "Request body must be a JSON object.")
        return payload

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.end_headers()

    # -- routing ----------------------------------------------------
    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/v1"):
            self.dispatch("GET", parsed)
            return
        translated = Path(self.translate_path(parsed.path))
        if not translated.exists() and "." not in os.path.basename(parsed.path):
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        self.dispatch("POST", urlparse(self.path))

    def do_PATCH(self) -> None:  # noqa: N802
        self.dispatch("PATCH", urlparse(self.path))

    def dispatch(self, method: str, parsed) -> None:
        path = parsed.path[len("/api/v1") :] or "/"
        query = {key: values[0] for key, values in parse_qs(parsed.query).items()}
        try:
            body = self.read_json() if method in ("POST", "PATCH") else {}
            result = route(method, path, query, body)
            if isinstance(result, tuple) and result and result[0] == "stream":
                self.stream_analysis(result[1], result[2], result[3])
                return
            status, payload = result
            self.send_json(status, payload)
        except ApiError as error:
            self.send_json(
                error.status,
                {"error": {"code": error.code, "message": error.message, "details": error.details}},
            )
        except BrokenPipeError:
            return
        except Exception as error:  # pragma: no cover - defensive
            sys.stderr.write("[api] unhandled: " + repr(error) + "\n")
            self.send_json(500, {"error": {"code": "internal_error", "message": "Unexpected server error."}})

    def stream_analysis(self, profile: dict, scenario_id: str, role_id: str | None) -> None:
        scenario = SCENARIOS.get(scenario_id) or CATALOG["scenarios"][0]
        matches = build_matches(profile, scenario["id"])
        pathway = build_pathway(profile, matches, scenario["id"], role_id)
        analysis = build_analysis(profile, matches, scenario, pathway)

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()

        def emit(event: str, payload: dict) -> None:
            frame = "event: " + event + "\ndata: " + json.dumps(payload, ensure_ascii=False) + "\n\n"
            self.wfile.write(frame.encode("utf-8"))
            self.wfile.flush()

        try:
            emit("meta", {"provider": analysis["provider"], "model": analysis["model"], "scenarioId": scenario["id"]})
            words = analysis["narrative"].split(" ")
            for index, word in enumerate(words):
                text = word + (" " if index < len(words) - 1 else "")
                emit("token", {"text": text})
                time.sleep(0.015)
            emit("done", {"analysis": analysis})
        except (BrokenPipeError, ConnectionResetError):
            return
        self.close_connection = True


def require_profile(profile_id: str) -> dict:
    profile = db_get(profile_id)
    if not profile:
        raise ApiError(404, "profile_not_found", "No profile exists with id " + str(profile_id) + ".")
    return profile


def route(method: str, path: str, query: dict, body: dict):
    if path == "/health" and method == "GET":
        return 200, {
            "status": "ok",
            "service": "ai-career-navigator-reference",
            "version": "1.0.0",
            "mode": "live",
            "datasetVersion": CATALOG["meta"]["datasetVersion"],
            "time": now_iso(),
            "uptimeSeconds": int(time.time() - STARTED_AT),
            "llm": {"provider": "reference", "model": "narrative-v1", "configured": False},
        }
    if path == "/meta" and method == "GET":
        return 200, meta_payload()
    if path == "/catalog" and method == "GET":
        return 200, {
            "meta": CATALOG["meta"],
            "skills": CATALOG["skills"],
            "sdgs": CATALOG["sdgs"],
            "roles": CATALOG["roles"],
            "scenarios": CATALOG["scenarios"],
        }
    if path == "/scenarios" and method == "GET":
        return 200, {"items": CATALOG["scenarios"]}
    if path == "/signals" and method == "GET":
        return 200, list_signals(query)
    if path == "/signals/refresh" and method == "POST":
        global LAST_REFRESHED
        LAST_REFRESHED = now_iso()
        return 200, {
            "refreshedAt": LAST_REFRESHED,
            "added": 0,
            "updated": len(SIGNALS["items"]),
            "scanned": SIGNALS.get("pipeline", {}).get("sourcesScanned", 0),
            "durationSeconds": 4.2,
            "pipeline": SIGNALS.get("pipeline", {}),
            "note": "Reference API re-verifies the fixture set; wire the real ingestion pipeline here.",
        }
    if path == "/profiles" and method == "POST":
        profile = normalise_profile(body)
        db_save(profile)
        return 201, {"profile": profile}
    if path == "/analysis" and method == "POST":
        profile_id = body.get("profileId")
        profile = require_profile(profile_id) if profile_id else normalise_profile(body.get("profile") or body)
        scenario_id = body.get("scenarioId") or "baseline"
        scenario = SCENARIOS.get(scenario_id) or CATALOG["scenarios"][0]
        matches = build_matches(profile, scenario["id"])
        pathway = build_pathway(profile, matches, scenario["id"], body.get("roleId"))
        return 200, {"analysis": build_analysis(profile, matches, scenario, pathway)}
    if path == "/analysis/stream" and method == "GET":
        profile_id = query.get("profileId")
        if not profile_id:
            raise ApiError(422, "validation_error", "profileId is required for the analysis stream.")
        profile = require_profile(profile_id)
        return ("stream", profile, query.get("scenarioId") or "baseline", query.get("roleId"))

    profile_match = re.fullmatch(r"/profiles/([^/]+)", path)
    if profile_match and method == "GET":
        return 200, {"profile": require_profile(profile_match.group(1))}
    if profile_match and method == "PATCH":
        existing = require_profile(profile_match.group(1))
        merged = {**existing, **body}
        profile = normalise_profile(merged, existing)
        db_save(profile)
        return 200, {"profile": profile}

    action_match = re.fullmatch(r"/profiles/([^/]+)/(match|pathway|sdg-map)", path)
    if action_match:
        profile_id, action = action_match.groups()
        profile = require_profile(profile_id)
        sent_profile = body.get("profile") if method == "POST" else None
        if isinstance(sent_profile, dict) and sent_profile.get("skills"):
            profile = normalise_profile({**profile, **sent_profile}, profile)
        scenario_id = body.get("scenarioId") or query.get("scenarioId") or "baseline"
        scenario = SCENARIOS.get(scenario_id) or CATALOG["scenarios"][0]
        matches = build_matches(profile, scenario["id"])
        if action == "match" and method == "POST":
            return 200, matches
        if action == "pathway" and method == "POST":
            return 200, build_pathway(profile, matches, scenario["id"], body.get("roleId"))
        if action == "sdg-map" and method == "GET":
            return 200, build_sdg_map(profile, matches, scenario["id"])

    raise ApiError(404, "not_found", "No API route matches " + method + " " + path + ".")


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128


def main() -> int:
    parser = argparse.ArgumentParser(description="Reference API for AI Career Navigator")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--open", action="store_true", help="open the browser after start")
    args = parser.parse_args()

    if not FRONTEND.exists():
        print("Frontend directory not found: " + str(FRONTEND), file=sys.stderr)
        return 1

    db_connect().close()
    url = "http://" + args.host + ":" + str(args.port) + "/"
    print("AI Career Navigator reference API")
    print("  UI:      " + url)
    print("  API:     " + url + "api/v1/health")
    print("  SQLite:  " + str(DB_PATH) + " (" + str(db_count()) + " profiles)")
    print("  Catalog: " + str(MOCK))
    print("Ctrl+C to stop.")

    if args.open:
        import webbrowser

        webbrowser.open(url)

    try:
        with Server((args.host, args.port), Handler) as httpd:
            print("Serving " + str(FRONTEND))
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())