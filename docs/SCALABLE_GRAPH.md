# Large knowledge and operational networks

Implemented November 4, 2026. This guide describes the graph renderer, stored topology, attachments and read-only source contract. No customer credentials, proprietary dataset or verified CAIL connection are included in the repository.

## Use the graph

1. Open **Knowledge graph**. Existing contributions and actual access events remain visible.
2. Choose **Import dataset** for JSON/CSV topology, Prognosis dataset JSON or a MOMI alarm export. Choose **Add knowledge → HPE references** to import a real publisher PDF, or upload a manual. Documents create actual passage/reference nodes; they do not establish physical infrastructure dependencies.
3. Zoom with the wheel or controls; drag the background to pan. Drag a node to reposition it. The layout runs in a worker; pause or arrange it with the layout control.
4. Select a node to inspect its source, properties and connected nodes. **Focus only** isolates a bounded selection of immediate relationships. Use the inspector's connected-node list to browse every loaded connection and follow a particular passage or entity.
5. Select **Attach knowledge** to add a note or document linked to that node. It appears under its actual contributor, with a separate directed document-to-node relationship. Existing contributor and topic relationships remain.
6. Submit the contribution for independent review when ready. Adding or accessing knowledge never transfers ownership or approves it.

New nodes enter near an existing neighbor and animate into view. Keyed updates preserve positions and the camera. People, documents, topics, source entities and source roots have different colors; colors identify categories, not system health. Stale source entities are grey. Selected relationships have arrows; their exact relationship labels appear in the inspector.

A large manual does not highlight every passage at once. Selection emphasizes at most 24 relationships, prioritizing contributors, topics, sources and attached documents before sampling passages. The canvas reports the highlighted and loaded counts. Source records remain intact; the connected-node list, search and individual passage selection still reach the other relationships. Canvas labels use strict collision rejection, with the selected label first and passage excerpts deferred until zoomed in. Focus frames the selected connections rather than applying a fixed zoom into the hub. The same selection budget applies to 3D, 2D WebGL and the 2D fallback.

Search covers loaded knowledge and the permitted stored topology. A server search can find an entity outside the initial overview, and selecting it loads its neighborhood. Dataset and review filters narrow the display. The expandable node list and inspector provide keyboard navigation alongside the canvas.

The default is a perspective 3D camera with orbit, depth, pan, focus and node dragging. A `d3-force-3d` worker computes three-dimensional positions with uniform node charge, avoiding a large manual's high degree being treated as enormous mass. New documents arrive from alternating sides and their links grow into view. Software projection keeps this view available without WebGL. The 2D option uses Sigma 3/WebGL and a ForceAtlas2 worker, with a 2D canvas fallback. No mode creates thousands of SVG/DOM node elements. Reduced-motion preferences disable automatic layout and node-entry animation. Layout coordinates visualize relationships, not physical locations.

## What the data means

| Record | Origin and visibility |
| --- | --- |
| Person, knowledge document, topic | Actual workspace records; contribution, topic and access edges come from stored events |
| Passage and literal reference | Stored text, existing citation IDs and literal occurrences; document permissions apply and no causal/physical link is inferred |
| Imported source entity and relationship | Exactly the nodes and relationships supplied in an export; private while its root document is a draft |
| Live source entity and relationship | A successful authorized HTTPS topology read with source/system identity, observation time and SHA-256 provenance |
| Attached knowledge | A stored contribution linked to a permitted graph node, retaining its owner and review state |

An import does not become a live connection. The graph does not guess dependencies from a PDF, create decorative employees, or connect every entity to a root with invented operational relationships. Source membership is metadata and a filter. Cross-vendor identities are namespaced; equal display names do not prove two entities are the same system.

Importing creates a root contribution and its topology in one SQLite transaction. The owner sees the draft. An independent reviewer sees submitted data; configured operators see approved data. Entity search, details, neighborhoods and attachments enforce the same permissions server-side. Imported entity types such as `person` do not impersonate authenticated employee identities. Only approved **document text** enters assistant retrieval; importing topology does not automatically teach the model every entity/property.

Document uploads create a separate `document_evidence` projection automatically. The document contains passage nodes whose exact text/citation can be opened. Literal product/command references connect through `mentions` relationships. Existing owned documents can be indexed in batches of 20. The publisher catalog downloads only fixed HPE PDFs, retains actual cover editions and original file hashes, and deduplicates identical reimports within the same owner. It does not grant automatic knowledge approval.

## Export formats

JSON uses the following schema example, not production observations:

```json
{
  "nodes": [
    {"id": "SOURCE-SYSTEM-ID", "label": "Source system", "type": "system", "properties": {"region": "Source value"}},
    {"id": "SOURCE-SERVICE-ID", "label": "Source service", "type": "service"}
  ],
  "edges": [
    {"id": "SOURCE-RELATION-ID", "source": "SOURCE-SYSTEM-ID", "target": "SOURCE-SERVICE-ID", "label": "hosts"}
  ]
}
```

Use actual source IDs, labels and relationships from the authorized export. Node IDs must be unique. Every relationship must reference a supplied node. Self-links and multiple distinct relationships are supported. Optional `status` is retained as a source value, not independently verified health.

