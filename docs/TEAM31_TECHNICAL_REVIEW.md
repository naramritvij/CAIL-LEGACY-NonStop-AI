# Team 31: data access, graph construction and CAIL's independent implementation

Reviewed November 4, 2026. Reference repository: [ghousee/catalyst-2026-team31](https://github.com/ghousee/catalyst-2026-team31), pinned at [c8c48b1](https://github.com/ghousee/catalyst-2026-team31/tree/c8c48b1bc4b389ec471629a586df3ea613cb1a0b). This is a technical review of the checked-in implementation. A different private deployment or demonstration cannot be established from that source.

## Where its data comes from

The repository describes a local Postgres/pgvector application database. That database holds manual sections, vectors, entities, relationships, expert notes, learning records and alerts. It is not a connection to a CAIL/customer transaction database.

The README explicitly distinguishes public HPE manuals, fictional experts/notes and synthetic monitoring/simulator data. Its production connection instructions require customer-supplied Prognosis access or a MOMI export directory. See [README lines 179–190](https://github.com/ghousee/catalyst-2026-team31/blob/c8c48b1bc4b389ec471629a586df3ea613cb1a0b/README.md#L179-L190) and the [seed provenance](https://github.com/ghousee/catalyst-2026-team31/blob/c8c48b1bc4b389ec471629a586df3ea613cb1a0b/kg/seed/README.md).

| Layer | Checked-in implementation | What it establishes |
| --- | --- | --- |
| Application database | Local Postgres 16 + pgvector | Persistent app records and embeddings; not evidence of customer database access |
| Real reference content | Seven separately downloaded HPE manuals, chunked and embedded | Real documentation knowledge; the PDFs themselves are not in the repository |
| Expert/learning seed | YAML people, expert notes and illustrative relationships | A declared fictional demonstration network |
| Prognosis connector | HTTPS dataset GET with Basic authentication, mapped row columns | A customer-configurable native read path; its default points to a local demo endpoint |
| MOMI connector | Template-block or TAB alarm export reader | A file-based integration path; its demo writes synthetic files into that inbox |
| Incident feeds | Replay data and a simulator | Demonstration behavior, not real site telemetry |

A large graph can therefore be built from genuine manuals without access to a private enterprise database. Graph size and animation alone do not establish the origin of its data.

## The actual monitoring path

### Prognosis

[backend/integrations/prognosis.py](https://github.com/ghousee/catalyst-2026-team31/blob/c8c48b1bc4b389ec471629a586df3ea613cb1a0b/backend/integrations/prognosis.py) polls an admin-defined JSON dataset. It accepts row arrays or `data`/`rows` wrappers and maps fields such as problem ID, source node, description, severity and raised time. Its default interval is ten seconds. Previously seen IDs are not delivered again.

The transport is an HTTP GET with optional Basic credentials. The default URL is its own `/demo/prognosis/.../OpenProblems` route. A customer URL and credentials replace that stand-in. The companion [integration research](https://github.com/ghousee/catalyst-2026-team31/blob/c8c48b1bc4b389ec471629a586df3ea613cb1a0b/docs/INTEGRATIONS_PROGNOSIS_MOMI.md) discusses admin-defined PQL datasets and installed-release configuration. IR's linked community pages were unavailable to this review's web reader, so this review does not certify compatibility with every Prognosis release.

### MOMI

[backend/integrations/momi.py](https://github.com/ghousee/catalyst-2026-team31/blob/c8c48b1bc4b389ec471629a586df3ea613cb1a0b/backend/integrations/momi.py) reads alarm exports from a folder every five seconds. It parses key/value template blocks or TAB lines, delivers normalized alarms and moves processed files to a `done` directory. It does not open a MOMI REST connection or query NonStop Enscribe files.

[backend/integrations/demo.py](https://github.com/ghousee/catalyst-2026-team31/blob/c8c48b1bc4b389ec471629a586df3ea613cb1a0b/backend/integrations/demo.py) supplies the local Prognosis response and writes sample MOMI exports. The checked-in demo explicitly labels these samples synthetic. BlackWood's own [History / Export Data documentation](https://www.blackwood-systems.com/momi/documentation/WebHelp/Client/Screens/History/History___Export_Data.htm) independently describes delimited exports and export scripts.

### Mapping and warnings

[mapping.py](https://github.com/ghousee/catalyst-2026-team31/blob/c8c48b1bc4b389ec471629a586df3ea613cb1a0b/backend/integrations/mapping.py) resolves a quoted subsystem/message number to an existing graph entity, or falls back to a metric/category. The watcher then uses linked documentation, expert notes, patterns and trend rules to build an alert card. The code's named PROD/DR mapping is specific to its demonstration. CAIL's new readers preserve the supplied system names and enforce an explicitly configured scope instead.

The integrations directory contains Prognosis and MOMI adapters; this review did not find an ASAP adapter there. CAIL's existing ASAP Consumer/query gateway remains a separate integration path.

## How the large graph is built

1. [ingest/loader.py](https://github.com/ghousee/catalyst-2026-team31/blob/c8c48b1bc4b389ec471629a586df3ea613cb1a0b/backend/ingest/loader.py) extracts PDF/text sections, creates document chunks and embeddings, and stores edition metadata.
2. [graph/from_docs.py](https://github.com/ghousee/catalyst-2026-team31/blob/c8c48b1bc4b389ec471629a586df3ea613cb1a0b/backend/graph/from_docs.py) deterministically extracts command and numbered-message entities from manual section titles. These entities link to their defining sections and subsystems. This is a major source of its thousands of nodes.
3. [documents.py](https://github.com/ghousee/catalyst-2026-team31/blob/c8c48b1bc4b389ec471629a586df3ea613cb1a0b/backend/documents.py) supports upload, chunk differences, unchanged IDs, literal mentions and reindexing. Changed supporting sections can flag dependent notes for review.
4. [knowledge.py](https://github.com/ghousee/catalyst-2026-team31/blob/c8c48b1bc4b389ec471629a586df3ea613cb1a0b/backend/knowledge.py) links signed notes to their author, scope and relevant entities. Expert and learning relationships are application records.
5. [graph/view.py](https://github.com/ghousee/catalyst-2026-team31/blob/c8c48b1bc4b389ec471629a586df3ea613cb1a0b/backend/graph/view.py) queries that local graph and projects people, notes, entities, links and recent changes.

These document relationships express knowledge and references. They are not a discovered physical topology of all customer processes, CPUs or transaction records.

## What creates the visual effect

The checked-in [GraphCanvas.tsx](https://github.com/ghousee/catalyst-2026-team31/blob/c8c48b1bc4b389ec471629a586df3ea613cb1a0b/frontend/components/GraphCanvas.tsx) and [package.json](https://github.com/ghousee/catalyst-2026-team31/blob/c8c48b1bc4b389ec471629a586df3ea613cb1a0b/frontend/package.json) use `vis-network`/`vis-data`, with a 2D force-directed canvas, curved directional edges, category colors, camera transitions and node dragging. The inspected renderer does not use a 3D scene engine. A different demonstration build may differ.

The important implementation pattern is incremental updates: existing node/edge DataSets are updated rather than replaced, preserving layout. Newly added notes and relationships settle into the network. Click opens details; double-click isolates neighbors. The graph page polls its API every ten seconds. Many manual-derived nodes are hidden until the operator enables them, optionally by subsystem.

## Other architecture worth understanding

The repository also has hybrid vector/keyword retrieval, reciprocal-rank fusion, a local cross-encoder and a cited Qwen answer path. It scopes retrieval, preserves manual editions, names note authors, and records learning relationships from questions/checks. Other modules cover deterministic warnings, training scenarios and simulated command approval. The README's evaluation results are reported results; they were not independently rerun in this review.

CAIL retains its own conversation persistence, bounded context selection, orchestrator and independent knowledge review. The later [semantic knowledge update](SEMANTIC_KNOWLEDGE_GRAPH.md) independently implements richer concept, guidance, expertise, learning and edition relationships, with 3D views and trails. It does not import the other project's fictional profiles, curriculum, vector pipeline or reported benchmarks.

## What CAIL implements independently

| Area | CAIL update |
| --- | --- |
| Real documentation | Fixed HPE publisher catalog; download/import real PDFs under the current contributor, with original file hashes and actual cover editions |
| Document graph | Stored passage nodes, existing citation IDs and literal term/command references; contains/mentions never imply physical dependencies or root cause |
| 3D view | Perspective orbit camera, depth, an independent three-dimensional worker layout and animated document arrival/link growth; 2D remains available |
| Updates | Keyed nodes/edges; 3-second foreground graph refresh; configured source reads every 15 seconds while visible |
| Direct Prognosis access | Fixed allowlisted HTTPS dataset GET, TLS verification, server-only Basic credentials, configurable rows/columns and exact system scope |
| MOMI access | Read-only newest-export directory, or explicit export upload; files are not moved, renamed or modified |
| Evidence and privacy | Draft networks remain private, independent approval controls sharing/retrieval, and source system/record IDs and timestamps remain visible |
| Failure behavior | No sample fallback, stale labels, bounded views and evidence rows, scope changes hide old system data |

The implementation is original. It uses the reference project to understand the engineering approach, without importing its application code, fictional people, seed graph or document copies.

## Real-data verification in this change

The new publisher-import API made actual HTTPS requests to HPE, extracted both PDFs and stored their text and graph in an isolated verification database. This was not a fixture import and did not modify the owner's Windows/Docker volume.

| Publisher PDF | Pages | Imported text characters | Original PDF SHA-256 |
| --- | ---: | ---: | --- |
| HPE NonStop Security Hardening Guide, 830852-008, March 2023 | 93 | 303,529 | `5c657a79941eb0aa9e460c79931e3bfc3592fd0f9c0d4ff537fee774eed031e6` |
| HPE NonStop TACL Reference Manual, 862345-002, April 2017 | 674 | 1,344,137 | `bdfe786a3ad4f36252d193048769d4f99c398d03a1cf72ec8e029e5210ffef3d` |

Together they produced **1,524 nodes and 2,607 relationships**, including **1,498 actual text passages and 21 literal references**, plus the contributor/documents/topics. Both contributions remained drafts. The same backend projection was rendered in the 3D viewer. Public documentation is real source material; it is not customer telemetry. Older cover editions do not automatically establish applicability to the current NonStop release.

Native Prognosis/MOMI transport and error paths are tested with controlled responses/files. No private customer endpoint or credential was supplied, and no live customer integration is claimed. The exact activation steps are in [NATIVE_SOURCE_SETUP.md](NATIVE_SOURCE_SETUP.md).
