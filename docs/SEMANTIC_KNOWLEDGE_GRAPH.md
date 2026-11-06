# Semantic knowledge and transfer graph

Implemented November 5, 2026. This extends the contributor/document network with
operational concepts, signed guidance, citations and learning evidence. No other
team's code, fictional people, notes or seed data are imported.

## Feature coverage

| Graph behavior | CAIL implementation |
| --- | --- |
| Commands, numbered messages and subsystems | Citation-backed extraction; normalized concept IDs connect permitted occurrences across documents |
| Objects, metrics, sites and versions | Literal documentation references with exact evidence; these do not establish current infrastructure or measurements |
| People and expert notes | Real signed-in authors; signed guidance records category, selected scope and exact citations |
| Author → guidance → concept | wrote, about and independently reviewed expert_in links; authors cannot approve their own guidance |
| Guidance → source | cites and author-declared supports/contradicts, with citation IDs and review state |
| Source-specific guidance | Select the source entity before capturing guidance; applies_to retains its actual source identity |
| Learner questions | asked_about when a question names a concept and the answer retrieves an approved supporting source |
| Demonstrated learning | A passed source-bound command check or independently approved explanation creates knows and learned_from |
| Learning visibility | Private by default; explicit, revocable sharing also controls existing activity |
| Revisions | Owned edition links, cycle protection and review flags on affected guidance |
| Latest changes | Actual event journal and Show latest change |
| Enhanced 3D | Subsystem-centered layout, distinct symbols/colors, document arrivals, new-link growth, view transitions and evidence-trail playback |
| Monitoring context | Permitted observations link to documented terms present in their source text; these links establish neither causation nor prediction |

## Views and contributions

**Knowledge map** shows operational concepts, documents, people and guidance.
Manual passage clouds and duplicate legacy literal references start hidden.
**Manual passages** reveals the underlying evidence.

**People & expertise** isolates contributors, guidance, learning/question
relationships and their relevant concepts/subsystems. Mentor, learner and
contributor roles are self-described metadata; they grant no permissions or
expertise. **Operational context** shows source entities and documented
concepts. **Source evidence** exposes citation records. **All relationships**
shows every loaded category. These are views over the same stored graph.

Select a concept to inspect exact excerpts, citation IDs and source editions.
Search and bounded neighborhoods also reach concepts outside the overview.

To contribute, select a concept or the source entity to which guidance applies,
then choose **Capture expert guidance**. Write the guidance, choose its type
and scopes, and select citations. Selecting a concept loads its supporting
citations. Every scope must occur in at least one selected citation.

**Sign and add guidance** records the current author and timestamp; it is not
a cryptographic signature. Submit the draft through the existing document
controls for independent review. Only current approved guidance creates an
expert_in link, labelled **reviewed guidance in**.

Agreement/conflict links are author-declared comparisons, explicitly marked
pending or independently reviewed. They do not independently prove a claim.

## Learning and explanation checks

Choose approved guidance written by another contributor:

- **Reference recall:** the server masks a command present in both the note
  and its cited evidence. It checks the normalized answer, binds the attempt
  to the learner and source hash, expires it after 30 minutes, and prevents
  changing a completed failed attempt into a pass.
- **Explain the guidance:** the learner explains the decision, evidence and
  limits. The existing model can provide provisional feedback; its source
  quotes must occur literally in the approved guidance. A missing model
  leaves the explanation available for review. The model cannot award a
  pass. A configured reviewer distinct from the learner approves or returns
  it with reasoning in **Explanation reviews**.

A pass records a specific assessment, not operational certification. Reading a
document, receiving an answer, signing in or declaring a mentor role never
creates knows. Repeated checks aggregate into stable relationships while
retaining individual attempts.

Learning is private by default. **Your learning profile → Share my learning
links** permits users who can access the underlying guidance to see the links.
Turning sharing off hides existing links again. Conversation text is not
published in the graph. Explanation text is visible only to its learner and
authorized independent reviewers.

The single local-demo identity can contribute drafts. Independent approval
and another person's learning require separate configured operators, using
the README's identity setup. No fictional mentors or approvals are seeded.

## Editions and evidence trails

Upload a newer document normally. Select it and use **Connect a document
edition** to choose an owned predecessor. Both documents must belong to the
current contributor. Self-links and cycles are rejected; historical documents
and citations remain intact.

Approval of the new edition flags guidance citing its predecessor for source
review. Outdated guidance is withheld from retrieval, current expertise and
new checks. **Revise selected guidance** creates a new draft with updated
citations while preserving the previous contribution and review history.

Select a node and **Start evidence trail here**, select another node, then
**Trace to selected node**. The server follows actual permitted relationships,
preferring knowledge/learning edges on ties, up to eight hops. A searched
endpoint outside the overview adds its permission-checked neighborhood to the
search, bounded to 500 relationships per endpoint. No path within the overview
and these neighborhoods does not prove global disconnection.

**Play 3D trail** moves the camera through its nodes. The itinerary retains
stored arrow direction and citations. Following an edge backwards does not
reverse its meaning. Layout coordinates are presentation positions, not
physical machine locations.

