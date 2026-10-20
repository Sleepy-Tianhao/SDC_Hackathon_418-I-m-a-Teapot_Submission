# Backend integration kit

Reference material for the FastAPI owner. Everything here runs on the Python standard library,
so you can verify the frontend integration before writing a single route.

| File | Purpose |
| ---- | ------- |
| `reference_api.py` | Complete implementation of `docs/API.md`: static UI, profiles in SQLite, deterministic matching, pathway assembly, SDG map, SSE narrative |
| `smoke_test.py` | 53-check contract test; run it against any backend |
| `export_fixtures.py` | Captures example responses into `fixtures/` |
| `fixtures/` | Real responses from the reference implementation, for shape comparison |

## Run it

~~~bash
python docs/backend-integration/reference_api.py --port 8000
# UI:  http://127.0.0.1:8000/
# API: http://127.0.0.1:8000/api/v1/health
# DB:  data/reference.db (created on first run)
~~~

Then:

~~~bash
python docs/backend-integration/smoke_test.py --base http://127.0.0.1:8000/api/v1
python docs/backend-integration/export_fixtures.py --base http://127.0.0.1:8000/api/v1
~~~

The reference API serves the real frontend from `src/frontend`. Open the UI and the sidebar
should read **Live API connected**.

## Where each endpoint lives

| Endpoint | Function |
| -------- | -------- |
| `GET /health` | `route()` → inline payload |
| `GET /meta` | `meta_payload()` |
| `GET /catalog` | `route()` → loads `mock/catalog.json` |
| `GET /signals` | `list_signals()` |
| `POST /signals/refresh` | `route()` → updates `LAST_REFRESHED` |
| `POST /profiles` | `normalise_profile()` + `db_save()` |
| `GET/PATCH /profiles/{id}` | `db_get()` / `db_save()` |
| `POST /profiles/{id}/match` | `build_matches()` → `score_role()` |
| `POST /profiles/{id}/pathway` | `build_pathway()` → `pick_module()` |
| `GET /profiles/{id}/sdg-map` | `build_sdg_map()` |
| `POST /analysis` | `build_analysis()` |
| `GET /analysis/stream` | `Handler.stream_analysis()` |

## Porting to FastAPI

The reference is deliberately plain, so the move is mechanical:

1. Replace `Handler.dispatch` with `APIRouter` route decorators; keep the same payloads.
2. Replace `db_*` helpers with your repository layer (SQLAlchemy or raw sqlite3).
3. Replace `build_analysis` with a provider client that streams tokens, and keep the SSE frame
   format from `Handler.stream_analysis`.
4. Serve `src/frontend` with `StaticFiles(directory=..., html=True)` **after** mounting the API
   router, as shown in [`docs/BACKEND_INTEGRATION.md`](../BACKEND_INTEGRATION.md#5-option-a--fastapi-serves-the-ui-recommended).

Keep the deterministic scoring in Python rather than delegating it to the LLM: the demo needs
reproducible numbers and an audit trail.

## About the dataset and fixtures

`src/frontend/mock/*.json` is an **illustrative** dataset built for the pitch: 23 skills, 12
future roles, 3 scenarios, 20 dated signals and 37 learning modules. Sources, publishers and
dates are realistic so the evidence layer can be demonstrated, but the figures are modelled,
not official statistics. Replace the JSON with your ingestion output (same shapes) and every
screen updates without a frontend change. `fixtures/` contains responses captured from this
dataset — use them to compare field names, not as current data.
