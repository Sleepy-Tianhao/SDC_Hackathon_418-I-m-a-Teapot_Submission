# AI Career Navigator

> A workforce-foresight copilot that turns dated AI-trend signals into a defensible reskilling
> plan — matched to your real skills, stress-tested across three 2028 scenarios, and mapped to
> all 17 UN Sustainable Development Goals.

**SDC 2026 · Domain 1 — Aiversecity Future-Ready Workforce · Team 418 I'm a Teapot**

---

## Team information

| Field | Details |
| ----- | ------- |
| **Team** | 418 I'm a Teapot |
| **Domain** | Domain 1 — Future-Ready Workforce |
| **SDG track** | SDG 8 — Decent Work and Economic Growth (cross-cutting SDG 4, 10 and 17 through the role-level mapping) |
| **Leader** | CHEN XIANGYU |
| **University** | Xiamen University Malaysia |
| **Team size** | 5 |

## Links

| Resource | Link |
| -------- | ---- |
| GitHub Repository | <https://github.com/Sleepy-Tianhao/SDC_Hackathon_418-I-m-a-Teapot_Submission> *(to be updated)* |
| Replit Project | <https://replit.com/@CufoFlux/SDCHackathon418-I-m-a-TeapotSubmission> *(to be updated)* |
| Live Demo | <https://your-project.replit.app> *(to be updated)* |
| Slide Deck | *(to be updated)* |
| Demo Video | *(to be updated)* |

---

## Overview

### The problem

AI is changing which skills matter faster than any training catalogue can follow. Workers are
told to "reskill" without knowing which skills will still be valuable, employers cannot explain
which roles are emerging, and public programmes cannot show how a reskilling budget connects to
the SDGs. Most career tools produce a score and a list of courses; almost none show their
evidence, their assumptions, or what happens if the future turns out differently.

### The solution

**AI Career Navigator** is a separated frontend/backend web application:

* **Skills profile intake** captures what a person can actually do, with self-rated skills,
  plus time, budget and interests.
* **A dated signal layer** draws its records from real institution/source rows — every signal
  has a publisher, a publication date and a source link, so the forecast can be audited.
* **Scenario-aware matching** scores 12 future roles under three explicit 2028 futures, showing
  fit, the exact skills gap, salary band, automation risk and the reasons behind every score.
* **A personalised reskilling pathway** sequences open and low-cost modules into three phases,
  with hours, cost, milestones and evidence artefacts.
* **SDG mapping** connects each matched role to the 17 goals with a weighted rationale and
  supporting signals.
* **A server-side narrative** turns the structured result into a written briefing a mentor or
  manager can act on. The current build uses a deterministic evidence narrative; a model
  provider can be added behind the same SSE interface.

The frontend is a build-free SPA; the backend owns the database, scoring and narrative generation.
The UI can run on a complete demo dataset when the API is unavailable, and it says so.

## Requirement coverage

| Must-have from the Domain 1 brief | Where it is implemented |
| --------------------------------- | ----------------------- |
| Skills profile intake | `#/intake` — four-step wizard, validated, persisted via `POST /api/v1/profiles` |
| AI-trend signal layer (updatable, dated source) | `#/signals` — filters, evidence modal, source links, `POST /api/v1/signals/refresh` |
| Future-role matching + skills gap | `#/matches` and `#/overview` — fit scores, gap matrix, role detail |
| Personalised reskilling pathway | `#/pathway` — phases, modules, cost, milestones, coverage, print/copy |
| SDG mapping | `#/sdg` — all 17 goals, contribution scores, role and skill links, evidence |
| More than one future scenario | `#/scenarios` + scenario selector in the top bar — three futures re-score everything |

## Screens

**Landing — the product in one screen**

![Landing page](docs/screenshots/landing.png)

**Personal dashboard — life tree, readiness, top roles, capability radar, scenario sensitivity, SDG footprint**

![Overview dashboard](docs/screenshots/overview.png)

**Signal layer — every trend dated and linked to its publisher**

![Signal layer](docs/screenshots/signals.png)

**Role matching — fit, gaps and reasons, with a cross-role gap matrix**

![Role matches](docs/screenshots/matches.png)

**Reskilling pathway — phases, modules, cost and evidence**

![Reskilling pathway](docs/screenshots/pathway.png)

**SDG mapping — all 17 goals, scored with rationale and evidence**

![SDG mapping](docs/screenshots/sdg.png)

**Scenario lab — three futures, one profile**

![Scenario lab](docs/screenshots/scenarios.png)

**Integration screen — live API status, endpoint contract and backend recipe**

![API and integration](docs/screenshots/connect.png)

**Streamed narrative briefing — grounded in the profile, scenario and pathway**

![Streamed narrative briefing](docs/screenshots/briefing.png)

**Dark mode and mobile**

| Dark dashboard | Mobile dashboard |
| -------------- | ---------------- |
| ![Dark mode](docs/screenshots/overview-dark.png) | ![Mobile mode](docs/screenshots/overview-mobile.png) |

