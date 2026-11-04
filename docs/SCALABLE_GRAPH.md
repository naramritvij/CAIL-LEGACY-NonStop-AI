# Large knowledge and operational networks

Implemented November 4, 2026. This guide describes the graph renderer, stored topology, attachments and read-only source contract. No customer credentials, proprietary dataset or verified CAIL connection are included in the repository.

## Use the graph

1. Open **Knowledge graph**. Existing contributions and actual access events remain visible.
2. Choose **Import dataset** to upload an authorized JSON or CSV topology export. A PDF is a knowledge document, not a topology export: its text alone does not supply thousands of operational nodes or validated dependencies.
3. Zoom with the wheel or controls; drag the background to pan. Drag a node to reposition it. The layout runs in a worker; pause or arrange it with the layout control.
4. Select a node to inspect its source, properties and connected nodes. **Connections only** isolates its immediate relationships. Use the inspector's connected-node list to follow a relationship.
5. Select **Attach knowledge** to add a note or document linked to that node. It appears under its actual contributor, with a separate directed document-to-node relationship. Existing contributor and topic relationships remain.
6. Submit the contribution for independent review when ready. Adding or accessing knowledge never transfers ownership or approves it.

New nodes enter near an existing neighbor and animate into view. Keyed updates preserve positions and the camera. People, documents, topics, source entities and source roots have different colors; colors identify categories, not system health. Stale source entities are grey. Relationship labels and arrows are available in the selected view.

Search covers loaded knowledge and the permitted stored topology. A server search can find an entity outside the initial overview, and selecting it loads its neighborhood. Dataset and review filters narrow the display. The expandable node list and inspector provide keyboard navigation alongside the canvas.

The preferred renderer is Sigma 3 with WebGL, Graphology and a ForceAtlas2 worker. A 2D canvas renderer supports zoom, pan, node dragging, selection and highlighting when WebGL is unavailable. Neither renderer creates thousands of SVG or DOM node elements. Reduced-motion preferences disable automatic layout and node-entry animation.

## What the data means

| Record | Origin and visibility |
| --- | --- |
| Person, knowledge document, topic | Actual workspace records; contribution, topic and access edges come from stored events |
| Imported source entity and relationship | Exactly the nodes and relationships supplied in an export; private while its root document is a draft |
| Live source entity and relationship | A successful authorized HTTPS topology read with source/system identity, observation time and SHA-256 provenance |
| Attached knowledge | A stored contribution linked to a permitted graph node, retaining its owner and review state |

An import does not become a live connection. The graph does not guess dependencies from a PDF, create decorative employees, or connect every entity to a root with invented operational relationships. Source membership is metadata and a filter. Cross-vendor identities are namespaced; equal display names do not prove two entities are the same system.

Importing creates a root contribution and its topology in one SQLite transaction. The owner sees the draft. An independent reviewer sees submitted data; configured operators see approved data. Entity search, details, neighborhoods and attachments enforce the same permissions server-side. Imported entity types such as `person` do not impersonate authenticated employee identities. Only approved **document text** enters assistant retrieval; importing topology does not automatically teach the model every entity/property.

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
| Initial graph overview | 12,000 nodes, up to 50,000 relationships with visible endpoints |
| Knowledge contribution projection | Up to 3,000 permitted documents; clipping is disclosed |
| Entity neighborhood expansion | Up to 500 relationships, including permitted attachments; truncation is disclosed |
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

## Verification

Backend tests exercise 5,000-node imports, a 13,000-node bounded projection/search/expansion, invalid-import rollback, independent review, cross-user privacy, atomic attachments, stable IDs, changed-system annotation isolation, stale/failure/revocation handling and all three named topology connectors without metrics endpoints. Live HTTP tests use controlled test responses, not customer systems.

Browser checks used the shared renderer with explicit synthetic networks of 1,000, 5,000 and 12,000 nodes (up to 15,998 edges). The cloud browser lacked WebGL, so the 2D fallback was visually checked, including selection, focused relationships, a linked document addition, fit and zoom. No application console errors were reported. This does not establish hardware WebGL performance or an end-to-end customer integration. The managed browser preview could not run the Python backend; actual API/storage/review behavior was covered separately by backend tests.

For repeatable renderer QA, run frontend development and open `/graph-benchmark.html`. That page is labelled synthetic, writes no database records and is not an entry in the production Vite build or app navigation. No test network is seeded into the application.

The owner's earlier Windows/Qwen/contribution checks are recorded separately in [local verification](LOCAL_VERIFICATION_2026-11-04.md). Actual CAIL connectivity requires an authorized export or provisioned topology endpoints; neither was supplied during this change.

References: [Sigma 3](https://v3.sigmajs.org/docs/) and [Graphology ForceAtlas2](https://graphology.github.io/standard-library/layout-forceatlas2.html).
