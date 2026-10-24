# AI Career Navigator

> A workforce-foresight copilot that turns dated AI-trend signals into a defensible reskilling plan, matched to a worker's real skills across three 2028 futures and all 17 UN Sustainable Development Goals.

---

## Team Information

|Field|Details|
|-|-|
|**Team Name**|418 I'm a Teapot|
|**Team Domain**|Domain 1 — Future-Ready Workforce|
|**SDG Track (1–17)**|SDG 8 — Decent Work and Economic Growth (cross-cutting SDG 4, 10 and 17)|
|**Team Leader**|CHEN XIANGYU|
|**University**|Xiamen University Malaysia|
|**Number of Members**|5|

## Links

|Resource|Link|
|-|-|
|GitHub Repository|https://github.com/Sleepy-Tianhao/SDC_Hackathon_418-I-m-a-Teapot_Submission|
|Live Demo|https://aicareer.replit.app|
|RunPod Endpoint|Not used — this build is CPU-only (see How We Use RunPod)|
|Slide Deck|[`submission/AI_Career_Navigator_Pitch_FINAL.pdf`](<submission/AI_Career_Navigator_Pitch_FINAL.pdf>)|
|Demo Video|*(pending)*|

---

## Overview

### Problem

AI is changing which skills matter faster than any training catalogue can follow. Graduates and mid-career workers in Malaysia are told to "reskill" without knowing which skills will still be valuable, while employers and public programmes cannot show the evidence behind their forecasts. Most career tools return one opaque score and a list of courses, with no dated sources, no stated assumptions and no way to see what happens under a different future.

### Solution

AI Career Navigator turns dated labour-market signals into an auditable plan. Every signal carries a publisher, a publication date and a source link, and the FastAPI engine scores 12 future roles under three explicit 2028 scenarios with a published weighted-overlap model, so each result comes with its gap, salary band, automation risk and reasons. A personalised pathway sequences 27 open and low-cost modules into three phases with hours, cost and milestones, and each match is mapped to the 17 SDGs with a weighted rationale. An optional OpenAI-compatible model re-ranks candidates, orders the modules and writes the briefing; matching and pathway retain deterministic fallbacks, while the AI briefing requires the configured model.

### Key Features

* **Skills profile intake** — Four-step wizard capturing self-rated skills plus time, budget and interests, persisted through `POST /api/v1/profiles`.
* **Dated signal layer** — Filters, evidence modal and source links; every record is attributable to a publisher and a release date, refreshable via `POST /api/v1/signals/refresh`.
* **Scenario-aware matching** — 12 roles scored under three 2028 futures, with the exact skills gap, salary band, automation risk and the reasons behind every score.
* **Personalised pathway** — 27 catalogue modules sequenced into three phases with hours, cost, milestones and coverage; the model may reorder, hours and cost are recalculated.
* **SDG mapping** — All 17 goals with contribution scores, supporting roles, skills and dated evidence.
* **Server-side briefing** — Structured result streamed as SSE narrative tokens; keys and prompts never reach the browser.

### Tech Stack

|Layer|Technology|
|-|-|
|Frontend|HTML, CSS, native JavaScript (ES modules), hand-rolled SVG charts — no framework, no build step|
|Backend|Python 3.12, FastAPI, uvicorn, pydantic; `requirements.txt` also pins the transitive HTTP stack (anyio, certifi, h11, idna)|
|Database|SQLite (`data/app.db`)|
|AI / Compute|DeepSeek API through an OpenAI-compatible adapter (optional, server-side); deterministic fallback for matching/pathway; model required for briefing — no GPU workload|
|Hosting / Dev|Replit (run and deployment), Git / GitHub|

---

## Project Structure

