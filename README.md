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

The frontend is a build-free SPA and calls the FastAPI API directly. It also retains a local
demo transport for offline review; the live backend remains the source of truth.

## Requirement coverage

| Must-have from the Domain 1 brief | Where it is implemented |
| --------------------------------- | ----------------------- |
| Skills profile intake | `#/intake` — four-step wizard, persisted via `POST /api/v1/profiles` |
| AI-trend signal layer (updatable, dated source) | `#/signals` — filters, evidence modal, source links, `POST /api/v1/signals/refresh` |
| Future-role matching + skills gap | `#/matches` and `#/overview` — fit scores, gap matrix, LLM score source |
| Personalised reskilling pathway | `#/pathway` — LLM-ordered modules, phases, cost, milestones, coverage |
| SDG mapping | `#/sdg` — all 17 goals, contribution scores, role and skill links, evidence |
| More than one future scenario | `#/scenarios` + scenario selector — three futures re-score everything |

## Architecture

~~~text
┌────────────────────────────┐        ┌─────────────────────────────────────┐
│ Browser                    │        │ FastAPI  src/main.py                │
│  src/frontend              │ JSON   │  /api/v1/*                          │
│  ES modules, no build step │ ─────► │  ├─ src/backend/engine.py           │
│  fetch + EventSource       │        │  │   matching / pathway / SDG      │
│  localStorage cache        │  SSE   │  ├─ src/backend/llm.py              │
└────────────────────────────┘        │  │   optional external model       │
                                      │  ├─ SQLite data/app.db              │
                                      │  └─ static frontend mount at /       │
                                      └─────────────────────────────────────┘
~~~

The frontend never reads the CSV files or the SQLite database directly. The backend owns the data
load, scoring, LLM adapter and persistence; the browser only sends ids and receives structured
JSON or SSE frames.

## Tech stack

| Layer | Technology | Why |
| ----- | ---------- | --- |
| Frontend | Native ES modules, modern CSS, inline SVG | No build step, instant deploys |
| Backend | Python 3 + FastAPI + SQLite | /api/v1 contract, same-origin UI, SSE, persistence |
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
│   ├── frontend/                    # the default routed frontend
│   │   ├── css/                     # design tokens, layout, components, views
│   │   ├── js/                      # app shell, views, API facade, demo engine
│   │   └── mock/                    # offline demo fixtures
│   ├── main.py                      # FastAPI: /api/v1, static UI, SSE
│   └── backend/
│       ├── data.py                  # real CSVs → catalogue/signals/modules
│       ├── engine.py                # deterministic core + LLM orchestration
│       ├── llm.py                   # OpenAI-compatible model adapter
│       └── data/                    # labour snapshots and source metadata
├── tools/
│   ├── serve_frontend.py            # static server for frontend work
│   └── screenshot.mjs               # optional headless screenshots
├── tests/
│   ├── test_frontend_assets.py      # asset, fixture and contract checks
│   └── test_utils.py
├── .replit                         # Replit run + deployment + port mapping
├── replit.nix                      # Replit Python 3.11 environment
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
frontend from `src/frontend`.

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

### 2. Frontend only — offline demo

~~~bash
python tools/serve_frontend.py --port 8003
# open http://127.0.0.1:8003/
~~~

No API is required. The UI falls back to the files in `src/frontend/mock/` and visibly shows
**Offline demo dataset**. The live FastAPI backend does not read those fixtures.

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
The frontend transport switches between `auto`, `live` and `demo` at runtime.

When configured, the optional model also participates in matching scores and pathway ordering.
Its provider/model/configured state is exposed through `GET /api/v1/meta`; keys and prompts
never cross into the browser.

## Two-minute demo script

1. **Landing** — state the problem and the six must-haves. Click *Explore with a sample profile*.
2. **Overview** — the exploration tree, readiness score, top roles, capability radar and SDG footprint.
3. **Intake** — show honest self-rating and the time/budget constraints that drive the plan.
4. **Signals** — open one signal's evidence: publisher, date, source link, affected roles.
5. **Matches** — compare two roles, open the gap matrix, then change the scenario:
   the same profile re-ranks.
6. **Pathway** — phases, costs, milestones, coverage; generate or regenerate the LLM briefing.
7. **SDG map** — pick a goal and show the role, skills and evidence behind its score.
8. **Connect** — show live/demo status and the endpoint contract.

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
they are not random mock records. The frontend's offline fixtures in `src/frontend/mock` are
illustrative only; the backend never reads them as live data.


## How we use Replit *(required)*

* **Development:** the repository is imported into a Repl; `.replit` starts
  `PORT=3000 python src/main.py`. The entry point serves the API and static frontend.
* **Hosting:** `.replit` [deployment] runs `python3 src/main.py`; the process binds
  `0.0.0.0` and reads `PORT` / `API_PORT`. Port 3000 is mapped to external port 80.
* **Secrets:** if the external model is enabled, add `LLM_API_KEY`, `LLM_BASE_URL` and
  `LLM_MODEL` in Replit Secrets (not in the repository). Without a key the deterministic
  engine remains fully operational.
* **Timeout headroom:** structured scoring/pathway calls use `deepseek-chat` (typically 5–20 s);
  narrative calls can take ~20 s on `deepseek-flash`. The frontend waits 120 s, the health probe
  20 s, and `LLM_TIMEOUT` defaults to 120 s.
* **Storage:** SQLite is used for profiles. Treat deployed SQLite as disposable demo storage;
  use an external database before relying on profiles across redeploys.

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
* **Making a demo survivable.** The frontend retains a complete offline demo transport and
  reports when it is running on fixtures. The backend also falls back to its deterministic
  engine when the external model fails.
* **Keeping the contract honest.** The API contract, OpenAPI spec, self-contained FastAPI
  backend and a 53-check smoke test are all in the repo, so "the frontend expects this shape"
  is testable rather than a claim.
* **Six must-haves, one routed workspace.** The frontend keeps the six requirements in
  separate, inspectable views and the same `/api/v1` contract.

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
* [x] Working frontend with live/demo transport switch
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
