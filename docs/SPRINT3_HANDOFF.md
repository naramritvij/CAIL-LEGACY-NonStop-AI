# Backend Sprint 3 — Teammate Handoff and Validation

**Backend track:** Ritvij and supporting assistant. **Frontend track:** Maggie. The Sprint 3 commit changes only backend Python files and documentation, not React or other frontend UI code.

## Integration priority for Maggie
1. Show `POST /api/v1/knowledge/retrieve` after a question: render **approved-only** lessons and official document pointers in distinct columns; never call chapter pointers exact matches.
2. Add a separate **Transfer Challenge** screen that calls `GET /api/v1/training/challenges/{lesson_id}` and `POST /api/v1/training/challenges/{lesson_id}/assess` using the submitted action/evidence/prerequisites. Show the 100-point rubric and label it *synthetic training evaluation*, not a professional competency certification.
3. On the Incident Black Box, add `GET /api/v1/incidents/{id}/grounded-brief`: render source ID chips and an explicit **root cause not established** state.
4. Existing `/api/v1/investigate`, `/incidents`, `/replay`, Sentinel preview and `/shift-briefing` remain available. No keys should ever be embedded in browser code.

## Security notes
- A training challenge is only returned after an expert lesson is approved; public response never shows an unreleased draft.
- Both selected actions and replay outputs remain simulated, and the training evaluator calls the **independent** policy engine, not an LLM.
- No training response should be treated as proof of real-world operator proficiency.
- Relevance-based retrieval filters lesson IDs and evidence IDs; unsupported IDs do not influence the AI's approved-knowledge context.

## Validation run

```
git pull
docker compose up -d --build
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

Latest developer-verified baseline on Windows: **49 tests passed, 1 Starlette/httpx deprecation warning, 3.30 seconds** on 17 October 2026 (46 original + 3 scoring-gate regression cases). Re-run after future backend changes. Sample fast endpoint test:

```
Invoke-RestMethod 'http://localhost:8000/api/v1/incidents/INC-DISK-001/grounded-brief' |
  Select-Object incident_id, root_cause_status, evidence_validation_level
```

Training challenge needs an **approved** Decision DNA record first. Use existing protected expert/reviewer API operations and keep secret keys in private local environment only.

## Maggie's local setup and collaboration

Follow [the illustrated README](../README.md#-maggies-frontend-development-guide) or [Confluence onboarding](https://northeastern-team-mx3hi3ad.atlassian.net/wiki/spaces/CAILLEG26/pages/753694). The existing UI is React + Vite (not Next.js). For frontend hot reload: run Docker **backend only**, stop Docker frontend, then from `frontend/` run `npm.cmd install` and `npm.cmd run dev -- --config vite.local.config.ts`. Do not change API secrets in browser code. Use separate feature branches and pull requests.