## Architecture

~~~text
┌────────────────────────────┐        ┌─────────────────────────────────────┐
│ Browser                    │        │ FastAPI  src/main.py                │
│  src/frontend              │ JSON   │  /api/v1/*                          │
│  ES modules, no build step │ ─────► │  ├─ src/backend/data.py             │
│  fetch + EventSource       │        │  │   real labour CSVs + catalogue  │
│  localStorage cache        │  SSE   │  ├─ src/backend/engine.py           │
└────────────────────────────┘        │  │   matching / pathway / SDG      │
                                      │  ├─ SQLite data/app.db              │
                                      │  └─ static frontend mount at /      │
                                      └─────────────────────────────────────┘
~~~

The frontend never reads the CSV files or the SQLite database directly. The backend owns the data
load, scoring, catalogue and persistence; the browser only sends ids and receives structured JSON.
The current narrative is deterministic and runs server-side; an external model can replace that
step behind the same SSE contract.

## Tech stack

| Layer | Technology | Why |
| ----- | ---------- | --- |
| Frontend | Native ES modules, modern CSS, inline SVG | No build step, instant deploys, nothing to break on Replit |
| Backend | Python 3 + FastAPI | Typed routes, same-origin UI, SSE, SQLite |
| Database | SQLite | Profiles are persisted locally with zero setup |
| Narrative | Deterministic evidence engine; provider adapter optional | Reproducible demo output; no key is needed for the default build |
| Hosting / dev | Replit | One URL for UI + API |

## Repository structure

~~~text
.
├── docs/
│   ├── API.md                       # the frontend↔backend contract
│   ├── openapi.json                 # machine-readable OpenAPI 3.1 spec
│   ├── BACKEND_INTEGRATION.md       # handover and endpoint notes
│   ├── backend-integration/
│   │   ├── reference_api.py         # legacy contract reference (not runtime code)
│   │   ├── smoke_test.py            # 53-check contract test
│   │   ├── export_fixtures.py       # captures example responses
│   │   └── fixtures/                # captured example responses (legacy shape reference)
│   └── screenshots/                 # UI evidence
├── src/
│   ├── frontend/                    # the application UI (build-free SPA)
│   ├── main.py                      # FastAPI entry: /api/v1 + static UI + SSE
│   ├── backend/
│   │   ├── data.py                  # loads real labour CSVs; builds catalogue/signals/modules
│   │   ├── engine.py                # matching, pathway, SDG, narrative, SQLite
│   │   └── data/                    # real labour snapshots and source metadata
│   └── utils.py
├── tools/
│   ├── serve_frontend.py            # static server for frontend-only development
│   └── screenshot.mjs               # headless screenshots (no npm)
├── tests/
│   ├── test_frontend_assets.py      # assets, fixtures, module graph, contract checks
│   └── test_utils.py
├── requirements.txt
├── .env.example
└── README.md
~~~


## How to run

### 1. Full stack — FastAPI backend + frontend (recommended)

~~~bash
pip install -r requirements.txt
python src/main.py
# open http://127.0.0.1:8000/
~~~

The FastAPI entry serves the frontend and the `/api/v1` API from the same origin, so the
sidebar reads **Live API connected** without any extra configuration. It reads the real
labour snapshots in `src/backend/data/`, persists profiles in `data/app.db`, and serves the
UI from `src/frontend`.

If port 8000 is already in use:

~~~powershell
$env:API_PORT="8022"
python src/main.py
# open http://127.0.0.1:8022/
~~~

### 2. Frontend only — offline demo dataset

~~~bash
python tools/serve_frontend.py --port 8003
# open http://127.0.0.1:8003/
~~~

No API is required. The UI probes `/api/v1/health`, falls back to the browser demo fixtures,
and visibly shows **Offline demo dataset**. Add `#/overview?sample=1` to seed a sample profile.
This mode uses the files in `src/frontend/mock/`; it is intentionally separate from the
live backend.

### 3. Legacy reference API (contract shape only)

`docs/backend-integration/reference_api.py` remains in the repository as a small, dependency-free
contract reference and test fixture. It is **not imported by the runtime backend** and should
not be used as the production service.

### Tests

~~~bash
python -m unittest discover tests
python docs/backend-integration/smoke_test.py --base http://127.0.0.1:8000/api/v1
~~~


## API contract

* Human-readable: [docs/API.md](docs/API.md)
* Machine-readable: [docs/openapi.json](docs/openapi.json)
* Integration guide: [docs/BACKEND_INTEGRATION.md](docs/BACKEND_INTEGRATION.md)
* Frontend notes: [src/frontend/README.md](src/frontend/README.md)

The contract covers health and metadata, the catalogue, the signal layer, profile intake,
matching, pathway generation, SDG mapping, scenarios, and the server-side narrative stream. The
frontend's transport is switchable at runtime (`auto` / `live` / `demo`) and visible in the UI.

## Two-minute demo script

1. **Landing** — state the problem and the six must-haves. Click *Explore with a sample profile*.
2. **Overview** — the exploration tree, readiness score, top roles, capability radar and SDG footprint.
3. **Intake** — show honest self-rating and the time/budget constraints that drive the plan.
4. **Signals** — open one signal's evidence: publisher, date, source link, affected roles.
5. **Matches** — compare two roles, open the gap matrix, then change the scenario in the top bar:
   the same profile re-ranks.
6. **Pathway** — phases, costs, milestones, coverage; generate or regenerate the evidence briefing.
7. **SDG map** — pick a goal and show the role, skills and evidence behind its score.
8. **Connect** — show live/demo status and the endpoint contract. This is the backend handover.

## Data and provenance

The live backend is data-driven:

* `src/backend/data/01_national_annual_series.csv` — national graduate labour series;
* `src/backend/data/02_salary_by_qualification_skill_gender_location.csv` — salary by qualification;
* `src/backend/data/03_industry_distribution.csv` — sector distribution and starting ranges;
* `src/backend/data/04_salary_by_state.csv` — salary by state/territory;
* `src/backend/data/05_mohe_employment_rate.csv` — MoHE employment rates;
* `src/backend/data/06_global_annual_series.csv` and `07_global_salary_employment_detail.csv` — global comparisons;
* `src/backend/data/08_source_urls.csv` — publisher, URL and release metadata used by the signal layer.

Salary, employment and signal metadata are loaded from those tables. Role archetypes, the skill
taxonomy and scenario parameterisation are explicit product definitions on top of the real data;
they are not random mock records. The backend does **not** read `src/frontend/mock/*.json`.

The files in `src/frontend/mock/` are a separate **offline demo** dataset used only when the
frontend is started without an API. They are labelled as illustrative in the UI and are not
served by the FastAPI backend as live data.


## How we use Replit *(required)*

* **Development:** the repository is imported into a Repl; the backend entry point
  (`src/main.py`) serves both the API and the frontend.
* **Hosting:** the app is deployed with Replit Deployments; the live demo link above points at it.
* **Secrets:** if an external narrative provider is enabled later, its keys belong in Replit Secrets,
  never in the repository. The default deterministic narrative needs no model key.

Proof of use: [`submission/REPLIT PROOF OF USE.pdf`](submission/REPLIT%20PROOF%20OF%20USE.pdf)

## Narrative generation

The default backend generates a deterministic, evidence-based narrative from the selected
profile, scenario, matched roles, pathway and relevant signals. It streams that narrative to the
browser over the same Server-Sent Events contract the UI already consumes:

~~~text
event: meta
event: token
event: done
~~~

No model key is required for the default build. The engine boundary is intentionally separate,
so a provider adapter can be added later without changing the frontend. If a provider is enabled,
its key stays server-side; the browser receives only `event: token` frames and never sees a key
or prompt.

## Challenges and learnings

* **Showing evidence, not just answers.** Every score had to be explainable, so the matcher is a
  weighted overlap with published weights rather than an opaque model. The UI shows the gaps,
  the reasons and the scenario delta.
* **Making a demo survivable.** Backends fail during demos. The frontend ships a complete demo
  transport, probes `/health` with a three-second timeout, and always displays which mode is
  active.
* **Keeping the contract honest.** The API contract, OpenAPI spec, self-contained FastAPI
  backend and a 53-check smoke test are all in the repo, so "the frontend expects this shape"
  is testable rather than a claim.
* **Ten packages of scope.** Six must-haves means six screens; the design system (tokens,
  components, charts) made it possible to keep them coherent.

## Future improvements

* [ ] Replace self-rated skills with verified evidence (assessments, work samples).
* [ ] Real ingestion pipeline with scheduled jobs and source monitoring.
* [ ] Employer-side view: post a role, see supply and gap forecasts.
* [ ] Localisation for Malay, Mandarin and Tamil.
* [ ] Persist and compare multiple profiles for programme planners.
* [ ] Add authentication and per-user workspaces.

## Team

| Name | Role | GitHub |
| ---- | ---- | ------ |
| CHEN XIANGYU | Team lead / Frontend | @Sleepy-Tianhao |
| ZI KUNLIN | Frontend | @kunlinzi53-hue |
| ZHU BINSHA | Backend | @zhubinsha58-ai |
| LI JIAYOU | Backend | @lijiayou755-spec |
| WANG HAOYUE | Research & presentation | @Anne-why |

## Submission checklist

* [x] Domain 1 and SDG track filled in
* [x] All six must-haves implemented and demonstrated
* [x] Working frontend with a live/demo transport switch
* [x] API contract + OpenAPI + integration guide
* [x] Self-contained FastAPI backend with real labour datasets and contract smoke test
* [x] Automated tests for assets, fixtures and contract
* [ ] Slide deck link added
* [ ] Demo video link added
* [ ] Replit deployment URL added
* [ ] Optional external narrative provider configured in Secrets
* [ ] "How to Run" verified on a clean clone
* [x] No API keys or secrets committed

## License

This project is licensed under the [Apache License 2.0](LICENSE).