```
.
├── docs/                    # Contract and integration kit
│   ├── API.md               # frontend↔backend contract, including SSE
│   ├── openapi.json         # machine-readable OpenAPI 3.1 spec
│   ├── BACKEND_INTEGRATION.md
│   └── backend-integration/ # reference API, 53-check smoke test, fixtures
├── src/
│   ├── main.py              # Application entry point (FastAPI: /api/v1 + static UI)
│   ├── utils.py             # Helper functions
│   ├── backend/
│   │   ├── engine.py        # matching / pathway / SDG / SSE orchestration
│   │   ├── data.py          # CSV snapshots → catalogue, signals, modules
│   │   ├── llm.py           # optional OpenAI-compatible model adapter
│   │   └── data/            # DOSM / MoHE labour snapshots and source URLs
│   └── frontend/            # build-free SPA: index.html, css/, js/, mock/
├── tools/                   # static server, headless screenshot runner
├── tests/                   # 20 unit and contract-integrity tests
├── submission/              # Required submission documents
│   ├── SDC2026_418-I-m-a-Teapot_TechDeclaration.pdf   # Technology declaration
│   ├── SDC2026_418 I'm a Teapot_Preliminary.pdf      # Preliminary submission
│   └── REPLIT PROOF OF USE.pdf                       # Replit proof of use
├── .env.example             # Example environment variables
├── .gitignore
├── .replit                  # Replit run configuration
├── LICENSE
├── requirements.txt         # Python dependencies
└── README.md
```

### Architecture

```
User ──► Replit (FastAPI · src/main.py) ──► SQLite profiles / CSV labour snapshots
                 │
                 ├──► DeepSeek API (optional, OpenAI-compatible model)
                 │
                 └──► Response returned to user (JSON or SSE)
```

---

## How to Run

### Option 1 — Run on Replit (Recommended)

