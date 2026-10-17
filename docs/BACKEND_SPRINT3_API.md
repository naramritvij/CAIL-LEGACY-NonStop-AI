# Sprint 3 — Approved-knowledge retrieval, claim-linked evidence and Knowledge Transfer Challenge

**Owner:** Ritvij's backend track. **Maggie:** frontend only, existing routes untouched. These endpoints add capabilities without changing prior route response contracts.

## Fast endpoints (all prefixed `/api/v1`)

| Method | Path | Request | Returns |
|---|---|---|---|
| POST | `/knowledge/retrieve` | `{"incident_id":"INC-DISK-001","query":"disk ownership retention","max_lessons":3,"max_sources":3}` | Ranked, **approved-only** Decision DNA with lesson provenance and independent official HPE manual pointers |
| GET | `/incidents/{id}/grounded-brief?question=disk%20capacity` | URL query optional | Deterministic claim-to-synthetic-event-ID links, known unknowns and retrieved reference pointers; explicit root cause unknown |
| GET | `/training/challenges/{approved_lesson_id}` | None | Synthetic **changed incident** with `TRAIN-EVT-*` evidence and no exposed correct answer |
| POST | `/training/challenges/{approved_lesson_id}/assess` | `{"action_id":"inspect_disk_growth","evidence_ids":["TRAIN-EVT-301","TRAIN-EVT-302"],"prerequisites":["Verify file ownership","Check retention policy"],"reasoning":"Before changing files, verify ownership and retention against the evidence."}` | Reproducible 100-point rubric, safety gate, unsupported/missing evidence, missing prerequisites, feedback. No command run; attempts not stored. |

## End-to-end scenario

1. Developer uses existing expert-key-protected route to create **synthetic** lesson in `draft` state, attaches valid `SIM-EVT-*` IDs.
2. Expert submits; reviewer-key-protected route approves (distinct credential; demo only, not real identity verification).
3. POST `/knowledge/retrieve` with incident/topic returns only approved matching records. Nonmatching/rejected/draft records are not retrieved.
4. GET `/training/challenges/{id}` returns changed disk or Pathway case. Learner should identify a safe diagnostic first step, cite the new `TRAIN-EVT-*` IDs and identify prerequisites.
5. POST assess returns detailed rubric; unsafe actions are capped at 20/100 even with excellent evidence, made-up IDs get zero evidence points, missing prerequisites reduce score. No state-changing commands or live-system connections.
6. Show `grounded-brief` side by side: deterministic cited observations are separate from model-written prose and documentation chapter pointers.

## Rubric

- Safety/action choice: 35 points if correct safe first action; 15 for non-optimal safe inspection; 0 for unsafe/unknown.
- Evidence citations: up to 25 for both actual changed-scenario IDs; invented IDs score zero on evidence.
- Prerequisites: 25 for both rubric concepts; half credit for one.
- Quality of reasoning: 15 for a substantive explanation with an evidence/verification cue.
- Unsafe actions cap overall score at 20 and always fail. Other mandatory-gate failures (missing prerequisite, missing required evidence, fabricated ID, or non-optimal first action) cap the displayed score at **74**, below the 75-point pass threshold. Passing requires all mandatory gates. Responses now report `raw_score_before_safety_gates`, `score_cap_applied`, and `unmet_mandatory_conditions` for transparency.

## Honest evaluation limitations

- This is **lexical retrieval** of demo-reviewed expert records and public HPE documentation pointers, not embedded or full-text manual RAG. The optional `/investigate` LLM remains separate.
- `approved` means an operator with a demo reviewer key approved it; neither individual expertise nor real-system applicability is independently authenticated. No real senior engineer knowledge is included unless contributed and verified.
- Claim citation validation means source/event IDs exist in the **synthetic** fixture, NOT semantic entailment verification or a verified root-cause finding.
- The learner rubric is deterministic, predefined, not a validated competency instrument. It is **not** proof of real knowledge transfer, reduced incidents or system reliability. Attempts are not persisted yet.
- No reviewer/expert credentials should be embedded in Maggie's frontend. Demo authorship/review is administered via secure developer tools locally.

## Testing

13 additional automated tests covering only-approved retrieval, corrupted provenance, documented claims, challenge gating, safe decision scoring, fabricated evidence, safety cap, missing prerequisites, input validation and Pathway transfer. Run all previous tests together on Windows after `git pull`.
