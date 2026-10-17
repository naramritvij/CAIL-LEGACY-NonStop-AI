# Sprint 4 — Authorized excerpt ingestion, local evidence retrieval and limits

This optional feature allows a **local demo expert** to paste **licensed/authorized** HPE document excerpts with a release label and source URL. A separate reviewer approves or rejects them. Only approved chunks for the explicitly requested release are visible in public search results. This is **not automatic HPE manual download**, production certification, internet fact-checking, or embedding/vector RAG.

## New API

| Verb | Endpoint | Actor | Function |
|--|--|--|--|
| POST | `/api/v1/knowledge/corpus/documents` | Expert demo key | Import one bounded excerpt as draft; requires authorization checkbox |
| POST | `/api/v1/knowledge/corpus/documents/{id}/submit` | Expert demo key | Draft to submitted |
| POST | `/api/v1/knowledge/corpus/documents/{id}/review` | Reviewer demo key | Submitted to approved/rejected |
| POST | `/api/v1/knowledge/corpus/search` | Read-only | Search approved excerpts only, exact release filter |
| GET | `/api/v1/knowledge/corpus/status` | Read-only | Count stored records by status; no leaked draft text |

### Demo search

```powershell
$payload = @{ query = 'EMS collector message'; release = 'L23.08'; limit = 4 } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:8000/api/v1/knowledge/corpus/search' -Method POST -ContentType 'application/json' -Body $payload
```

With zero authorized excerpts, the result is **`no_match`**, which is intended. Do not paste HPE manuals or confidential customer logs without license/authority. Never commit secrets, source excerpts, or database files to Git. Existing pointer search in `/api/v1/knowledge/search` remains separate.

Each retrieval hit carries exact `citation_id`, `document_id`, `source_url`, `release`, `section`, `excerpt`, `chunk_sha256`, `document_sha256`, and a transparent lexical overlap rank. SHA checksums identify local bytes, **not external source authenticity**. Source domain and path are format checked, but text is not downloaded or compared with the source. Whitespace normalization, quote matches, claim-level semantic entailment, prompt injection resistance and HPE release compatibility require additional review. Retrieved excerpts are untrusted inputs. No commands can run through this feature.

## Safety and adversarial checks

- Missing/short expert or reviewer keys return errors, never default to accept.
- Separate expert and reviewer keys; zero draft/submitted/rejected visibility in retrieval.
- `source_url` must be an HTTPS public HPE docDisplay path, no userinfo/custom port.
- Uploads bounded at 12,000 characters and 30 chunks per document.
- Search returns exact release and approved status only; no best-guess cross-release fallback.
- Text including prompt injection markers is treated as passive data, **not trusted instructions**. This isolation should be revisited before adding LLM generation from excerpts.
- Synthetic sample text in unit tests is not a real HPE manual excerpt.

## Next step toward stronger RAG

Once properly authorized release-matched text is available, add verified-by-human span references, a content authenticity check, and a separate LLM grounded-answer path with strict cite-ID checking and evaluation. Do **not** label the current lexical index as embedding RAG or claim external content validation.