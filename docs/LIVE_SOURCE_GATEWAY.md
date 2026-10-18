# CAIL — opt-in production-source gateway contract (18 October 2026)

## What is implemented vs. what is not

**Implemented in source:** read-only HTTPS gateway clients for `asap`, `ems`,
`scf`, `guardian`, and `pathway`; independent operator-read authentication;
host allowlisting; fixed admin-configured endpoints; TLS certificate validation;
bearer credentials confined to the backend; redirect refusal; timeout and payload
limits; source/time identity validation; freshness enforcement; SHA-256 snapshot
fingerprints; explicit UNKNOWN when no observation exists; no command execution;
and a general-purpose local Qwen chat outside incident context.

**Not implemented / not claimed:** authentication to any real customer device,
direct native EMS collector/ASAP/SCF sessions, production command execution,
device-side attestation, enterprise SSO/RBAC, customer approvals, vendor-certified
versions, private network access, a resilient store/queue, HA failover, enterprise
audit retention, real incident outcomes, or production certification.

These integrations are READY TO CONFIGURE, not CONNECTED. Real live evidence
is only available after a licensed/authorized administrator deploys an
HTTPS read-only gateway that exports a snapshot using the contract below.
There is no generic documented, universal public REST API that allows us to
query every HPE NonStop installation without CAIL/customer provisioning.
Do not put live credentials, actual incident dumps or customer data in GitHub
or the publicly shared synthetic Funnel environment.

## Required gateway JSON shape (example with invented data)

```json
{
  "source_id": "ems",
  "system_id": "training-system",
  "observed_at": "2026-10-18T18:00:00Z",
  "health": "warning",
  "records": [
    {
      "id": "TRAINING-EMS-123",
      "timestamp": "2026-10-18T17:59:59Z",
      "severity": "warning",
      "message": "Illustrative event text",
      "component": "example"
    }
  ]
}
```

Allowed source IDs: ASAP, EMS, SCF, Guardian, and Pathway (lowercase in API).
Permitted record keys: `id`, `timestamp`, `severity`, `message`,
`name`, `value`, `unit`, `baseline`, `component`,
`event_code`, `state`. Additional keys are discarded, not trusted.
The snapshot must be less than 5 minutes old, not future-dated more than 60s,
at most 100 records and 512 KiB, served with
`Content-Type: application/json`, as HTTPS GET returning 200.
Health can be `ok`, `warning`, `critical`, `unknown`. It is
**UNKNOWN** if no records are present even when the gateway reports `ok`.
These colors reflect the *gateway's classification*, not CAIL's endorsement
or a verified HPE system condition.

A compliant gateway itself must obtain facts via customer-approved
read-only system facilities, avoid shell execution, restrict network access,
perform principal authentication and log access. This repository does not
implement the environment-specific native capture or the source-side gateway.

## Configure private local service

Copy `.env.example` to an untracked private `.env`, and configure:

```dotenv
CAIL_LIVE_ENABLED=true
CAIL_OPERATOR_READ_KEY=<strong-random-value-at-least-32-chars>
CAIL_LIVE_ALLOWED_HOSTS=readbridge.example.internal
CAIL_LIVE_EMS_URL=https://readbridge.example.internal/v1/ems/snapshot
CAIL_LIVE_EMS_TOKEN=<gateway-issued-read-only-token-at-least-24-chars>
```

For other integrations, use `CAIL_LIVE_ASAP_URL/TOKEN`,
`CAIL_LIVE_SCF_URL/TOKEN`, `CAIL_LIVE_GUARDIAN_URL/TOKEN`, or
`CAIL_LIVE_PATHWAY_URL/TOKEN`. Different per-source tokens are encouraged.
A gateway must not issue a token permitting POST, commands, administrative
operations or broad system access. TLS hostnames must be explicitly present
in `CAIL_LIVE_ALLOWED_HOSTS` (comma-separated exact hostnames).
No URLs or credentials can be selected by an operator prompt or the AI.

```powershell
docker compose up -d --build
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/integrations/capabilities'
$headers = @{ 'X-CAIL-Operator-Key' = $env:CAIL_OPERATOR_READ_KEY }
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/integrations/sources/ems' -Headers $headers
```

Set `$env:CAIL_OPERATOR_READ_KEY` in your PRIVATE shell; avoid pasting
actual tokens into chat, screenshots, terminal transcripts, or commands that
are recorded in shared history. The read endpoint has no public browser
credential workflow: it is intended for an authenticated back-office operator
client or server-to-server integration only.

The existing `/operations/.../sources/...` endpoints continue to return
**synthetic fixtures**, deliberately separated from `/integrations/sources`.
The public Tailscale Funnel Compose project explicitly does NOT pass live
credentials or enable these gateways. This prevents presenting live
customer source data as demo content.

## AI question scopes

`POST /api/v1/assistant/ask` with JSON
`{"question":"Explain database replication."}` sends a question to the
existing local Ollama model. Responses have scope
`general_knowledge_no_incident_evidence`, no citations, and no tool/command
authority. These answers can be useful but are unverified, may be wrong,
and must never be treated as authenticated incident evidence.

Existing ATM chat maintains synthetic source proof, review gates and explicit
command deny rules. The UI routes educational/non-operational questions to
the general model and keeps operational questions on the guarded ATM workflow.
Because intent classification is heuristic and a model is fallible, an
incident-critical operator must use the evidence/approved procedure paths.

## Production acceptance gate (not yet met)

Before use with live customer systems: written HPE/customer authorization;
approved collector mechanism and version; scoped read-only service identity;
review of system-side gateway; enterprise authentication and role separation;
TLS trust/mTLS where required; data classification and retention; PII/secrets
redaction; audit backend/central monitoring; security and penetration test;
SLO/error budget; deployment rollback; live integration tests in a controlled
nonproduction environment; operator sign-off and runbook attribution.

There is **no** native restart/purge execution route and no plan to grant
a language model direct arbitrary command execution. Operator changes require
a separate customer-approved change-management design.
