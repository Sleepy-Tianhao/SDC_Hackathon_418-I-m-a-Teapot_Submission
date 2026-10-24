# Running on Replit

This imported project keeps its original Python/FastAPI backend, build-free
JavaScript frontend, and SQLite storage. No frontend build step is needed.

- Click **Run** to start the `Start application` workflow.
- Run command: `PORT=5000 python src/main.py`.
- The server binds to `0.0.0.0:5000` and serves both the frontend at `/` and
  the API at `/api/v1` from the same origin.
- Python 3.12 dependencies are declared in `requirements.txt`.
- Publishing uses `python3 -m uvicorn src.main:app --host 0.0.0.0 --port 5000`
  so the production server matches the configured external port.
- Runtime profiles are stored in `data/app.db` (git-ignored); source datasets
  remain in `src/backend/data/`.

## Optional external AI

No secrets or external services are needed for the existing deterministic
matching, pathways, or narrative engine. For external model features, configure
`LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` using Replit Secrets; see
`.env.example`. Never place credentials in frontend files or commit them.

## Checks

```sh
python -m unittest discover tests
python docs/backend-integration/smoke_test.py --base "https://$REPLIT_DEV_DOMAIN/api/v1"
```

The API smoke test creates sample profiles in the development SQLite database.