Graphology exports with node `key` and `attributes`, and edge `key`, `source`, `target` and `attributes.label`, are also accepted. Extra scalar node attributes are retained except rendering fields. An `edges` array can alternatively be named `links`.

CSV relationships use UTF-8 and these column names:

```csv
source,target,relationship,source_label,target_label,source_type,target_type
SOURCE-SYSTEM-ID,SOURCE-SERVICE-ID,hosts,Source system,Source service,system,service
```

A node-only CSV may instead use `id,label,type` plus scalar property columns. Node-only files have no inferred relationships. Use JSON when a dataset needs both richer properties and relationships.

Properties are bounded scalar values. Obvious credential field names are stripped, but this is not a comprehensive content sanitizer: supply only information authorized for this workspace.

## Connect actual Prognosis, ASAP and MOMI topology

Direct Prognosis REST datasets and read-only MOMI export directories are now also supported, along with raw export uploads. Those source rows create observation networks, rather than inferred physical topology. See [NATIVE_SOURCE_SETUP.md](NATIVE_SOURCE_SETUP.md) for exact configuration, field mapping, scope and freshness checks. The normalized topology gateway contract below remains supported, including ASAP.

These are distinct installed products. A configured numeric metric endpoint does not automatically expose a topology or the customer's transaction database. Obtain the installed release's read interface, entitlement and schema from CAIL/the environment owner. Normalize the approved entities and relationships through the existing read-only gateway boundary. No universal native vendor REST path is assumed.

| Source | Optional topology endpoint | Existing server-only token |
| --- | --- | --- |
| IR Prognosis | `CAIL_LIVE_PROGNOSIS_TOPOLOGY_URL` | `CAIL_LIVE_PROGNOSIS_TOKEN` |
| HPE ASAP | `CAIL_LIVE_ASAP_TOPOLOGY_URL` | `CAIL_LIVE_ASAP_TOKEN` |
| MOMI | `CAIL_LIVE_MOMI_TOPOLOGY_URL` | `CAIL_LIVE_MOMI_TOKEN` |

The existing `CAIL_LIVE_<SOURCE>_URL` settings remain separate numeric observation endpoints. Either capability can be configured independently. Connections reports whether metrics, topology or both are available; topology does not fabricate a metric chart.

Configure privately in the ignored local `.env`:

```dotenv
CAIL_LIVE_ENABLED=true
CAIL_LIVE_ALLOWED_HOSTS=YOUR-AUTHORIZED-GATEWAY-HOST
CAIL_LIVE_PROGNOSIS_TOPOLOGY_URL=https://YOUR-AUTHORIZED-GATEWAY-HOST/YOUR-APPROVED-READ-PATH
CAIL_LIVE_PROGNOSIS_TOKEN=YOUR-PRIVATE-READ-TOKEN-AT-LEAST-24-CHARACTERS
```

