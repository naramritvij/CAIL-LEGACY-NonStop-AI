# Conversational workspace: implementation and integration

## Conversation memory

CAIL exposes one assistant, one knowledge graph and one connection screen. The white interface replaces the former dark shell. The source/activity inspector belongs to a saved answer; it is not another chat.

Every user turn and accepted assistant response is stored with evidence, source status and visible agent activity. Reloading or restarting the API does not discard SQLite records. Browser storage only remembers the selected thread.

Inference uses recent exchanges and earlier lexically relevant exchanges, including neighboring answers, within a bounded context budget. This is retrieval over complete saved history, not unlimited model memory. Standalone topics are routed afresh. Model unavailability is saved explicitly rather than replaced by a scripted imitation of an answer.

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

Nodes represent stored people, documents and topics. Directed edges distinguish contribution, topic membership and access. Actual document-view and assistant-retrieval events create access edges. Documents retain their contributor's identity.

The graph refreshes immediately after the current user's upload and every three seconds while visible. Other sessions see permitted changes on their next refresh. This is polling, not WebSocket streaming or background updates to inactive browsers.

Owners see drafts and rejected contributions. Reviewers see submitted documents and may review another contributor's submission. Approved material is shared with configured team operators and assistant retrieval. Access does not grant ownership, approve knowledge or clone a branch.

The graph shows up to 150 recently updated permitted documents and discloses that limit. Access relationships aggregate the complete retained history; the recent-activity list is bounded separately. Legacy reviewed knowledge is searchable, but old author aliases are not silently reassigned to authenticated employees.

Uploads retain extracted text rather than the original binary. Overlapping chunks, stable citation IDs, content digests and review status are stored. Scans require OCR. Retrieval uses lexical matching with model-driven rewriting and relevance evaluation; it does not claim vector embeddings.

## Identity

CAIL_WORKSPACE_USERS holds server-only operator configuration. Stable IDs own private threads and contributions. Roles are derived from server configuration on each request, never a claimed role or display name in a request. Removing a user revokes their sessions.

Login creates a random HttpOnly, SameSite Strict cookie with a 12-hour expiry. Only its hash is stored. Use HTTPS outside localhost; set CAIL_COOKIE_SECURE=true behind TLS termination if necessary. Preserve the original Host in reverse proxies because mutations reject mismatched browser Origins. Vite preserves it.

With no configured users and CAIL_WORKSPACE_LOCAL_DEMO=true, one demonstration operator is used with neither review nor live-read permission. Standard Docker ports are loopback-only. This is not enterprise SSO and must not be publicly exposed as an employee identity system.

## What the three connectors mean

These are separate products/interfaces. Monitoring access does not automatically give direct access to a customer's transaction database.

| Connector | Implemented CAIL transport | Environment owner must provision |
| --- | --- | --- |
| prognosis | Fixed HTTPS GET, Bearer authentication and normalized snapshot validation | Installed Prognosis release/API, licensing, read scopes and field mapping |
| asap | The same read-only HTTPS contract | Authorized Consumer API, EMS or published query/database path; Provider API supplies data and is not this assistant's read path |
| momi | The same read-only HTTPS contract | Vendor-approved collector for its proprietary client/server interface; no universal public MOMI REST endpoint is invented |

Primary sources checked November 4, 2026:

- [IR Infrastructure / Prognosis](https://www.ir.com/products/infrastructure)
- [NonStop ASAP programmatic interfaces](https://nonstopasap.com/index.htm)
- [MOMI server and client communication](https://www.momi.com/momi/documentation/5.21/WebHelp/Content/Topics/MOMI%20Server/Server_Overview.htm)

The MOMI reference is older documentation and does not establish the customer's current supported interface. Confirm the installed release with the vendor or CAIL sponsor.

No customer endpoint, credential or schema was supplied. This change implements and tests the connector boundary, not a live customer integration. The UI shows no verified sources until configuration and a successful authorized check.

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
| POST | /documents | Add text under the current operator |
| POST | /documents/upload | Extract a document into a draft |
| GET | /documents/{id} | Check access and record a view |
| POST | /documents/{id}/review | Owner submission or independent review |
| GET | /connections | Safe metadata and permitted observations |
| POST | /connections/{source}/check | Authorized source read and provenance |

Older APIs remain available. Their shared demonstration credentials do not grant identity, review or live-read permissions in this workspace.

## Verification limits

Tests use isolated SQLite databases, configured test identities, controlled model responses and connector snapshots. They exercise actual API/storage/orchestration/graph behavior without claiming customer connectivity.

The frontend is typechecked and production-built. Existing contracts remain intact. The managed preview here lacked FastAPI's Python dependencies, so full browser verification remains incomplete. A running local Qwen instance and real authorized vendor endpoints were also unavailable; model quality and vendor compatibility require validation in the owner's environment.
