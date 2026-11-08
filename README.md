# CAIL / Nonstop AI Operations Assistant

A focused, light workspace for operational questions, persistent conversation memory, reviewed expertise and authorized read-only observations.

The application now has **three screens**:

- **Assistant:** one conversational interface. User messages, assistant answers, evidence and agent activity are saved in SQLite. Follow-ups receive relevant earlier user **and** assistant turns; new topics are routed independently.
- **Knowledge graph:** a 3D orbit view with a 2D option, contributor/document/passage networks, actual access events and imported or authorized source data. Explore thousands of small nodes, inspect source text and citations, and attach knowledge to a specific entity. The 3D view rotates while idle, and new documents fly in from the side and draw their contributor and attachment links. Committed knowledge refreshes every three seconds while visible; uploads retain their contributor.
- **Connections:** direct read-only Prognosis REST datasets, read-only MOMI alarm exports, and the existing Prognosis/ASAP/MOMI gateways. Timestamped observations, source scope and real numeric histories are shown when supplied; missing values are not invented.

The orchestrator delegates to memory, knowledge, telemetry and evidence-evaluation workers, then synthesizes an answer with the existing local Ollama model. The evaluator can reject irrelevant excerpts and request another query, with at most five retrieval attempts. Access control and document approval remain outside the model.

**Real data paths:** the fixed publisher catalog downloads actual HPE PDFs into private knowledge networks. Direct Prognosis reads use an administrator's configured HTTPS dataset URL, Basic credentials and field mapping. MOMI reads an authorized export folder without changing its files. ASAP and normalized gateways remain available. Customer endpoints/credentials are supplied locally; public documentation is not customer telemetry. Missing or stale observations remain unknown.

## Verified locally — November 4, 2026

The owner has now built and started the application on Windows, opened the new light workspace, and passed the **real Qwen conversation test**: acknowledge a fresh checklist name, answer an unrelated API question, recall the name, and read back all six saved turns.

Document upload and extracted text, contributor/document/topic links, and a real document-access edge were also observed in the browser. The uploaded contribution moved from **Draft** to **Submitted / Awaiting Review**. Independent approval and another employee's access remain to be checked with separate configured accounts. The three-second graph refresh is implemented; a timed cross-session refresh test has not yet been reported.

**Large graph update:** JSON/CSV/Graphology topology imports, stable source identities, linked knowledge, dataset filters and search beyond the overview are implemented. The bounded overview loads up to 12,000 nodes and 50,000 relationships; individual imports support 25,000 nodes / 100,000 relationships within 16 MiB. The 3D perspective view and 2D Sigma/canvas options replace the small fixed-column SVG. Browser renderer checks covered explicit synthetic networks up to 12,000 nodes; these are never seeded into the app. See the [large graph guide](docs/SCALABLE_GRAPH.md) for source formats, bounds and verification limits.

**Real publisher import:** actual HPE HTTPS downloads of the 93-page Security Hardening Guide and 674-page TACL Reference Manual passed through CAIL's import API. They produced **1,524 nodes / 2,607 relationships**, including 1,498 cited text passages. The shared 3D renderer displayed that backend projection in an isolated verification workspace. No fictional experts, customer telemetry or PDF copies are seeded into the app/repository. See the [technical source review](docs/TEAM31_TECHNICAL_REVIEW.md).

**Dense manual readability:** selecting a document highlights at most 24 relationships, with contributor/topic/attachment links first and passage sampling after that. The canvas discloses the highlighted count, avoids overlapping labels and frames selected connections. All source records remain available through the inspector, search and passage selection. Run `npm --prefix frontend run test:graph` for the dense-manual regression.

**Semantic knowledge and transfer:** the graph now connects cited commands, messages, subsystems, objects, metrics and versions with contributors and signed guidance. Independent review enables expertise links; source-bound recall checks and reviewed explanations enable learning links. New editions flag dependent guidance. Five views, subsystem clustering, a change journal and playable 3D evidence trails expose the relationships. Existing owned manuals upgrade automatically in batches. See [the semantic graph guide](docs/SEMANTIC_KNOWLEDGE_GRAPH.md) for workflows, assessment meaning, permissions and verification limits.

**Graph navigation:** passage and observation drill-downs retain their permitted document, concept, citation and guidance connections. Trails can expand searched endpoints beyond the overview. Live refresh replaces cached review/stale states and removes revoked learning links. Trail steps retain the rest of their path while loading details.

