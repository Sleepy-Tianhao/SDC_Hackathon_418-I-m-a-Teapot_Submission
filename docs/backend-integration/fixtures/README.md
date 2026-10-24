# Example responses (legacy fixture set)

These JSON files were captured from the legacy reference implementation and its illustrative
mock catalogue, using the sample profile. They are **shape references only**; the current
self-contained FastAPI backend reads real labour tables from `src/backend/data/` and produces
different values. When the optional external model is enabled, current responses may additionally
contain `llm` metadata and model-adjusted scores or ordering; those fields are additive.

| File | Endpoint |
| ---- | -------- |
| `health.json` | `GET /health` |
| `meta.json` | `GET /meta` |
| `signals.json` | `GET /signals?limit=3&sort=impact` |
| `profile.json` | `POST /profiles` (201) |
| `match.json` | `POST /profiles/{id}/match` |
| `pathway.json` | `POST /profiles/{id}/pathway` |
| `sdg-map.json` | `GET /profiles/{id}/sdg-map` |
| `analysis.json` | `POST /analysis` |
| `error-404.json` | `GET /profiles/{id}` with an unknown id |

Use them to compare field names and nesting, not as current live data. To capture examples from
the current backend, start `python src/main.py` and run:

~~~bash
python docs/backend-integration/export_fixtures.py --base http://127.0.0.1:8000/api/v1
~~~

Ids and timestamps differ on every run.
