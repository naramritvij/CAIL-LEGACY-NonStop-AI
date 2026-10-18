# CAIL/Nonstop AI Operations Assistant — Operator Command Center

## Update — actual local health checks and HPE reference commands (18 October 2026)

The Home page **CHECK HEALTH** control now performs fresh local read-only checks:
- CAIL backend responds to the active API request.
- The backend queries the configured local Ollama `GET /api/tags` endpoint with a 3-second timeout and verifies that the requested model appears in the returned inventory.
- A response from Ollama is **not** proof that inference, model quality, application availability, or any HPE NonStop service is healthy.
- The selected incident's colored signal remains separate and is explicitly labelled **synthetic**. Native HPE health is **UNKNOWN** until the authorized operator configures and verifies a live evidence gateway.

`GET /api/v1/operations/runtime-health` returns fresh local backend/Ollama observations. Existing `POST /api/v1/operations/commands/preview` for `check_health` includes both the runtime observations and the synthetic incident signal as separate fields.

The command center now lists the incident-matched **HPE read-only syntax references** from `backend/app/command_playbook.py`:
- Synthetic disk incident: `STATUS DISK $DATA03` (object name is fictional and must be verified before real use).
- Synthetic Pathway incident: `STATUS PATHWAY` and `STATUS SERVER <serverclass>, DETAIL` (serverclass unknown).

Each shows its purpose, fields to inspect, prerequisites, UNKNOWN actual status, and an HPE documentation link. Clicking **Show usage and availability** does **not** execute a command or simulate a successful native response. There is no TACL, SCF or PATHCOM terminal API. `SHOW SCF REFERENCE` is only displayed for the disk incident, never indiscriminately for Pathway.

The other five legacy interface actions show local synthetic source projections; they remain interface intents, not source-native HPE commands. For real HPE health, the sanctioned HTTPS source gateway remains separately authenticated, opt-in, and requires customer access. Never put HPE credentials in the browser.

Manual quick check:

```powershell
Invoke-RestMethod "http://localhost:8000/api/v1/operations/runtime-health" | Format-List
Invoke-RestMethod "http://localhost:8000/api/v1/operations/incidents/INC-DISK-001/commands" | ConvertTo-Json -Depth 7
Invoke-RestMethod "http://localhost:8000/api/v1/operations/incidents/INC-PATH-002/commands" | ConvertTo-Json -Depth 7
```


This milestone adds a source-aware operator experience WITHOUT claiming a live HPE NonStop connection.

## Delivered components

- Colored red/yellow/green health tiles on explicitly synthetic scenario evidence. The green card is a purpose-built normal baseline; it is not absence of alerts. **Missing or stale real data must always be UNKNOWN.**
- ASAP / EMS / SCF source drilldowns with registered documentation pointers and original fixture provenance. The existing scenario fixtures are NOT official ASAP, EMS, or SCF output.
- Local UI command vocabulary: CHECK HEALTH, SHOW ALERTS, OPEN ASAP SOURCE, OPEN EMS SOURCE, OPEN SCF SOURCE, SHOW SCF REFERENCE. These are safe interface intents, **not** TACL or SCF execution.
- The SCF syntax example STATUS SUBSYS $ZZKRN is a display-only L-Series kernel documentation reference. No command is executed; actual release and privileges have not been verified.
- Qwen3's existing grounded investigation can cite source-projected *synthetic ASAP metrics* by identifier. The model never performs tool calls or authorizes actions. Its citation checks are structural only, not proof of entailment.
- Text-only transcript ingestion, permission confirmation, explicit redaction confirmation, isolated draft status, separate reviewer approval, SHA-256 chunk identifiers, exact release filter and existing search. No bulk downloads, audio transcription, or unapproved document retrieval.
- Canonical read API uses Knowledge Tree, preserving old path/response aliases until the UI migration is complete.

## Available API contracts

