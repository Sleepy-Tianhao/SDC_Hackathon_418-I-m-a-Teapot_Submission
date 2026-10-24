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
  manager can act on. An optional OpenAI-compatible model can also re-rank matches, adjust the
  fit scores and order the pathway modules; the deterministic engine remains the fallback.

The default frontend is built on the vendored Argon Theme source and calls the FastAPI API
directly. The previous frontend is preserved independently in `src/frontend_bak` and remains
available at `/legacy/`.

## Requirement coverage

| Must-have from the Domain 1 brief | Where it is implemented |
| --------------------------------- | ----------------------- |
| Skills profile intake | `Profile` section — validated form, persisted via `POST /api/v1/profiles` |
| AI-trend signal layer (updatable, dated source) | `Signals` section — dated cards, source links, `POST /api/v1/signals/refresh` |
| Future-role matching + skills gap | `Matches` section — fit scores, gap chips, reasons, score source |
| Personalised reskilling pathway | `Pathway` section — LLM-ordered modules, phases, cost, milestones |
| SDG mapping | `SDG map` section — all 17 goals, contribution scores, rationale, evidence |
| More than one future scenario | `Scenarios` section + top-bar selector — three futures re-score everything |

## Architecture

~~~text
┌──────────────────────────────┐      ┌──────────────────────────────────────┐
│ Browser                      │      │ FastAPI  src/main.py                 │
│  src/frontend                │ JSON │  /api/v1/*                           │
│  Argon Theme source + JS     │ ───► │  ├─ src/backend/engine.py            │
│  fetch + EventSource         │      │  │   matching / pathway / SDG       │
│  local profile cache         │ SSE  │  ├─ src/backend/llm.py               │
└──────────────────────────────┘      │  │   optional external model        │
                                      │  ├─ SQLite data/app.db               │
                                      │  └─ static mounts: / and /legacy/    │
                                      └──────────────────────────────────────┘
~~~

The default frontend never reads the CSV files or the SQLite database directly. The backend owns
the data load, scoring, LLM adapter and persistence; the browser only sends ids and receives
structured JSON or SSE frames. The legacy frontend is a fully independent copy in
`src/frontend_bak`.

## Tech stack

| Layer | Technology | Why |
| ----- | ---------- | --- |
| Frontend | Vendored Argon Theme CSS/JS, Bootstrap and product JS | Uses the actual Argon source; no build step |
| Backend | Python 3 + FastAPI + SQLite | /api/v1 contract, same-origin UI, SSE, profile persistence |
| Database | SQLite | Profiles are persisted locally with zero setup |
| LLM | Optional OpenAI-compatible provider (`src/backend/llm.py`) | Model participates in matching, scoring, pathway order and briefing; deterministic fallback |
| Hosting / dev | Replit | One URL for UI + API |

## Repository structure

~~~text
.
├── docs/
│   ├── API.md                       # frontend↔backend contract, including SSE
│   ├── openapi.json                 # machine-readable OpenAPI 3.1 spec
│   ├── BACKEND_INTEGRATION.md       # handover notes
│   ├── backend-integration/
│   │   ├── reference_api.py         # legacy contract reference, not runtime
│   │   ├── smoke_test.py            # 53-check contract test
│   │   ├── export_fixtures.py       # example-response capture
│   │   └── fixtures/                # legacy shape references
│   └── screenshots/                 # image assets (not linked from this README)
├── src/
│   ├── frontend/                    # default Argon Theme frontend
│   │   ├── vendor/argon/            # unchanged Argon source + LICENSE
│   │   ├── css/app.css              # product layout on Argon components
│   │   └── js/app.js                # API, profile, matches, pathway, SDG, SSE
│   ├── frontend_bak/                # independent classic frontend at /legacy/
│   ├── argon-theme/                 # upstream Argon source tree
│   ├── main.py                      # FastAPI: /api/v1, static mounts, SSE
│   └── backend/
│       ├── data.py                  # real CSVs → catalogue/signals/modules
│       ├── engine.py                # deterministic core + LLM orchestration
│       ├── llm.py                   # OpenAI-compatible model adapter
│       └── data/                    # labour snapshots and source metadata
├── tools/
│   ├── serve_frontend.py            # static server for frontend work
│   └── screenshot.mjs               # optional headless screenshots
├── tests/
│   ├── test_frontend_assets.py      # asset, backup-data and contract checks
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
default Argon frontend from `src/frontend` (built on the vendored Argon Theme source).

The previous teapot design is preserved independently in `src/frontend_bak`. Open
`http://127.0.0.1:8000/legacy/` or use the **Classic** pill in the top bar to switch back
immediately; the legacy page has an **Argon design** link back.

Optional external model configuration (server-side only):

~~~bash
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=your-key
LLM_MODEL=deepseek-chat
LLM_ENABLED=true
~~~

`.env` is loaded automatically; real environment variables take precedence. With no key the
deterministic engine handles matching, pathway and narrative unchanged.

If port 8000 is already in use:

~~~powershell
$env:API_PORT="8022"
python src/main.py
# open http://127.0.0.1:8022/
~~~

### 2. Legacy frontend only

The previous frontend is complete and independent in `src/frontend_bak`. In the FastAPI
entry it is available at `/legacy/`; it can also be served by any static server rooted at
`src/frontend_bak`. The Argon frontend is the default and has no offline mock dataset.

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
matching, pathway generation, SDG mapping, scenarios, and the server-side narrative stream.
The default Argon frontend calls the live API directly. The classic frontend in
`src/frontend_bak` retains its own demo/live transport for offline review.

When configured, the optional model also participates in matching scores and pathway ordering.
Its provider/model/configured state is exposed through `GET /api/v1/meta`; keys and prompts
never cross into the browser.

## Two-minute demo script

1. **Banner** — introduce the product and the six must-haves; use *Load sample profile*.
2. **Overview** — readiness score, top role, dated signals and SDG footprint.
3. **Profile** — show honest self-rating, interests and time/budget constraints.
4. **Signals** — open one signal's evidence: publisher, date, source link and affected roles.
5. **Matches** — compare two roles, inspect gaps and reasons, then change the scenario:
   the same profile re-ranks.
6. **Pathway** — LLM-ordered modules, phases, costs and milestones; regenerate the briefing.
7. **SDG map** — inspect goals, contribution scores and rationale.
8. **Classic** — switch to `/legacy/` to show the fully independent previous design.

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
they are not random mock records. The new Argon frontend has no mock dataset and uses the `/api/v1` contract directly.

The legacy frontend in `src/frontend_bak` retains its offline demo fixtures for comparison;
they are not used by the default Argon frontend or served as live backend data.


## How we use Replit *(required)*

* **Development:** the repository is imported into a Repl; the backend entry point
  (`src/main.py`) serves both the API and the frontend.
* **Hosting:** the app is deployed with Replit Deployments; the live demo link above points at it.
* **Secrets:** if the external model is enabled, `LLM_API_KEY` belongs in Replit Secrets,
  never in the repository. Without it the deterministic engine remains fully operational.

Proof of use: [`submission/REPLIT PROOF OF USE.pdf`](submission/REPLIT%20PROOF%20OF%20USE.pdf)

## Narrative generation

The backend supports an optional **OpenAI-compatible third-party model** alongside the
deterministic engine. When configured, the model participates in three places:

* **Matching and scores** — it re-ranks the deterministic candidates and applies bounded
  fit-score adjustments (±12 points), validated against the real role ids;
* **Pathway** — it chooses the role when no explicit role was requested and orders the
  catalogue modules into a learning sequence, after which hours, cost and readiness are
  recalculated;
* **Briefing** — it writes the plain-text evidence narrative from the profile, scenario,
  matches, pathway and dated signals.

The API contract is unchanged and the deterministic engine remains the fallback when the key
is missing, the provider fails or the response is invalid. Configure it server-side only:

~~~bash
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=...
LLM_MODEL=deepseek-chat
LLM_ENABLED=true
~~~

The browser receives only the resulting structured JSON or SSE token frames; it never sees a
key or prompt.

## Challenges and learnings

* **Showing evidence, not just answers.** Every score had to be explainable, so the matcher is a
  weighted overlap with published weights rather than an opaque model. The UI shows the gaps,
  the reasons and the scenario delta.
* **Making a demo survivable.** The classic frontend retains a complete offline demo
  transport; the Argon frontend reports an API-offline state instead of inventing data.
  The backend also falls back to its deterministic engine when the external model fails.
* **Keeping the contract honest.** The API contract, OpenAPI spec, self-contained FastAPI
  backend and a 53-check smoke test are all in the repo, so "the frontend expects this shape"
  is testable rather than a claim.
* **Six must-haves, two frontends.** The Argon page groups the six requirements into one
  scrollable workspace, while the classic backup keeps the original routed views and offline
  demo; both use the same `/api/v1` contract.

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
* [x] Argon frontend with an independent classic fallback at `/legacy/`
* [x] API contract + OpenAPI + integration guide
* [x] Self-contained FastAPI backend with real labour datasets and contract smoke test
* [x] Automated tests for assets, fixtures and contract
* [ ] Slide deck link added
* [ ] Demo video link added
* [ ] Replit deployment URL added
* [x] External LLM adapter implemented; credentials are optional and server-side
* [ ] "How to Run" verified on a clean clone
* [x] No API keys or secrets committed

## License

This project is licensed under the [Apache License 2.0](LICENSE).
