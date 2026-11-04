# Conversational workspace: implementation and integration

## Conversation memory

CAIL exposes one assistant, one knowledge graph and one connection screen. The white interface replaces the former dark shell. The source/activity inspector belongs to a saved answer; it is not another chat.

Every user turn and accepted assistant response is stored with evidence, source status and visible agent activity. Reloading or restarting the API does not discard SQLite records. Browser storage only remembers the selected thread.

Inference uses recent exchanges and earlier lexically relevant exchanges, including neighboring answers, within a bounded context budget. This is retrieval over complete saved history, not unlimited model memory. Standalone topics are routed afresh. Model unavailability is saved explicitly rather than replaced by a scripted imitation of an answer.

Explicit user requests to remember a note are prioritized even when a later recall question shares no words with that note. General conversation uses a dedicated conversational prompt and the original user message, without an empty monitoring-evidence envelope. User-supplied names, preferences and corrections need no external monitoring verification. Their reports about operational status remain unverified reports and cannot confer permissions or substitute for live evidence.

Requests use idempotency keys and a database response lease. A retry returns the same answer. Reusing a key for a different question is rejected. Concurrent responses in one thread are rejected rather than reordered. Interrupted placeholders recover after the bounded lease expires.

## Orchestration

1. Memory selects earlier user and assistant turns.
2. The planning agent resolves follow-ups and chooses general, knowledge, live or explicitly synthetic work.
3. Knowledge and telemetry workers run concurrently when relevant. Knowledge retrieves reviewed document chunks, existing approved Decision DNA and release-filtered corpus excerpts. Telemetry reads only the registered connectors and only for an authorized operator.
4. The evaluation agent assesses excerpt relevance and coverage. It can suggest another query, subject to five attempts and an elapsed-time bound. It cannot approve documents, grant access or execute commands.
5. The response agent synthesizes an answer with supplied citation IDs. One correction is allowed for bad formatting/citations; unknown IDs are rejected.
6. The full answer, evidence and activity are saved before the API returns.

Visible activity reports actions, outcomes and timing, never private model reasoning. Citation-ID validation proves that an identifier was retrieved; it does not prove every claim.

A live investigation without fresh authorized observations deterministically withholds a system-health conclusion. An approved runbook does not establish current health. Synthetic examples are opt-in, labelled, and never substitute for failed live access.

## Knowledge provenance

Nodes represent stored people, documents, topics, cited passages, literal references and permitted imported/live source entities. Directed edges distinguish contribution, topic membership, access, contains/mentions, supplied source relationships and explicit document attachments. Actual document-view and assistant-retrieval events create access edges. Documents retain their contributor's identity.

The graph refreshes immediately after the current user's upload and every three seconds while visible. Other sessions see permitted changes on their next refresh. This is polling, not WebSocket streaming or background updates to inactive browsers.

Owners see drafts and rejected contributions. Reviewers see submitted documents and may review another contributor's submission. Approved material is shared with configured team operators and assistant retrieval. Access does not grant ownership, approve knowledge or clone a branch.

The graph defaults to a perspective 3D view with a three-dimensional worker layout and animated document arrivals/link growth. A 2D Sigma/WebGL view with a canvas fallback remains available. It projects up to 3,000 recently updated permitted documents and a bounded overview of up to 12,000 nodes / 50,000 relationships. JSON/CSV topology imports support up to 25,000 nodes / 100,000 relationships within 16 MiB. Server search and bounded neighborhood expansion reach entities outside the overview. Clipping is disclosed. Access relationships aggregate the complete retained history; the recent-activity list is bounded separately. Legacy reviewed knowledge is searchable, but old author aliases are not silently reassigned to authenticated employees.

Source entities and their actual supplied relationships can be imported as a private review-gated dataset or read from an authorized source-specific topology gateway. The three optional CAIL_LIVE_<SOURCE>_TOPOLOGY_URL settings use the corresponding existing source token. Topology is separate from numeric snapshots; source/system identities, observation time, bounded structure and SHA-256 provenance are validated. Failed reads retain labelled stale topology; disabling the source hides it. No sample data substitutes for live data.

Selecting an entity shows its properties and neighbors. Attaching knowledge inserts the draft contribution and explicit link in one transaction. Import approval controls sharing; only approved document text enters assistant retrieval. See the [large graph and topology guide](SCALABLE_GRAPH.md) for schemas, foreground refresh behavior, limits and verification.