- GET /api/v1/operations/overview
- GET /api/v1/operations/tools
- GET /api/v1/operations/incidents/INC-DISK-001/sources/asap
- GET /api/v1/operations/incidents/INC-DISK-001/sources/ems
- GET /api/v1/operations/incidents/INC-DISK-001/sources/scf
- GET /api/v1/operations/incidents/INC-DISK-001/commands
- POST /api/v1/operations/commands/preview with JSON body {"incident_id":"INC-DISK-001","command_id":"show_alerts"}
- POST /api/v1/knowledge/transcripts with expert header and JSON fields title, recording_reference, release, section, content, acknowledged_authorization=true, redaction_confirmed=true.
- Existing POST /api/v1/knowledge/corpus/documents/{document_id}/submit (expert role) and /review (distinct reviewer role).
- GET /api/v1/knowledge/knowledge-tree
- GET /api/v1/incidents/INC-DISK-001/workspace now includes knowledge_tree and legacy_tree compatibility fields.

## Windows verification (one command after checkout)

Once on this branch, run the full-stack regression, build, local Ollama, source-status, and safe-command checks together with: 

    .\scripts\verify_operator_center.ps1 -RunsPerIncident 1

The script builds on the existing validated Sprint 5 check and fails when an asserted synthetic safety/health contract is violated. Real HPE tool access remains untested and unconfigured.

For manual troubleshooting, the equivalent individual checks are below.

Use the existing local workspace on the named branch. Do not run multiple concurrent Git write flows against Maggie's UI work.

    git fetch origin
    git switch feat/cail-operator-command-center
    git pull --ff-only
    Push-Location backend
    .\.venv\Scripts\python.exe -m pytest -q
    Pop-Location
    Push-Location frontend
    npm run build
    Pop-Location
    docker compose up -d --build
    Invoke-RestMethod "http://localhost:8000/api/v1/operations/overview"
    Invoke-RestMethod "http://localhost:8000/api/v1/operations/tools"
    Invoke-RestMethod "http://localhost:8000/api/v1/operations/incidents/INC-DISK-001/sources/ems"

If the current local checkout has uncommitted edits, commit/stash your work before switching. Existing expert/reviewer keys must remain server-side. Never place them in a client build.

## Next production-grade boundary — not implemented

To replace fixture adapters with actual connectors, get written authorization from CAIL/customer, the supported NonStop RVU, licenses, network access, and a sanctioned read-only mechanism: CAIL HLLAPI/COM bridge, ASAP export/Consumer API, EMS collector/distributor, or a release-scoped SCF terminal proxy. Only a dedicated server connector holding least-privilege credentials should communicate with those sources. Enforce request allowlists, bounded data size, independent authn/authz, TLS, timeout, event timestamp/freshness checks, privacy redaction, approval gate, audit logging, and runbook version attribution. No production restart/purge should be callable by Qwen.

## Original HPE reference

Challenge-brief HPE URL: https://support.hpe.com/hpesc/public/docDisplay?docId=a00099017en_us&docLocale=en_US

Its page body did not render in the research environment; therefore neither command semantics nor document title were inferred from it. Additional independently readable HPE references:

- EMS event messages: https://support.hpe.com/hpesc/public/docDisplay?docId=c03911514en_us&docLocale=en_US&page=EMS_Messages.html
- SCF kernel status reference: https://support.hpe.com/hpesc/public/docDisplay?docId=c04583315en_us&docLocale=en_US&page=GUID-D7147C7F-2016-0901-02DF-0000000004D7.html
- SCF collection procedure: https://support.hpe.com/hpesc/public/docDisplay?docId=a00121284en_us&page=GUID-D7147C7F-2016-0901-02A5-00000000011EF.html

The challenge expects natural language understanding, monitoring, safe troubleshooting and expert knowledge transfer. This branch covers an operator-friendly simulated slice, not verified production monitoring or automated remediation.
