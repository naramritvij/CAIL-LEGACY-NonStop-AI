# CAIL/Nonstop AI Operations Assistant — Current Architecture

**18 October 2026 · synthetic sponsor-completion PR #15, pending local verification.**

The React/Vite interface communicates with a FastAPI backend. The backend
collects only hand-authored synthetic incident fixtures, applies a default-deny
read-only policy, retrieves locally approved source excerpts and optionally
calls a Windows-hosted Ollama/Qwen3 model. SQLite stores reviewed Decision DNA.
It never connects to or controls a real HPE NonStop installation.

## System and trust flow

```text
Operator (React / Vite)  ──▶ Unified Command Console
                               │
              (validated exact reference / bounded natural question)
                               ▼
                         FastAPI Router
                               │
          ┌────────────────────┼─────────────────────┐
          ▼                    ▼                     ▼
   EMS / ASAP / Guardian    SCF / PATHCOM       Unsupported tools
  synthetic fixture read    reference-only      explicit UNAVAILABLE
          │                    │
          ▼                    ▼
   event/metric data       UNKNOWN real output
          │                    │
          └────────────┬───────┘
                       ▼
          Chronology and unknowns
                       │
         ┌─────────────┴─────────────────┐
         ▼                               ▼
    Local Qwen                      Human reasoning
 citation-ID validation           + independent review
         │                               │
    unverified claims             approved Knowledge Tree
         └───────────────────────────────┘
```

## APIs and lifecycle

| Domain | Path | Trust status |
|---|---|---|
| Incident queue and evidence | `/api/v1/incidents*` | Two original synthetic scenarios |
| Financial hardware failure | `/api/v1/operations/lab/scenarios` | Third fictional scenario, separate from original queue |
| Allowlisted command input | `POST /api/v1/operations/lab/command` | No native execution |
| Adapter inventory | `GET /api/v1/operations/lab/tools` | All eleven categories disclose no live connection |
| Qwen financial investigation | `POST /api/v1/operations/lab/ask` | Registered citation IDs, not claim entailment |
| Chronology and management briefing | `GET /api/v1/operations/lab/shift-summary` | Synthetic only |
| Study protocol | `GET /api/v1/operations/lab/evaluation-protocol` | No fabricated results |
| Incident-scoped command learning | `GET /api/v1/operations/incidents/{id}/playbook` | Documentation / preview |
| Source excerpt intake | `POST /api/v1/knowledge/corpus/documents` | Authorized paste, not verified original |
| Expert lessons and Mentor | `/api/v1/knowledge/lessons*` | Demo keys, draft→submit→review |
| Approved lesson tree | `/api/v1/knowledge/knowledge-tree` | Approved-only local data |

**Frontend:** Home, Investigate, Evidence, Operations Lab, Library, Mentor,
Knowledge Tree and Apprentice. Operators can switch from cross-tool console
results to existing incident investigations. The financial case has a separate
lab because adding a new fixture to the original `/incidents` queue would
change already tested sprint contracts; no substitution or hidden mapping is
claimed.

## Safety and source boundaries

- `STATUS PATHWAY`, `STATUS SERVER <serverclass>, DETAIL`, and
  `STATUS DISK $DATA03` are displayed only as HPE-documentation references.
  The command console does not execute them.
- `SHOW ALERTS`, `SHOW CPU METRICS` and similar phrases are CAIL UI
  intents to local fixtures, not native HPE commands.
- User input cannot pass executable shell commands, scripts or command
  pipelines to a tool. Unknown native syntax is blocked.
- A PATHCOM request on the disk scenario is context-mismatched and suggests
  switching to the correct Pathway scenario.
- SCF, PATHCOM and the remaining unsupported subsystems do not return invented
  authenticated native status.
- Ollama inference may return text only with registered citation identifiers;
  semantic support and document authenticity still require human review.
- Different private local expert/reviewer keys gate document and lesson
  approvals. No production identity or authorization system exists.
- No automatic text extraction from large copyrighted manuals, no external
  speech/audio capture, real time tool polling or production execution.

## Verification and limitations

The **previous** commit passed 146/146 Python tests, 15/15 frontend
contracts, 2/2 local Qwen investigations and safe PowerShell smoke checks.
The sponsor-completion commit contains new tests and **has not yet been
verified by the user's local Docker/Ollama suite**.

Do not invent new passing test counts, live uptime, authenticated source
provenance, real MTTR improvements or recovery results. See
`docs/REQUIREMENTS.md` and `docs/SPONSOR_MISSION_ACCEPTANCE.md`.
