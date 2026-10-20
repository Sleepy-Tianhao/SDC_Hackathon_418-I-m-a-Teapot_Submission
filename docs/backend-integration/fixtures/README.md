# Example responses

Captured from `reference_api.py` with the sample profile (Aisha Rahman, baseline scenario) so
the backend team can diff their own output field by field.

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

Ids and timestamps differ on every run; compare structure and field names.
Regenerate with:

~~~bash
python docs/backend-integration/export_fixtures.py --base http://127.0.0.1:8000/api/v1
~~~
