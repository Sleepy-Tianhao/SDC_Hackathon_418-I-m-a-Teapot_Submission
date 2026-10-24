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
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.backend import engine  # noqa: E402

FRONTEND = ROOT / "src" / "frontend"
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
        raise engine.ApiError(400, "invalid_json", "Request body must be valid JSON.")
    if not isinstance(body, dict):
        raise engine.ApiError(400, "invalid_body", "Request body must be a JSON object.")
    return body


def _sse_frame(event: str, payload: dict) -> str:
    return "event: " + event + "\ndata: " + json.dumps(payload, ensure_ascii=False) + "\n\n"


def _stream_analysis(profile: dict, scenario_id: str, role_id: str | None) -> StreamingResponse:
    async def generate():
        scenario = engine.SCENARIOS.get(scenario_id) or engine.CATALOG["scenarios"][0]
        info = engine.llm.provider_info()
        # Open the stream before the model call. A cold container or a slow provider
        # must not look like a dead connection to the browser or to a proxy.
        yield _sse_frame(
            "meta",
            {"provider": info["provider"], "model": info["model"], "scenarioId": scenario["id"], "pending": True},
        )

        def compute() -> dict:
            matches = engine.build_matches(profile, scenario["id"])
            pathway = engine.build_pathway(profile, matches, scenario["id"], role_id)
            return engine.build_analysis(profile, matches, scenario, pathway)

        # The engine and the provider client are blocking; run them off the event loop
        # so health checks and other requests stay responsive while the model thinks.
        task = asyncio.create_task(asyncio.to_thread(compute))
        try:
            while True:
                try:
                    analysis = await asyncio.wait_for(asyncio.shield(task), timeout=10)
                    break
                except asyncio.TimeoutError:
                    # SSE comment lines are ignored by EventSource but keep idle
                    # connections (Replit/Cloud Run proxies) from being closed.
                    yield ": keep-alive\n\n"
        except Exception:
            task.cancel()
            yield _sse_frame("error", {"message": "The analysis could not be generated."})
            return

        words = analysis["narrative"].split(" ")
        for index, word in enumerate(words):
            yield _sse_frame("token", {"text": word + (" " if index < len(words) - 1 else "")})
            await asyncio.sleep(0.015)
        yield _sse_frame("done", {"analysis": analysis})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
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


# The classic frontend is the only frontend again; it is served at /.
app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    # Replit passes PORT and expects the app to bind on all interfaces.
    # Local development keeps HOST/API_PORT as fallbacks.
    uvicorn.run(
        app,
        host=os.getenv("HOST") or os.getenv("API_HOST") or "0.0.0.0",
        port=int(os.getenv("PORT") or os.getenv("API_PORT") or "8000"),
    )
