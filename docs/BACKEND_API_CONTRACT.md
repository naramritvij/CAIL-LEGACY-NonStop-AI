# LEGACY backend API contract — Maggie integration handoff

Base URL: `http://localhost:8000/api/v1` (frontend Vite proxy `/api/v1`). All incidents and outcomes are synthetic. Frontend can render existing incident view unchanged.

## Public, read-only training endpoints

- `GET /health`: `{status,mode,version}`.
- `GET /incidents`: array of incident objects (existing contract).
- `GET /incidents/{incident_id}`: existing incident detail.
- `GET /incidents/{incident_id}/analysis`: returns deterministic `{findings:[{statement,kind,evidence_ids}],nodes,edges,missing_evidence,root_cause_status:'not_established', recommended_read_only_actions}`. Edges do not claim causation.
- `GET /actions`: action metadata (existing contract).
- `POST /diagnostics/preview` JSON `{incident_id, action_id}`: always simulated; returns policy `allowed`, `status`, `reason`, no real command.
- `POST /replay` JSON `{incident_id, action_id}`: `{policy, simulated_outcome, deterministic:true, state_change_executed:false, disclaimer}`. This illustrates predetermined branches, NOT real outcomes.
- `POST /investigate` JSON `{incident_id, question}`: existing `{status,answer,model,evidence_ids}` plus `knowledge_ids` and citation-validation caveat. Local Qwen3 may take seconds; display loading and `model_unavailable` fallback.
- `GET /knowledge/lessons?incident_id=INC-DISK-001`: *approved* expert lessons only (initially empty).
- `GET /shift-briefing`: original fields preserved; adds open issue details, evidence IDs and approved knowledge record count.

## Protected write/review endpoints (backend only)

- `POST /knowledge/lessons` with header `X-Legacy-Expert-Key` and JSON:

```json
{"incident_id":"INC-DISK-001","author_alias":"Demo Expert","symptoms":"Capacity increased throughout the shift.","reasoning":"Verify ownership and dependencies before a potential file deletion.","rejected_action":"purge_files","prerequisites":["Confirm retention policy"],"evidence_ids":["SIM-EVT-101","SIM-EVT-103"]}
```

- `POST /knowledge/lessons/{uuid}/submit` with `X-Legacy-Expert-Key` header: draft to submitted.
- `POST /knowledge/lessons/{uuid}/review` with `X-Legacy-Reviewer-Key`, JSON `{decision:"approved"|"rejected",notes:"..."}`: submitted to final review.
- `GET /knowledge/lessons?status=all` or unapproved detail: requires expert/reviewer key.
- `GET /audit/verify`: requires reviewer key; local hash-chain integrity check (NOT tamper-proof against administrators).

**Security:** Never put reviewer/expert credentials into Maggie's frontend bundle. Protected operations should be demonstrated using localhost FastAPI docs or a secure backend-for-frontend layer later. Until secrets are configured, write endpoints return 503. Reviewer key must be different from expert key. This is a local demo gate, not user authentication.

## UI integration hints

1. Incident Black Box: use `analysis.findings` to show exactly which SIM-EVT records support a claim; distinguish unverified hypotheses.
2. Counterfactual Replay: use `policy.allowed` and `simulated_outcome`; mark outcomes **simulated** and never represent them as predictions.
3. Decision DNA: approved lessons appear in the public list; drafts may not be displayed publicly.
4. Shift Passport: use `shift-briefing.unresolved` and `approval_state`; never label synthetic handovers as operator-signed.
5. Retain simulated/read-only warning and model-unavailable handling.
