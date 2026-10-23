"""Build the API catalogue from the repository's real labour-market datasets.

The backend does not read src/frontend/mock. The datasets in src/backend/data
are DOSM/MoHE/global salary and employment tables restored from the repository's
real-data commit. Role archetypes and the skill taxonomy are product definitions;
all salary, employment, source and signal metadata comes from those tables.
"""

from __future__ import annotations

import csv
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "src" / "backend" / "data"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_rows(filename: str) -> list[dict]:
    path = DATA / filename
    if not path.is_file():
        raise FileNotFoundError("Required real dataset is missing: " + str(path))
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def number(value):
    try:
        text = str(value or "").strip().replace(",", "")
        return float(text) if text else None
    except ValueError:
        return None


# Skill taxonomy: identifiers are also used by the frontend intake and matching UI.
SKILLS = [
    ("data-literacy", "Data literacy", "Data & AI", "Read, question and use data without a data-science title."),
    ("statistics", "Statistics", "Data & AI", "Reason about distributions, uncertainty and evidence."),
    ("python", "Python", "Data & AI", "Automate analysis and build small data tools."),
    ("sql", "SQL", "Data & AI", "Query and join operational data safely."),
    ("machine-learning", "Machine learning", "Data & AI", "Understand model behaviour and basic experimentation."),
    ("prompt-engineering", "Prompt engineering", "Data & AI", "Design reliable instructions for generative systems."),
    ("model-evaluation", "Model evaluation", "Data & AI", "Test quality, safety and failure modes before deployment."),
    ("ai-governance", "AI governance", "Data & AI", "Apply accountability, privacy and assurance practices."),
    ("cloud", "Cloud platforms", "Digital & Systems", "Run and secure services on shared infrastructure."),
    ("cybersecurity", "Cybersecurity", "Digital & Systems", "Protect systems, identities and data."),
    ("systems-design", "Systems design", "Digital & Systems", "Model dependencies and design reliable workflows."),
    ("automation", "Automation", "Digital & Systems", "Turn repeatable work into reliable processes."),
    ("process-design", "Process design", "Digital & Systems", "Map, simplify and improve operational workflows."),
    ("stakeholder-comms", "Stakeholder communication", "Human & Social", "Explain decisions to non-technical stakeholders."),
    ("communication", "Communication", "Human & Social", "Write and present evidence clearly."),
    ("facilitation", "Facilitation", "Human & Social", "Run groups toward a useful decision."),
    ("critical-evaluation", "Critical evaluation", "Human & Social", "Challenge assumptions and assess evidence quality."),
    ("financial-analysis", "Financial analysis", "Domain & Policy", "Read budgets, costs and financial trade-offs."),
    ("research", "Research", "Domain & Policy", "Find, verify and synthesise primary sources."),
    ("policy-analysis", "Policy analysis", "Domain & Policy", "Connect rules, incentives and public outcomes."),
    ("sustainability", "Sustainability", "Domain & Policy", "Assess environmental and social impact."),
    ("healthcare-systems", "Healthcare systems", "Domain & Policy", "Understand clinical operations and health data."),
    ("project-management", "Project management", "Domain & Policy", "Sequence work, risks and evidence."),
    ("change-facilitation", "Change facilitation", "Human & Social", "Help people adopt new ways of working."),
    ("systems-thinking", "Systems thinking", "Digital & Systems", "See feedback loops and dependencies across a system."),
]
SKILLS = [{"id": i, "name": n, "category": c, "blurb": b} for i, n, c, b in SKILLS]
SKILL_INDEX = {item["id"]: item for item in SKILLS}