Replace every placeholder with provisioned values; do not commit the file or send credentials in chat. Add corresponding ASAP/MOMI settings only for approved sources. Configure an operator with `can_read_live=true` in `CAIL_WORKSPACE_USERS`; the anonymous local demo operator cannot read live data. See [operator configuration](../README.md#operators-and-document-review).

The topology endpoint must return the `nodes` and `edges` schema above plus:

```json
{
  "source_id": "prognosis",
  "system_id": "ACTUAL-AUTHORIZED-SYSTEM-ID",
  "observed_at": "2026-11-04T12:00:00Z",
  "nodes": [{"id": "ACTUAL-SOURCE-ID", "label": "Actual source label", "type": "system"}],
  "edges": []
}
```

This is a contract example. Set `source_id` to the matching `prognosis`, `asap` or `momi`. Use a current timezone-aware observation time representing the actual source observation, not a restamp of old data. An empty relationship array is allowed; at least one node is required.

The backend issues a fixed allowlisted HTTPS GET with Bearer authentication, verifies TLS, rejects redirects and URL credentials/fragments, and times out after 15 seconds. Topology responses must be JSON and fit within 16 MiB. Source identity, node references, property bounds and timestamps are validated before a transaction replaces the projection. Snapshots older than 300 seconds or over 60 seconds in the future are rejected. Stable source/system/node identities preserve graph IDs and document attachments across updates. A changed system identity gets different entity IDs, so old annotations are not silently rebound to another system.

After changing configuration, recreate the backend with `docker compose up -d --build`. Sign in as the authorized operator. Open Knowledge graph and select **Refresh sources**, or use **Connections → Verify source** for a topology-only source. No real source is marked connected before a successful read.

Failed reads mark retained source data stale; old data is never presented as a successful current connection. Disabling a source or revoking live-read permission hides that source's entities. A missing entity in a later snapshot no longer appears; its knowledge documents remain stored without being reassigned to a different entity.

## Updates and bounds

| Operation | Bound / behavior |
| --- | --- |
| Import or one live response | 16 MiB, 25,000 nodes, 100,000 relationships |
| Reference manual / publisher PDF | 32 MiB, 1,000 PDF pages, 2,000,000 extracted characters; publisher reads time out at 20 seconds |
| Native alarm dataset/export | At most 5,000 source rows; native assistant snapshots disclose a 100-row bound |
| Initial graph overview | 12,000 nodes, up to 50,000 relationships with visible endpoints |
| Knowledge contribution projection | Up to 3,000 permitted documents; clipping is disclosed |
| Entity neighborhood expansion | Up to 500 relationships, including permitted attachments; truncation is disclosed |
| Selected-node emphasis | Up to 24 loaded relationships; contributor/topic/attachment links precede sampled passages |
| Server entity search | Up to 50 results per query, across permitted datasets |
| Workspace graph polling | Every 3 seconds while visible, with a revision cursor to skip unchanged payloads |
| Configured topology reads | Every 15 seconds while the graph is visible and live updates are enabled |

These are bounded views, not a claim that the entire enterprise fits in a single canvas. Dataset counts and view limits are disclosed. Search/expansion can reach stored entities omitted from the overview. Performance depends on the device and graph density; no fixed frame-rate guarantee is made. Live reads and polls run in the foreground, not as a server-side scheduled collector. Other active sessions see a permitted committed contribution on their next poll, plus request time.

## API additions

Paths are under `/api/v1/workspace` and require the workspace identity:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/graph?cursor=...` | Bounded permitted projection, or `not_modified` if unchanged |
| POST | `/graph/import` | Multipart `title` and JSON/CSV `file`; creates a private draft dataset |
| POST | `/graph/sync?source_id=prognosis` | Read one configured source; omit the query for all configured sources |
| GET | `/graph/search?q=...` | Search permitted source entity labels/IDs beyond the overview |
| GET | `/graph/node?node_id=...` | Permission-checked entity properties and provenance |
| GET | `/graph/neighborhood?node_id=...` | Bounded source relationships and permitted attachments |
| POST | `/graph/links` | Link an owned existing `document_id` to a permitted `target_node_id` |
| POST | `/documents` or `/documents/upload` | Optional `target_node_id` atomically attaches the new draft |
| POST | `/documents/manual` | Large PDF/TXT/Markdown manual with edition/source provenance |
| GET / POST | `/references` / `/references/import` | Fixed HPE catalog / actual publisher PDF import |
| POST | `/graph/index-documents` | Index existing owned text into citation-backed passage networks |
| POST | `/graph/monitoring-import` | Import literal Prognosis JSON or MOMI alarm rows as a draft snapshot |

## Verification

Backend tests exercise 5,000-node imports, a 13,000-node bounded projection/search/expansion, invalid-import rollback, independent review, cross-user privacy, atomic attachments, stable IDs, changed-system annotation isolation, stale/failure/revocation handling and all three named topology connectors without metrics endpoints. Live HTTP tests use controlled test responses, not customer systems.

Browser checks used the shared renderer with explicit synthetic networks of 1,000, 5,000 and 12,000 nodes (up to 15,998 edges). The cloud browser lacked WebGL, so the 2D fallback was visually checked, including selection, focused relationships, a linked document addition, fit and zoom. No application console errors were reported. This does not establish hardware WebGL performance or an end-to-end customer integration. The managed browser preview could not run the Python backend; actual API/storage/review behavior was covered separately by backend tests.

For repeatable renderer QA, run frontend development and open `/graph-benchmark.html`. That page is labelled synthetic, writes no database records and is not an entry in the production Vite build or app navigation. No test network is seeded into the application.

Run `npm run test:graph` for the dense-manual regression: 1,222 passage leaves, contributor/topic/source/attachment priority, unchanged source records, stable selection across insertion order, visibility filters, individual passage navigation, strict label collisions, bounded 3D/2D drawing at three zoom levels, framing of selected connections, bounded manual-arrival animation and changed relationship endpoints without moving nodes. The QA page also offers a **Large manual hub** topology up to 12,000 nodes, which covers the high-degree selection missed by a branching network.

The readability fix was also checked in the browser against the actual 1,524-node publisher projection: selecting TACL disclosed 24 of 1,224 loaded relationships, and an individual passage retained all three of its connections. The separate synthetic manual fixture disclosed 24 of 11,999 connections at 12,000 nodes, then 24 of 12,000 after adding a linked document. The 3D view and 2D canvas fallback were checked; the verification browser did not provide WebGL.

The owner's earlier Windows/Qwen/contribution checks are recorded separately in [local verification](LOCAL_VERIFICATION_2026-11-04.md). Actual CAIL connectivity requires an authorized export or provisioned topology endpoints; neither was supplied during this change.

The later 3D/document update performed real HPE publisher imports through the API: two PDFs, 767 pages, 1,524 nodes and 2,607 relationships. That actual backend projection was visually checked in the shared 3D renderer. Native monitoring tests use controlled responses/files; no private customer connection is claimed. See [the source review and verification record](TEAM31_TECHNICAL_REVIEW.md).

References: [Sigma 3](https://v3.sigmajs.org/docs/) and [Graphology ForceAtlas2](https://graphology.github.io/standard-library/layout-forceatlas2.html).