New document uploads automatically create passage networks using stored citation IDs and literal references. Existing owned contributions can be indexed in batches. Reference manuals support 32 MiB / 1,000 pages / 2,000,000 extracted characters. The fixed HPE publisher catalog can download actual reference PDFs with original file hashes and cover edition metadata, without fetching arbitrary user-entered URLs. Reimporting an identical publisher file under the same owner reuses it. Public references remain review-gated; older editions do not imply compatibility with the current release.

Uploads retain extracted text rather than the original binary. Overlapping chunks, stable citation IDs, content digests and review status are stored. Scans require OCR. Retrieval uses lexical matching with model-driven rewriting and relevance evaluation; it does not claim vector embeddings.

## Identity

CAIL_WORKSPACE_USERS holds server-only operator configuration. Stable IDs own private threads and contributions. Roles are derived from server configuration on each request, never a claimed role or display name in a request. Removing a user revokes their sessions.

Login creates a random HttpOnly, SameSite Strict cookie with a 12-hour expiry. Only its hash is stored. Use HTTPS outside localhost; set CAIL_COOKIE_SECURE=true behind TLS termination if necessary. Preserve the original Host in reverse proxies because mutations reject mismatched browser Origins. Vite preserves it.

With no configured users and CAIL_WORKSPACE_LOCAL_DEMO=true, one demonstration operator is used with neither review nor live-read permission. Standard Docker ports are loopback-only. This is not enterprise SSO and must not be publicly exposed as an employee identity system.

## What the three connectors mean

These are separate products/interfaces. Monitoring access does not automatically give direct access to a customer's transaction database.

| Connector | Implemented CAIL transport | Environment owner must provision |
| --- | --- | --- |
| prognosis | Direct fixed allowlisted HTTPS dataset GET with Basic authentication and configurable columns, or normalized Bearer-authenticated gateways | Installed Prognosis release/API, approved dataset, read account and field mapping |
| asap | The same read-only HTTPS contract | Authorized Consumer API, EMS or published query/database path; Provider API supplies data and is not this assistant's read path |
| momi | Read-only alarm export directory / explicit export import, or normalized HTTPS gateway | Approved MOMI client/export job or vendor-approved collector; no universal public MOMI REST endpoint is invented |

Primary sources checked November 4, 2026:

- [IR Infrastructure / Prognosis](https://www.ir.com/products/infrastructure)
- [NonStop ASAP programmatic interfaces](https://nonstopasap.com/index.htm)
- [MOMI server and client communication](https://www.momi.com/momi/documentation/5.21/WebHelp/Content/Topics/MOMI%20Server/Server_Overview.htm)

The MOMI reference is older documentation and does not establish the customer's current supported interface. Confirm the installed release with the vendor or CAIL sponsor.

No customer endpoint, credential or schema was supplied. This change implements and tests the connector boundary, not a live customer integration. The UI shows no verified sources until configuration and a successful authorized check.

Direct native settings and publisher import are documented in [NATIVE_SOURCE_SETUP.md](NATIVE_SOURCE_SETUP.md). Native observations also flow into the authorized telemetry worker. Wrong-system reads fail; changing a native system scope hides the old graph/history before another read. Native health remains unknown rather than being inferred from an empty alarm collection or successful transport. The Bearer snapshot contract below still applies to normalized gateways.

### Gateway contract

The following is a schema example, not production observations. Supply real source/system identities, actual values and current observation times.

~~~json
{
  "source_id": "prognosis",
  "system_id": "AUTHORIZED-SYSTEM-ID",
  "observed_at": "2026-11-04T12:00:00Z",
  "health": "unknown",
  "records": [{
    "id": "SOURCE-RECORD-ID",
    "timestamp": "2026-11-04T12:00:00Z",
    "name": "Source-provided metric",
    "component": "SOURCE-COMPONENT-ID",
    "value": 31.0,
    "unit": "%"
  }]
}
~~~

The transport enforces HTTPS, an allowlisted host, a fixed URL and a server-only read token of at least 24 characters. URL credentials/fragments and redirects are refused; normal TLS verification stays enabled.

Reads time out after six seconds. Responses must be JSON, at most 512 KB, with the correct source identity, a bounded system ID, and at most 100 bounded scalar records with source IDs. Snapshot observation times must include a time zone and be at most 300 seconds old or 60 seconds in the future.

Explicit source health is retained; empty evidence remains unknown. SHA-256 snapshot provenance is stored. No native command transport exists.

Individual historical events may predate a snapshot. The gateway observation time must represent the actual source observation, not merely the HTTP request. Do not restamp old measurements as fresh data.

The Connections view charts only actual numeric observations in successful snapshots. Failed reads invalidate connection state; stale or disabled sources cannot become connected through fallback. Internal endpoints and credentials are never sent to the browser or model.

### Activate real access

1. Obtain authorized, release-specific source access and a least-privilege collector account.
2. Provision the normalized HTTPS endpoints.
3. Set CAIL_LIVE_ENABLED, CAIL_LIVE_ALLOWED_HOSTS and each source URL/token privately.
4. Grant the actual operator can_read_live=true on the server.
5. Recreate the backend and select Connections → Verify source.
6. Inspect system identity, observation time and evidence before relying on it.
7. Optionally enable the 15-second refresh while that screen is open.

The assistant cannot create credentials, change source permissions, execute TACL/SCF/PATHCOM commands or access arbitrary internal URLs.

## API

All paths below are under /api/v1/workspace. Record permissions are enforced server-side.

| Method | Path | Behavior |
| --- | --- | --- |
| GET / POST | /session | Read identity / establish operator session |
| POST | /session/logout | Revoke session |
| GET / POST | /conversations | List owned threads / create thread |
| GET | /conversations/{id} | Complete transcript and response metadata |
| POST | /conversations/{id}/messages | Persist question, orchestrate, persist answer |
| GET | /graph | Permission-scoped ownership/access projection |
| POST | /graph/import | Import review-gated JSON/CSV topology |
| POST | /graph/sync | Read configured authorized topology gateways |
| GET | /graph/search | Search permitted source entities beyond the overview |
| GET | /graph/node | Source entity details and provenance |
| GET | /graph/neighborhood | Bounded permitted relationships and attachments |
| POST | /graph/links | Attach an owned document to a permitted node |
| POST | /graph/index-documents | Index existing owned text into cited passage/reference networks |
| POST | /graph/monitoring-import | Parse a Prognosis JSON or MOMI TXT/LOG/TSV export |
| POST | /documents | Add text under the current operator |
| POST | /documents/upload | Extract a document into a draft |
| POST | /documents/manual | Large reference document with edition/source metadata |
| GET / POST | /references / /references/import | Fixed public HPE catalog / actual publisher import |
| GET | /documents/{id} | Check access and record a view |
| POST | /documents/{id}/review | Owner submission or independent review |
| GET | /connections | Safe metadata and permitted observations |
| POST | /connections/{source}/check | Authorized source read and provenance |

Older APIs remain available. Their shared demonstration credentials do not grant identity, review or live-read permissions in this workspace.

## Verification limits

Tests use isolated SQLite databases, configured test identities, controlled model responses and connector snapshots. They exercise actual API/storage/orchestration/graph behavior without claiming customer connectivity.

The frontend is typechecked and production-built, and the existing contracts remain intact. On November 4, 2026, the owner passed the real-model acknowledgement/topic-change/recall/transcript test in the running Windows/Docker application. Browser screenshots also confirmed the light workspace, document ingestion, ownership/access/topic edges, and submission changing to Awaiting Review. See the [local verification record](LOCAL_VERIFICATION_2026-11-04.md).

The managed browser preview could not run the Python backend. The owner's checks establish the specific flows above, not exhaustive browser coverage or general model correctness. Later renderer checks used clearly labelled synthetic networks of up to 12,000 nodes, including fallback rendering, zoom, selection, focused connections and an added linked document. Backend tests separately exercise large imports, privacy, independent review, attachments and all three topology-only connectors. Independent approval, cross-employee access and timed cross-session refresh remain to be checked in the owner's running application. Real authorized vendor endpoints are still unavailable, so vendor compatibility and live NonStop connectivity remain unverified.

The subsequent publisher-import API performed real HPE HTTPS downloads and generated a 1,524-node / 2,607-edge projection from two actual PDFs; that projection was rendered in the shared 3D viewer. This verifies public documentation ingestion, not a private customer connection. The [technical review](TEAM31_TECHNICAL_REVIEW.md) records original file hashes, editions, counts and comparison-source permalinks.