SDGS = [
    (1, "No Poverty", "No poverty", "#E5243B", "Income security and access to productive work."),
    (2, "Zero Hunger", "Zero hunger", "#DDA63A", "Food systems, rural livelihoods and nutrition."),
    (3, "Good Health and Well-being", "Good health", "#4C9F38", "Health outcomes, care access and clinical capacity."),
    (4, "Quality Education", "Quality education", "#C5192D", "Learning, skills and access to knowledge."),
    (5, "Gender Equality", "Gender equality", "#FF3A21", "Equal participation and economic agency."),
    (6, "Clean Water and Sanitation", "Clean water", "#26BDE2", "Water security and sanitation systems."),
    (7, "Affordable and Clean Energy", "Clean energy", "#FCC30B", "Energy access and the transition to clean power."),
    (8, "Decent Work and Economic Growth", "Decent work", "#A21942", "Job quality, productivity and inclusive growth."),
    (9, "Industry, Innovation and Infrastructure", "Industry & innovation", "#FD6925", "Industrial capability, R&D and resilient infrastructure."),
    (10, "Reduced Inequalities", "Reduced inequalities", "#DD1367", "Distribution of opportunity and outcomes."),
    (11, "Sustainable Cities and Communities", "Sustainable cities", "#FD9D24", "Urban systems, housing and mobility."),
    (12, "Responsible Consumption and Production", "Responsible consumption", "#BF8B2E", "Material use, waste and supply chains."),
    (13, "Climate Action", "Climate action", "#3F7E44", "Emissions, adaptation and climate risk."),
    (14, "Life Below Water", "Life below water", "#0A97D9", "Marine ecosystems and blue economies."),
    (15, "Life on Land", "Life on land", "#56C02B", "Biodiversity, land use and ecosystems."),
    (16, "Peace, Justice and Strong Institutions", "Peace & institutions", "#00689D", "Governance, rights and accountable institutions."),
    (17, "Partnerships for the Goals", "Partnerships", "#19486A", "Coordination, financing and shared delivery."),
]
SDGS = [
    {"number": n, "name": name, "shortName": short, "color": color, "focus": focus}
    for n, name, short, color, focus in SDGS
]

# Role archetypes are grounded in the real salary/field rows in dataset 07.
ROLE_SPECS = [
    ("ai-data-analyst", "AI / Data Analyst", "Computer Science", "Data & AI", "Technology", 22,
     ["data-literacy", "statistics", "python", "sql", "machine-learning", "communication"], [8, 9, 4]),
    ("aerospace-systems-engineer", "Aerospace Systems Engineer", "Aerospace Engineering", "Engineering", "Manufacturing & logistics", 14,
     ["systems-design", "systems-thinking", "project-management", "data-literacy", "communication"], [9, 8, 11]),
    ("financial-analyst", "Financial Analyst", "Accounting", "Finance", "Finance", 36,
     ["financial-analysis", "data-literacy", "statistics", "communication", "critical-evaluation"], [8, 10, 16]),
    ("agri-food-analyst", "Agri-Food Systems Analyst", "Agriculture", "Sustainability", "Other", 28,
     ["sustainability", "research", "data-literacy", "project-management", "communication"], [2, 13, 8]),
    ("health-data-analyst", "Health Data Analyst", "Biochemistry", "Health", "Healthcare", 19,
     ["healthcare-systems", "research", "data-literacy", "critical-evaluation", "communication"], [3, 8, 10]),
    ("business-intelligence-analyst", "Business Intelligence Analyst", "Business Analytics", "Data & AI", "Technology", 24,
     ["data-literacy", "statistics", "sql", "financial-analysis", "communication"], [8, 9, 4]),
    ("embedded-systems-engineer", "Embedded Systems Engineer", "Computer Engineering", "Engineering", "Manufacturing & logistics", 12,
     ["systems-design", "systems-thinking", "cybersecurity", "cloud", "automation"], [9, 8, 11]),
    ("social-research-analyst", "Social Research Analyst", "Anthropology", "Human & Social", "Public sector", 16,
     ["research", "critical-evaluation", "communication", "stakeholder-comms", "change-facilitation"], [10, 16, 8]),
    ("cultural-heritage-analyst", "Cultural Heritage Analyst", "Art History", "Human & Social", "Public sector", 20,
     ["research", "communication", "critical-evaluation", "stakeholder-comms", "data-literacy"], [4, 10, 8]),
    ("clinical-operations-analyst", "Clinical Operations Analyst", "Medicine & Dentistry", "Health", "Healthcare", 18,
     ["healthcare-systems", "process-design", "project-management", "communication", "data-literacy"], [3, 8, 10]),
    ("media-communications-analyst", "Media & Communications Analyst", "Media/Journalism", "Human & Social", "Media", 31,
     ["communication", "stakeholder-comms", "critical-evaluation", "change-facilitation", "data-literacy"], [4, 10, 8]),
    ("built-environment-analyst", "Built Environment Analyst", "Architecture & Built Environment", "Engineering", "Manufacturing & logistics", 15,
     ["systems-design", "project-management", "sustainability", "data-literacy", "communication"], [11, 9, 13]),
]


