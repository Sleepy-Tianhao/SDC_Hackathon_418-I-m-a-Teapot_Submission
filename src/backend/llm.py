"""Server-side, OpenAI-compatible model adapter.

The adapter is intentionally optional: when no API key is configured the
deterministic engine remains fully functional.  Keys and prompts never leave
the server.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / ".env"


def _load_env_file() -> None:
    """Small stdlib .env loader; real environment variables always win."""
    if not ENV_FILE.is_file():
        return
    try:
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)
    except OSError:
        pass


_load_env_file()


class LLMError(RuntimeError):
    """Raised when the configured provider cannot return a usable answer."""


def _enabled_flag() -> bool:
    return os.getenv("LLM_ENABLED", "true").strip().lower() not in ("0", "false", "no", "off")


def _api_key() -> str:
    return (os.getenv("LLM_API_KEY") or os.getenv("DEEPSEEK_API_KEY") or "").strip()


def _base_url() -> str:
    return (
        os.getenv("LLM_BASE_URL")
        or os.getenv("DEEPSEEK_BASE_URL")
        or "https://api.deepseek.com"
    ).strip()


def _model() -> str:
    return (os.getenv("LLM_MODEL") or "deepseek-chat").strip()


def _structured_model() -> str:
    """Use a fast non-reasoning model for strict JSON when one is available."""
    override = (os.getenv("LLM_STRUCTURED_MODEL") or "").strip()
    if override:
        return override
    configured = _model()
    if "flash" in configured.lower():
        return "deepseek-chat"
    return configured


def _timeout() -> float:
    try:
        return max(2.0, float(os.getenv("LLM_TIMEOUT_SECONDS") or os.getenv("LLM_TIMEOUT") or "120"))
    except ValueError:
        return 120.0


def is_configured() -> bool:
    return _enabled_flag() and bool(_api_key())


def provider_info() -> dict:
    """Safe public metadata: never include the key or full private URL."""
    base = _base_url()
    try:
        host = urllib.parse.urlparse(base).hostname or ""
    except Exception:
        host = ""
    return {
        "provider": "openai-compatible",
        "model": _model(),
        "structuredModel": _structured_model(),
        "configured": is_configured(),
        "host": host,
        "enabled": _enabled_flag(),
    }


def _endpoint() -> str:
    base = _base_url().rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return base + "/chat/completions"
    return base + "/chat/completions"


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    fence = chr(96) * 3
    if text.startswith(fence):
        text = re.sub(r"^" + fence + r"(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*" + fence + r"$", "", text)
    return text.strip()


def extract_json(text: str) -> dict:
    """Parse a JSON object from a provider response, tolerating fences/prose."""
    cleaned = _strip_code_fence(text or "")
    try:
        value = json.loads(cleaned)
        if isinstance(value, dict):
            return value
    except json.JSONDecodeError:
        pass
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        try:
            value = json.loads(cleaned[start : end + 1])
            if isinstance(value, dict):
                return value
        except json.JSONDecodeError:
            pass
    raise LLMError("The model response did not contain a JSON object.")


def _request(
    messages: list[dict], *, temperature: float, max_tokens: int, json_mode: bool = False, model: str | None = None
) -> str:
    if not is_configured():
        raise LLMError("No external model is configured.")

    budget = max(1, int(max_tokens))
    last_error = "The provider returned an empty answer."
    for attempt in range(3):
        payload = {
            "model": model or _model(),
            "messages": messages,
            "temperature": temperature,
            "max_tokens": budget,
            "stream": False,
        }
        # JSON mode makes structured calls complete instead of drifting into
        # an unbounded reasoning block on deepseek-flash.
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            _endpoint(),
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + _api_key(),
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=_timeout()) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as error:
            detail = ""
            try:
                detail = error.read().decode("utf-8", errors="replace")[:400]
            except Exception:
                pass
            raise LLMError(f"Provider returned HTTP {error.code}: {detail}") from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise LLMError("Could not reach the model provider: " + str(error)) from error

        try:
            response_payload = json.loads(raw)
            choice = response_payload["choices"][0]
            content = choice["message"]["content"]
        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as error:
            raise LLMError("The provider returned an unexpected response shape.") from error

        finish_reason = choice.get("finish_reason") if isinstance(choice, dict) else None
        if isinstance(content, str) and content.strip() and finish_reason != "length":
            return content.strip()
        if finish_reason != "length":
            raise LLMError("The provider returned an empty answer.")

        # A reasoning model can spend the whole completion budget on
        # reasoning_content. Move up to the provider's output ceiling and
        # only return content once the response is actually complete.
        last_error = "The model used its output budget on reasoning; retrying with more output tokens."
        next_budget = min(max(budget * 2, 4000), 8000)
        if next_budget <= budget:
            break
        budget = next_budget
    raise LLMError(last_error)

def generate_json(system: str, user: str, *, max_tokens: int = 900, temperature: float = 0.15) -> dict:
    # Structured calls need headroom for reasoning tokens on models such as
    # deepseek-flash; the cap is a ceiling, not a fixed spend.
    content = _request(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max(8000, int(max_tokens)),
        json_mode=True,
        model=_structured_model(),
    )
    return extract_json(content)


def generate_text(system: str, user: str, *, max_tokens: int = 900, temperature: float = 0.35) -> str:
    return _request(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
    )
