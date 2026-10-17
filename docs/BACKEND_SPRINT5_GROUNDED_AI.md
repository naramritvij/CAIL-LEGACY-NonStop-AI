# Sprint 5 — Citation-bounded local AI investigation

**Status:** Sprint 5 baseline was tested on Windows (84 passed), but repeated live calls exposed intermittent rejected model outputs. The reliability patch on the review branch adds stricter structured output, a bounded retry and diagnostics; the patched suite and live behavior still require verification on the developer's Windows machine.

## Endpoint

`POST /api/v1/investigate/grounded`

```json
{
  "incident_id": "INC-DISK-001",
  "question": "What does the available evidence show about the disk trend?",
  "release": "L23.08",
  "max_chunks": 3
}
```

The response is a structured evidence review, never an execution plan. Fields include `status`, `claims` with one to three `citations` per claim, `source_registry`, `release_requested`, `root_cause_status: not_established`, `missing_evidence` (server-owned, from incident unknowns), `excerpt_authenticity_verified: false`, `operational_action_authorized: false`, and `state_change_executed: false`. The optional `model_attempts` and `validation_attempt_reasons` reveal whether one bounded format retry was needed; they never expose raw model output.

### Data sources and trust boundaries

1. Synthetic incident evidence IDs (`SIM-EVT-*`) are provided from the deterministic training fixture. They are **not** official HPE operator-message numbers.
2. The release filter is mandatory. Optional document snippets come from **locally reviewed and approved**, user-supplied corpus entries for the exact requested release. Unapproved or wrong-release material is not included; the endpoint does not crawl HPE websites. SHA-256 of each excerpt is checked again immediately before model context assembly.
3. The untrusted question and snippets are serialized as data in a bounded Ollama prompt. The model receives no tool or execution interface; it cannot call Sentinel or change systems.
4. Ollama receives a JSON schema requesting **one or two short observations** (schema text cap 180 characters), with source IDs enumerated from the actual registry. The backend independently applies the original strict validation (12-220 characters, 1-4 claims, registered unique citation IDs, conservative wording filters). It never truncates claims to force acceptance. When the first output fails validation, the backend tries **one additional** short, schema-bound response. A 400/422 schema-unsupported response on the first attempt uses a single JSON-mode compatibility attempt. If it still fails, claims are **suppressed**, with `status: model_output_rejected` and safe failure reasons.
5. If Ollama is unavailable on the first call, the endpoint returns `status: model_unavailable`, zero claims, and deterministic source evidence for manual review. If the retry becomes unavailable after a rejected first response, the endpoint returns `model_output_rejected` with `retry_model_unavailable` in the reason list. There is no model-executed action, and the model never authorizes any command.
6. The prompt now contains only the registered event/document evidence, not the incident's general summary or unknowns. `missing_evidence` is returned independently to avoid attributing missing facts to unrelated event citations. This mitigates one observed failure mode but **does not prove claim-to-source entailment**.

### Nonclaims / security cautions

- **This is source-ID validation, not independent semantic entailment or fact-checking.** The model can still misstate what a cited source says.
- Local approval is a demo workflow, not verification of HPE URL contents, expertise, or release compatibility. Checksums verify bytes stored locally, not their truth.
- A blocked-phrases filter is not comprehensive prompt-injection resistance. Operators must review any generated text. The independent Sentinel policy remains the only simulated action gate.
- This remains local lexical excerpt selection + Ollama augmentation, **not a vector embedding index or full-manual RAG**. The corpus may be empty until authorized material is reviewed.
- No connection to a live HPE NonStop system exists; no commands are executed.

## Local validation

From the repo root:

```powershell
git pull
Push-Location backend
.\.venv\Scripts\python.exe -m pytest -q
Pop-Location
docker compose up -d --build

$payload = @{
  incident_id = 'INC-DISK-001'
  question = 'What synthetic events show the disk capacity trend?'
  release = 'L23.08'
  max_chunks = 3
} | ConvertTo-Json

Invoke-RestMethod 'http://localhost:8000/api/v1/investigate/grounded' -Method Post -ContentType 'application/json' -Body $payload | Select-Object status, root_cause_status, approved_corpus_chunks_in_context, citations_validation
```

**Baseline:** 84 tests previously passed locally. The reliability branch adds 7 new backend regression tests (expected total 91; do not claim they passed until the full local suite runs). Model output status can be `generated_unverified_citation_ids_checked`, `model_output_rejected` or `model_unavailable`, depending on Ollama responsiveness and JSON correctness. All are handled responses; a generated answer is *not* assured.

## Maggie's UI contract

Display claims with linked citation IDs and their registered source text. Visibly label:
- **Synthetic event** for `SIM-EVT-*`.
- **Locally approved user-supplied excerpt; authenticity not verified** for `DOC-*`.
- **Root cause not established** and **Generated content requires expert review**.

Do not show the result as an approved runbook, an automatically verified official HPE message, or a safe-to-execute command. Protected corpus ingestion and review should not put demo credentials into browser code.

## Consolidated branch verification (Windows)

From repository root, review and run the reliability branch without merging it to `main`:

```powershell
git fetch origin
git switch fix/sprint5-grounded-ai-reliability
.\scripts\verify_sprint5.ps1
```

The script runs the complete Python suite, rebuilds the same Docker services without removing volumes, checks backend health, and invokes each existing synthetic incident three times against local Ollama. It prints status, accepted claims, attempt count, safe state-change flags, failure reasons, and elapsed seconds. The script exits with an error if any live response fails or reports an unsafe flag. Six successes are an initial smoke result, **not** a statistical reliability guarantee. Never paste credentials or source documents into diagnostic reports.

### Known limits / follow-up before production

- A schema-supported Ollama build is preferred; a single older JSON-mode fallback is implemented for rejected schema requests. Model latency may increase if a retry occurs.
- Bad answers remain rejected. Safe failure with zero claims is correct behavior, not an invitation to bypass policy.
- The structured-output contract cannot verify semantic entailment. Verified source spans and independent evidence-checking are separate work.
- Existing frontend route `/api/v1/investigate` remains unchanged; Maggie can opt into `/api/v1/investigate/grounded` later and present deterministic `missing_evidence` with unverified claim labels. No UI change in this patch.
