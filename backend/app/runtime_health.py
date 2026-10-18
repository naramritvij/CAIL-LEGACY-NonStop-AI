"""Fresh, bounded checks of the actual CAIL local runtime (NOT a NonStop health probe)."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

MAX_RESPONSE_BYTES = 65536


def runtime_health() -> dict:
    """Check this backend process and Ollama on every request; never infer HPE health."""
    now = datetime.now(timezone.utc).isoformat()
    model = os.getenv("OLLAMA_MODEL", "qwen3:4b-instruct")
    base = os.getenv("OLLAMA_URL", "http://host.docker.internal:11434").rstrip("/")
    ollama = {
        "status": "unknown", "model": model, "model_installed": None,
        "checked_at": now, "method": "fresh_http_get_api_tags",
    }
    try:
        parsed = urlsplit(base)
        # Configuration is server-controlled, not supplied by the browser.
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Invalid Ollama endpoint configuration")
        request = Request(base + "/api/tags", headers={"Accept": "application/json"}, method="GET")
        with urlopen(request, timeout=3) as response:
            if response.status != 200 or "application/json" not in response.headers.get("Content-Type", ""):
                raise ValueError("Unexpected Ollama response")
            payload = response.read(MAX_RESPONSE_BYTES + 1)
            if len(payload) > MAX_RESPONSE_BYTES:
                raise ValueError("Ollama model list too large")
        data = json.loads(payload)
        models = data.get("models") if isinstance(data, dict) else None
        if not isinstance(models, list):
            raise ValueError("Invalid Ollama model inventory")
        names = {
            item.get("name") for item in models
            if isinstance(item, dict) and isinstance(item.get("name"), str)
        }
        installed = model in names
        ollama["status"] = "reachable"
        ollama["model_installed"] = installed
    except (HTTPError, URLError, OSError, TimeoutError, ValueError, TypeError, json.JSONDecodeError):
        ollama["status"] = "unavailable"
    return {
        "scope": "cail_local_runtime_only",
        "checked_at": now,
        "backend": {
            "status": "responding", "checked_at": now,
            "method": "active_fastapi_request",
        },
        "ollama": ollama,
        "overall_status": "available" if ollama["status"] == "reachable" and ollama["model_installed"] is True else "degraded",
        "hpe_nonstop_health": "unknown",
        "live_hpe_queried": False,
        "execution_allowed": False,
        "state_change_executed": False,
        "limitations": "The backend and local Ollama service were checked now. This is not a Qwen inference test, customer uptime/HA proof, or a check of any HPE NonStop subsystem.",
    }