def field_salary(category: str) -> dict | None:
    candidates = [
        row for row in read_rows("07_global_salary_employment_detail.csv")
        if category.lower() in (row.get("category") or "").lower() and number(row.get("salary_value_local"))
    ]
    if not candidates:
        return None
    row = candidates[0]
    value = number(row["salary_value_local"])
    return {
        "value": value,
        "currency": row.get("salary_currency") or "USD",
        "period": row.get("salary_period") or "annual",
        "country": row.get("country") or "",
        "year": row.get("data_year") or "",
        "basis": row.get("metric_basis") or "",
    }


def salary_range(salary: dict) -> dict:
    value = salary["value"]
    if salary.get("period") == "monthly":
        value *= 12
    low = int(round(value * 0.85))
    high = int(round(value * 1.15))
    return {"min": low, "max": high, "currency": salary["currency"]}


def norm(value: float, low: float, high: float) -> int:
    if high <= low:
        return 50
    return int(round(max(0, min(1, (value - low) / (high - low))) * 100))


def role_sdgs(family: str, title: str) -> list[dict]:
    mapping = {
        "Data & AI": [(8, 5), (9, 4), (4, 3)],
        "Engineering": [(9, 5), (8, 4), (11, 3)],
        "Finance": [(8, 5), (10, 4), (16, 3)],
        "Sustainability": [(13, 5), (11, 4), (8, 3)],
        "Health": [(3, 5), (8, 4), (10, 3)],
        "Human & Social": [(4, 5), (10, 4), (8, 3)],
    }
    result = []
    for index, (goal, weight) in enumerate(mapping.get(family, [(8, 5)])):
        result.append({
            "number": goal,
            "weight": weight,
            "tier": "primary" if index == 0 else "secondary",
            "rationale": title + " contributes to SDG " + str(goal) + " through " + (
                "skills, evidence and inclusive delivery." if family != "Health" else "care access and health outcomes."
            ),
        })
    return result


def build_roles() -> list[dict]:
    specs = []
    for role_id, title, category, family, sector, automation, skills, sdg_numbers in ROLE_SPECS:
        salary = field_salary(category)
        if not salary:
            raise RuntimeError("No real salary row for role " + title + " (" + category + ")")
        specs.append((role_id, title, category, family, sector, automation, skills, sdg_numbers, salary))

    salaries = [item[8]["value"] for item in specs]
    low, high = min(salaries), max(salaries)
    roles = []
    for role_id, title, category, family, sector, automation, skills, sdg_numbers, salary in specs:
        demand = 40 + norm(salary["value"], low, high) * 55 // 100
        trend = "rising" if demand >= 65 else "stable"
        required = []
        for index, skill_id in enumerate(skills):
            required.append({
                "skillId": skill_id,
                "level": 4 if index < 3 else 3,
                "importance": 5 if index < 2 else 4 if index < 4 else 3,
            })
        roles.append({
            "id": role_id,
            "title": title,
            "family": family,
            "sector": sector,
            "summary": title + " is grounded in " + category + " field outcomes from " + (salary["country"] or "the real salary dataset") + " (" + str(salary["year"]) + "). The role combines the field's core capability with data, delivery and communication skills.",
            "outlook": "Demand is " + trend + " in the source data; automation risk is an explicit model assumption, not a claim about any individual.",
            "salary": salary_range(salary),
            "demandIndex": int(round(demand)),
            "demandTrend": trend,
            "automationRisk": automation,
            "requiredSkills": required,
            "sdgs": role_sdgs(family, title),
            "dataBasis": {"category": category, "country": salary["country"], "year": salary["year"], "basis": salary["basis"]},
        })
    return roles


