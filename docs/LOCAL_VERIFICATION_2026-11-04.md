# Local verification — November 4, 2026

The project owner verified the following on Windows with Docker Desktop, Chrome and the configured local Ollama/Qwen model. These observations supplement automated regression tests; they do not establish production readiness or live customer connectivity.

## Confirmed locally

| Check | Observed result | Evidence |
| --- | --- | --- |
| Docker application startup | Frontend and backend images built; both containers started | Owner-provided terminal output and screenshot |
| Rebuilt workspace | Light interface with Assistant, Knowledge Graph and Connections loaded at localhost:5173 | Owner-provided browser screenshot |
| Remember a user-provided name | The model acknowledged a fresh checklist name | Real application smoke-test output |
| Unrelated topic | The model explained API in one sentence | The same smoke-test conversation |
| Follow-up recall | The model correctly recalled the original checklist name after the topic change | The same smoke-test conversation |
| Saved transcript | The smoke test read back all six user/assistant turns and reported PASS | Actual workspace API readback |
| Document ingestion | Uploaded content appeared as extracted source text in the document inspector | Owner-provided graph screenshot |
| Contribution ownership | The document was linked to Local operator by a contributed edge | The same graph screenshot |
| Document access event | Opening the document produced an accessed edge | The same graph screenshot; this was the owner's own access |
| Topic relationship | The document was linked to its assigned NonStop operations topic | The same graph screenshot |
| Submit for review | The inspector changed from Draft to Submitted; the node displayed Awaiting Review | Subsequent owner-provided screenshot |

No uploaded document body, account keys or local database contents are included in this verification record.

## Real-model test

The owner ran the included test against the actual running application:

~~~powershell
docker compose exec backend python -m app.conversation_smoke
~~~

The application acknowledged a newly generated checklist name, answered an unrelated API question, recalled the name correctly, and returned:

~~~text
PASS: real-model acknowledgement, topic change, recall and six persisted turns.
~~~

This confirms that specific acknowledgement/topic-change/recall path and its transcript readback. It does not establish correctness for every question, unlimited context retention, cross-conversation memory or retention after every possible failure.

The earlier conversational refusal was fixed by giving ordinary conversation its own instructions and passing the actual user message without an empty monitoring-evidence packet. Explicit requests to remember a note receive priority in bounded history selection. User-provided operational reports still do not verify real system health.

## Automated checks

At source commit [9320afd](https://github.com/naramritvij/CAIL-LEGACY-NonStop-AI/commit/9320afd6d49af163aeeafad87d94253a9b1a1781):

- 259 backend tests passed locally.
- The 26 existing frontend contract checks and production TypeScript/Vite build passed in the update's CI.
- [GitHub Actions run 24](https://github.com/naramritvij/CAIL-LEGACY-NonStop-AI/actions/runs/41795780866) completed successfully.
- Python compilation and whitespace checks passed.

Automated connector/model regressions use controlled doubles. The real-model result above is separately reported from the owner's running application.

## Still to verify or configure

| Area | Current boundary / next verification |
| --- | --- |
| Independent document approval | Configure a different reviewer identity and approve the submitted document; the owner's submission is not approval |
| Another employee's access | Configure another operator and confirm that accessing approved knowledge adds that operator's access edge while preserving the contributor |
| Retrieval of this uploaded document | It remains Submitted and must not enter assistant retrieval until independently approved |
| Cross-session refresh timing | Three-second polling is implemented; a timed test across two sessions has not yet been reported |
| Restart retention in the owner's environment | SQLite persistence is implemented; a separate owner-run restart/recovery check is still useful |
| Prognosis, ASAP and MOMI | Gateway adapters and guarded read contracts are implemented; real authorized endpoints, credentials and release-specific mapping are not supplied or verified |
| Broader browser/model behavior | The owner has verified the screens and flows above; this is not exhaustive browser or model-quality coverage |
| Enterprise identity | Configured operator sessions are available; enterprise SSO and production certification are not implemented |

The demonstrated user remains Local operator in a local workspace. The existing uploaded contribution and conversation records remain in the local SQLite volume; repository updates do not publish that data.
