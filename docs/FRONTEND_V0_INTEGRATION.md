# Maggie v0 frontend integration — CAIL / Nonstop AI Operations Assistant

**Branch:** `feat/maggie-v0-frontend` (created from `main`, 17 Oct 2026)
**Source:** Maggie's exported `legacy-frontend-architecture.zip`, reviewed as a source ZIP.
**Scope:** Replace the pre-existing minimal `frontend/` with the v0 React/Vite shell, add a conservative FastAPI adapter, update Compose frontend environment. `backend/` is unchanged.

## One codebase, two data modes

- `http` mode (the Docker Compose default): real local FastAPI **synthetic fixtures**, currently `INC-DISK-001` and `INC-PATH-002`. Neither is live NonStop telemetry; no production commands are run.
- `mock` mode (standalone v0 preview only): Maggie's independent fictional payment/database scenarios and animations. These are **not** on the FastAPI backend. Switch explicitly with `VITE_LEGACY_DATA_MODE=mock`.
- The top bar always distinguishes mock showcase from **Local API · Synthetic**. Local API does **not** mean a connection to a real NonStop installation.

## Backend compatibility

`src/api/backend-contract.ts` projects the actual FastAPI responses from:

| API | Backend response | UI projection |
|---|---|---|
| `GET /api/v1/incidents` | `id`, `system`, `severity:warning/high`, `metrics`, `events` | `incident_id`, synthetic environment, display severity only (`warning→SEV-3`, `high→SEV-2`) |
| `GET /api/v1/incidents/{id}/workspace` | `incident`, `analysis.findings`, `hypotheses_unverified`, `missing_evidence`, `sentinel_previews`, `legacy_tree`, `training_challenges` | Evidence + timeline from real `SIM-EVT-*` fixtures, finding source IDs, unknowns and previews |
| `POST /api/v1/investigate/grounded` | Requires explicit release; status + `claims[].citations` + registry | On-demand local Qwen3 (release `L23.08`) with fail-closed empty claims if unavailable/rejected |
| `GET /api/v1/knowledge/legacy-tree` | Approved-only nodes with `id`, `reviewed_at`, `source_event_ids`, `revision_of` | Knowledge Tree view model with locally approved revision lineage; no invented reuse counts |

### Honest boundaries

1. FastAPI's backend fixture has baseline/current metrics, **not recorded time series**. The UI shows numeric metrics without fabricated sparkline samples. The original v0 mock's fictional time series remain in mock mode only.
2. Backend events include only `HH:MM` synthetic clocks, not calendar dates. The adapter uses a fixed epoch day internally to format clock values; displayed days and elapsed times are **not actual incident timestamps**. This should eventually be replaced with an explicit backend synthetic `scenario_date` or clock field.
3. The backend does not supply verified impact or root cause. The adapted panel explicitly says that impact is not independently measured and root cause is not established.
4. Backend deterministic observations are **not AI-generated**. The **Ask CAIL · optional AI** section is a separate user-triggered endpoint; it shows source IDs, unverified status and non-semantic-validation warnings, and never authorizes commands.
5. `preview_action_ids` includes only independently policy-allowed read-only synthetic previews; `purge_files` and `restart_service` never become allowed UI actions. The UI previews use explanatory text, not Linux/Postgres commands inappropriate for NonStop.
6. Knowledge Tree nodes come only from the backend's approved, event-registered synthetic lessons. Local review does not authenticate a real senior engineer. Lines represent local approved revisions, not verified reuse or mentorship. The interactive **Synthetic Showcase** remains distinctly fictional.
7. Mentor, Library, Apprentice capture controls remain explicitly planned. Backend-only expert/reviewer API keys are never stored in React.

## Build/run

**Windows local UI + Docker backend:**

```powershell
# From repository root, on feat/maggie-v0-frontend
npm.cmd --prefix frontend install
npm.cmd --prefix frontend run test:contract
npm.cmd --prefix frontend run build

docker compose up -d --build
# Local frontend: http://localhost:5173 ; backend: http://localhost:8000/docs
```

**Hot reload outside Docker** (with backend on localhost:8000):

```powershell
$env:VITE_LEGACY_DATA_MODE='http'
$env:LEGACY_API_PROXY_TARGET='http://localhost:8000'
npm.cmd --prefix frontend run dev
```

**Standalone v0 mock demo** (not the backend):

```powershell
$env:VITE_LEGACY_DATA_MODE='mock'
npm.cmd --prefix frontend run dev
```

When finished, `Remove-Item Env:VITE_LEGACY_DATA_MODE -ErrorAction SilentlyContinue` to avoid changing later shell sessions. Compose sets `http` explicitly and forwards `/api` to `http://backend:8000` on its private Docker network.

## Validation and remaining work

- The source ZIP was inspected and sanitized (no parent-path ZIP entries).
- The contract projection was checked against the current GitHub backend implementation and 10 deterministic JS/TS adapter checks have passed in the preparation environment.
- All 53 TypeScript/TSX source files parsed without syntax diagnostics.
- **Full npm TypeScript/Vite production build and live Docker/browser integration are NOT yet verified** in the offline preparation environment. The one-shot installer runs `npm run test:contract` and `npm run build` and aborts before committing/pushing if either fails. Verify live Docker API and both incidents locally before merging.
- Future work: migrate to explicit backend-provided timestamps, build a proper server-side authenticated mentor-review workflow, test usability/mobile, integrate training challenge grading, and provide a verified real NonStop connector only with owner authorization. None of those capabilities is asserted by this frontend snapshot.

### Team workflow

Maggie can keep refining her v0 project, but this source ZIP is a snapshot — v0 edits **do not automatically arrive** in GitHub unless its Git integration is intentionally configured. Have Maggie review the integration branch and use new v0 exports or commits only against that feature branch, not directly against `main`.
