# Backend Sprint 2 — HPE reference-grounding and safe diagnostic templates

**Author/owner:** Backend track (no Maggie frontend code changed). **Status:** Implemented source modules; integration must be validated on the Windows development laptop.

## New endpoints (under `/api/v1`)

| Method | Route | Purpose |
|---|---|---|
| GET | `/knowledge/sources` | Curated, sourced HPE manual references with scope, source URL and release caveats |
| POST | `/knowledge/search` | Request `{ "query": "disk capacity", "limit": 4 }`; returns ranked lexical pointers and matching terms |
| GET | `/incidents/INC-DISK-001/evidence-pack` | Source-aware incident evidence: observed synthetic claims, missing prerequisites, relevant reference pointers, no claimed root cause |
| GET | `/diagnostics/templates` | Inspected reference and checklist catalog; read-only display |
| POST | `/diagnostics/templates/preview` | Request `{ "incident_id": "INC-DISK-001", "template_id": "scf_kernel_status_lseries" }`; returns reference status, command text, scope and `execution_allowed:false` |

Existing `/incidents`, `/incidents/{id}`, `/incidents/{id}/analysis`, `/investigate`, `/replay`, Decision DNA routes and Shift Briefing routes are unchanged.

## A critical distinction for judges

**Retrieved evidence from an incident**: statements backed by `SIM-EVT-*` synthetic event identifiers. These are not genuine HPE operator message IDs.

**Official reference facts**: curated *links* to HPE support material (document chapters/sections) for understanding manual procedures and terminology. Links do NOT mean a synthetic incident is verified by the manual.

The evidence pack deliberately reports `official_message_match: null`, `release_verified: false` and the missing subsystem/event-number prerequisite. This avoids false authority.

Search method is deterministic lexical token overlap, not embedding search or trained model fine-tuning; `match_count` is not a confidence probability. The source registry contains reference summaries and attribution, not copies of proprietary HPE manuals. Exact message/cmd matching must await authorized actual event metadata and version confirmation.

## Template model

`scf_kernel_status_lseries` is a **documented reference-only** L-series SCF `STATUS` illustration. The method never connects to a host or executes any action. Unknown names or arbitrary commands are blocked. Generic operator-message header lookup is a checklist, not a shell command.

## Maggie handoff

- Render `GET /incidents/{id}/evidence-pack` on an evidence panel. Show `official_message_match_status` without hiding the limitation.
- Show document links in a separate reference panel with chapter/section and release scope.
- Show `GET /diagnostics/templates` as view-only catalog; never treat the returned `command` property as an execution button.
- Use `POST /diagnostics/templates/preview` for UI demonstration of default deny and source applicability.
- Never put expert/reviewer shared demo keys in browser code.

## Tests

11 additional tests cover source pointers, lexical retrieval/no-match, input validation, synthetic-vs-official distinction, evidence source provenance, reference-only commands and blocked arbitrary template IDs. They passed using a minimal integration harness with FastAPI, but **must be re-run against the full app on the actual laptop**.

## Next

- Authorize/crawl official manual sections with license/release metadata.
- Add full RAG over authorized excerpts, with document chunk IDs and claim-level citation verification.
- Introduce exact operator message matching only when real subsystem/version and real event number are present.
- Update safety-evaluation dataset, no-template-execution and prompt-injection tests.
