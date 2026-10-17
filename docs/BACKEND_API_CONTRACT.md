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


# Sprint 2 additional contracts (manual reference and evidence packs)
- GET /knowledge/sources: attributed official HPE source pointers; no copied manual text.
- POST /knowledge/search: {"query":"disk capacity","limit":4}; lexical source lookup, not embedding RAG. No invented exact event matching.
- GET /incidents/{incident_id}/evidence-pack: independent synthetic incident findings and attributed HPE documentation pointers; "official_message_match":null until real subsystem/event metadata exist.
- GET /diagnostics/templates: read-only reference catalog; no command execution.
- POST /diagnostics/templates/preview: {"incident_id":"INC-DISK-001","template_id":"scf_kernel_status_lseries"}; shows scoped manual reference with "execution_allowed":false.
Refer to docs/BACKEND_SPRINT2_API.md for response structure and security boundaries.

## Sprint 3: Retrieval and Transfer

See [Sprint 3 API contract](BACKEND_SPRINT3_API.md) for approved-only retrieval, deterministic evidence claims, knowledge transfer training endpoints, limitations, and examples. These additions do not change earlier routes.


## Sprint 4: Locally-approved excerpt index

See [Sprint 4 Corpus API](BACKEND_SPRINT4_CORPUS.md). The five new `/knowledge/corpus` routes let an expert submit an **authorized** source excerpt as draft, a distinct reviewer approve/reject, and the frontend search **approved excerpts only** with an exact release filter. Source URL shape and checksums are recorded; external contents are **not independently verified**. This is lexical chunk search, not full vector/LLM RAG. No real NonStop commands or network source downloads.


## Sprint 5: Source-ID-bounded local AI explanation

`POST /api/v1/investigate/grounded` accepts `incident_id`, `question`, an explicit `release`, and optional `max_chunks` (1–5). It returns structured, **unverified** claims with registered event or local approved-corpus citation IDs. Missing/invalid model output yields an informative response with no generated claims; it never authorizes or executes actions. See [full Sprint 5 specification](BACKEND_SPRINT5_GROUNDED_AI.md). Older /investigate route is unchanged for Maggie.

**Sprint 5 reliability branch (additive response fields, no route change):** `/investigate/grounded` now returns a deterministic `missing_evidence` list separately from AI `claims`, plus `model_attempts` and (when rejected) `validation_attempt_reasons`. The model is requested to emit 1-2 concise source-cited observations; citations are identifier-checked only and are not proof of source entailment. At most one format-repair call is made, and all failures keep `claims: []`, `operational_action_authorized: false`, and `state_change_executed: false`. Maggie's existing `/investigate` integration is unaffected.

## Legacy Tree: Approved local knowledge-lineage view

`GET /api/v1/knowledge/legacy-tree` accepts optional query `incident_id` (known synthetic incident only; unknown ID returns 404). Returns `synthetic:true`, `review_scope:"approved_only"`, `nodes[]`, `edges[]`, `returned_node_count`, `returned_edge_count`, `maximum_returned_nodes:100`, `may_be_truncated`, `reuse_metrics_available:false`, `identity_or_source_authenticity_verified:false`, `lineage_semantics`, and `limitations`.

`nodes[]` includes `id`, `incident_id`, `incident_title`, `kind:"locally_approved_decision_dna"`, `title`, `reasoning_preview`, `prerequisites`, `rejected_action`, `source_event_ids`, `author_alias` (identity NOT verified), `review_status:"approved"`, `reviewed_at`, `revision_of`, and explicit evidence/synthetic flags. Only approved records with registered synthetic event IDs are exposed. `edges[]` relates visible, approved record revisions through `from`, `to`, and `kind:"approved_revision_of"`.

**Not a validated real-world mentorship graph or reuse metric.** Zero nodes when no synthetic lesson has been approved is expected. Do not invent positive counts, expert identities, cross-incident reuse links, learner skills, or growth metrics. The endpoint is read-only with no authentication keys in browser code, and does not change existing lesson/retrieval APIs. Frontend integration belongs to Maggie.

## Incident Workspace: Single-call read-only UI foundation

`GET /api/v1/incidents/{incident_id}/workspace` accepts optional `question` (3–500 characters; default evidence question). Unknown incidents return 404. The response is a model-independent read-only assembly of the **existing** incident, deterministic analysis/grounded-brief, missing evidence, Sentinel previews for known actions, a question-relevant subset of **approved-only** Decision DNA, Legacy Tree (approved local revisions), available training challenge pointers (approved lessons only), and the unresolved synthetic shift excerpt. It reports `ai_investigation.status:"not_requested"`, `needs_separate_model_call:true`, `root_cause_status:"not_established"`, `synthetic:true`, `operational_action_authorized:false`, and `state_change_executed:false`.

`sentinel_previews[].allowed` is permission to inspect a **simulated preview**, not permission to execute a command. No local model is contacted by this GET. Frontend must POST separately to `/api/v1/investigate/grounded` and show failed/rejected AI states rather than silently replacing them with invented claims. The `reviewed_knowledge` source pointers are not authenticated HPE manual snippets. No reviewer/expert keys belong in browser requests.

### Prototype HTTP response safeguards

API responses include `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`. These reduce accidental browser caching/sniffing/embedding but **are not a replacement for enterprise authentication, rate limits, transport security, audited RBAC or production hardening**.
