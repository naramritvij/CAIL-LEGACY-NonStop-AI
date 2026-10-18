# CAIL / Nonstop AI Operations Assistant

**CAIL Catalyst operator-facing product name.** The older repository identifiers are retained to avoid disrupting branches and API consumers. The canonical knowledge feature is **Knowledge Tree**. The new [Operator Command Center](docs/OPERATOR_COMMAND_CENTER.md) provides color-coded *synthetic* source evidence, ASAP/EMS/SCF-style drilldowns, safe display-only command previews, and review-gated transcript intake. No HPE tools or customer systems are connected.

<div align="center">

# CAIL / Nonstop AI Operations Assistant
### Evidence-First Assistance for Mission-Critical Operations

**CAIL • Catalyst 2026 • HPE NonStop-inspired training environment**

![Python](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square) ![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-177DAD?style=flat-square) ![AI](https://img.shields.io/badge/AI-Local%20Ollama-6B64C6?style=flat-square) ![Tests](https://img.shields.io/badge/Tests-Pytest%20%2B%20live%20smoke-23976A?style=flat-square) ![Safety](https://img.shields.io/badge/Environment-Synthetic%20%7C%20Read--only-BE5974?style=flat-square)

**[Quick start](#-quick-start-clone--run) · [Ask CAIL + ATM demo](#-ask-cail-interactive-chat--atm-mission) · [Public Tailscale demo](#-public-demo-tailscale-funnel) · [Architecture](#-system-architecture) · [API map](#-api-map) · [Confluence](https://northeastern-team-mx3hi3ad.atlassian.net/wiki/spaces/CAILLEG26)**

</div>

> [!IMPORTANT]
> **Educational prototype only.** This repository does **not** connect to live HPE NonStop systems, execute system commands, or claim production safety. Events (`SIM-EVT-*`), expert lessons created for the demo, and replay outcomes are **synthetic**. HPE manual links are general references—not evidence that an invented event matches an official HPE message.

## 🎯 The hackathon challenge

> How might we use AI to help the next generation of IT operators **understand, monitor, and troubleshoot** mission-critical enterprise systems through **natural language**, while **preserving the expertise** of experienced professionals?

**CAIL's answer:** A local-first investigation workspace that shows the *evidence* behind a finding, separates an AI explanation from the independent safety policy, and turns reviewed investigation rationale into reusable Decision DNA and a **changed-incident knowledge-transfer challenge**.

| Requirement | Working prototype capability | Important boundary |
|:---|:---|:---|
| Understand | Qwen3 via local Ollama explains synthetic incidents | Generated text remains **unverified** |
| Monitor | Disk-growth / Pathway incidents, metrics, event timeline | Fixtures, **not** live telemetry |
| Troubleshoot | Evidence-linked findings, missing-fact lists, safe previews | No actual command execution |
| Preserve expertise | SQLite Decision DNA: draft → submit → independent review → approved | Demo keys do not establish real-world operator identity |
| Improve judgment | Counterfactual replay + changed-incident assessment | Predetermined scenarios, not real-world prediction |
| Trust and continuity | Default-deny Sentinel, hash-linked local audit, shift briefing | Not hardened RBAC, signed audit, or completed PWA |

## 🧭 System architecture

![Architecture: frontend, FastAPI, SQLite, Sentinel, synthetic events, source registry and Windows Ollama](docs/assets/legacy-architecture.svg)

<details><summary><strong>Open the equivalent editable Mermaid architecture</strong></summary>

```mermaid
flowchart LR
  OP[Operator browser<br/>React + TypeScript] -->|/api/v1| API[FastAPI backend]
  subgraph Docker[Docker Compose]
    API --> EVENT[Synthetic incident<br/>and replay engine]
    API --> POLICY[Sentinel<br/>default deny]
    API --> DB[(SQLite<br/>Decision DNA + audit)]
    API --> REF[HPE manual source<br/>pointer registry]
  end
  API -->|host.docker.internal:11434| AI[Windows host<br/>Ollama / Qwen3]
  API -. no live connection .-> NO[No production NonStop access]
```

</details>

**What's running where?** Docker Compose runs the **frontend (port 5173)** and **FastAPI (port 8000)**. Native **Ollama remains on Windows**; FastAPI calls it over `host.docker.internal:11434`. SQLite lives in Docker's named `legacy_knowledge` volume. Do not remove that volume if you need existing demo lessons.

## 🧠 The feature that makes CAIL different

![Decision DNA: capture, independent approval and changed incident knowledge-transfer assessment](docs/assets/legacy-knowledge-flow.svg)

1. **Observe** an incident with traceable synthetic event IDs and explicitly missing evidence.
2. **Capture** a lesson: observations, rationale, rejected alternatives, prerequisites and references.
3. **Submit and review** through two distinct locally configured roles. Only *approved* notes are publicly retrievable.
4. **Transfer** that lesson to a **different synthetic case**, rather than repeating the original answer.
5. **Assess** action choice, evidence and prerequisites with a reproducible rubric. Unsafe choices cannot pass; no operational action runs.

The workflow is implemented for **synthetic** cases. It does **not** claim we already captured knowledge from a verified senior HPE operator.

## 🚀 Quick start: clone & run

**For Ritvij, Maggie, and authorized collaborators • Windows 11 / PowerShell**

### Prerequisites

- Git, Docker Desktop **with engine running**, and Windows 11.
- For AI responses: [Ollama](https://ollama.com/download) and the local model `qwen3:4b-instruct` (other features work without it).
- For local frontend editing: Node.js LTS / npm. For local backend tests: Python 3.12.
- **Private repository:** the owner must first invite Maggie at **GitHub repository → Settings → Collaborators → Add people**. She must accept the invitation before `git clone` can access it. No passwords, tokens or `.env` files need to be sent in chat.

**1 — Clone this repository** (in PowerShell):

```powershell
git clone https://github.com/naramritvij/CAIL-LEGACY-NonStop-AI.git
cd CAIL-LEGACY-NonStop-AI
code .
```

**2 — Start the local model** (optional for the read-only UI; recommended for Ask CAIL):

```powershell
ollama pull qwen3:4b-instruct
# Ollama must be running on the Windows host.
```

**3 — Start the complete app:**

```powershell
docker compose up -d --build
docker compose ps
```

| Open in your browser | Purpose |
|---|---|
| **http://localhost:5173** | React Incident Black Box |
| **http://localhost:8000/docs** | Interactive FastAPI / OpenAPI documentation |
| **http://localhost:8000/api/v1/health** | Backend readiness / synthetic mode |
| **http://localhost:8000/api/v1/incidents/INC-DISK-001/grounded-brief** | Example evidence-linked brief |

Check app logs with `docker compose logs -f backend` and stop the demo with `docker compose down` (this **keeps** the named database volume). **Do not run** `docker compose down -v` unless you intentionally want to erase local demo knowledge.

### Test the backend (Windows)

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
cd ..
```

**Verification status (18 Oct 2026):** The last supplied Windows run passed **221/221 Python backend tests** and the TypeScript/Vite production build (**2,009 modules**). That run passed **21** frontend contracts while **three verification assertions failed** (one outdated map markup assertion, two tests incorrectly reading host-only Compose files inside the frontend Docker image). Those three checks were corrected in the subsequent branch commit; **a complete successful 24/24 frontend run and full final verification have not yet been supplied**. An isolated Funnel gateway health check and separate local Qwen request passed. A real Chrome browser nevertheless reported **`ERR_SSL_PROTOCOL_ERROR`** at the public Tailscale address, so external availability remains **unverified**. Previous completed end-to-end automated results apply to earlier revisions; do not represent this head as independently production-tested.

## 🏧 Ask CAIL: interactive chat & ATM mission

**Use the actual backend-powered browser demo**, not a screenshot or a static
Netlify substitute:

| Route | Demonstration |
|---|---|
| [Ask CAIL](http://localhost:5173/#/chat) (\`#/chat\`) | Ask about an ATM and get a clickable animated fictional map inside the conversation |
| [ATM Mission](http://localhost:5173/#/atm) (\`#/atm\`) | Explore the six fictional locations, evidence, safe guidance and audience modes |
| \`#/operations\` | Synthetic Operations Lab and registered read-only command previews |
| Knowledge Tree / Mentor / Apprentice | Submit draft training lessons, require **independent local reviewer approval**, and practice transferring approved knowledge |

The **ATM chat uses a bounded deterministic intent router**, not open-ended
LLM generation or live bank data. Its answers deliberately vary with the
question:

| Ask | CAIL does |
|---|---|
| "Which ATM is broken, and where is it?" | **Locate:** highlights fictional ATM-042 at North Exchange; animates the schematic map without irrelevant system reports |
| "Show EMS and CPU evidence for ATM-042" | **Investigate:** opens synthetic EMS/ASAP/Guardian observations and shows PATHCOM native status as **UNKNOWN** |
| "Have we learned anything from similar ATM incidents?" | **Retrieve:** checks only independently approved local Knowledge Tree lessons; unreviewed fictional history is *not* a proven repair |
| "Our cash machine is down. What should I do?" | **Assist:** provides role-specific, safe escalation and read-only checks |

Technical wording can select the engineering explanation; operators can also
choose plain-language or engineer mode explicitly. The chat retains the
selected fictional ATM across follow-up questions. Unknown ATM IDs,
unrelated prompts and unsafe commands are refused or constrained. The AI
cannot execute native HPE/NonStop commands, reset an ATM or authorize recovery.
Optional **Qwen3 via local Ollama** is used in **separate, citation-bounded
investigations**. Citation-ID matching does **not** establish causal accuracy
or source authenticity.

**Showcase narrative:** **Locate → Investigate → Retrieve → Assist → Learn**.
Capturing and learning from expert reasoning requires a separate, approved
Mentor review in the private/local setup; no approved lessons are invented.
Detailed walkthrough: [ATM Mission Demo](docs/ATM_WOW_DEMO.md).

## 🌐 Public demo: Tailscale Funnel

Netlify's static build cannot serve our local FastAPI and Ollama runtime.
For a shareable **AI-backed** presentation link, the project includes a
dedicated, isolated **Tailscale Funnel** stack and gateway:

- \`compose.funnel.yaml\` starts an independent \`cail-funnel-demo\` Docker
  project, distinct from the regular local Compose services.
- \`demo-gateway\` serves a production React build over loopback
  \`127.0.0.1:8787\`. Tailscale Funnel publishes the public HTTPS hostname.
- \`demo-backend\` runs synthetic FastAPI, calls **Windows-hosted Ollama**
  through \`host.docker.internal:11434\`, and uses temporary demo-only data.
  The private SQLite Knowledge Tree volume and expert/reviewer credentials
  are **not** mounted or served.
- Nginx restricts public API methods/routes and rate-limits model calls.
  Reviewer approvals and other privileged mutations are **not available**
  through the public demo. The public Knowledge Tree can therefore be empty.

**Windows setup** (Docker Desktop, Ollama/Qwen and signed-in Tailscale required):

\`\`\`powershell
Set-Location "$HOME\Projects\CAIL-LEGACY-NonStop-AI"
docker compose up -d --build                         # full private/local app
.\scripts\verify_operator_center.ps1 -RunsPerIncident 1

# Check isolated gateway and local model before publishing:
.\scripts\start_tailscale_funnel.ps1 -CheckQwen

# Only when ready to expose a PUBLIC demo:
.\scripts\start_tailscale_funnel.ps1 -Publish -CheckQwen
\`\`\`

The last command displays your account's actual \`.ts.net\` HTTPS hostname.
Append \`/#/chat\` to link directly into Ask CAIL. **A previously generated
Funnel URL is not a guarantee that HTTPS is working.** The Windows browser
has reported \`ERR_SSL_PROTOCOL_ERROR\` after successful Funnel activation.
Before sharing the link, check \`tailscale funnel status\`, public DNS/TLS
certificate reachability and a fresh browser on **mobile data**. A local
\`http://127.0.0.1:8787\` success proves only the gateway, **not** public TLS.

The Funnel URL is **unauthenticated and public**. Only fictional training
data is appropriate; avoid loading private or customer data, uploading files
or sharing reviewer credentials. Keep the Windows laptop awake and Docker,
Ollama and Tailscale running. The demo stops working if the host sleeps or
loses network access. Shut it down afterward:

\`\`\`powershell
.\scripts\stop_tailscale_funnel.ps1
\`\`\`

See [Tailscale deployment and troubleshooting](docs/TAILSCALE_FUNNEL_DEMO.md).
**Do not claim live HPE, real ATM/GPS integration, verified historic repairs,
real-world MTTR reduction or a production hardened service.**

## 👩‍💻 Maggie's frontend development guide

> **Team ownership:** Maggie owns the React/TypeScript UI, visual design and frontend integration. Ritvij owns FastAPI, AI, simulator, policies, persistence and the API contracts. Use feature branches and pull requests so both tracks can progress in parallel.

### Option A — Run the entire existing application first (fastest)

After accepting repository access, follow **Quick start** above. Edit `frontend/src/App.tsx` and `frontend/src/styles.css` only after seeing the original UI at `localhost:5173`. Docker rebuild is required to incorporate edits because the current Compose setup does **not** bind-mount frontend source files:

```powershell
docker compose up -d --build frontend
```

### Option B — Recommended for live UI development (hot reload)

This uses the **existing Vite app** on Windows while the backend runs in Docker. No need to create a new React or Next.js project. A separate `vite.local.config.ts` proxies `/api` to the local backend on port 8000.

**Terminal 1**, from the repository root:

```powershell
docker compose up -d --build backend
docker compose stop frontend  # release port 5173 if the Docker frontend was already started
```

**Terminal 2**, from the repository root:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev -- --config vite.local.config.ts
```

Open **http://localhost:5173**. Editing frontend source should now trigger Vite hot reload. The local Vite proxy handles API requests; in React, call **`/api/v1/...`**, *not* `http://backend:8000` (the Docker hostname is invisible to Windows browsers).

To check code quality before sending it to Ritvij:

```powershell
npm.cmd run build
```

> [!NOTE]
> Current UI technology is **React + Vite + TypeScript**, not Next.js. If Maggie wants Next.js, discuss the migration first and create a separate feature branch. Do **not** replace the working frontend unintentionally. Keep all expert and reviewer keys out of browser bundles.

### Suggested Git collaboration (Maggie)

```powershell
git switch main
git pull origin main
git switch -c feat/maggie-frontend
```

After changing files:

```powershell
git status
git add frontend/
git commit -m "feat(frontend): refine LEGACY interface"
git push -u origin feat/maggie-frontend
```

Open a **pull request into `main`**, request Ritvij's review, and coordinate API contract changes before merging. Ritvij should use separate backend branches to avoid collisions.

### Maggie's API handoff checklist

| UI concept | Endpoint to integrate | What to render |
|---|---|---|
| Incident selector | `GET /api/v1/incidents` | Two synthetic cases and metrics |
| Evidence trail | `GET /api/v1/incidents/{id}/grounded-brief` | Claims + `SIM-EVT-*` citations + unknown root cause |
| **Incident Workspace** | `GET /api/v1/incidents/{id}/workspace` | Read-only aggregated evidence, previews, approved knowledge, tree and training links; **no Ollama call** |
| Explain with AI | `POST /api/v1/investigate` | Loading/error state and `generated_unverified` label |
| Sentinel | `POST /api/v1/diagnostics/preview` | Safe preview vs blocked purge |
| Counterfactual | `POST /api/v1/replay` | **Simulated**, not predicted, outcomes |
| Decision DNA | `GET /api/v1/knowledge/lessons` | Approved records only |
| Knowledge Tree (legacy API alias) | `GET /api/v1/knowledge/knowledge-tree` or compatibility endpoint `/api/v1/knowledge/legacy-tree?incident_id=INC-DISK-001` | Only locally reviewer-approved synthetic lesson nodes; never fictional reuse counts |
| Knowledge transfer | `GET /api/v1/training/challenges/{lesson_id}` + `POST .../assess` | New-event scenario + rubric; needs approved lesson |
| Shift handover | `GET /api/v1/shift-briefing` | Open incidents and missing evidence |

**Full contracts:** [Backend API overview](docs/BACKEND_API_CONTRACT.md) · [Sprint 2](docs/BACKEND_SPRINT2_API.md) · [Sprint 3](docs/BACKEND_SPRINT3_API.md) · [Maggie's integration handoff](docs/SPRINT3_HANDOFF.md).

**Current cross-team MVP plan:** [Complete incident → Decision DNA → apprentice transfer handoff](docs/END_TO_END_MVP_HANDOFF.md) documents every existing endpoint, safety/error state, the synthetic demo walkthrough, and what's still Maggie's frontend work. Backend contract integration tests live in `backend/tests/test_demo_journey.py` (included in full pytest). This backend handoff does **not** implement Maggie's screens.

## 🧩 Repository map

```text
CAIL-LEGACY-NonStop-AI/
├── backend/
│   ├── app/                   # FastAPI; evidence; safety; AI; knowledge; training
│   ├── tests/                 # pytest API/security/knowledge tests
│   ├── Dockerfile
│   └── requirements*.txt
├── frontend/
│   ├── src/                   # Maggie: React views/styles
│   ├── vite.config.ts         # Docker/Vite frontend proxy
│   └── vite.local.config.ts   # Windows host development proxy
├── docs/
│   ├── assets/                # Editable SVG architectural visuals
│   ├── BACKEND_API_CONTRACT.md
│   ├── BACKEND_SPRINT2_API.md
│   └── BACKEND_SPRINT3_API.md
├── scripts/                   # Optional explicitly synthetic knowledge demo seed
├── compose.yaml
└── .env.example               # Template only — NEVER commit .env
```

## 🔌 API map

```mermaid
flowchart TD
  I[Incident] --> A[Analysis / Grounded brief]
  A --> L[Local Ollama investigation]
  A --> R[Documentation pointers]
  A --> S[Sentinel preview]
  A --> C[Counterfactual replay]
  I --> K[Expert lesson: draft]
  K --> U[Submitted]
  U --> V{Independent reviewer}
  V -->|Approve| P[Approved retrieval]
  V -->|Reject| X[Excluded from retrieval]
  P --> T[Knowledge-transfer challenge]
  T --> E[Safety + evidence + prerequisite scoring]
```

Interactive schema is always available at **[FastAPI `/docs`](http://localhost:8000/docs)** when the local backend is running. Public endpoints serve simulated training information. The protected write/review endpoints require **distinct local demo secrets**; they are **not production login, SSO or RBAC**. For a safe optional demonstration, see [`scripts/seed_demo_knowledge.ps1`](scripts/seed_demo_knowledge.ps1); run it only with `-ConfirmSynthetic` from your own computer and never share `.env` contents.

## 🔐 Reliability, cost and privacy

| Item | Current position |
|---|---|
| Paid APIs | None required for local prototype |
| LLM "training" | **No fine-tuning** — local inference + approved-note lexical retrieval |
| HPE source material | Curated official document *pointers*, not full-text RAG or an HPE-certified knowledge base |
| Command safety | Display-only reference templates and a deterministic default-deny simulator |
| Audit | Local hash-linked SQLite records; **not tamper-proof** against privileged DB modifications |
| Security | Private repo, local ports, demo role keys. Authentication, rate limits and threat testing still needed for deployment |
| Mobile | Responsive browser UI foundation; dedicated Android app and installable PWA not implemented |

**Please do not:** commit `.env`, ship real customer logs, hardcode reviewer keys in React, run commands from model prose, treat training scores as verified employee competence, or describe synthetic event IDs as actual HPE codes.

## 🧯 Troubleshooting

| Problem | What to check |
|---|---|
| Git clone returns 404 | Private repo: ask Ritvij for collaborator invitation, accept it and sign in through Git/GitHub |
| `docker compose` cannot connect | Open Docker Desktop and wait for *Engine running* |
| Frontend cannot load incidents | Check `docker compose ps` and `http://localhost:8000/api/v1/health`; inspect backend logs |
| `model_unavailable` | Ollama running on host? `ollama list`; check `qwen3:4b-instruct` name, backend logs, `host.docker.internal:11434` |
| Public Funnel shows `ERR_SSL_PROTOCOL_ERROR` | Public HTTPS/DNS/certificate or Funnel ingress needs diagnosis; confirm gateway locally, inspect `tailscale funnel status` and test on mobile data. Do **not** expose backend/Ollama ports as a workaround. |
| Chat responds similarly to different prompts | Use `#/chat` and the four intent-specific ATM questions above; rebuild containers after changing code, then verify `interpreted_intent` and varied response panels. |
| PowerShell blocks `npm.ps1` | Run `npm.cmd` / `npx.cmd` instead; no global policy change needed |
| Port 5173 in use | Stop Docker frontend before local Vite dev; don't run both on same port |
| No approved lesson / transfer challenge 404 | Review workflow hasn't created an approved lesson; do not fake a verified operator |
| Role-protected endpoints return 503 | Create separate local credentials in **untracked** `.env`; don't send them to teammates |

## 📚 Collaboration and project records

- **[Confluence project space](https://northeastern-team-mx3hi3ad.atlassian.net/wiki/spaces/CAILLEG26)** — architecture, sprint history, evaluation and meeting rituals.
- **[GitHub issues](https://github.com/naramritvij/CAIL-LEGACY-NonStop-AI/issues)** — backlog and acceptance checks.
- **[Project charter](docs/REQUIREMENTS.md)** · **[Security boundaries](docs/SECURITY.md)** · **[Detailed architecture](docs/ARCHITECTURE.md)**

<div align="center">

**CAIL = Evidence + Safe Assistance + Durable, Reviewed Knowledge.**

*Understand what happened. Show the evidence. Preserve the reasoning.*

</div>

### Optional locally reviewed excerpt corpus (Sprint 4)

The backend now supports **user-supplied, authorized** documentation excerpts with expert submission, independent reviewer approval, SHA-256 chunk citations and an explicit NonStop-release search filter. Nothing is downloaded from HPE automatically; an official-looking URL is not proof that pasted text is genuine. This is an **offline lexical chunk index, not full vector/semantic RAG**. With no approved excerpts, searches correctly return `no_match`.

[Read the five new endpoints, ingestion rules and security limits](docs/BACKEND_SPRINT4_CORPUS.md). Existing Incident Black Box and Maggie's frontend routes are unchanged.

### Sprint 5 — Citation-bounded local AI investigations

Use `POST /api/v1/investigate/grounded` to request a structured local Qwen3 explanation of the **synthetic** incident, optionally augmented by release-matched, locally approved document chunks. Every generated claim must identify a registered `SIM-EVT-*` or `DOC-*` citation; invented IDs or malformed model JSON cause the claim output to be suppressed. **Matching an ID is not verifying the claim's truth or the document's authenticity.** The AI cannot execute or approve commands, and the existing frontend is unchanged. See [API contract and verification steps](docs/BACKEND_SPRINT5_GROUNDED_AI.md).

## Knowledge Transfer demo (merged into main)

The integrated Maggie v0 interface now includes review-gated **Library**, **Mentor**, **Apprentice**, and **Capture Decision DNA** flows, plus simulated **safe check previews** and a structured operator briefing. Synthetic Showcase tree lessons are NonStop-themed, while the actual Knowledge Tree still shows only locally approved lessons.

See [Knowledge Transfer demo guide](docs/KNOWLEDGE_TRANSFER_DEMO.md) for the one-time Windows demo-key setup, complete scenario flow, review constraints, and limitations. These features are opt-in **local synthetic training only** and passed the 18 October local automated verification. Browser review flows still require manual acceptance. Never import live customer data or treat a pasted HPE URL as authenticated source content without verification.


## Guided Command Playbook (merged into main)

The Investigate screen now starts with an issue-specific **Guided Command Playbook** for the synthetic disk and Pathway incidents: read-only CAIL fixture previews, documentation-only SCF/PATHCOM status syntax, evidence buttons, interpretation/unknowns, and contextual next steps. A deterministic symptom selector routes questions to registered checks, not free-form executable commands. Published HPE document links are included for each real command reference; the project-supplied `a00099017en_us` link was not directly verifiable as a command manual. There is no live HPE integration or execution endpoint.

See [document/source audit, exact commands, and safety boundaries](docs/GUIDED_COMMAND_PLAYBOOK.md). The additional tests and UI passed the full local Windows verification on 18 October. Browser interaction testing and sponsor-specific applicability checks remain separate.

## Integrated CAIL Sponsor Operations Lab — synthetic completeness milestone

The local prototype now has an **Operations Lab** route with an allowlisted
operator command console, CAIL Suite-style offline adapters (EMS, ASAP,
Guardian/process, SCF and PATHCOM references), an interdependent financial
hardware-capacity failure, a generated management/overnight briefing and a
browser-based timed evaluation protocol. Existing Investigate pages share
the same console. Commands that might change system state are blocked;
recognized native STATUS commands are documentation references, not executed
subsystem queries.

See [sponsor mission and realistic acceptance/limitations](docs/SPONSOR_MISSION_ACCEPTANCE.md).

The CAIL brochure permits a read-only advisory prototype, but a real CAIL
Suite deployment requires authorized connectivity, verified NonStop release,
RBAC, site-specific policy and genuine data; none is claimed. Do not present
temporary fictional incident chronology as an authenticated hardware failure.


## Chat-to-map investor demo (ATM, synthetic only)

The **Ask CAIL Chat** navigation entry (`#/chat`) accepts ordinary ATM
questions and renders a **clickable six-location fictional ATM map inside
the chat reply**. The assistant reuses existing local synthetic EMS/ASAP/
Guardian adapters, displays HPE PATHCOM status as UNKNOWN, retrieves only
locally approved Knowledge Tree lessons, and explains the same events for
frontline staff or technical engineers. Follow-up turns keep the selected
fictional ATM. A new restricted POST /api/v1/operations/atm/chat endpoint
performs only deterministic local routing, no shell/NonStop execution or
real-ATM lookup. Existing incident Ask CAIL panels also offer this rich
ATM-specific route. See docs/ATM_WOW_DEMO.md for the live stage walkthrough.

The map and past-history examples remain explicitly fictional. The public Funnel environment is a separate, isolated synthetic backend and does not expose the private Mentor reviewer workflow. See the [public deployment instructions](docs/TAILSCALE_FUNNEL_DEMO.md) for activation and TLS troubleshooting. No real CAIL Suite/ATM integration or measured MTTR outcome is claimed.