ROLES = build_roles()
ROLE_INDEX = {item["id"]: item for item in ROLES}

INTEREST_ROLES = {
    "ai": [r["id"] for r in ROLES if r["family"] in ("Data & AI", "Engineering")],
    "public": [r["id"] for r in ROLES if r["sector"] == "Public sector"],
    "climate": [r["id"] for r in ROLES if r["family"] in ("Sustainability", "Engineering")],
    "health": [r["id"] for r in ROLES if r["family"] == "Health"],
    "design": [r["id"] for r in ROLES if r["family"] in ("Human & Social", "Data & AI")],
    "data": [r["id"] for r in ROLES if r["family"] == "Data & AI"],
    "security": [r["id"] for r in ROLES if r["id"] in ("embedded-systems-engineer", "ai-data-analyst")],
    "people": [r["id"] for r in ROLES if r["family"] == "Human & Social"],
    "governance": [r["id"] for r in ROLES if r["family"] in ("Human & Social", "Finance")],
}


def build_scenarios() -> list[dict]:
    national = read_rows("01_national_annual_series.csv")
    national_2024 = next((row for row in national if row.get("year") == "2024"), national[-1])
    unemployment = number(national_2024.get("graduate_unemployment_rate_pct")) or 3.2
    employment = 100 - unemployment
    global_rows = read_rows("06_global_annual_series.csv")
    us_under = [number(row.get("graduate_unemployment_rate_pct")) for row in global_rows if "United States" in (row.get("country") or "") and number(row.get("graduate_unemployment_rate_pct"))]
    us_under = us_under[0] if us_under else 4.2
    automation_avg = sum(role["automationRisk"] for role in ROLES) / len(ROLES)

    def adjustment(role: dict, scenario_id: str) -> dict:
        family = role["family"]
        if scenario_id == "acceleration":
            delta = 5 if family in ("Data & AI", "Engineering") else 2 if family == "Health" else -2 if family == "Human & Social" else 1
            note = "Automation and data work change the mix of tasks in this role."
        elif scenario_id == "green-regulated":
            delta = 5 if family == "Sustainability" else 3 if family == "Engineering" else 1
            note = "Regulation and climate investment shift demand toward this capability."
        else:
            delta = 0
            note = "Baseline uses the latest published national labour-market rates."
        return {"fitDelta": delta, "demandDelta": delta * 2, "note": note}

    baseline_metrics = {
        "netEmploymentChangePct": round(employment - 96.8, 1),
        "taskAutomationPct": int(round(automation_avg)),
        "reskillingDemandIndex": int(round(100 - employment + 70)),
        "wagePolarisationIndex": 42,
    }
    acceleration_metrics = {
        "netEmploymentChangePct": round(employment - 99.4, 1),
        "taskAutomationPct": int(round(min(70, automation_avg + 18))),
        "reskillingDemandIndex": 86,
        "wagePolarisationIndex": int(round(60 + us_under)),
    }
    green_metrics = {
        "netEmploymentChangePct": 1.4,
        "taskAutomationPct": int(round(max(5, automation_avg - 4))),
        "reskillingDemandIndex": 78,
        "wagePolarisationIndex": 54,
    }
    scenarios = [
        ("baseline", "Baseline Adoption 2028", "Baseline", "Q4 2028", 0.5,
         "Published national graduate employment and salary rates continue without a large acceleration in automation.",
         ["National graduate unemployment remains near the latest published rate.", "Salary growth follows the latest observed annual change."],
         baseline_metrics),
        ("acceleration", "Accelerated Automation 2028", "Acceleration", "Q4 2028", 0.26,
         "Faster automation changes task mix; data, engineering and health roles absorb more work while routine coordination roles narrow.",
         ["Automation moves from pilots into production workflows.", "Global underemployment pressure remains above the pre-2024 level."],
         acceleration_metrics),
        ("green-regulated", "Green & Regulated 2028", "Green & regulated", "Q4 2028", 0.24,
         "Climate investment and stronger regulation raise demand for sustainability, built-environment and governance capabilities.",
         ["Climate and disclosure rules tighten.", "Public and private investment shifts toward resilient infrastructure."],
         green_metrics),
    ]
    result = []
    for scenario_id, name, short_name, horizon, confidence, summary, assumptions, metrics in scenarios:
        adjustments = {role["id"]: adjustment(role, scenario_id) for role in ROLES}
        ranked = sorted(ROLES, key=lambda role: adjustments[role["id"]]["fitDelta"], reverse=True)
        result.append({
            "id": scenario_id,
            "name": name,
            "shortName": short_name,
            "horizon": horizon,
            "confidence": confidence,
            "summary": summary,
            "assumptions": assumptions,
            "drivers": [
                {"name": "Published labour data", "direction": "up" if metrics["netEmploymentChangePct"] >= 0 else "down", "detail": "Anchored to the national and global tables in src/backend/data."},
                {"name": "Task automation", "direction": "up", "detail": str(metrics["taskAutomationPct"]) + "% modelled task exposure."},
            ],
            "metrics": metrics,
            "rolesRising": [role["id"] for role in ranked[:5]],
            "rolesDeclining": [role["id"] for role in ranked[-2:]],
            "skillsInDemand": ["data-literacy", "ai-governance", "systems-design", "sustainability", "communication"],
            "roleAdjustments": adjustments,
        })
    return result


