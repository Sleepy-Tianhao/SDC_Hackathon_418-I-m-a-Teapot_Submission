# Backend integration kit

This directory is the contract and verification kit for the FastAPI backend. The production
service is now self-contained under `src/backend/`; the old `reference_api.py` is kept only as a
small legacy contract reference and is **not imported by the runtime backend**.

| File | Purpose |
| ---- | ------- |
| `smoke_test.py` | 53-check contract test; run it against the FastAPI backend |
| `reference_api.py` | Legacy standard-library contract reference; not runtime code |
| `export_fixtures.py` | Captures response examples for shape comparison |
| `fixtures/` | Legacy captured responses; compare field names, not current data |

## Current runtime

~~~text
src/main.py                         FastAPI entry: /api/v1, static UI, CORS, SSE
  └── src/backend/engine.py         deterministic core + LLM-assisted matching/pathway/briefing
        ├── src/backend/llm.py      optional OpenAI-compatible external model
        ├── src/backend/data.py     builds catalogue/signals/modules from real CSVs
        └── src/backend/data/       labour snapshots and source URL metadata
              └── data/app.db       created on first profile write
~~~

Start the real backend:

~~~bash
pip install -r requirements.txt
python src/main.py
# UI:  http://127.0.0.1:8000/
# API: http://127.0.0.1:8000/api/v1/health
~~~

If port 8000 is occupied, set `API_PORT`:

~~~powershell
$env:API_PORT="8022"
python src/main.py
~~~

The FastAPI entry serves `src/frontend` at `/` and the API at `/api/v1` on the same origin,
so the UI does not need a separate CORS configuration or a second static server.

The optional external model is configured server-side with `LLM_BASE_URL`, `LLM_API_KEY`,
`LLM_MODEL` and `LLM_ENABLED`. When enabled it participates in match re-ranking and score
adjustment, pathway role/module ordering, and the briefing. If the key is absent, the provider
fails or its response is invalid, the deterministic engine handles the request unchanged.

## Contract test

~~~bash
python docs/backend-integration/smoke_test.py --base http://127.0.0.1:8000/api/v1
~~~

The test covers health/metadata, catalogue, signals, profile CRUD, matching, pathway, SDG
mapping, narrative SSE and the error envelope. It should finish with:

~~~text
All 53 checks passed.
~~~

## Endpoint implementation

| Endpoint | Implementation |
| -------- | -------------- |
| `GET /health` | `src/backend/engine.py` → inline payload |
| `GET /meta` | `meta_payload()` |
| `GET /catalog` | `CATALOG` built by `src/backend/data.py` |
| `GET /scenarios` | `CATALOG["scenarios"]` |
| `GET /signals` | `list_signals()` over real source rows |
| `POST /signals/refresh` | `route()` updates the refresh timestamp |
| `POST /profiles` | `normalise_profile()` + `db_save()` |
| `GET/PATCH /profiles/{id}` | `db_get()` / `db_save()` |
| `POST /profiles/{id}/match` | `build_matches()` → `score_role()` + optional LLM re-ranking |
| `POST /profiles/{id}/pathway` | `build_pathway()` + optional LLM role/module ordering |
| `GET /profiles/{id}/sdg-map` | `build_sdg_map()` |
| `POST /analysis` | `build_analysis()` + optional LLM narrative |
| `GET /analysis/stream` | SSE adapter in `src/main.py`; LLM-assisted analysis when configured |

## Data and fixtures

The runtime data is not the frontend mock set. It comes from:

~~~text
src/backend/data/
  01_national_annual_series.csv
  02_salary_by_qualification_skill_gender_location.csv
  03_industry_distribution.csv
  04_salary_by_state.csv
  05_mohe_employment_rate.csv
  06_global_annual_series.csv
  07_global_salary_employment_detail.csv
  08_source_urls.csv
  malaysia_graduate_labour_market.xlsx
~~~

`data.py` loads the salary/employment/source tables and builds the role/skill/scenario
catalogue. Role archetypes, the skill taxonomy and scenario assumptions are explicit product
definitions on top of the real tables; they are not random fixtures.

The fixtures in `fixtures/` were captured from the legacy reference implementation and its
illustrative mock catalogue. They are useful for field-name comparison only. To inspect current
shapes, run the FastAPI backend and use `export_fixtures.py` against its `/api/v1` URL.

## Legacy reference

`reference_api.py` remains useful for a quick no-install contract replay, but it must not be
used as the production service and must not be imported by `src/main.py`. The runtime backend
lives entirely under `src/backend/`.
