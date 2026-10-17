# LEGACY end-to-end MVP — product flow, existing API contracts and demo acceptance

**Track:** Backend integration verification and React handoff | **Frontend owner:** Maggie | **Backend owner:** Ritvij

> This describes the existing **local, synthetic, read-only** LEGACY prototype. It is not production HPE NonStop monitoring, actual operational recovery, or verified expert instruction. The demo's focus is *how evidence becomes reviewed, reusable operating judgment and an apprentice learning exercise*.

## 1. One clear demo story, not unrelated widgets

Use the existing **INC-DISK-001** case throughout the main demo:
- `$DATA03` disk utilization begins at **72%** (`SIM-EVT-101`).
- It exceeds **75%** (`SIM-EVT-102`) and reaches **81%** with an **80% warning threshold** (`SIM-EVT-103`).
- File ownership, retention policy and application dependencies remain unknown. **No established root cause.**
- The operator reviews evidence, inspects a **simulated read-only** action, and sees destructive file purge blocked.
- A **synthetic demo mentor** submits a Decision DNA record. A different **locally keyed reviewer** approves it.
- An apprentice tackles a *different synthetic incident* with 79% → 89% disk growth, citing `TRAIN-EVT-301` and `TRAIN-EVT-302`.
- The apprentice must choose the correct safe inspection, verify prerequisites, and explain why; the deterministic rubric caps unsafe choices at 20.
- Shift Passport shows ongoing unknowns and approved synthetic-knowledge counts; it is **not signed by a real operator**.

Use the existing **INC-PATH-002** case as the shorter alternate demo for regression/breadth—not as a different invented payment/database narrative. Never present `SIM-EVT-*` or `TRAIN-EVT-*` as real HPE event codes.

## 2. Maggie's React integration map

Existing frontend: React/TypeScript/Vite (no Next.js migration). Use the Vite proxy and relative `/api/v1` calls; **do not put expert/reviewer demo keys in browser source or localStorage**.

| Display / interaction | Method + relative path | Truthful UI state |
|---|---|---|
| Incident picker, metrics, event timeline | `GET /api/v1/incidents`, `GET /api/v1/incidents/{id}` | `Synthetic training incident`; show event IDs and missing prerequisites |
| Evidence & causes | `GET /api/v1/incidents/{id}/grounded-brief` | Show deterministic evidence-linked observations, unverified hypotheses, `root_cause_status: not_established` |
| Ask LEGACY | `POST /api/v1/investigate/grounded` | Cite each claim with source registry entry; mark **AI-generated, requires human validation** |
| Safety panel | `POST /api/v1/diagnostics/preview` | `preview_allowed` is simulated permission **to preview only**, not permission to execute |
| What-if outcomes | `POST /api/v1/replay` | Pre-authored simulator branch **not a prediction** |
| Reviewed Decision DNA | `GET /api/v1/knowledge/lessons?incident_id=...` | **Approved only**; empty state if no reviewed records |
| Relevant reviewed lesson | `POST /api/v1/knowledge/retrieve` | Approved lessons separate from generic HPE documentation pointers |
| Apprentice exercise | `GET /api/v1/training/challenges/{lesson_id}` | Challenge requires an approved lesson; 404 before approval is normal |
| Apprentice assessment | `POST /api/v1/training/challenges/{lesson_id}/assess` | Show `passed`, `score`, gate failures and *synthetic exercise* disclaimer |
| Shift Passport | `GET /api/v1/shift-briefing` | Not operator-signed; show unresolved incidents, unknowns, approved record count |

### Grounded AI call

Request:

```json
{
  "incident_id": "INC-DISK-001",
  "question": "What does the disk evidence show?",
  "release": "L23.08",
  "max_chunks": 3
}
```

Read the **actual response** fields: `status`, `claims[]` with each `text` and `citations[]`, `source_registry[]` with `id`, `kind`, `source_text`; `missing_evidence[]`, `root_cause_status`, `model_attempts`, `operational_action_authorized`, `state_change_executed`.

UI rule: show generated claims **only when** `status === 'generated_unverified_citation_ids_checked'`. On `model_output_rejected` or `model_unavailable`, show *"AI explanation unavailable; source evidence remains available"* and render `/grounded-brief` / source registry separately. A claim can have valid source IDs while still misstating its evidence. Avoid a generic green "verified" badge; **ID registered does not mean semantically verified**.

Return `missing_evidence[]` as its own panel, **not** as claims backed by unrelated event IDs. Display `DOC-*` only when locally approved user excerpts exist, and do not call them independently authenticated.

### Decision DNA and Legacy Tree

