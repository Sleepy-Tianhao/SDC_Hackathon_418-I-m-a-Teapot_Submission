# AI Career Navigator — API contract (v1)

> **Status:** draft 1.0 · **Owner:** frontend (team 418 I'm a Teapot) · **Consumer:** FastAPI backend
> **Base URL:** `/api/v1` (same origin) · **Machine-readable:** [openapi.json](./openapi.json)
> **Reference implementation:** [backend-integration/reference_api.py](./backend-integration/reference_api.py)
> **Contract test:** `python docs/backend-integration/smoke_test.py --base http://127.0.0.1:8000/api/v1`

This document is the agreement between the `src/frontend` UI and the backend. If a field
appears here, the UI may depend on it. If the backend cannot supply a field yet, return a
neutral value (`null`, `0`, empty array) rather than omitting the key — the UI degrades
gracefully, but only when it knows the key exists.

---

## 1. Principles

1. **The browser never holds a model key.** All third-party LLM calls happen server-side
   behind `POST /analysis` and `GET /analysis/stream`.
2. **JSON only, UTF-8, `camelCase` field names.** No XML, no form encoding, no snake_case.
3. **Every signal is dated and linked.** `publishedAt` + `sourceUrl` are required on each
   signal record; the UI renders them as evidence.
4. **The backend owns identity and persistence.** The UI stores the profile id and a local
   cache (for offline demo), never the source of truth.
5. **Additive changes only within v1.** Adding optional fields is safe; renaming or removing
   a field requires `/api/v2`.

## 2. Environments and transport modes

| Environment | Base URL | Notes |
| ----------- | -------- | ----- |
| Local (reference API) | `http://127.0.0.1:8000/api/v1` | Serves the UI at `/`, same origin |
| Local (FastAPI) | `http://127.0.0.1:8000/api/v1` | Recommended target |
| Replit / deployed | `https://<app>.replit.app/api/v1` | Same origin with the static UI |
| Static UI only | — | UI falls back to the demo transport |

The UI resolves its transport in this order:

1. `?api=...&mode=...` URL parameters
2. `localStorage["aicn:config:v1"]` (set from the *API & integration* screen)
3. `window.AI_CAREER_CONFIG` from `src/frontend/assets/config.js`
4. Default: `/api/v1`, mode `auto`

`mode` is one of:

* `auto` — probe `GET /health` (3 s timeout). Live if it answers with JSON, demo otherwise.
* `live` — always call the API; surface errors to the user.
* `demo` — never call the API; use the fixtures in `src/frontend/mock/`.

The sidebar always shows which transport is active, so a demo never pretends to be live.

## 3. Conventions

### 3.1 Identifiers and timestamps

* IDs are opaque strings (e.g. `prof-92d1dfc0`, `sig-006`, `ai-ops-analyst`). Do not parse them.
* Timestamps are ISO 8601 in UTC with a `Z` suffix: `2026-10-20T05:51:39Z`.
* Dates inside signal records are calendar dates: `2026-08-02`.

### 3.2 Numbers

| Kind | Range | Example |
| ---- | ----- | ------- |
| Fit / readiness / demand / impact scores | integer `0–100` | `fitScore: 74` |
| Skill levels (self-rated and required) | integer `1–5` | `level: 3` |
| Confidence | float `0–1` | `0.82` |
| Money | integer minor units? **No** — whole currency units | `{ "min": 68000, "max": 98000, "currency": "USD" }` |
| Hours / weeks | integer | `hours: 8`, `weeks: 3` |

### 3.3 Errors

All non-2xx responses use one envelope:

~~~json
{
  "error": {
    "code": "validation_error",
    "message": "A name is required to create a profile.",
    "details": { "field": "name" }
  }
}
~~~

| HTTP | `code` | When |
| ---- | ------ | ---- |
| 400 | `invalid_json` / `invalid_body` | Body is not a JSON object |
| 404 | `profile_not_found` / `not_found` | Unknown profile or route |
| 413 | `payload_too_large` | Body above the 2 MB limit |
| 422 | `validation_error` | Missing or invalid field |
| 500 | `internal_error` | Unexpected server failure |

The UI displays `message` verbatim and logs `code`; keep messages human-readable.

### 3.4 Pagination

Only `GET /signals` paginates:

* `limit` — default `50`, max `200`
* `offset` — default `0`
* Response echoes `limit`, `offset`, `total` (total after filters).

### 3.5 CORS

* **Same origin (recommended):** serve `src/frontend` from the API host. No CORS needed.
* **Separate origins:** allow the UI origin explicitly, plus `GET, POST, PATCH, OPTIONS`
  and `Content-Type, Authorization` headers. Do not use `*` in production.

### 3.6 Authentication

The prototype is unauthenticated. If you add sessions, send them as cookies (same-origin) or
an `Authorization: Bearer <token>` header. The UI forwards cookies automatically; it does not
currently attach bearer tokens, so add a token field to `src/frontend/js/core/api.js` if you
introduce them.

## 4. Enumerations

| Field | Allowed values |
| ----- | -------------- |
| `momentum` | `rising`, `stable`, `declining` |
| `velocity` | `accelerating`, `steady`, `cooling` |
| `demandTrend` | `rising`, `stable`, `declining` |
| `direction` | `demand-up`, `demand-down` |
| `signal.type` | `labour-market`, `technology`, `policy`, `skills-framework`, `research` |
| `skill.category` | `Data & AI`, `Digital & Systems`, `Human & Social`, `Domain & Policy` |
| `sdg.tier` | `primary`, `secondary` |
| `match tier (computed)` | `primary`, `secondary`, `contextual` |
| `module.level` | `foundation`, `intermediate`, `advanced` |
| `module.format` | `self-paced`, `cohort`, `workshop`, `project` |
| `module.kind` | `module`, `project`, `assessment` |

## 5. Data objects

### 5.1 Profile

~~~json
{
  "id": "prof-92d1dfc0",
  "name": "Aisha Rahman",
  "headline": "Operations coordinator moving into AI-enabled public services",
  "currentRole": "Operations Coordinator",
  "sector": "Public sector",
  "region": "Singapore",
  "yearsExperience": 7,
  "education": "Diploma / vocational",
  "goal": "Move into an AI-facing role without leaving public service",
  "interests": ["ai", "public", "people"],
  "constraints": { "hoursPerWeek": 8, "budget": 300, "remoteOnly": false },
  "skills": [
    { "skillId": "data-literacy", "name": "Data literacy", "category": "Data & AI", "level": 3 }
  ],
  "createdAt": "2026-10-20T05:51:39Z",
  "updatedAt": "2026-10-20T05:51:39Z",
  "source": "web"
}
~~~

Notes:

* `skills` is the only required array beyond `name`; at least one entry.
* `level` is the **self-rated** level (1–5). The backend may later add verified evidence.
* `constraints.hoursPerWeek` drives pathway duration; `budget` is in USD.
* `interests` are ids from `src/frontend/js/core/options.js` (`ai`, `public`, `climate`,
  `health`, `design`, `data`, `security`, `people`, `governance`).

### 5.2 Skill

~~~json
{ "id": "data-literacy", "name": "Data literacy", "category": "Data & AI", "blurb": "Read, question and act on data…" }
~~~

### 5.3 Role

~~~json
{
  "id": "ai-ops-analyst",
  "title": "AI Operations Analyst",
  "family": "AI & Automation",
  "sector": "Cross-sector",
  "summary": "Runs the day-to-day operation of AI systems…",
  "outlook": "Demand is climbing fastest where pilot projects…",
  "salary": { "min": 68000, "max": 98000, "currency": "USD" },
  "demandIndex": 91,
  "demandTrend": "rising",
  "automationRisk": 18,
  "requiredSkills": [
    { "skillId": "prompt-engineering", "level": 4, "importance": 5 }
  ],
  "sdgs": [
    { "number": 8, "weight": 5, "tier": "primary", "rationale": "Raises job quality by…" }
  ]
}
~~~

`importance` is 1–5 and weights the fit calculation. `sdgs` contains at least one entry;
`weight` is 1–5.

### 5.4 Scenario

~~~json
{
  "id": "acceleration",
  "name": "Accelerated Automation 2028",
  "shortName": "Acceleration",
  "horizon": "Q4 2028",
  "confidence": 0.26,
  "summary": "Agentic systems move from assistant to actor…",
  "assumptions": ["Agent reliability improves enough…"],
  "drivers": [{ "name": "Agentic deployment", "direction": "up", "detail": "Multi-step agents…" }],
  "metrics": {
    "netEmploymentChangePct": -2.6,
    "taskAutomationPct": 41,
    "reskillingDemandIndex": 86,
    "wagePolarisationIndex": 71
  },
  "rolesRising": ["ai-ops-analyst"],
  "rolesDeclining": ["civic-tech-program-manager"],
  "skillsInDemand": ["model-evaluation", "mlops"],
  "roleAdjustments": {
    "ai-ops-analyst": { "fitDelta": 6, "demandDelta": 8, "note": "The bottleneck role when agents run production workflows." }
  }
}
~~~

At least **two** scenarios must be returned. `confidence` values are relative likelihoods and
may not sum to 1 in a future dataset.

### 5.5 Signal

~~~json
{
  "id": "sig-006",
  "title": "General-purpose AI obligations take effect across the EU",
  "summary": "Documentation, evaluation, incident reporting…",
  "publisher": "European Commission",
  "sourceUrl": "https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai",
  "publishedAt": "2026-08-02",
  "type": "policy",
  "momentum": "rising",
  "impact": 81,
  "velocity": "accelerating",
  "confidence": 0.83,
  "region": "EU",
  "sectors": ["Cross-sector", "Public sector"],
  "tags": ["EU AI Act", "compliance", "assurance"],
  "affectedSkills": [{ "skillId": "ai-governance", "direction": "demand-up", "magnitude": 5 }],
  "affectedRoles": [{ "roleId": "ai-ethics-officer", "direction": "demand-up", "magnitude": 5 }]
}
~~~

`publishedAt` and `sourceUrl` are mandatory. `magnitude` is 1–5.

### 5.6 Catalog

`GET /catalog` returns:

~~~json
{
  "meta": { "datasetVersion": "2026.10.1", "generatedAt": "2026-10-18T06:00:00Z", "signalWindow": { "from": "2024-07-26", "to": "2026-10-12" } },
  "skills": [],
  "sdgs": [],
  "roles": [],
  "scenarios": []
}
~~~

The UI fetches this once per boot and caches it in memory.

## 6. Endpoints

All paths below are relative to `/api/v1`.

### 6.1 `GET /health`

Liveness probe used by the UI to choose its transport.

~~~json
{
  "status": "ok",
  "service": "ai-career-navigator-reference",
  "version": "1.0.0",
  "mode": "live",
  "datasetVersion": "2026.10.1",
  "time": "2026-10-20T05:51:39Z",
  "uptimeSeconds": 12,
  "llm": { "provider": "openai-compatible", "model": "model-name", "configured": true }
}
~~~

Requirements: answer within **3 seconds**; the UI treats a timeout, non-JSON response or
connection error as "backend unavailable" and switches to the demo dataset.

### 6.2 `GET /meta`

Dataset and capability metadata shown in the UI (dataset version, refresh time, counts).

~~~json
{
  "service": "ai-career-navigator",
  "version": "1.0.0",
  "mode": "live",
  "datasetVersion": "2026.10.1",
  "lastRefreshedAt": "2026-10-18T06:00:00Z",
  "signalWindow": { "from": "2024-07-26", "to": "2026-10-12" },
  "llm": { "provider": "openai-compatible", "model": "model-name", "configured": true },
  "capabilities": ["catalog", "signals", "profiles", "matching", "pathway", "sdg-map", "scenarios", "streaming"],
  "counts": { "skills": 23, "roles": 12, "sdgs": 17, "signals": 20 }
}
~~~

`counts.signals` is rendered in the sidebar; `lastRefreshedAt` in the top bar.

### 6.3 `GET /catalog`

Everything the UI needs to render selectors, skill lists and SDG legends, in one request.

Response keys: `meta`, `skills`, `sdgs`, `roles`, `scenarios` (see §5). The UI caches this
for the session; add a `datasetVersion` bump if you change it.

### 6.4 `GET /signals`

Filtered, sorted signal feed.

| Query | Type | Default | Notes |
| ----- | ---- | ------- | ----- |
| `query` | string | — | Matches title, summary, publisher and tags (case-insensitive) |
| `momentum` | enum | — | `rising` / `stable` / `declining` |
| `type` | enum | — | Signal type |
| `region` | string | — | Exact match |
| `roleId` | string | — | Signals affecting that role |
| `sort` | enum | `recent` | `recent` or `impact` |
| `limit` | int | `50` | Max 200 |
| `offset` | int | `0` | |

~~~json
{
  "items": [ { "id": "sig-006", "title": "…", "publishedAt": "2026-08-02", "sourceUrl": "https://…" } ],
  "total": 20,
  "limit": 50,
  "offset": 0,
  "lastRefreshedAt": "2026-10-18T06:00:00Z",
  "window": { "from": "2024-07-26", "to": "2026-10-12" },
  "pipeline": { "sourcesScanned": 21, "recordsIngested": 1840, "model": "signal-extractor:v1.4" },
  "facets": {
    "momentum": { "rising": 14, "stable": 5, "declining": 1 },
    "region": { "Global": 12, "EU": 3 },
    "type": { "labour-market": 8, "policy": 4 }
  }
}
~~~

`facets` must reflect **all** signals, not the filtered page: the UI builds its filter chips
from them.

### 6.5 `POST /signals/refresh`

Runs the ingestion/extraction pipeline (or re-verifies sources) and returns a summary. The UI
animates the button and updates `lastRefreshedAt`.

Request (optional): `{ "sources": ["weforum", "ilo"] }`

~~~json
{
  "refreshedAt": "2026-10-20T05:55:10Z",
  "added": 3,
  "updated": 20,
  "scanned": 21,
  "durationSeconds": 6.4,
  "pipeline": { "sourcesScanned": 21, "recordsIngested": 1892, "model": "signal-extractor:v1.4" },
  "note": "Optional human-readable summary"
}
~~~

Keep this request under the UI timeout (15 s by default). If the real pipeline takes longer,
return `202` with `{ "jobId": "…" }` and add `GET /jobs/{id}` in v2 — the current UI expects a
synchronous response.

### 6.6 `POST /profiles`

Creates a skills profile from the intake wizard.

Request body: a **Profile draft** (same fields as §5.1 without `id`, `createdAt`, `updatedAt`).
Minimum viable body:

~~~json
{
  "name": "Aisha Rahman",
  "currentRole": "Operations Coordinator",
  "sector": "Public sector",
  "region": "Singapore",
  "yearsExperience": 7,
  "education": "Diploma / vocational",
  "goal": "Move into an AI-facing role",
  "interests": ["ai", "public"],
  "constraints": { "hoursPerWeek": 8, "budget": 300, "remoteOnly": false },
  "skills": [
    { "skillId": "data-literacy", "level": 3 },
    { "skillId": "stakeholder-comms", "level": 4 }
  ]
}
~~~

Response `201`:

~~~json
{
  "profile": {
    "id": "prof-92d1dfc0",
    "name": "Aisha Rahman",
    "skills": [
      { "skillId": "data-literacy", "name": "Data literacy", "category": "Data & AI", "level": 3 }
    ],
    "createdAt": "2026-10-20T05:51:39Z"
  }
}
~~~

Validation: `name` non-empty, `skills` a non-empty array of known `skillId`s; unknown ids
are dropped. Store the profile; return the stored shape (including `id`). The UI then calls
`POST /profiles/{id}/match` immediately.

### 6.7 `GET /profiles/{id}`

Returns `{ "profile": { … } }` or `404 profile_not_found`.

### 6.8 `PATCH /profiles/{id}`

Partial update; same validation as creation. Returns `{ "profile": { … } }`. The intake
screen re-saves through this endpoint when a profile already exists.

### 6.9 `POST /profiles/{id}/match`

Scores every role in the catalogue for the profile under one scenario.

Request:

~~~json
{
  "scenarioId": "baseline",
  "profile": { "…": "optional snapshot of the latest intake, may be ignored" }
}
~~~

The optional `profile` snapshot exists because the demo transport has no database. In live
mode the stored profile is authoritative; validate any snapshot before using it.

Response:

~~~json
{
  "profileId": "prof-92d1dfc0",
  "scenarioId": "baseline",
  "generatedAt": "2026-10-20T05:52:02Z",
  "model": "career-match:v1.3",
  "matches": [
    {
      "roleId": "workforce-transition-coach",
      "title": "Workforce Transition Coach",
      "family": "People & skills",
      "sector": "Public & education",
      "summary": "Guides people displaced or reshaped by automation…",
      "outlook": "Publicly funded and employer-funded demand…",
      "demandIndex": 74,
      "demandTrend": "rising",
      "automationRisk": 8,
      "salary": { "min": 58000, "max": 84000, "currency": "USD" },
      "fitScore": 74,
      "baselineFit": 74,
      "fitDelta": 0,
      "gapScore": 31,
      "skillsGap": [
        {
          "skillId": "change-facilitation",
          "name": "Change facilitation",
          "category": "Human & Social",
          "currentLevel": 2,
          "requiredLevel": 5,
          "importance": 5,
          "gap": 3,
          "priority": 15
        }
      ],
      "matchedSkills": [],
      "sdgs": [{ "number": 4, "weight": 5, "tier": "primary", "rationale": "…" }],
      "scenarioNote": "",
      "reasons": ["Largest gaps: Change facilitation (2 of 5)."]
    }
  ],
  "summary": {
    "readinessScore": 72,
    "topRoleId": "workforce-transition-coach",
    "topRoleTitle": "Workforce Transition Coach",
    "topFit": 74,
    "skillsToClose": 9,
    "coveragePct": 46,
    "topMatches": [{ "roleId": "workforce-transition-coach", "title": "Workforce Transition Coach", "fitScore": 74 }]
  }
}
~~~

Field rules:

* `fitScore` / `baselineFit` — 0–100 integers. `fitDelta = fitScore - baselineFit` (scenario effect).
* `skillsGap` — only gaps, sorted by `priority` descending. `matchedSkills` — the complement.
* `reasons` — 1–3 short sentences the UI prints under the role.
* `summary.readinessScore` — weighted fit of the top three (0.5 / 0.3 / 0.2).
* `summary.skillsToClose` — distinct gap `skillId`s across the top three roles.
* Sort `matches` by `fitScore` descending; the UI re-sorts by demand/salary client-side.

### 6.10 `POST /profiles/{id}/pathway`

Builds a personalised reskilling pathway for one role.

Request:

~~~json
{ "scenarioId": "baseline", "roleId": "ai-ops-analyst" }
~~~

`roleId` is optional; default to the top match.

Response:

~~~json
{
  "profileId": "prof-92d1dfc0",
  "roleId": "ai-ops-analyst",
  "roleTitle": "AI Operations Analyst",
  "scenarioId": "baseline",
  "generatedAt": "2026-10-20T05:52:05Z",
  "model": "pathway-builder:v1.2",
  "horizonWeeks": 11,
  "hoursPerWeek": 8,
  "totalHours": 80,
  "totalCost": 30,
  "currency": "USD",
  "readinessFrom": 72,
  "readinessTo": 95,
  "phases": [
    {
      "id": "phase-1",
      "title": "Foundations & orientation",
      "goal": "Close the baseline gaps that every later step depends on.",
      "weeks": 3,
      "hours": 20,
      "cost": 30,
      "startWeek": 1,
      "endWeek": 3,
      "modules": [
        {
          "id": "mod-comms-1",
          "title": "Communicating with Influence",
          "provider": "LinkedIn Learning",
          "url": "https://www.linkedin.com/learning",
          "format": "self-paced",
          "kind": "module",
          "hours": 5,
          "cost": 30,
          "currency": "USD",
          "level": "foundation",
          "teaches": ["stakeholder-comms", "change-facilitation"],
          "credential": "LinkedIn Learning certificate",
          "outcome": "Frame trade-offs for executives and frontline teams.",
          "targets": [
            { "skillId": "stakeholder-comms", "name": "Stakeholder communication", "fromLevel": 4, "toLevel": 5 }
          ]
        }
      ],
      "milestones": [
        { "title": "Starting-level diagnostic", "detail": "Confirm your real level…", "week": 1 }
      ]
    }
  ],
  "covers": [
    {
      "skillId": "stakeholder-comms",
      "name": "Stakeholder communication",
      "fromLevel": 4,
      "requiredLevel": 5,
      "toLevel": 5,
      "covered": true,
      "moduleIds": ["mod-comms-1"]
    }
  ],
  "notes": ["Optional caveats, e.g. uncovered gaps."],
  "rationale": "Built for AI Operations Analyst by sequencing 4 identified gaps…"
}
~~~

Rules:

* Always return **three phases** (`phase-1`…`phase-3`) in order; empty phases are allowed but
  discouraged (the UI renders them).
* `phases[].startWeek` / `endWeek` are sequential; `horizonWeeks == last.endWeek`.
* `covers` includes **all** gaps, with `covered` telling the UI whether the catalogue closes it.
* `totalCost` / `totalHours` are sums of the modules; `currency` defaults to `USD`.

### 6.11 `GET /profiles/{id}/sdg-map?scenarioId=baseline`

Maps the profile's matched roles to all 17 SDGs.

~~~json
{
  "profileId": "prof-92d1dfc0",
  "scenarioId": "baseline",
  "generatedAt": "2026-10-20T05:52:06Z",
  "goals": [
    {
      "number": 8,
      "name": "Decent Work and Economic Growth",
      "shortName": "Decent work",
      "color": "#A21942",
      "focus": "Job quality, productivity and fair transitions.",
      "score": 77,
      "tier": "primary",
      "roleIds": ["workforce-transition-coach"],
      "skillIds": ["stakeholder-comms", "change-facilitation"],
      "rationale": "Keeps displaced workers in decent employment.",
      "evidence": [
        { "signalId": "sig-003", "title": "One in four clerical…", "publisher": "ILO", "publishedAt": "2026-02-18" }
      ]
    }
  ],
  "summary": {
    "topGoal": 8,
    "primaryGoals": [4, 8, 10],
    "secondaryGoals": [3, 5, 9, 11, 16, 17],
    "strongestScore": 77,
    "note": "Scores combine…"
  }
}
~~~

Requirements:

* Return **all 17 goals**, even when the score is 0 (`tier: "contextual"`).
* `tier` is `primary` when the top role itself marks that goal `primary`; otherwise
  `secondary` (score ≥ 34) or `contextual`.
* `evidence` ≤ 2 signals, each with `publishedAt`.

### 6.12 `GET /scenarios`

~~~json
{ "items": [ { "id": "baseline", "name": "Baseline Adoption 2028", "shortName": "Baseline" } ] }
~~~

The full objects match §5.4. Two or more are required.

### 6.13 `POST /analysis`

Generates the narrative briefing with the backend's LLM.

Request:

~~~json
{ "profileId": "prof-92d1dfc0", "scenarioId": "baseline", "roleId": "ai-ops-analyst" }
~~~

Response:

~~~json
{
  "analysis": {
    "provider": "openai-compatible",
    "model": "model-name",
    "generatedAt": "2026-10-20T05:52:08Z",
    "scenarioId": "baseline",
    "narrative": "Aisha, your strongest adjacent role is…\n\nThe gap is narrow…"
  }
}
~~~

`narrative` is plain text with blank lines between paragraphs (the UI preserves newlines).
Keep it under ~400 words; the panel is not built for essays.

### 6.14 `GET /analysis/stream`

Server-Sent Events variant used by the UI (EventSource). Query parameters are the same as
`POST /analysis` (`profileId`, `scenarioId`, optional `roleId`).

Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`.

~~~text
event: meta
data: {"provider":"openai-compatible","model":"model-name","scenarioId":"baseline"}

event: token
data: {"text":"Aisha, your "}

event: token
data: {"text":"strongest adjacent role…"}

event: done
data: {"analysis":{"narrative":"…","model":"model-name","generatedAt":"…","scenarioId":"baseline"}}
~~~

Optional failure event:

~~~text
event: error
data: {"message":"Upstream model timed out."}
~~~

The UI has a fallback: if the stream errors or does not start within 20 seconds, it shows the
error and the user can retry (the *Generate briefing* button also works via `POST /analysis`
when streaming is disabled with `AI_CAREER_CONFIG.stream = false`).

## 7. What the UI does with each response

| Endpoint | UI behaviour |
| -------- | ------------ |
| `/health` | Chooses live vs demo transport (3 s timeout) and fills the sidebar status card |
| `/meta` | Sidebar signal count, top-bar freshness pill, dataset version on the connect screen |
| `/catalog` | Skills intake, role catalogue, scenario selector, SDG legend |
| `/signals` | Signal list, filter facets, role filter chips, evidence modals |
| `/signals/refresh` | Toast with added/updated/scanned counts, freshness update |
| `POST /profiles` | Navigates to `#/matches` and triggers matching |
| `PATCH /profiles/{id}` | Re-saves an edited intake |
| `/match` | Match cards, gap matrix, scenario sensitivity, dashboard KPIs |
| `/pathway` | Timeline, module list, costs, coverage, print/copy |
| `/sdg-map` | 17-goal grid, contribution scores, evidence list |
| `/analysis` (stream) | AI briefing panel, token-by-token text, model label |

## 8. Requirement traceability (Domain 1 brief)

| Must-have from the brief | Where it lives | Endpoint(s) |
| ------------------------ | -------------- | ----------- |
| Skills profile intake | `#/intake` (4-step wizard) | `POST /profiles`, `PATCH /profiles/{id}` |
| AI-trend signal layer (updatable, dated source) | `#/signals` | `GET /signals`, `POST /signals/refresh` |
| Future-role matching + skills gap | `#/matches`, `#/overview` | `POST /profiles/{id}/match` |
| Personalised reskilling pathway | `#/pathway` | `POST /profiles/{id}/pathway` |
| SDG mapping | `#/sdg` | `GET /profiles/{id}/sdg-map`, `GET /catalog` |
| More than one future scenario | `#/scenarios`, scenario selector in the top bar | `GET /scenarios`, `GET /catalog` |

## 9. LLM integration contract (backend responsibility)

The frontend only sends ids and receives text. The backend owns:

* **Prompt construction.** Recommended inputs: profile (skills, sector, goal), scenario
  (name, assumptions, role adjustments), top three matches with gaps, pathway phases and the
  SDG map.
* **Grounding rules.** Cite only signals supplied in the request context; include publisher
  and date; never invent credentials, salaries or course costs; state uncertainty explicitly.
* **Output shape.** `{ "narrative": string }` (plus optional `highlights` later). No markdown
  headings — plain paragraphs separated by blank lines.
* **Streaming.** Emit tokens as they arrive from the provider; send `meta` first and `done`
  last. Cap generation at ~400 words / 30 seconds.
* **Secrets.** `LLM_API_KEY`, provider keys and prompts stay on the server. Never expose
  them through `/api/meta` or the static bundle.
* **Failure handling.** Return `event: error` (or a 502 JSON error) with a human-readable
  message; the UI retries on demand.

A ready-to-adapt prompt and JSON schema live in
[`BACKEND_INTEGRATION.md`](./BACKEND_INTEGRATION.md#7-llm-narrative-integration).

## 10. Versioning

* Path prefix is the version: `/api/v1`.
* Additive fields are non-breaking; clients ignore unknown keys.
* Removing or renaming a field, changing an enum, or changing a score scale requires
  `/api/v2` and a frontend config change (`apiBaseUrl`).
* The frontend logs a warning when `/meta.counts` disagrees with the number of rows it
  received — useful during backend bring-up.
