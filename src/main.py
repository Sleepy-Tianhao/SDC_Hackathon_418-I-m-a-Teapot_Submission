"""FastAPI entry point for AI Career Navigator.

This module adapts the contract-complete reference implementation in
docs/backend-integration/reference_api.py to FastAPI. It serves both the
frontend and /api/v1 on the same origin, which avoids CORS and keeps the
frontend's default apiBaseUrl (/api/v1) working without configuration.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import mimetypes
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
REFERENCE_PATH = ROOT / "docs" / "backend-integration" / "reference_api.py"
FRONTEND = ROOT / "src" / "frontend"
API_PREFIX = "/api/v1"


def _load_reference():
    spec = importlib.util.spec_from_file_location("aicn_reference_api", REFERENCE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load the API reference implementation: " + str(REFERENCE_PATH))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


reference = _load_reference()

mimetypes.add_type("image/webp", ".webp")
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
        raise reference.ApiError(400, "invalid_json", "Request body must be valid JSON.")
    if not isinstance(body, dict):
        raise reference.ApiError(400, "invalid_body", "Request body must be a JSON object.")
    return body


def _sse_frame(event: str, payload: dict) -> str:
    return "event: " + event + "\ndata: " + json.dumps(payload, ensure_ascii=False) + "\n\n"


def _stream_analysis(profile: dict, scenario_id: str, role_id: str | None) -> StreamingResponse:
    async def generate():
        scenario = reference.SCENARIOS.get(scenario_id) or reference.CATALOG["scenarios"][0]
        matches = reference.build_matches(profile, scenario["id"])
        pathway = reference.build_pathway(profile, matches, scenario["id"], role_id)
        analysis = reference.build_analysis(profile, matches, scenario, pathway)

        yield _sse_frame("meta", {"provider": analysis["provider"], "model": analysis["model"], "scenarioId": scenario["id"]})
        words = analysis["narrative"].split(" ")
        for index, word in enumerate(words):
            text = word + (" " if index < len(words) - 1 else "")
            yield _sse_frame("token", {"text": text})
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
        result = reference.route(request.method, route_path, query, body)
        if isinstance(result, tuple) and result and result[0] == "stream":
            return _stream_analysis(result[1], result[2], result[3])
        status, payload = result
        return JSONResponse(status_code=status, content=payload)
    except reference.ApiError as error:
        return _error_response(error)
    except Exception as error:  # pragma: no cover - defensive
        return _error_response(error)


# The static mount must come after the API route. The frontend uses hash routing,
# so a normal static file server is enough for all of its screens.
app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("API_HOST", "127.0.0.1"),
        port=int(os.getenv("API_PORT", "8000")),
    )