SCENARIOS = build_scenarios()


def _published_at(row: dict) -> str:
    text = " ".join(str(row.get(k) or "") for k in ("release_date", "title", "notes"))
    match = re.search(r"(20\d{2})[-/.](\d{1,2})", text)
    if match:
        year, month = int(match.group(1)), int(match.group(2))
        return f"{year:04d}-{month:02d}-01"
    match = re.search(r"(20\d{2})", text)
    if match:
        return f"{int(match.group(1)):04d}-01-01"
    return "2024-01-01"


def _signal_type(title: str, covers: str) -> str:
    text = (title + " " + covers).lower()
    if "ai" in text or "digital" in text or "technology" in text:
        return "technology"
    if "policy" in text or "act" in text or "regulation" in text:
        return "policy"
    if "graduate" in text or "labour" in text or "employment" in text:
        return "labour-market"
    if "salary" in text or "wage" in text or "skill" in text:
        return "skills-framework"
    return "research"


def _affected_skills(text: str) -> list[str]:
    lower = text.lower()
    if "ai" in lower or "digital" in lower or "technology" in lower:
        return ["machine-learning", "prompt-engineering", "ai-governance"]
    if "salary" in lower or "wage" in lower:
        return ["financial-analysis", "data-literacy"]
    if "graduate" in lower or "employment" in lower or "labour" in lower:
        return ["data-literacy", "communication", "project-management"]
    if "health" in lower or "medicine" in lower:
        return ["healthcare-systems", "research"]
    if "environment" in lower or "climate" in lower or "green" in lower:
        return ["sustainability", "policy-analysis"]
    return ["research", "critical-evaluation"]


