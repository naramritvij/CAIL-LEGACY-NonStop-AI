# CAIL / Nonstop AI Operations Assistant

A focused, light workspace for operational questions, persistent conversation memory, reviewed expertise and authorized read-only observations.

The application now has **three screens**:

- **Assistant:** one conversational interface. User messages, assistant answers, evidence and agent activity are saved in SQLite. Follow-ups receive relevant earlier user **and** assistant turns; new topics are routed independently.
- **Knowledge graph:** a zoomable network of contributions, actual access events and imported or authorized source topology. Explore thousands of small nodes, inspect neighbors and properties, and attach a document to a specific entity. Source provenance, review state and stale data are visible. Committed knowledge refreshes every three seconds while visible; uploads retain their contributor.
- **Connections:** IR Prognosis, HPE ASAP and MOMI verification, topology status, timestamped observations and charts of actual numeric history. Metric and topology endpoints can be configured separately. No invented live values.

The orchestrator delegates to memory, knowledge, telemetry and evidence-evaluation workers, then synthesizes an answer with the existing local Ollama model. The evaluator can reject irrelevant excerpts and request another query, with at most five retrieval attempts. Access control and document approval remain outside the model.

**Integration boundary:** adapters are implemented for authorized HTTPS snapshot gateways. This repository does not contain CAIL/customer credentials, a verified customer connection, or invented native vendor API paths. The environment owner must provision the installed Prognosis interface, ASAP Consumer/query access, and an approved MOMI bridge. Missing or stale observations remain unknown.

## Verified locally — November 4, 2026

The owner has now built and started the application on Windows, opened the new light workspace, and passed the **real Qwen conversation test**: acknowledge a fresh checklist name, answer an unrelated API question, recall the name, and read back all six saved turns.

Document upload and extracted text, contributor/document/topic links, and a real document-access edge were also observed in the browser. The uploaded contribution moved from **Draft** to **Submitted / Awaiting Review**. Independent approval and another employee's access remain to be checked with separate configured accounts. The three-second graph refresh is implemented; a timed cross-session refresh test has not yet been reported.

**Large graph update:** JSON/CSV/Graphology topology imports, stable source identities, linked knowledge, dataset filters and search beyond the overview are implemented. The bounded overview loads up to 12,000 nodes and 50,000 relationships; individual imports support 25,000 nodes / 100,000 relationships within 16 MiB. Sigma/WebGL and a 2D canvas fallback replace the small fixed-column SVG. Browser renderer checks covered explicit synthetic networks up to 12,000 nodes; these are never seeded into the app. See the [large graph guide](docs/SCALABLE_GRAPH.md) for source formats, bounds and verification limits.

**Automated validation:** 281 backend tests, 26 existing frontend contracts and the production TypeScript/Vite build pass. See the [local verification record](docs/LOCAL_VERIFICATION_2026-11-04.md) for the owner's earlier observed results. Real Prognosis, ASAP and MOMI access still requires authorized environment configuration or an authorized dataset export; the update does not supply customer data or credentials.

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

The owner submits a contribution. A different reviewer approves or requests revision. **Only approved content enters assistant retrieval.** Owners see their drafts; reviewers see submitted material; team members see approved material. Existing approved Decision DNA and release-filtered corpus records remain searchable.

## Real source access

See [the workspace and integration guide](docs/AGENT_WORKSPACE.md) for the contract and permission model.

| Source | Endpoint setting | Credential setting | Upstream integration |
| --- | --- | --- | --- |
| IR Prognosis | CAIL_LIVE_PROGNOSIS_URL | CAIL_LIVE_PROGNOSIS_TOKEN | Installed API/data access normalized by an authorized gateway |
| HPE ASAP | CAIL_LIVE_ASAP_URL | CAIL_LIVE_ASAP_TOKEN | Consumer API, published query interface or approved monitoring bridge |
| MOMI | CAIL_LIVE_MOMI_URL | CAIL_LIVE_MOMI_TOKEN | Vendor-approved client/server collector exposed through the read-only gateway |

Also set CAIL_LIVE_ENABLED=true and CAIL_LIVE_ALLOWED_HOSTS. The separate CAIL_OPERATOR_READ_KEY applies to older integration endpoints; the new workspace uses per-operator can_read_live authorization.

For source networks, configure `CAIL_LIVE_PROGNOSIS_TOPOLOGY_URL`, `CAIL_LIVE_ASAP_TOPOLOGY_URL` and/or `CAIL_LIVE_MOMI_TOPOLOGY_URL` with the corresponding server-only token above. These optional read-only gateway endpoints return source/system identity, observation time, nodes and relationships. They are not guessed native product API paths. The graph can refresh configured sources every 15 seconds while open. See the [topology contract and activation steps](docs/SCALABLE_GRAPH.md#connect-actual-prognosis-asap-and-momi-topology).

Only fixed, allowlisted HTTPS GET requests are issued. TLS is verified. Redirects, stale snapshots, wrong identities and malformed responses are rejected. A failed read invalidates the connected state even when older snapshots exist. No API executes a NonStop command.

The former public Tailscale demonstration does **not** enable this private persistent workspace. Deploy privately with authenticated identities rather than exposing the local demonstration identity.

## Validation

~~~bash
PYTHONPATH=backend .venv/bin/python -m pytest -q backend/tests
npm --prefix frontend run test:contract
npm --prefix frontend run build
node --check scripts/dev-workspace.mjs
~~~

Regressions cover persisted two-role history, topic changes, older relevant memory, private conversations, session revocation, independent approval, real ownership/access edges, large topology imports, bounded search/expansion, atomic document attachments, stable source IDs, source revocation/staleness, all three topology-only connectors, idempotency, concurrent response leases, failure recovery, citation IDs and bounded evaluation retries.

Automated model and connector tests use controlled doubles. They verify contracts and workflows, not actual Qwen answer quality or licensed vendor compatibility. The frontend is typechecked and production-built. The owner has separately passed the real-model smoke test and verified the browser flows listed above; broader model and browser coverage remains incomplete.

To check the real model in your running Docker application, run:

~~~powershell
docker compose exec backend python -m app.conversation_smoke
~~~

This creates one test conversation with a fresh checklist name, asks an unrelated API question, checks recall, and reads back all six persisted turns. It reports PASS only after real model responses pass these checks. Ordinary conversation uses its own instructions without an empty monitoring-evidence packet. Explicitly requested notes are prioritized when older context is loaded; user-reported operational information still does not establish verified live health.

## Further detail

- [As-built workspace and integration guide](docs/AGENT_WORKSPACE.md)
- [Large graph, topology contract and source activation](docs/SCALABLE_GRAPH.md)
- [Local verification record](docs/LOCAL_VERIFICATION_2026-11-04.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Existing source gateway contract](docs/LIVE_SOURCE_GATEWAY.md)
- [Existing backend contracts](docs/BACKEND_API_CONTRACT.md)

Earlier APIs and tests remain for compatibility. The former Home, ATM chat, Operations Lab, Investigate, Library, Mentor and Apprentice screens are removed from application navigation. Old knowledge-related hashes open Knowledge Graph; other old screen hashes open the single Assistant.
