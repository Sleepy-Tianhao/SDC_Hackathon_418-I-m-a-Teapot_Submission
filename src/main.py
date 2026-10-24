"""FastAPI entry point for AI Career Navigator.

The API engine lives under src/backend. It reads the real labour datasets in
src/backend/data; it does not import the reference implementation under docs/.
"""

from __future__ import annotations

import asyncio
"""FastAPI entry point for AI Career Navigator.

The API engine lives under src/backend. It reads the real labour datasets in
src/backend/data; it does not import the reference implementation under docs/.
"""

from __future__ import annotations

import asyncio
import json
import mimetypes
import os
import sys
import mimetypes
import os
import sys
from pathlib import Path


from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.backend import engine  # noqa: E402
from src.backend import engine  # noqa: E402

FRONTEND = ROOT / "src" / "frontend"
LEGACY_FRONTEND = ROOT / "src" / "frontend_bak"
mimetypes.add_type("image/webp", ".webp")
FRONTEND = ROOT / "src" / "frontend"
LEGACY_FRONTEND = ROOT / "src" / "frontend_bak"
mimetypes.add_type("image/webp", ".webp")

app = FastAPI(title="AI Career Navigator API", version="1.0.0")
app = FastAPI(title="AI Career Navigator API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _error_response(error: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=getattr(error, "status", 500),
        content={
            "error": {
                "code": getattr(error, "code", "internal_error"),
                "message": getattr(error, "message", "Unexpected server error."),
                "details": getattr(error, "details", None),
            }
        },
    )


async def _read_body(request: Request) -> dict:
    if request.method not in ("POST", "PATCH"):
        return {}
    raw = await request.body()
    if not raw:
        return {}
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise engine.ApiError(400, "invalid_json", "Request body must be valid JSON.")
    if not isinstance(body, dict):
        raise engine.ApiError(400, "invalid_body", "Request body must be a JSON object.")
    return body


def _sse_frame(event: str, payload: dict) -> str:
    return "event: " + event + "\ndata: " + json.dumps(payload, ensure_ascii=False) + "\n\n"


def _stream_analysis(profile: dict, scenario_id: str, role_id: str | None) -> StreamingResponse:
    async def generate():
        scenario = engine.SCENARIOS.get(scenario_id) or engine.CATALOG["scenarios"][0]
        matches = engine.build_matches(profile, scenario["id"])
        pathway = engine.build_pathway(profile, matches, scenario["id"], role_id)
        analysis = engine.build_analysis(profile, matches, scenario, pathway)
        yield _sse_frame("meta", {"provider": analysis["provider"], "model": analysis["model"], "scenarioId": scenario["id"]})
        words = analysis["narrative"].split(" ")
        for index, word in enumerate(words):
            yield _sse_frame("token", {"text": word + (" " if index < len(words) - 1 else "")})
            await asyncio.sleep(0.015)
        yield _sse_frame("done", {"analysis": analysis})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.api_route("/api/v1/{path:path}", methods=["GET", "POST", "PATCH"])
async def api(path: str, request: Request):
    route_path = "/" + path if path else "/"
    query = {key: value for key, value in request.query_params.items()}
    try:
        body = await _read_body(request)
        result = engine.route(request.method, route_path, query, body)
        if isinstance(result, tuple) and result and result[0] == "stream":
            return _stream_analysis(result[1], result[2], result[3])
        status, payload = result
        return JSONResponse(status_code=status, content=payload)
    except engine.ApiError as error:
        return _error_response(error)
    except Exception as error:  # pragma: no cover - defensive
        return _error_response(error)


# The current Argon design is the default. The previous visual design is kept
# as a separate, self-contained site under /legacy/ so it can be compared and
# restored without touching this one.
if LEGACY_FRONTEND.is_dir():

    @app.get("/legacy", include_in_schema=False)
    def legacy_redirect():
        return RedirectResponse("/legacy/")

    @app.get("/legacy/", include_in_schema=False)
    def legacy_index():
        index = LEGACY_FRONTEND / "index.html"
        if not index.is_file():
            return RedirectResponse("/")
        page = index.read_text(encoding="utf-8")
        switch = """
<a href="/" style="position:fixed;right:18px;bottom:18px;z-index:2147483647;display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border-radius:999px;background:linear-gradient(135deg,#5e72e4,#825ee4);color:#fff;font:600 12px/1 'Segoe UI',sans-serif;text-decoration:none;box-shadow:0 12px 28px -10px rgba(94,114,228,.75)">Argon design</a>
"""
        if "</body>" in page:
            page = page.replace("</body>", switch + "</body>", 1)
        return HTMLResponse(page)

    app.mount("/legacy", StaticFiles(directory=str(LEGACY_FRONTEND), html=True), name="legacy")

app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("API_HOST", "127.0.0.1"),
        port=int(os.getenv("API_PORT", "8000")),
    )
