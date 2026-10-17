# LEGACY — NonStop AI Operations Assistant

A **synthetic, read-only hackathon prototype** for CAIL's *Managing Mission-Critical Systems with AI* challenge at Catalyst 2026. LEGACY demonstrates evidence-first incident investigation, controlled simulated diagnostics, and the groundwork for preservation of expert judgment.

> No live HPE NonStop connection, no production commands, no auto-remediation. Event data and operator notes are invented for demonstration. HPE terminology is used descriptively, not as a claim of certified integration.

## Stack
- Frontend: React, TypeScript, Vite (mobile-responsive)
- Backend: Python 3.12, FastAPI and Pydantic
- AI: optional local Ollama / qwen3:4b-instruct, no paid API
- Simulator: deterministic Python scenario fixtures
- Deployment: Docker Compose for app services, Ollama native on Windows

## Run on Windows 11

Ensure Docker Desktop is running and Ollama has already downloaded the model:

    ollama list
    docker compose up --build

Then open http://localhost:5173. Backend docs: http://localhost:8000/docs.

For direct backend development (without Docker):

    cd backend
    py -3.12 -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
    .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload

For direct frontend development (second terminal):

    cd frontend
    npm.cmd install
    npm.cmd run dev

For automated tests:

    cd backend
    py -3.12 -m pip install -r requirements-dev.txt
    py -3.12 -m pytest -q

If the frontend responds but the model is unavailable from inside Docker, the application still displays deterministic incident evidence and explicitly reports the model outage. Do not expose Ollama publicly.

## Demonstration workflow
1. Observe a synthetic NonStop disk-growth incident and timestamped evidence.
2. Ask a natural-language question; answers include referenced event identifiers.
3. Preview approved read-only inspection vs. a blocked destructive action.
4. Inspect a *draft, unverified* expert lesson; human review and persistent Decision DNA are future implementation work.
5. Inspect a handover summary derived from scenario data.

## Safety and limitations
- All incident data is synthetic; EMS entries are **not official HPE message codes**.
- Read-only diagnostic operations only produce mocked outputs.
- The app has no production transport or arbitrary shell execution capability.
- A locally deployed demo is **not** production-hardened; add authentication, audit persistence, rate limits, threat testing, and release-specific command verification before considering real deployments.
- Store only authorized reference material; never commit sensitive incident logs or credentials.

For requirements and roadmap see docs/REQUIREMENTS.md and docs/SECURITY.md.

## Project documentation
Confluence: https://northeastern-team-mx3hi3ad.atlassian.net/wiki/spaces/CAILLEG26
