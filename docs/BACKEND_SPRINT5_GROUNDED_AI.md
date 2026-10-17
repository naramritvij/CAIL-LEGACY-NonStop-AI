# Sprint 5 — Citation-bounded local AI investigation

**Status:** Implemented as an additive backend endpoint; isolated module tests passed. Full Windows API suite and live Ollama responses require verification after pulling this change.

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

The response is a structured evidence review, never an execution plan. Fields include `status`, `claims` with one to three `citations` per claim, `source_registry`, `release_requested`, `root_cause_status: not_established`, `excerpt_authenticity_verified: false`, `operational_action_authorized: false`, and `state_change_executed: false`.

### Data sources and trust boundaries

1. Synthetic incident evidence IDs (`SIM-EVT-*`) are provided from the deterministic training fixture. They are **not** official HPE operator-message numbers.
2. The release filter is mandatory. Optional document snippets come from **locally reviewed and approved**, user-supplied corpus entries for the exact requested release. Unapproved or wrong-release material is not included; the endpoint does not crawl HPE websites. SHA-256 of each excerpt is checked again immediately before model context assembly.
3. The untrusted question and snippets are serialized as data in a bounded Ollama prompt. The model receives no tool or execution interface; it cannot call Sentinel or change systems.
4. Ollama is asked to return a strict JSON `claims` structure. The backend validates citation identifiers against the actual source registry and applies a conservative text filter. When output is malformed or has fabricated IDs, claims are **suppressed**, with `status: model_output_rejected`.
5. If Ollama is unavailable, the endpoint returns `status: model_unavailable`, zero generated claims, and the deterministic source registry for manual review.

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

**Expected suite target:** 84 tests (69 previously verified on the user's laptop + 15 new isolated unit tests). Model output status can be `generated_unverified_citation_ids_checked`, `model_output_rejected` or `model_unavailable`, depending on Ollama responsiveness and JSON correctness. All are handled responses; a generated answer is *not* assured.

## Maggie's UI contract

Display claims with linked citation IDs and their registered source text. Visibly label:
- **Synthetic event** for `SIM-EVT-*`.
- **Locally approved user-supplied excerpt; authenticity not verified** for `DOC-*`.
- **Root cause not established** and **Generated content requires expert review**.

Do not show the result as an approved runbook, an automatically verified official HPE message, or a safe-to-execute command. Protected corpus ingestion and review should not put demo credentials into browser code.