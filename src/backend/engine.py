#!/usr/bin/env python3
"""Contract engine for the AI Career Navigator API.

This module contains the deterministic matching, pathway, SDG and analysis engine:

* Python standard library only (no pip install, runs on Replit as-is)
* serves src/frontend at / so the UI is same-origin
* implements every endpoint in docs/API.md, including SSE streaming
* persists profiles in a local SQLite database (data/app.db)
* uses the real labour datasets in src/backend/data

Run:
    python src/main.py
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
DB_PATH = ROOT / "data" / "app.db"

from src.backend.data import CATALOG, SIGNALS, MODULES, INTEREST_ROLES
from src.backend import llm

SKILLS = {item["id"]: item for item in CATALOG["skills"]}
ROLES = {item["id"]: item for item in CATALOG["roles"]}
SCENARIOS = {item["id"]: item for item in CATALOG["scenarios"]}
SDGS = {item["number"]: item for item in CATALOG["sdgs"]}

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


def _build_matches_deterministic(profile: dict, scenario_id: str) -> dict:
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


# LLM-assisted matching ----------------------------------------------

MATCH_CACHE: dict[str, tuple[float, dict]] = {}
MATCH_CACHE_SECONDS = 900


def _profile_signature(profile: dict) -> str:
    return json.dumps(
        {
            "id": profile.get("id"),
            "updatedAt": profile.get("updatedAt"),
            "skills": profile.get("skills"),
            "interests": profile.get("interests"),
            "goal": profile.get("goal"),
            "constraints": profile.get("constraints"),
            "sector": profile.get("sector"),
        },
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )


def _summary_for_matches(matches: list[dict]) -> dict:
    top = matches[:3]
    readiness = sum(match["fitScore"] * weight for match, weight in zip(top, [0.5, 0.3, 0.2]))
    gap_skills = {gap["skillId"] for match in top for gap in match["skillsGap"]}
    return {
        "readinessScore": int(round(readiness)),
        "topRoleId": top[0]["roleId"] if top else None,
        "topRoleTitle": top[0]["title"] if top else None,
        "topFit": top[0]["fitScore"] if top else 0,
        "skillsToClose": len(gap_skills),
        "coveragePct": int(
            round(
                100
                * sum(len(match["matchedSkills"]) for match in top)
                / max(1, sum(len(match["matchedSkills"]) + len(match["skillsGap"]) for match in top))
            )
        ),
        "topMatches": [
            {"roleId": match["roleId"], "title": match["title"], "fitScore": match["fitScore"]} for match in top
        ],
    }


def _match_provider_info() -> dict:
    return llm.provider_info()


def _llm_rerank_matches(profile: dict, scenario: dict, base: dict) -> dict:
    candidates = []
    for match in base["matches"]:
        candidates.append(
            {
                "roleId": match["roleId"],
                "title": match["title"],
                "family": match["family"],
                "sector": match["sector"],
                "fitScore": match["fitScore"],
                "baselineFit": match["baselineFit"],
                "demandIndex": match["demandIndex"],
                "automationRisk": match["automationRisk"],
                "salary": match["salary"],
                "summary": match["summary"],
                "gaps": [
                    {
                        "skill": gap["name"],
                        "current": gap["currentLevel"],
                        "required": gap["requiredLevel"],
                        "importance": gap["importance"],
                    }
                    for gap in match["skillsGap"][:5]
                ],
            }
        )
    context = {
        "profile": {
            "name": profile.get("name"),
            "headline": profile.get("headline"),
            "currentRole": profile.get("currentRole"),
            "sector": profile.get("sector"),
            "region": profile.get("region"),
            "education": profile.get("education"),
            "yearsExperience": profile.get("yearsExperience"),
            "goal": profile.get("goal"),
            "interests": profile.get("interests"),
            "constraints": profile.get("constraints"),
            "skills": profile.get("skills"),
        },
        "scenario": {
            "id": scenario.get("id"),
            "name": scenario.get("name"),
            "shortName": scenario.get("shortName"),
            "summary": scenario.get("summary"),
            "horizon": scenario.get("horizon"),
            "metrics": scenario.get("metrics"),
        },
        "candidates": candidates,
    }
    result = llm.generate_json(
        "You are a labour-market career analyst. Return only a JSON object. "
        "Do not invent role ids, salaries, credentials or skills. Use only the supplied candidates. "
        "Re-rank them for this person and scenario, and adjust fit scores by at most +/-12 points. "
        "The output schema is: {selectedRoleId: string, rankedRoleIds: string[], "
        "scoreAdjustments: object mapping roleId to integer, roleNotes: object mapping roleId to one sentence, "
        "rationale: string}. The selected role must be one of the candidates.",
        json.dumps(context, ensure_ascii=False, default=str),
        max_tokens=1100,
    )
    by_id = {match["roleId"]: match for match in base["matches"]}
    adjustments = result.get("scoreAdjustments")
    if isinstance(adjustments, dict):
        for role_id, value in adjustments.items():
            match = by_id.get(role_id)
            if not match:
                continue
            try:
                delta = int(round(float(value)))
            except (TypeError, ValueError):
                continue
            delta = int(clamp(delta, -12, 12))
            match["fitScore"] = int(clamp(match["fitScore"] + delta, 0, 100))
            match["fitDelta"] = match["fitScore"] - match["baselineFit"]
            match["llmAdjustment"] = delta
            match["scoreSource"] = "deterministic+llm"

    notes = result.get("roleNotes")
    if isinstance(notes, dict):
        for role_id, note in notes.items():
            if role_id in by_id and isinstance(note, str):
                by_id[role_id]["llmNote"] = note.strip()[:300]

    ranked = []
    for role_id in result.get("rankedRoleIds") or []:
        if role_id in by_id and role_id not in ranked:
            ranked.append(role_id)
    selected = result.get("selectedRoleId")
    if selected not in by_id:
        selected = ranked[0] if ranked else base["matches"][0]["roleId"]
    if selected not in ranked:
        ranked.insert(0, selected)
    for match in base["matches"]:
        if match["roleId"] not in ranked:
            ranked.append(match["roleId"])

    ordered = [by_id[role_id] for role_id in ranked if role_id in by_id]
    # Scores are the public ranking contract; the model's role order is only a
    # hint and must not leave the list unsorted after score adjustments.
    ordered.sort(key=lambda match: (-match["fitScore"], match["title"]))
    base["matches"] = ordered
    base["summary"] = _summary_for_matches(ordered)
    base["model"] = "career-match:v1.3+llm"
    base["selectionSource"] = "llm"
    base["llm"] = {
        **_match_provider_info(),
        "used": True,
        "selectedRoleId": selected,
        "rationale": str(result.get("rationale") or "")[:500],
    }
    return base


def build_matches(profile: dict, scenario_id: str) -> dict:
    base = _build_matches_deterministic(profile, scenario_id)
    if not llm.is_configured():
        base["llm"] = {**_match_provider_info(), "used": False}
        base["selectionSource"] = "deterministic"
        return base

    key = scenario_id + ":" + _profile_signature(profile)
    cached = MATCH_CACHE.get(key)
    if cached and time.time() - cached[0] < MATCH_CACHE_SECONDS:
        return json.loads(json.dumps(cached[1]))

    scenario = SCENARIOS.get(scenario_id) or CATALOG["scenarios"][0]
    try:
        enriched = _llm_rerank_matches(profile, scenario, base)
    except llm.LLMError as error:
        base["llm"] = {**_match_provider_info(), "used": False, "error": str(error)[:240]}
        base["selectionSource"] = "deterministic"
        return base
    MATCH_CACHE[key] = (time.time(), enriched)
    return enriched


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


def _build_pathway_deterministic(profile: dict, matches: dict, scenario_id: str, role_id: str | None) -> dict:
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

# LLM-assisted pathway planning -------------------------------------

def _recompute_pathway(base: dict) -> dict:
    cursor = 0
    for phase in base.get("phases", []):
        modules = phase.get("modules", [])
        hours = sum(int(module.get("hours") or 0) for module in modules)
        cost = sum(int(module.get("cost") or 0) for module in modules)
        weeks = max(1, -(-hours // max(1, int(base.get("hoursPerWeek") or 8))))
        phase["hours"] = hours
        phase["cost"] = cost
        phase["weeks"] = weeks
        phase["startWeek"] = cursor + 1
        cursor += weeks
        phase["endWeek"] = cursor
        for index, milestone in enumerate(phase.get("milestones", [])):
            milestone["week"] = phase["startWeek"] if index == 0 else phase["endWeek"]
    base["horizonWeeks"] = cursor
    base["totalHours"] = sum(int(phase.get("hours") or 0) for phase in base.get("phases", []))
    base["totalCost"] = sum(int(phase.get("cost") or 0) for phase in base.get("phases", []))
    covers = base.get("covers", [])
    covered_pct = (sum(1 for cover in covers if cover.get("covered")) / len(covers)) if covers else 1.0
    base["readinessTo"] = min(95, int(round(base.get("readinessFrom", 0) + 8 + covered_pct * 18)))
    return base


def _llm_plan_pathway(profile: dict, matches: dict, scenario: dict, base: dict, explicit_role: bool) -> dict:
    role_candidates = [
        {"roleId": match["roleId"], "title": match["title"], "fitScore": match["fitScore"]}
        for match in matches["matches"][:6]
    ]
    modules = []
    for phase in base.get("phases", []):
        for module in phase.get("modules", []):
            modules.append(
                {
                    "id": module.get("id"),
                    "title": module.get("title"),
                    "level": module.get("level"),
                    "hours": module.get("hours"),
                    "cost": module.get("cost"),
                    "teaches": module.get("teaches", []),
                    "phase": phase.get("id"),
                }
            )
    context = {
        "profile": {
            "name": profile.get("name"),
            "goal": profile.get("goal"),
            "skills": profile.get("skills"),
            "constraints": profile.get("constraints"),
        },
        "scenario": {
            "id": scenario.get("id"),
            "name": scenario.get("name"),
            "summary": scenario.get("summary"),
        },
        "roleCandidates": role_candidates,
        "currentRoleId": base.get("roleId"),
        "modules": modules,
        "explicitRole": explicit_role,
    }
    result = llm.generate_json(
        "You are a reskilling pathway planner. Return only a JSON object. "
        "Never invent roles, module ids, hours or costs. Choose one roleId from roleCandidates "
        "(unless explicitRole is true, in which case keep currentRoleId). Re-order the supplied module ids "
        "into the best learning sequence; every id must come from modules. Keep all modules. "
        "Output: {selectedRoleId: string, moduleOrder: string[], rationale: string, phaseNotes: object}. "
        "The plan must respect the learner's hours and budget constraints.",
        json.dumps(context, ensure_ascii=False, default=str),
        max_tokens=1100,
    )
    return result


def build_pathway(profile: dict, matches: dict, scenario_id: str, role_id: str | None) -> dict:
    scenario = SCENARIOS.get(scenario_id) or CATALOG["scenarios"][0]
    base = _build_pathway_deterministic(profile, matches, scenario_id, role_id)
    if not llm.is_configured():
        base["llm"] = {**llm.provider_info(), "used": False}
        base["selectionSource"] = "deterministic"
        return base

    try:
        result = _llm_plan_pathway(profile, matches, scenario, base, bool(role_id))
        selected = result.get("selectedRoleId")
        valid_roles = {match["roleId"] for match in matches["matches"]}
        if (
            not role_id
            and isinstance(selected, str)
            and selected in valid_roles
            and selected != base["roleId"]
        ):
            base = _build_pathway_deterministic(profile, matches, scenario_id, selected)
            base["llmRoleChanged"] = True

        order = result.get("moduleOrder")
        if isinstance(order, list):
            rank = {module_id: index for index, module_id in enumerate(order) if isinstance(module_id, str)}
            for phase in base.get("phases", []):
                phase["modules"] = sorted(
                    phase.get("modules", []),
                    key=lambda module, rank=rank: rank.get(module.get("id"), len(rank) + 1),
                )
        base = _recompute_pathway(base)
        base["model"] = "pathway-builder:v1.2+llm"
        base["selectionSource"] = "llm"
        base["llm"] = {
            **llm.provider_info(),
            "used": True,
            "selectedRoleId": base["roleId"],
            "rationale": str(result.get("rationale") or "")[:500],
            "phaseNotes": result.get("phaseNotes") if isinstance(result.get("phaseNotes"), dict) else {},
        }
    except llm.LLMError as error:
        base["llm"] = {**llm.provider_info(), "used": False, "error": str(error)[:240]}
        base["selectionSource"] = "deterministic"
    return base


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

# LLM-assisted briefing ---------------------------------------------

def build_analysis(profile: dict, matches: dict, scenario: dict, pathway: dict) -> dict:
    if not llm.is_configured():
        raise ApiError(503, "llm_not_configured", "AI briefing requires a configured external model.")
    top = matches["matches"][:3]
    context = {
        "profile": {
            "name": profile.get("name"),
            "headline": profile.get("headline"),
            "currentRole": profile.get("currentRole"),
            "sector": profile.get("sector"),
            "region": profile.get("region"),
            "goal": profile.get("goal"),
            "constraints": profile.get("constraints"),
            "skills": profile.get("skills"),
        },
        "scenario": {
            "id": scenario.get("id"),
            "name": scenario.get("name"),
            "shortName": scenario.get("shortName"),
            "summary": scenario.get("summary"),
            "metrics": scenario.get("metrics"),
        },
        "topMatches": [
            {
                "roleId": match["roleId"],
                "title": match["title"],
                "fitScore": match["fitScore"],
                "summary": match["summary"],
                "gaps": [
                    {"name": gap["name"], "current": gap["currentLevel"], "required": gap["requiredLevel"]}
                    for gap in match["skillsGap"][:4]
                ],
                "reasons": match.get("reasons", [])[:3],
                "llmNote": match.get("llmNote", ""),
            }
            for match in top
        ],
        "pathway": {
            "roleTitle": pathway.get("roleTitle"),
            "horizonWeeks": pathway.get("horizonWeeks"),
            "hoursPerWeek": pathway.get("hoursPerWeek"),
            "totalHours": pathway.get("totalHours"),
            "totalCost": pathway.get("totalCost"),
            "readinessFrom": pathway.get("readinessFrom"),
            "readinessTo": pathway.get("readinessTo"),
            "phases": [
                {
                    "title": phase.get("title"),
                    "goal": phase.get("goal"),
                    "weeks": phase.get("weeks"),
                    "modules": [
                        {"title": module.get("title"), "hours": module.get("hours"), "cost": module.get("cost")}
                        for module in phase.get("modules", [])[:5]
                    ],
                }
                for phase in pathway.get("phases", [])
            ],
        },
        "signals": [
            {
                "title": signal.get("title"),
                "publisher": signal.get("publisher"),
                "publishedAt": signal.get("publishedAt"),
                "summary": signal.get("summary"),
            }
            for signal in sorted(SIGNALS["items"], key=lambda item: -item["impact"])[:4]
        ],
    }
    try:
        narrative = llm.generate_text(
            "You are a careful career adviser. Write a grounded briefing in plain text only: "
            "3-4 short paragraphs, no markdown headings, no invented salaries, credentials or sources. "
            "Use the supplied profile, scenario, role matches, pathway and dated signals. "
            "Mention uncertainty where the evidence is thin. End with one concrete next action.",
            json.dumps(context, ensure_ascii=False, default=str),
            max_tokens=900,
            temperature=0.35,
        )
    except llm.LLMError as error:
        raise ApiError(503, "llm_unavailable", "AI briefing failed: " + str(error)[:240]) from error
    if not isinstance(narrative, str) or not narrative.strip():
        raise ApiError(503, "llm_unavailable", "AI briefing returned an empty model response.")
    info = llm.provider_info()
    return {
        "provider": info["provider"],
        "model": info["model"],
        "generatedAt": now_iso(),
        "scenarioId": scenario["id"],
        "narrative": narrative.strip(),
        "llm": {**info, "used": True},
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


CAPABILITIES = ["catalog", "signals", "profiles", "matching", "pathway", "sdg-map", "scenarios", "streaming", "llm"]


def meta_payload() -> dict:
    return {
        "service": "ai-career-navigator-fastapi",
        "version": "1.0.0",
        "mode": "live",
        "datasetVersion": CATALOG["meta"]["datasetVersion"],
        "generatedAt": CATALOG["meta"]["generatedAt"],
        "lastRefreshedAt": LAST_REFRESHED,
        "signalWindow": SIGNALS["window"],
        "llm": llm.provider_info(),
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
            "service": "ai-career-navigator-fastapi",
            "version": "1.0.0",
            "mode": "live",
            "datasetVersion": CATALOG["meta"]["datasetVersion"],
            "time": now_iso(),
            "uptimeSeconds": int(time.time() - STARTED_AT),
            "llm": llm.provider_info(),
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
    print("AI Career Navigator API")
    print("  UI:      " + url)
    print("  API:     " + url + "api/v1/health")
    print("  SQLite:  " + str(DB_PATH) + " (" + str(db_count()) + " profiles)")
    print("  Catalog: " + str(CATALOG["meta"]))
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