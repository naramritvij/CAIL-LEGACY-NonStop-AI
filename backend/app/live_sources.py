"""Opt-in, read-only HTTPS evidence gateway for CAIL (NOT a native HPE client).

A CAIL/customer-operated gateway must expose a narrowly scoped JSON snapshot
from an independently licensed/authorized ASAP, EMS, SCF, Guardian or Pathway
collector. This code never starts a terminal session or executes commands.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import ssl
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener

from fastapi import HTTPException

LOGGER = logging.getLogger("cail.live_sources")
SOURCE_IDS = ("asap", "ems", "scf", "guardian", "pathway")
MAX_BYTES = 512 * 1024
MAX_RECORDS = 100
MAX_AGE_SECONDS = 300


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def _enabled() -> bool:
    return os.getenv("CAIL_LIVE_ENABLED", "").lower() == "true"


def _config(tool: str) -> tuple[str, str]:
    if tool not in SOURCE_IDS:
        raise HTTPException(404, "Unrecognized evidence source")
    if not _enabled():
        raise HTTPException(503, "Live evidence gateway is disabled")
    url = os.getenv(f"CAIL_LIVE_{tool.upper()}_URL", "").strip()
    token = os.getenv(f"CAIL_LIVE_{tool.upper()}_TOKEN", "").strip()
    hosts = {h.strip().lower() for h in os.getenv("CAIL_LIVE_ALLOWED_HOSTS", "").split(",") if h.strip()}
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or not parsed.hostname or
            parsed.username or parsed.password or parsed.fragment or
            parsed.hostname.lower() not in hosts or not token or len(token) < 24):
        raise HTTPException(503, "Live source is not securely configured")
    return url, token


def require_operator(provided: str | None) -> None:
    """Separate least-privilege read credential: never use demo knowledge keys."""
    expected = os.getenv("CAIL_OPERATOR_READ_KEY", "")
    if len(expected) < 32 or not provided or not hmac.compare_digest(expected, provided):
        raise HTTPException(403, "Operator read access denied")


def capabilities() -> dict:
    """Metadata only; NEVER return gateway URLs, hostnames or credentials."""
    hosts = {h.strip().lower() for h in os.getenv("CAIL_LIVE_ALLOWED_HOSTS", "").split(",") if h.strip()}
    configured = []
    for tool in SOURCE_IDS:
        endpoint = os.getenv(f"CAIL_LIVE_{tool.upper()}_URL", "").strip()
        parsed = urlsplit(endpoint)
        valid = bool(
            _enabled() and parsed.scheme == "https" and parsed.hostname and
            parsed.hostname.lower() in hosts and not parsed.username and
            not parsed.password and not parsed.fragment and
            len(os.getenv(f"CAIL_LIVE_{tool.upper()}_TOKEN", "")) >= 24
        )
        configured.append({"tool_id": tool, "configured": valid,
                           "connected": None, "mode": "on_demand_read_only_https_gateway",
                           "execution_allowed": False})
    return {"mode": "opt_in_live_read_gateway" if _enabled() else "disabled",
            "operator_auth_configured": len(os.getenv("CAIL_OPERATOR_READ_KEY", "")) >= 32,
            "sources": configured, "connectivity_checked": False,
            "native_hpe_api_certified": False, "execution_allowed": False}


def _timestamp(value: object) -> datetime:
    if not isinstance(value, str) or len(value) > 48:
        raise ValueError("Missing or invalid source timestamp")
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("Source timestamp must be timezone-aware")
    return result.astimezone(timezone.utc)


def _record(raw: object) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("Malformed evidence record")
    # Forward only documented fields; never forward gateway metadata or secrets.
    permitted = ("id", "timestamp", "severity", "message", "name", "value", "unit",
                 "baseline", "component", "event_code", "state")
    item = {}
    for key in permitted:
        value = raw.get(key)
        if value is None:
            continue
        if not isinstance(value, (str, int, float, bool)):
            raise ValueError("Malformed evidence field")
        if isinstance(value, str) and len(value) > 1000:
            raise ValueError("Oversized evidence field")
        item[key] = value
    if not item.get("id") or not isinstance(item["id"], str) or len(item["id"]) > 120:
        raise ValueError("Evidence record needs a bounded source ID")
    return item


def read_source(tool: str) -> dict:
    """A single GET to a fixed, explicitly allowlisted HTTPS endpoint."""
    url, token = _config(tool)
    request = Request(url, headers={"Authorization": "Bearer " + token,
                                    "Accept": "application/json",
                                    "User-Agent": "CAIL-read-only-evidence/1"},
                      method="GET")
    try:
        opener = build_opener(_NoRedirect(), HTTPSHandler(context=ssl.create_default_context()))
        with opener.open(request, timeout=6) as response:
            if response.status != 200:
                raise ValueError("Gateway did not return HTTP 200")
            if "application/json" not in response.headers.get("Content-Type", ""):
                raise ValueError("Unexpected gateway content type")
            raw = response.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ValueError("Evidence gateway response exceeds limit")
        payload = json.loads(raw)
        if not isinstance(payload, dict) or payload.get("source_id") != tool:
            raise ValueError("Unexpected source identity")
        system_id = payload.get("system_id")
        if not isinstance(system_id, str) or not (1 <= len(system_id) <= 120):
            raise ValueError("Missing system identity")
        observed = _timestamp(payload.get("observed_at"))
        age = (datetime.now(timezone.utc) - observed).total_seconds()
        if age < -60 or age > MAX_AGE_SECONDS:
            raise ValueError("Stale or future-dated source snapshot")
        records = payload.get("records")
        if not isinstance(records, list) or len(records) > MAX_RECORDS:
            raise ValueError("Malformed or oversized evidence collection")
        evidence = [_record(item) for item in records]
        health = payload.get("health")
        # GREEN is never inferred from missing alarms, empty records or a successful HTTP GET.
        health_map = {"ok": "green", "warning": "yellow", "critical": "red"}
        signal = health_map.get(health, "unknown") if evidence else "unknown"
        digest = hashlib.sha256(raw).hexdigest()
        LOGGER.info("source_snapshot tool=%s digest=%s count=%d", tool, digest[:16], len(evidence))
        return {
            "tool_id": tool, "system_id": system_id,
            "connected": True, "synthetic": False,
            "mode": "read_only_gateway_snapshot",
            "provenance": "configured_https_gateway_not_native_device_attestation",
            "observed_at": observed.isoformat(), "age_seconds": round(age, 1),
            "snapshot_sha256": digest, "health_signal": signal,
            "evidence": evidence, "execution_allowed": False,
            "state_change_executed": False,
            "limitations": "Gateway identity and timestamp validated; source authenticity, release compatibility and individual claims require independent operator verification.",
        }
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, TypeError,
            json.JSONDecodeError, OverflowError) as exc:
        LOGGER.warning("source_gateway_unavailable tool=%s error_type=%s", tool, type(exc).__name__)
        raise HTTPException(502, "Live evidence unavailable or invalid; status UNKNOWN. No synthetic fallback.") from exc
