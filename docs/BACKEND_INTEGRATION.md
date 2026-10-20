# Backend integration guide

How to connect the FastAPI backend to the `src/frontend` interface, implement the contract in
[`API.md`](./API.md), and wire the third-party LLM. Written by the frontend owner for the
backend owner; everything here is exercised by
[`backend-integration/reference_api.py`](./backend-integration/reference_api.py) and
[`backend-integration/smoke_test.py`](./backend-integration/smoke_test.py).

---

## 1. What you are integrating

The frontend is a **build-free single-page app** (ES modules + CSS, no bundler). It:

* calls `/api/v1/*` with `fetch` (JSON) and `EventSource` (SSE);
* never holds a model key and never calls the LLM directly;
* stores only an id, the last profile snapshot and preferences in `localStorage`;
* falls back to a complete **demo dataset** when the API is unreachable, and labels itself
  clearly in the UI.

Your job is to make `GET /api/v1/health` answer, then implement the endpoints in the order
below. Nothing in the frontend needs to change if the response shapes match.

## 2. Architecture

~~~text
┌────────────────────────────┐        ┌─────────────────────────────────────┐
│ Browser (src/frontend)     │        │ FastAPI (backend)                   │
│  index.html + ES modules   │  HTTP  │  /api/v1/*  ──► services            │
│  fetch / EventSource       │ ─────► │      │            ├─ matching       │
│  localStorage: profile id  │        │      │            ├─ pathway        │
└────────────────────────────┘        │      │            ├─ SDG map        │
                                      │      │            └─ LLM client     │
                                      │      ▼                              │
                                      │  SQLite (profiles, signals, runs)   │
                                      └───────────────┬─────────────────────┘
                                                      │ HTTPS
                                              ┌───────▼────────┐
                                              │ RunPod / LLM   │
                                              └────────────────┘
~~~

Two deployment shapes are supported:

* **Same origin (recommended):** FastAPI serves the static UI at `/` and the API at
  `/api/v1`. No CORS, cookies work, one URL to demo.
* **Split origins:** the UI on Replit static hosting or a CDN, the API elsewhere. Requires
  CORS and a configured base URL.

## 3. Repository layout

~~~text
src/
  frontend/                 # this handover (serve this directory as static root)
    index.html
    assets/config.js        # runtime configuration (API base URL, mode)
    css/
    js/
      app.js                # shell + router
      core/
        api.js              # fetch/SSE client, live vs demo transport
        config.js           # URL/localStorage/env resolution
        mock.js             # demo engine (matches, pathway, SDG, narrative)
        store.js            # state + localStorage
        ui.js, charts.js    # components
      views/                # one module per screen
    mock/                   # catalogue + signals + modules fixtures (JSON)

  main.py                   # BACKEND entry point: FastAPI app, router, static mount
  api/                      # BACKEND HTTP layer (yours)
    __init__.py
    routes.py               # /api/v1 endpoints, one handler per contract operation
    deps.py                 # shared dependencies (db session, current profile)
  services/                 # BACKEND business logic (yours)
    __init__.py
    matching.py             # deterministic role scoring + gap analysis
    pathway.py              # three-phase plan assembly from the module catalogue
    sdg.py                  # 17-goal mapping
    signals.py              # filters, facets, ingestion/refresh
    narrative.py            # LLM client, prompt building, token streaming
  db/                       # BACKEND persistence (yours)
    __init__.py
    database.py             # SQLite engine/session factory
    models.py               # SQLAlchemy tables (or raw SQL)
    repositories.py         # profile/signal/run repositories
  schemas.py                # Pydantic request/response models
  config.py                 # environment and secrets loading
  utils.py                  # existing helper module
data/
  app.db                    # SQLite file created at runtime (git-ignored)
docs/
  API.md                    # contract
  openapi.json              # machine-readable contract
  BACKEND_INTEGRATION.md    # this file
  backend-integration/
    reference_api.py        # stdlib implementation of the full contract
    smoke_test.py           # 53-check contract test
    fixtures/               # captured example responses
tools/
  serve_frontend.py         # static-only server (frontend development)
  screenshot.mjs            # headless screenshots via Edge DevTools protocol
tests/
  test_frontend_assets.py   # asset + contract integrity tests
~~~

### 3.1 Where the backend code goes

Keep everything under **`src/`**, next to (never inside) `src/frontend/`:

* `src/main.py` stays the single entry point. It creates the FastAPI app, includes the
  `/api/v1` router and **last** mounts `src/frontend` at `/`.
* Put HTTP concerns in `src/api/`, business logic in `src/services/`, persistence in
  `src/db/`. This keeps `main.py` small and makes the scoring/pathway logic unit-testable
  without spinning up HTTP.
* Do **not** put production handlers in `docs/backend-integration/`; that directory is the
  contract reference and test kit, not the service.
* Do **not** put backend code inside `src/frontend/`; it is the static root and anything there
  is publicly served to the browser.

Interpreter/run convention (pick one and keep it consistent):

~~~bash
# A. script style (matches the current src/main.py: "from utils import ...")
python src/main.py

# B. package style, if you add src/__init__.py and use "from src.api import ..."
uvicorn src.main:app --host 0.0.0.0 --port 8000
~~~

With option A, imports are resolved from `src/`, so use `from api.routes import router`,
`from services.matching import build_matches`, etc. With option B, add `src/__init__.py` and
prefix imports with `src.`.

Configuration and data:

* Read `DATABASE_PATH` from the environment, default `data/app.db` (the UI reference uses
  `data/reference.db`).
* Keep `data/` and `*.db` in `.gitignore` (already configured).
* Add `fastapi`, `uvicorn[standard]`, `httpx`, `pydantic` to `requirements.txt` when you start.

## 4. Quick start

### 4.1 Run the reference API (no install)

~~~bash
python docs/backend-integration/reference_api.py --port 8000
# UI:  http://127.0.0.1:8000/
# API: http://127.0.0.1:8000/api/v1/health
~~~

It serves the frontend, implements every endpoint, streams SSE and stores profiles in
`data/reference.db`. This is the fastest way to see the contract working and to diff your
FastAPI responses against a known-good implementation.

### 4.2 Run only the frontend

~~~bash
python tools/serve_frontend.py --port 8000
~~~

The UI boots in **demo** mode (no `/api/v1` behind it) and shows the sample dataset.

### 4.3 Verify a backend against the contract

~~~bash
python docs/backend-integration/smoke_test.py --base http://127.0.0.1:8000/api/v1
~~~

The smoke test creates a profile, exercises every endpoint, checks the SSE stream and asserts
the error envelope. It exits non-zero on failure — run it in CI before a demo.

## 5. Option A — FastAPI serves the UI (recommended)

~~~python
# src/main.py
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from api.routes import router as api_router  # your /api/v1 router

app = FastAPI(title="AI Career Navigator")
app.include_router(api_router, prefix="/api/v1")

# Mount the static UI LAST so /api keeps priority.
FRONTEND = Path(__file__).resolve().parent / "frontend"
app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="ui")
~~~

Notes:

* `StaticFiles(..., html=True)` serves `index.html` for `/`; hash routing means no SPA
  rewrite rules are needed.
* Do not add cache headers to `index.html` or `assets/config.js` during the hackathon; the
  demo may be updated live.
* If you deploy behind nginx, set `proxy_buffering off` for `/api/v1/analysis/stream`.

Run locally:

~~~bash
uvicorn src.main:app --reload --port 8000
~~~

## 6. Option B — separate origins

### 6.1 API side

~~~python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-ui.replit.app", "http://127.0.0.1:5500"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)
~~~

### 6.2 UI side

Edit `src/frontend/assets/config.js` (no rebuild required):

~~~js
window.AI_CAREER_CONFIG = {
  apiBaseUrl: "https://your-api.example.com/api/v1",
  mode: "auto",
  stream: true,
  requestTimeoutMs: 15000,
};
~~~

Alternative without editing files: open the UI with
`?api=https://your-api.example.com/api/v1&mode=live`, or use the **API & integration** screen,
which persists the choice in `localStorage`.

Never commit secrets into `config.js` — it is public.

## 7. Endpoint implementation order

Implement in this order; each step unlocks a screen and is independently testable.

| Order | Endpoint | Screen unlocked | Notes |
| ----- | -------- | --------------- | ----- |
| 1 | `GET /health`, `GET /meta` | App shell | `/health` must answer in < 3 s |
| 2 | `GET /catalog` | Intake, matches, scenarios, SDG legend | Can be static JSON from `src/frontend/mock/catalog.json` at first |
| 3 | `POST /profiles` | Intake → matches | Persist and return the stored profile |
| 4 | `POST /profiles/{id}/match` | Overview, matches | Implement the scoring rule in §8 |
| 5 | `GET /signals`, `POST /signals/refresh` | Signal layer | Serve fixtures first, wire ingestion later |
| 6 | `POST /profiles/{id}/pathway` | Pathway | Assemble from `mock/modules.json` or LLM output |
| 7 | `GET /profiles/{id}/sdg-map` | SDG map | 17 goals, tiering rule |
| 8 | `POST /analysis` + `GET /analysis/stream` | AI briefing | LLM integration, SSE |
| 9 | `PATCH /profiles/{id}`, `GET /profiles/{id}` | Editing | Can land with step 3 |

A useful staging trick: serve `src/frontend/mock/catalog.json` and `signals.json` verbatim
from your API while developing the ML parts. The shapes already satisfy the frontend.

## 8. Matching and scoring (recommended algorithm)

The reference implementation uses this inspectable formula; match it unless you have a better
one, and keep the response fields identical.

For each role:

1. For every required skill, compute `coverage_i = min(currentLevel / requiredLevel, 1)`.
2. Weighted overlap `base = Σ(coverage_i × importance_i) / Σ(importance_i)`.
3. Adjustments: experience (≤ +5), sector match (≤ +4, half for cross-sector), declared
   interests (≤ +5).
4. `fitScore = round(base × 86 + adjustments + scenarioFitDelta)`, clamped to `3–99`.
5. `baselineFit` is the same computation with no scenario delta; `fitDelta` is their difference.
6. `gapScore = Σ(gap_i × importance_i) / Σ(requiredLevel_i × importance_i) × 100`.
7. Sort by `fitScore` descending and compute `summary.readinessScore` from the top three
   with weights 0.5 / 0.3 / 0.2.

Use scenario `roleAdjustments[roleId].fitDelta` for step 4. Do not let the LLM produce scores:
deterministic scoring keeps the demo reproducible.

## 9. Personalised pathway

Assemble, do not generate from scratch:

* Take the target role's `skillsGap` sorted by `priority`.
* Pick 1–2 catalogue modules per gap (prefer `foundation` for levels ≤ 2, else
  `intermediate`), plus one project/assessment module at the end.
* Group into three phases: foundations, role-specific capability, evidence & transition.
* Compute weeks from `constraints.hoursPerWeek`, and costs from the modules.
* Report coverage for **every** gap, including ones the catalogue cannot close (`covered: false`)
  — the UI surfaces this as a caveat.

The LLM may *explain* the pathway and propose a capstone, but sequence, hours and cost should
come from structured data. This keeps totals consistent and debuggable.

## 10. Database (SQLite)

The brief asks for an independent local database; SQLite is enough. Suggested schema:

~~~sql
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS profiles (
  id          TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,          -- normalised profile JSON
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signals (
  id           TEXT PRIMARY KEY,
  payload      TEXT NOT NULL,
  published_at TEXT NOT NULL,
  source_url   TEXT NOT NULL,
  fingerprint  TEXT UNIQUE            -- hash of source + title + date
);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL,
  kind        TEXT NOT NULL,          -- match | pathway | sdg | narrative
  payload     TEXT NOT NULL,
  model       TEXT,
  latency_ms  INTEGER,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_profile ON analysis_runs(profile_id, created_at DESC);
~~~

Rules of thumb:

* Store the **normalised profile** as JSON; normalise on write, not on every read.
* Keep every LLM output in `analysis_runs` for auditability and for the "regenerate" story.
* Do not store secrets in SQLite; keep keys in environment variables / Replit Secrets.
* Use parameterised queries (`?`) — never f-string SQL.

## 11. LLM narrative integration

The UI expects plain text plus metadata, streamed or whole.

### 11.1 Inputs to build the prompt

* Profile: name, current role, sector, years, goal, constraints (hours, budget), top skills.
* Scenario: name, assumptions, confidence, role adjustments.
* Top three matches: title, fit, gaps (max 3 each), demand trend, salary band.
* Pathway: horizon, hours/week, phases, totals, uncovered gaps.
* Signals: 2–3 dated evidence items (publisher + date + claim).

### 11.2 Prompt skeleton

~~~text
You are a careers analyst for a public workforce programme.
Write a 250-350 word briefing in plain text, addressed to {name}.

Rules:
- Use only the data below; do not invent courses, credentials, salaries or dates.
- Name the strongest adjacent role, one alternative, and the 2-3 biggest gaps.
- Cite evidence as "publisher, month year" at most once per paragraph.
- State the scenario you are modelling and what would change under another scenario.
- End with one concrete next action for the next 7 days.
- No headings, no markdown, no bullet lists.

[profile] ...
[scenario] ...
[matches] ...
[pathway] ...
[sdg] ...
[signals] ...
~~~

### 11.3 Response shape

Ask for JSON with one required field, then persist it:

~~~json
{ "narrative": "Aisha, your strongest adjacent role is …\n\nThe gap is narrow …" }
~~~

### 11.4 Streaming with FastAPI

~~~python
import json
from fastapi.responses import StreamingResponse

def sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

@app.get("/api/v1/analysis/stream")
async def analysis_stream(profileId: str, scenarioId: str = "baseline", roleId: str | None = None):
    context = build_context(profileId, scenarioId, roleId)   # your services

    async def generate():
        yield sse("meta", {"provider": "runpod", "model": MODEL, "scenarioId": scenarioId})
        parts = []
        async for token in llm_stream(context.prompt):
            parts.append(token)
            yield sse("token", {"text": token})
        yield sse("done", {"analysis": {
            "provider": "runpod",
            "model": MODEL,
            "scenarioId": scenarioId,
            "generatedAt": utcnow_iso(),
            "narrative": "".join(parts),
        }})

    return StreamingResponse(generate(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    })
~~~

If your provider cannot stream, emit a few coarse tokens as you write the complete answer,
then `done`. The UI only needs to see text arrive.

### 11.5 RunPod

The team already documents a RunPod serverless endpoint. Call it from the backend, not from
the browser:

~~~python
import os, httpx

RUNPOD_URL = "https://api.runpod.ai/v2/" + os.environ["RUNPOD_ENDPOINT_ID"] + "/runsync"
headers = {"Authorization": "Bearer " + os.environ["RUNPOD_API_KEY"]}

response = httpx.post(RUNPOD_URL, json={"input": {"prompt": prompt}}, headers=headers, timeout=60)
narrative = response.json()["output"]
~~~

Keep prompts and keys server-side; log latency and token counts in `analysis_runs`.

## 12. Deployment on Replit

Suggested `.replit` (backend owner should commit this):

~~~toml
run = "python src/main.py"
entrypoint = "src/main.py"

[nix]
channel = "stable-24_05"

[[ports]]
localPort = 8000
externalPort = 80
~~~

* Add `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID` and any provider keys in **Secrets**, never in
  `.env` that is committed.
* Bind to `0.0.0.0` and the port Replit provides (`PORT` env when available).
* Serve the UI from the same process so the demo is one URL.
* The frontend's default `apiBaseUrl` is `/api/v1`, so no frontend change is needed.

## 13. Testing and acceptance

Before a demo:

1. `python docs/backend-integration/smoke_test.py --base http://127.0.0.1:8000/api/v1` — all
   checks green.
2. Open the UI, watch the sidebar switch to **Live API connected**, and confirm the signal
   list shows dated sources.
3. Create a profile in the UI, then verify it exists in SQLite:
   `sqlite3 data/reference.db "select id, updated_at from profiles;"`
4. Switch scenarios and confirm match scores change and the pathway re-renders.
5. Generate the briefing and confirm SSE tokens arrive (DevTools → Network → EventStream).
6. Kill the API, reload the UI, and confirm it falls back to **Offline demo dataset** instead
   of breaking.
7. Run `python -m unittest discover tests` for the asset/contract integrity checks.

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| UI stuck on "Starting workspace…" | Static files not served, or JS blocked | Check `/js/app.js` returns 200 with `text/javascript`; open DevTools console |
| Badge says "Offline demo dataset" | `/api/v1/health` timed out, returned HTML or CORS failed | `curl -i /api/v1/health`; check base URL and CORS |
| 404 on refresh of a sub-route | Server rewrites missing | Hash routing is used — serve `index.html` at `/` and don't rewrite `/api` |
| Matches all score 3 | Profile skill ids unknown to the catalogue | Return `skillId`s from `GET /catalog`; unknown ids are dropped |
| Briefing panel shows "stream interrupted" | Proxy buffering or upstream timeout | Disable buffering, keep first token < 20 s, send `event: error` with a message |
| Mixed content error | HTTPS UI calling HTTP API | Use HTTPS for both, or same-origin |
| CORS preflight fails | Missing `OPTIONS` or headers | Allow `GET, POST, PATCH, OPTIONS` and `Content-Type` |
| Scores change between reloads | Non-deterministic LLM scoring | Keep scoring deterministic; use the LLM only for narrative |
| 404 on matching after switching demo → live | The saved profile id only exists in the demo store | The UI now re-creates the profile automatically via `POST /profiles`; keep that behaviour or return a writable id |

## 15. Handover checklist

- [ ] `/api/v1/health` answers JSON in under 3 s.
- [ ] `/catalog` returns 23 skills, 12 roles, 17 SDGs, ≥ 2 scenarios (or your own counts).
- [ ] Profiles persist in SQLite and can be read back and patched.
- [ ] Matching returns one entry per role, sorted, with gaps and reasons.
- [ ] Pathway returns three phases and coverage for every gap.
- [ ] SDG map returns all 17 goals with rationales.
- [ ] Analysis streams SSE and persists the narrative.
- [ ] Errors use the `{ error: { code, message } }` envelope.
- [ ] CORS or same-origin configured; no keys in the frontend bundle.
- [ ] `smoke_test.py` passes; `python -m unittest discover tests` passes.
- [ ] UI shows the API as live and survives a backend restart.