Documents arrive from alternating sides; new links grow in, views fade and
the camera eases between trail steps. Positions are cached across views.
Reduced-motion preferences disable automatic layout and animated camera/entry.

Node drill-downs include the stored document endpoint, canonical concept
references, readable signed citations and contextual attachments. Observations
retain literal documentation links and their stale state. The overview and
drill-downs use the same relationship IDs, meanings and citation metadata.
Entity detail counts include these permitted connections; truncated entity
neighborhoods disclose the total alongside their bounded response.

The latest overview replaces cached node/edge metadata during live refresh.
Removed document permissions and revoked learning sharing remove cached
relationships and invalidate affected trails. Moving through a trail retains
the remaining path while each selected node loads its details.

## Provenance, migration and bounds

Uploads create semantic links automatically. Existing owned prose documents
upgrade in foreground batches of 20 when the graph opens. Documents, review
states, hashes, passage IDs and citations remain unchanged. Failed batches
are retryable with **Index existing documents**.

Concept identity means the same normalized documentation term, not cross-release
compatibility, a discovered physical dependency or root cause. Each edition
remains visible. Command definitions require standalone headings in a named
manual scope; “FC Command on page 147” in a contents table is not a definition.
Unscoped message numbers and page numbers do not become events.

Concept lookup/search, exact citations, note scopes and neighborhoods apply
document permissions. A shared concept exposes only readable evidence.
Expanded concepts carry permission witnesses so role changes do not retain
unauthorized concepts in the browser.

| Projection | Limit |
| --- | --- |
| Overview | Existing 12,000 nodes / 50,000 edges |
| Semantic overview | 4,000 concepts / 24,000 passage-evidence links |
| One document | 30,000 semantic mentions |
| Guidance / learning projection | 200 notes / 2,000 aggregated learning records |
| Concept detail | 20 exact excerpts; total supporting passage count disclosed |
| Concept neighborhood | 500 relationships, up to 150 passage records / 100 scoped notes |
| Passage / source-entity neighborhood | 500 relationships, exact permitted total disclosed |
| Catalog search | 200 concepts and notes / 60 citations |
| Selection / trail | 24 emphasized relationships / eight hops |

Bounds are disclosed. Search and neighborhoods reach omitted concepts.

## API and verification

The following routes use the existing /api/v1/workspace prefix, identity
and same-origin write protection:

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /knowledge/catalog?q=... | Permitted concepts, notes, citations, owned editions and own profile |
| POST | /knowledge/notes | Signed, scoped and cited guidance draft |
| POST | /knowledge/profile | Own role and learning-sharing preference |
| POST | /knowledge/checks | Source-bound recall or explanation check |
| POST | /knowledge/checks/{id}/answer | Own answer, recall grade or explanation submission |
| GET | /knowledge/check-reviews | Own explanations / independent review queue |
| POST | /knowledge/checks/{id}/review | Independent explanation decision and reasoning |
| POST | /knowledge/editions | Owned newer/previous edition link |
| GET | /graph/path?source=...&target=... | Permission-checked bounded trail |

Tests cover typed extraction, exact citations, no invented topology, shared
concept identity with private evidence, signed guidance, independent review,
declared conflicts, matching scopes, checked learning, revocable sharing,
explanation review/model quotes, edition cycles, stale retrieval exclusion,
idempotent migration and stable neighborhoods.

The actual two HPE manual texts were reindexed in an isolated database.
With one explicitly labelled QA guidance contribution, they produced
**370 concepts, 1,899 nodes and 4,945 relationships** before a test learner
completed a check. Verification people, notes, PDFs and databases are not
bundled into the app. This is documentation evidence, not customer telemetry.

The managed browser preview cannot execute this workspace's Python runtime.
Browser checks therefore use a read-only recording of actual backend
projections; writes and permission transitions are tested separately through
FastAPI. Visual checks cover 3D views, provenance, guidance forms, bounded
selection and trail playback. WebGL is unavailable in that browser, so 2D
visual verification uses the canvas fallback.

### Navigation verification — November 6, 2026

All **324 backend tests**, **26 frontend contract checks**, graph display/cache
regressions and the production build pass. New regressions reproduce incomplete
passage endpoints, omitted observation/concept/guidance links, searched trail
endpoints outside the overview, private citations, stale reads and bounded
neighborhoods. Frontend checks cover current review metadata replacing a cached
draft, revoked learning/evidence, stale expanded observations and retention of
the remaining trail when another step loads.

`python scripts/verify_graph_http.py` starts a real FastAPI HTTP process with an
isolated temporary SQLite database and generated operator sessions. It uploads
a clearly labelled synthetic Markdown document using multipart HTTP, verifies
its contributor, citation, graph cursor and contextual attachment, follows the
actual evidence trail and checks a second operator cannot see private drafts.
It then stops and restarts the process and recovers the same **11 nodes and 16
relationships** from SQLite. This check is included in CI. It does not exercise
browser rendering, an LLM or customer monitoring.

For the existing Docker workspace, `python -m app.graph_smoke` performs the
upload/graph portion and leaves two labelled private verification drafts.