1. Open the [Replit Project](https://replit.com/@CufoFlux/SDCHackathon418-I-m-a-TeapotSubmission), or import this repository via **Create Repl → Import from GitHub**.
2. Open the **Secrets** tab (🔒) and add the model variables used by the backend. Matching, pathway and SDG mapping work without a key; the AI briefing requires a key:

   * Required for model calls: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`
   * Optional tuning: `LLM_STRUCTURED_MODEL`, `LLM_TIMEOUT`, `LLM_TEMPERATURE`, `LLM_MAX_TOKENS`, `AI_SCORE_WEIGHT`
   * Optional switch: `LLM_ENABLED` (defaults to true)
3. Click **Run**. The **Start application** workflow in `.replit` runs `PORT=5000 python src/main.py`, serving the UI at `/` and the API at `/api/v1` from the same origin (port 5000 is mapped to external port 80 and opened in the webview).

### Option 2 — Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/Sleepy-Tianhao/SDC_Hackathon_418-I-m-a-Teapot_Submission.git
cd SDC_Hackathon_418-I-m-a-Teapot_Submission

# 2. Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables
cp .env.example .env            # then fill in your values

# 5. Run the app
python src/main.py
```

Open `http://127.0.0.1:8000/` — the entry point serves both the frontend and `/api/v1`. If that port is busy, set `PORT` (a real environment variable wins over the `PORT=8000` in `.env`): `PORT=8022 python src/main.py`.

### Run Tests

```bash
python -m unittest discover tests

# Optional: 53-check HTTP contract test, needs the API already running
python docs/backend-integration/smoke_test.py --base http://127.0.0.1:8000/api/v1
```

---

## How We Use Replit *(Required)*

* **Development:** The repository is imported into a Repl; the **Start application** workflow in `.replit` runs `PORT=5000 python src/main.py`, so frontend and API share one origin and no build step or second server is needed.
* **Hosting:** The app is published with Replit Deployments (autoscale); the deployment command is `python3 -m uvicorn src.main:app --host 0.0.0.0 --port 5000`, and port 5000 is mapped to external port 80.
* **Secrets:** `LLM_API_KEY`, `LLM_BASE_URL` and `LLM_MODEL` are supplied as Replit environment variables and never reach the browser; they belong in **Secrets**, not in the repository, because anything committed to `.replit` becomes public with the repo.
* **Storage:** Profiles live in SQLite at `data/app.db`, which is treated as disposable demo storage for the deployed Repl.

📄 Proof of use: [`submission/REPLIT PROOF OF USE.pdf`](<submission/REPLIT PROOF OF USE.pdf>)

## How We Use RunPod *(Required)*

* **Status:** Not used in this build. The repository contains no `runpod/` handler, no endpoint URL and no `RUNPOD_*` variable in code, `.env.example` or secrets.
* **Why:** Every workload here is CPU-only and small — CSV snapshots into weighted scoring into SQLite — while the only external inference is a text model called over HTTPS. A GPU endpoint would add cost and a failure mode without adding capability, so the model call stays a plain server-side HTTP request.
* **If RunPod is added later:** deploy `runpod/handler.py` as a serverless endpoint, record `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` in Replit Secrets, and point `src/backend/llm.py` at that endpoint; the Links table above then carries the endpoint URL.

📄 Proof of use: not applicable — no RunPod workload (add `submission/SDC2026_418-I-m-a-Teapot_RunPod_POU.pdf` if that changes).

---

## Challenges & Learnings

* **Evidence instead of a score.** A single fit number is not defensible, so the matcher is a weighted overlap with published weights and every result carries its gap, reasons and scenario delta; the model can adjust scores but only within bounds and only against known role ids.
* **A demo that cannot die.** The frontend keeps a complete offline transport and labels the fixture dataset, while matching and pathway fall back to the deterministic engine when the key is missing; the AI briefing returns a clear error instead of substituting fixed text.
* **Three futures, one contract.** Re-scoring the whole catalogue per scenario forced the scenario parameters out of the UI and into the backend, which is why the same profile, route and response shape can be replayed under all three futures.
* **An install we can defend.** The runtime path touches only FastAPI, uvicorn and pydantic — datasets are read with `csv`, profiles persist through `sqlite3`, and the model call uses `urllib` — while `requirements.txt` pins the transitive HTTP stack (anyio, certifi, h11, idna) so clean installs and dependency scans resolve the same patched versions.

## Future Improvements

* [ ] Replace self-rated skills with verified evidence (assessments, work samples)
* [ ] Scheduled ingestion with source monitoring instead of a manual refresh endpoint
* [ ] Employer-side view: post a role, see supply and gap forecasts
* [ ] Localisation for Malay, Mandarin and Tamil
* [ ] Persist and compare multiple profiles, plus authentication for programme planners

## Team

|Name|Role|GitHub|
|-|-|-|
|CHEN XIANGYU|Team Lead / Frontend|[@Sleepy-Tianhao](https://github.com/Sleepy-Tianhao)|
|ZI KUNLIN|Frontend|[@kunlinzi53-hue](https://github.com/kunlinzi53-hue)|
|ZHU BINSHA|Backend|[@zhubinsha58-ai](https://github.com/zhubinsha58-ai)|
|LI JIAYOU|Backend|[@lijiayou755-spec](https://github.com/lijiayou755-spec)|
|WANG HAOYUE|Research & Presentation|[@Anne-why](https://github.com/Anne-why)|

---

## Submission Checklist

* [x] Team name, domain (Domain 1 / Domain 2) and SDG track filled in
* [ ] Slide deck link added
* [ ] Demo video link added
* [x] Replit used, with proof of use in `submission/`
* [ ] RunPod used, with proof of use in `submission/`
* [x] Preliminary submission completed (`SDC2026_418 I'm a Teapot_Preliminary.pdf`)
* [x] Technology declaration completed (`SDC2026_418-I-m-a-Teapot_TechDeclaration.pdf`)
* [ ] Submission files renamed with your team name (replace `TeamName`) — the proof of use still needs the `SDC2026_418-I-m-a-Teapot_Replit_POU` name
* [x] "How to Run" steps verified
* [ ] No API keys or secrets committed to the repository — a provider key is currently stored in `.replit` and must move to Secrets (and be rotated)

## License

This project is licensed under the [Apache License 2.0](LICENSE).