- **Backend currently persists lessons**, review status and audit history. It does not deliver a fully validated real-operator genealogy, learning impact metric, or reuse graph.
- If visualizing a **Legacy Tree**, derive nodes from `GET /knowledge/lessons` (approved only) and use `id` / `previous_lesson_id` as links where present. For a single synthetic approved lesson, a single node is a truthful first version.
- Do not fabricate lesson counts, expert credentials, reuse growth, years of expertise, organization approval, or leaderboards.
- Never expose draft or rejected records through public API calls.
- A user submitting notes in the future needs a proper authentication/authorization design; this MVP keeps expert creation/approval in local developer-controlled workflows.

### Training payload example

```json
{
  "action_id": "inspect_disk_growth",
  "evidence_ids": ["TRAIN-EVT-301", "TRAIN-EVT-302"],
  "prerequisites": ["Verify file ownership", "Check retention policy"],
  "reasoning": "Before changing anything, verify file ownership and retention using the observed evidence."
}
```

Render failed attempts explicitly. Unsafe actions do not pass even if the textual reasoning looks plausible. Scores are **not persisted** and do not certify employment competence.

## 3. Safe local demo preparation

1. Run Docker Compose with native Windows Ollama working (Sprint 5 script checks this).
2. **Only if you intend to create one explicitly invented training lesson**, configure different local `LEGACY_EXPERT_KEY` and `LEGACY_REVIEWER_KEY` values in a private, untracked `.env` file (at least 20 characters each). Never share them in ChatGPT, GitHub, screenshots or React.
3. From repo root, explicitly opt into the existing `scripts/seed_demo_knowledge.ps1 -ConfirmSynthetic` script. This **persists a synthetic approved lesson to the local named SQLite volume**. It is not appropriate for a clean no-write smoke test. Do not run multiple times without intending duplicate demo lessons. If `.env` was edited, restart backend container to import environment values first.
4. Confirm `GET /api/v1/knowledge/lessons?incident_id=INC-DISK-001` includes your synthetic reviewed record, and open the returned `/training/challenges/{lesson_id}`.
5. Show the evidence → diagnosis → Sentinel → Decision DNA → changed incident → shift handover path live.

**For reliable read-only verification with no demo seed and no external system:** the backend `test_demo_journey.py` suite exercises both scenarios through all endpoints with isolated temporary SQLite and a stubbed model.

## 4. One-run integration gates

From repo root, with `backend/.venv` present, use `./scripts/verify_sprint5.ps1` (PowerShell: `.\scripts\verify_sprint5.ps1`). It runs the **full backend pytest suite**, Docker rebuild/health, frontend TypeScript/Vite compile, key safety APIs and six live local Ollama checks.

The newly added `backend/tests/test_demo_journey.py` tests additionally verify both complete HTTP lifecycle flows and fail-closed model outcomes; they are included automatically by full pytest. They use temporary files, do not write to the Docker `legacy_knowledge` volume and make no live model requests.

**Stop-and-fix conditions:** any failed Python test, failed TypeScript build, leaked browser secrets, claim presented as verified without expert checking, unreviewed lesson displayed as approved, unsafe decision passing the rubric, unintended production connection, or inaccurate synthetic-vs-real labeling.

## 5. Still unfinished / nonclaims

- **Frontend:** Maggie still needs to implement and test the full multipanel user journey with the existing routes; this backend integration branch intentionally edits **no frontend files**.
- **Authenticity:** Manual pointers are not certified incident-specific instructions. Approval is a demo-local workflow; licensed content and NonStop release applicability are not independently checked.
- **Safety:** The simulator does not perform real command execution or authenticate operators via enterprise SSO/RBAC; it is not production hardened.
- **Measurement:** Do not invent troubleshooting-time reduction, training improvement, root-cause accuracy, or production uptime outcomes. Add a human-verified evaluation set for these goals.
- **Sustainability:** Local Ollama, FastAPI and SQLite require no paid inference APIs for the current prototype; free cloud tiers should remain optional rather than required.
- **Accessibility/mobile:** TypeScript build success is not evidence of end-to-end browser UX, keyboard interaction, responsive layout or accessibility testing; Maggie needs to verify these explicitly.

## 6. Division and merge policy

**Ritvij/backend:** API stability, evidence source registry, safe simulator, reviewed-knowledge lifecycle, integration tests, developer-only demo seed and measured local response behavior.

**Maggie/frontend:** screen composition, LEGACY Tree visualization from reviewed data, incident/challenge navigation, error and missing-evidence states, interactive citations, responsive/accessible UI.

**Joint demo rehearsal:** one consistent synthetic story, seeded lesson labeled honestly, evidence presented separately from AI, no unintended credential exposure, correct fail-closed behavior, explicit scoring gates.

Do not merge the frontend or backend work until their independent tests and one complete integrated browser journey pass. Track shared acceptance under GitHub Issue #9.