**Automated validation:** 324 backend tests, 26 existing frontend contracts, graph navigation/readability regressions and the production TypeScript/Vite build pass. An isolated HTTP check also verifies actual multipart upload, contributor/citation links, attachments, private operator access and recovery after a backend process restart. Native source tests use controlled responses; the publisher import above used actual public PDFs. See the [local verification record](docs/LOCAL_VERIFICATION_2026-11-04.md) for the owner's earlier observed results. Customer monitoring access still requires the actual environment's configured read access.

## Run the update

In an existing checkout, preserve local edits before switching branches or pulling updates.

~~~powershell
git fetch origin
git switch main
git pull --ff-only origin main
docker compose up -d --build
~~~

Open [CAIL](http://localhost:5173). Existing knowledge remains in the existing Docker volume. The update adds separate workspace tables. Do not remove the volume if you want to retain records.

Ollama must run on the host with the configured model:

~~~text
ollama pull qwen3:4b-instruct
ollama serve
~~~

If Ollama is already running, do not start another copy. Without it, CAIL still saves conversations and supports contribution, review and the graph, while explicitly reporting that language generation is unavailable.

### Local development

Python 3.12+ and Node 22+ are required.

~~~bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
npm --prefix frontend ci
npm run dev
~~~

On Windows, create the environment with "python -m venv .venv" and install using ".venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt". The launcher detects the environment on both platforms and supports --host and --port.

## Operators and document review

The loopback Docker setup defaults to a **single local demonstration identity**, named Local operator. Its uploads belong to that identity; it cannot independently approve its own documents or read live connectors.

For multiple operators, configure CAIL_WORKSPACE_USERS in the ignored local .env. Every operator needs a stable ID, display name and distinct high-entropy key of at least 32 characters. Assign independent reviewer and live-read permissions on the server. Setting this list disables anonymous local fallback.

~~~dotenv
CAIL_WORKSPACE_LOCAL_DEMO=false
CAIL_WORKSPACE_USERS='[{"id":"engineer-1","name":"Engineer Name","key":"REPLACE_WITH_A_FRESH_PRIVATE_32_PLUS_CHARACTER_KEY","can_review":false,"can_read_live":false},{"id":"reviewer-1","name":"Reviewer Name","key":"REPLACE_WITH_A_DIFFERENT_FRESH_PRIVATE_32_PLUS_CHARACTER_KEY","can_review":true,"can_read_live":true}]'
~~~

Replace the example keys; do not use them. Recreate the backend after configuration changes. Sign in from **Connections → Operator sign-in / Switch operator**. HttpOnly, SameSite Strict sessions scope conversations to the authenticated identity. These configured-key sessions are not enterprise SSO.

Upload PDF, DOCX, UTF-8 TXT/Markdown/CSV/LOG, or write a note. Extracted text is retained with its filename, owner, topic, digest and review state. Limits: 4 MB per file, 200,000 extracted characters and 100 PDF pages. Scans require OCR first.

Use **Knowledge graph → Import dataset** for a topology JSON/CSV export. This is separate from knowledge-document upload: an arbitrary PDF does not contain a verified operational network. Imported topology starts as a private draft and follows the same independent review policy. Select a source entity, then **Attach knowledge** to connect a new document or note without changing its contributor.

To load real NonStop reference content immediately, choose **Add knowledge → HPE references → Import publisher PDF**. To ingest another large manual, enable **Reference manual** in the upload dialog (32 MiB, 1,000 pages, 2,000,000 extracted characters). Ordinary notes keep their existing limits. New uploads build cited passage/reference networks automatically; **Index existing documents** expands older owned contributions. These contains/mentions links describe the actual text, not inferred physical dependencies.

The owner submits a contribution. A different reviewer approves or requests revision. **Only approved content enters assistant retrieval.** Owners see their drafts; reviewers see submitted material; team members see approved material. Existing approved Decision DNA and release-filtered corpus records remain searchable.

## Demonstrate knowledge transfer

From a checkout with Docker Desktop running, start the isolated local demo.

~~~powershell
python scripts/start_transfer_demo.py
~~~

Open [the demo graph](http://localhost:5180/#/graph). **People & handoffs** opens with a completed example and a practice request. Use **Switch demo role** in the sidebar to move among the synthetic learner, expert and independent reviewer. The demo uses its own Compose project and SQLite volume. It runs without an Ollama model or customer monitoring access.

1. As the learner, open the expert’s contributions and request guidance. You can link an approved document you already read.
2. As the expert, open the request, select a documented concept and exact passage, then sign and submit the response. If a current approved note already answers the request, choose **Reuse approved guidance**.
3. As the independent reviewer, open **Review queue**, inspect the cited passage and record the reason for approval or return.
4. As the learner, read the approved response and explain the evidence, reasoning, limits and safe next check or escalation.
5. As the reviewer, assess those four criteria. The learner can then open the **Learning receipt** with the assessor, date, guidance version and source citations. A superseded source edition sends the handoff back for source review.
6. Upload a document on the graph. The new node enters from a side, grows its links and shows its contributor in the document details. The graph resumes its idle orbit when you clear selection and move off the canvas. **Pause orbit** and the system reduced-motion preference control the movement.

Stop the demo with `docker compose -p cail-transfer-demo -f compose.transfer-demo.yaml down`. The demo volume retains its records.

In the regular workspace, a configured operator with `"can_manage_members":true` can add a contributor in **People & handoffs**, assign reviewer access, and rotate or revoke a key. Copy the one-time key and share it privately with that contributor. The directory shows per-contributor visible document counts, approved guidance and documents you accessed. Guidance requests and their graph links are scoped to their participants. See the [knowledge transfer and graph guide](docs/SEMANTIC_KNOWLEDGE_GRAPH.md#tracked-knowledge-handoffs).

## Real source access

See [the workspace and integration guide](docs/AGENT_WORKSPACE.md) for the contract and permission model.

For direct Prognosis datasets or a read-only MOMI export folder, follow [the native source setup](docs/NATIVE_SOURCE_SETUP.md). It provides the exact settings, field mappings, Docker mount and verification steps. **Import dataset → Export format** can also ingest an existing Prognosis JSON or MOMI TXT/TSV/LOG snapshot without live credentials.

| Source | Endpoint setting | Credential setting | Upstream integration |
| --- | --- | --- | --- |
| IR Prognosis | CAIL_LIVE_PROGNOSIS_URL | CAIL_LIVE_PROGNOSIS_TOKEN | Installed API/data access normalized by an authorized gateway |
| HPE ASAP | CAIL_LIVE_ASAP_URL | CAIL_LIVE_ASAP_TOKEN | Consumer API, published query interface or approved monitoring bridge |
| MOMI | CAIL_LIVE_MOMI_URL | CAIL_LIVE_MOMI_TOKEN | Vendor-approved client/server collector exposed through the read-only gateway |

Set `CAIL_LIVE_ENABLED=true`, `CAIL_LIVE_ALLOWED_HOSTS`, and the expected system IDs `CAIL_PROGNOSIS_SYSTEM_ID`, `CAIL_ASAP_SYSTEM_ID` and `CAIL_MOMI_SYSTEM_ID` for the sources being used. The separate CAIL_OPERATOR_READ_KEY applies to older integration endpoints; the new workspace uses per-operator can_read_live authorization.

For source networks, configure `CAIL_LIVE_PROGNOSIS_TOPOLOGY_URL`, `CAIL_LIVE_ASAP_TOPOLOGY_URL` and/or `CAIL_LIVE_MOMI_TOPOLOGY_URL` with the corresponding server-only token above. These optional read-only gateway endpoints return source/system identity, observation time, nodes and relationships. They are not guessed native product API paths. The graph can refresh configured sources every 15 seconds while open. See the [topology contract and activation steps](docs/SCALABLE_GRAPH.md#connect-actual-prognosis-asap-and-momi-topology).

Only fixed, allowlisted HTTPS GET requests are issued. TLS is verified. Redirects, stale snapshots, wrong identities and malformed responses are rejected. A failed read invalidates the connected state even when older snapshots exist. No API executes a NonStop command.

The former public Tailscale demonstration does **not** enable this private persistent workspace. Deploy privately with authenticated identities rather than exposing the local demonstration identity.

With sponsor-authorized read access configured in the running backend, verify the pilot from the same environment.

~~~powershell
docker compose exec backend python -m app.source_acceptance
~~~

Use `--operator <id>` when more than one configured operator can read live sources, and `--source prognosis`, `--source asap` or `--source momi` for a single-source check. The command checks every configured observation and topology path for each selected source, validates the returned system against the expected scope, and reports metadata including timestamps, record counts and snapshot hashes. It exits unsuccessfully if a selected source lacks configuration or fails validation. Controlled HTTPS and export tests have passed. A private CAIL pilot receipt requires the sponsor’s endpoint or export and authorized account.

## Validation

~~~bash
PYTHONPATH=backend .venv/bin/python -m pytest -q backend/tests
.venv/bin/python scripts/verify_graph_http.py
.venv/bin/python scripts/verify_knowledge_transfer.py
.venv/bin/python scripts/verify_source_transport.py
npm --prefix frontend run test:contract
npm --prefix frontend run test:graph
npm --prefix frontend run build
node --check scripts/dev-workspace.mjs
~~~

Regressions cover persisted two-role history, topic changes, older relevant memory, private conversations, session revocation, independent approval, cited document graphs, large topology imports, bounded search/expansion, atomic document attachments, publisher allowlisting/deduplication, direct Prognosis field/scope validation, read-only MOMI export parsing/freshness, stable source IDs, revocation/staleness, all three topology gateways, idempotency, response leases, failure recovery, citation IDs and bounded evaluation retries.

Automated model and connector tests use controlled doubles. They verify contracts and workflows, not actual Qwen answer quality or licensed vendor compatibility. The frontend is typechecked and production-built. The owner has separately passed the real-model smoke test and verified the browser flows listed above; broader model and browser coverage remains incomplete.

To check the real model in your running Docker application, run:

~~~powershell
docker compose exec backend python -m app.conversation_smoke
~~~

This creates one test conversation with a fresh checklist name, asks an unrelated API question, checks recall, and reads back all six persisted turns. It reports PASS only after real model responses pass these checks. Ordinary conversation uses its own instructions without an empty monitoring-evidence packet. Explicitly requested notes are prioritized when older context is loaded; user-reported operational information still does not establish verified live health.

To check document-to-graph behavior in your running Docker application:

~~~powershell
docker compose exec backend python -m app.graph_smoke
~~~

This adds **two labelled synthetic verification drafts** under the current operator: an uploaded Markdown file and a contextual attachment. It checks the actual HTTP upload, graph cursor change, contributor, exact citations, complete node connections and evidence trail. The drafts remain private and unapproved. With configured operators, supply `CAIL_SMOKE_ACCESS_KEY` through the process environment. `scripts/verify_graph_http.py` runs the same check in a temporary application, then verifies another operator's isolation and persistence through an actual process restart; CI runs it automatically. Neither check requires a model or monitoring access.

### Local knowledge transfer measurements

The authenticated walkthrough covered all three roles, receipt persistence after restart, contributor enrollment and access revocation. A browser walkthrough also completed the practice handoff, added a real test file, and verified that the orbit moves when enabled and stops when paused.

The same synthetic 1,234-passage fixture was used for both local benchmark runs. Times are p95 across 25 runs.

| Local measurement | Previous main (`0eece32`) | Knowledge transfer update |
| --- | ---: | ---: |
| Approved passage retrieval | 61.0 ms | 10.2 ms |
| Full graph build (1,243 nodes, 7,409 relationships) | 193.4 ms | 189.0 ms |
| Graph cursor refresh | 5.2 ms | 3.4 ms |
| Initial compressed assistant JavaScript | 145.26 kB | about 82 kB |

Run `.venv/bin/python scripts/benchmark_workspace.py` for a local measurement, or add `--baseline <checkout>` for a comparison. The answer checks cover exact approved guidance with citations, private draft exclusion, relevance, missing live evidence and source supersession. The new checks use the direct reviewed-guidance path. Peer performance and broad generative answer quality remain unmeasured.

## Further detail

- [As-built workspace and integration guide](docs/AGENT_WORKSPACE.md)
- [Large graph, topology contract and source activation](docs/SCALABLE_GRAPH.md)
- [Direct Prognosis, MOMI and public HPE reference setup](docs/NATIVE_SOURCE_SETUP.md)
- [Team 31 source review and CAIL's independent implementation](docs/TEAM31_TECHNICAL_REVIEW.md)
- [Local verification record](docs/LOCAL_VERIFICATION_2026-11-04.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Existing source gateway contract](docs/LIVE_SOURCE_GATEWAY.md)
- [Existing backend contracts](docs/BACKEND_API_CONTRACT.md)

Earlier APIs and tests remain for compatibility. The former Home, ATM chat, Operations Lab, Investigate, Library, Mentor and Apprentice screens are removed from application navigation. Old knowledge-related hashes open Knowledge Graph; other old screen hashes open the single Assistant.