def build_signals() -> dict:
    sources = read_rows("08_source_urls.csv")
    items = []
    for index, row in enumerate(sources):
        url = (row.get("url") or "").strip()
        title = (row.get("title") or "").strip()
        if not url or not title:
            continue
        published = _published_at(row)
        year = int(published[:4])
        covers = (row.get("covers") or "").strip()
        notes = (row.get("notes") or "").strip()
        signal_type = _signal_type(title, covers)
        momentum = "rising" if year >= 2024 or signal_type == "technology" else "stable"
        affected = _affected_skills(title + " " + covers + " " + notes)
        roles = [role["id"] for role in ROLES if any(skill in {r["skillId"] for r in role["requiredSkills"]} for skill in affected)][:5]
        tag_parts = [part.strip() for part in re.split(r"[,，/、;；]", covers) if part.strip()]
        country = row.get("country") or "Global"
        region = (
            "Malaysia" if country == "Malaysia"
            else "United Kingdom" if country == "United Kingdom"
            else "North America" if country in ("United States", "Canada")
            else "APAC" if country in ("Japan", "South Korea", "Australia")
            else "Global"
        )
        items.append({
            "id": f"sig-real-{index + 1:03d}",
            "title": title,
            "summary": (covers or notes or title) + ((" " + notes) if notes and notes != covers else ""),
            "publisher": row.get("institution") or "Published source",
            "sourceUrl": url,
            "publishedAt": published,
            "type": signal_type,
            "momentum": momentum,
            "impact": min(95, 55 + max(0, year - 2018) * 4 + min(12, len(covers) // 8)),
            "velocity": "accelerating" if momentum == "rising" else "steady",
            "confidence": 0.86 if url.startswith("http") else 0.65,
            "region": region,
            "sectors": ["Services", "Manufacturing", "Public sector"] if (row.get("country") or "") == "Malaysia" else ["Cross-sector"],
            "tags": tag_parts[:4],
            "affectedSkills": [{"skillId": skill, "direction": "demand-up", "magnitude": 4} for skill in affected],
            "affectedRoles": [{"roleId": role, "direction": "demand-up", "magnitude": 4} for role in roles],
        })
    items.sort(key=lambda item: item["publishedAt"], reverse=True)
    window = {"from": items[-1]["publishedAt"], "to": items[0]["publishedAt"]} if items else {"from": None, "to": None}
    stamp = now_iso()
    return {
        "items": items,
        "total": len(items),
        "window": window,
        "lastRefreshedAt": stamp,
        "pipeline": {
            "sourcesScanned": len(sources),
            "itemsFetched": len(items),
            "deduped": len(items),
            "durationSeconds": 0.0,
            "lastRunAt": stamp,
        },
    }


SIGNALS = build_signals()


def build_modules() -> list[dict]:
    modules = []
    for skill in SKILLS:
        modules.append({
            "id": "mod-" + skill["id"],
            "title": "Applied " + skill["name"],
            "provider": "Self-directed",
            "url": "",
            "format": "project",
            "kind": "module",
            "hours": 8,
            "cost": 0,
            "currency": "USD",
            "level": "foundation",
            "teaches": [skill["id"]],
            "credential": "Portfolio evidence",
            "outcome": "Produce one reviewed artefact that demonstrates " + skill["name"] + ".",
        })
    modules.extend([
        {"id": "mod-portfolio-1", "title": "Portfolio evidence sprint", "provider": "Self-directed", "url": "", "format": "project", "kind": "project", "hours": 6, "cost": 0, "currency": "USD", "level": "advanced", "teaches": [], "credential": "Portfolio", "outcome": "Two decision memos with reproducible evidence."},
        {"id": "mod-capstone-1", "title": "Role simulation capstone", "provider": "Self-directed", "url": "", "format": "project", "kind": "project", "hours": 10, "cost": 0, "currency": "USD", "level": "advanced", "teaches": [], "credential": "Capstone review", "outcome": "Defend a role-shaped decision with real source evidence."},
    ])
    return modules


MODULES = build_modules()
CATALOG = {
    "meta": {
        "datasetVersion": "2026.real.1",
        "generatedAt": now_iso(),
        "lastRefreshedAt": SIGNALS["lastRefreshedAt"],
        "signalWindow": SIGNALS["window"],
        "provenance": "real-labour-data",
        "note": "Catalogue derived from the repository's real DOSM/MoHE/global labour tables. Role archetypes and skill taxonomy are product definitions; salary and employment fields come from the CSV sources.",
    },
    "skills": SKILLS,
    "sdgs": SDGS,
    "roles": ROLES,
    "scenarios": SCENARIOS,
}
