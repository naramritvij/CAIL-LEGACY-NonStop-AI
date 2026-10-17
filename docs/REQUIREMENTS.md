# CAIL requirements traceability — Sprint 0

| Challenge capability | Initial implementation | Still required |
|---|---|---|
| Natural language | POST /api/v1/investigate uses optional local Ollama with evidence | Source-verified NonStop command templates, structured outputs |
| Health monitoring | GET /api/v1/incidents supplies synthetic metrics and timelines | Polling, richer visual trends, additional subsystems |
| Incident diagnosis | Synthetic hypotheses and missing evidence | Evidence correlation and document-cited troubleshooting |
| Expert knowledge | Unverified seed example | Review workflow, immutable provenance, persistent Decision DNA |
| Controlled automation | Default-deny read-only preview; destructive operations blocked | Authenticated approvals, true read-only adapter |
| Summaries | GET /api/v1/shift-briefing | Responsive handover view, signed shift ownership |

The current state is an **initial vertical slice**, not a completed solution. Synthetic evidence IDs are not HPE operator-message definitions. Measure user outcomes and model accuracy before presenting performance claims.
