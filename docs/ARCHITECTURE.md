# LEGACY — System Architecture (17 Oct 2026)

![Current architecture](assets/legacy-architecture.svg)

The local app is a **synthetic read-only prototype**, not an HPE NonStop deployment. Browser → React/Vite → FastAPI. Backend calls deterministic incident simulator, a default-deny policy engine, SQLite Decision DNA / audit, an attributed HPE *reference-pointer* registry, and optionally Windows-hosted Ollama / Qwen3. There is no live HPE NonStop connection or command executor.

## Current runtime and trust boundaries

| Component | Location | Interface | Current status |
|---|---|---|---|
| React 19 + TypeScript + Vite | Docker frontend at localhost:5173, or standalone host Vite | `/api/v1/*` via Vite proxy | Built, UI rendered |
| Python 3.12 + FastAPI | Docker backend at localhost:8000 | OpenAPI at `/docs` | Running / tested |
| Native Ollama Qwen3 4B Instruct | Windows host | `host.docker.internal:11434` from backend | Local AI tested; optional |
| Scenario fixtures | Python backend | Synthetic Disk/Pathway events, counterfactual branches | Deterministic |
| Sentinel action policy | Python backend | Simulated preview only | Default deny, no execution |
| Decision DNA + audit | SQLite named volume `legacy_knowledge` | Draft→submitted→approved/rejected | Working demo keys, not production identity |
| Official HPE reference pointers | Curated, offline Python registry | Lexical search and scoped URLs | Not full manual RAG |
| Shift briefing / transfer evaluation | FastAPI endpoints | Synthetic handover, scored changed-incident case | Prototype |

## Expert knowledge lifecycle

![Decision DNA knowledge lifecycle](assets/legacy-knowledge-flow.svg)

Review is an explicit prerequisite to retrieval. Unapproved notes never appear on the public approved endpoint. A simulated training challenge takes an approved lesson and presents **different** events. The scoring rubric is transparent: safe first action 35, evidence 25, prerequisites 25 and reasoning 15. Unsafe actions are capped at 20; other missing mandatory requirements cap at 74. This rubric is **not verified occupational competency assessment**.

## What is NOT implemented

- Real enterprise event feeds, authenticated NonStop commands, or production remediation.
- Authorized manual ingestion and release-specific full-text vector/semantic RAG.
- Strong user authentication/SSO/RBAC, tamper-resistant audit and production rate limiting.
- Mobile-native Android client or installable PWA, independently validated expert knowledge or training outcomes.

## Team workflow

**Ritvij** — API, security, simulator, AI and persistence. **Maggie** — React UI/UX and API integration. For local hot reload, Maggie uses `frontend/vite.local.config.ts` while running backend with Docker, rather than editing the Docker-specific Vite proxy. See the [README](../README.md) and [Confluence architecture page](https://northeastern-team-mx3hi3ad.atlassian.net/wiki/spaces/CAILLEG26/pages/491522).

## Tests and data provenance

49 backend tests passed on the team laptop 17 Oct 2026, with one Starlette/httpx deprecation warning. Synthetic IDs `SIM-EVT-*` and `TRAIN-EVT-*` are invented and cannot be matched to genuine HPE manual operator messages. Manual reference URLs provide generic documentation provenance, not proof of incident root cause. Confirm system release, real subsystem and event number before any real operational analysis.
