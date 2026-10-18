# Tailscale Funnel: full AI-backed public CAIL demo on Windows

**Status:** preparation only. These commands create a public URL on the
operator's *own* Tailscale account; no GitHub commit generates that hostname.
Always verify the local gateway and Ollama access before publishing.

This is the **CAIL / Nonstop AI Operations Assistant** hackathon prototype,
not production NonStop management. The map, incident records and tool
outputs are fictional. The Ask CAIL map chat uses bounded rule-based routing,
and the separate Qwen investigations use your running Ollama model.

## What is actually shared?

\`compose.funnel.yaml\` runs two separate containers under the independent Docker Compose project
name `cail-funnel-demo` (so local `compose.yaml` services are untouched):

1. \`demo-gateway\`: production React build, served by Nginx. It publishes
   **127.0.0.1:8787**, not the Vite development port. Blocks all unsupported
   POST routes; throttles AI requests; includes no admin API, raw Ollama,
   shell or reviewer/expert functionality.
2. \`demo-backend\`: an isolated FastAPI backend with a temporary fictional
   SQLite database under /tmp, **no private local knowledge volume**,
   **no expert/reviewer keys**, and **no host-published backend port**.
   It can use Ollama already running on the Windows host through
   \`host.docker.internal:11434\`. It is **not** wired to a real HPE host.

The public Knowledge Tree will initially be empty because the real local
expert-approved lesson database is intentionally **not shared**. The local
full project at \`localhost:5173\` is unchanged and retains its private
approved lessons and reviewer workflow.

The URL is publicly reachable without a Tailscale account, subject to
Tailscale's HTTPS Funnel availability. Keep the laptop awake and Docker,
Ollama and Tailscale running. Do not place real customer data in these demos.

## Prerequisites

- Windows 11, Docker Desktop running and already verified local project.
- Ollama running with existing \`qwen3:4b-instruct\` model.
- Tailscale installed from https://tailscale.com/download/windows and
  signed in to your own Tailscale account/tailnet.
- MagicDNS and HTTPS certificates enabled for the tailnet. The first
  \`tailscale funnel\` invocation can ask for web-admin consent and enable
  the required Funnel \`nodeAttrs\` policy. Follow the official prompt.
  Funnel requires an HTTPS tailnet DNS name ending in \`.ts.net\`.

## Start, test and publish

From PowerShell:

\`\`\`powershell
Set-Location "$HOME\Projects\CAIL-LEGACY-NonStop-AI"
git switch feat/cail-atm-wow-demo
git pull --ff-only
.\scripts\start_tailscale_funnel.ps1 -CheckQwen
\`\`\`

This builds and checks the restricted public gateway at:

\`http://127.0.0.1:8787/#/chat\`

It verifies ATM-042, chat-to-map and HTTP 403 for knowledge writes.
The optional \`-CheckQwen\` checks that the local Qwen service responds
through the allowed HTTP route. A successful JSON request does **not**
prove factual correctness.

When all local checks pass, activate the public HTTPS URL:

\`\`\`powershell
.\scripts\start_tailscale_funnel.ps1 -Publish -CheckQwen
\`\`\`

Tailscale may open an authorization browser page for Funnel/HTTPS.
Approve only in your own tailnet. Then the script prints
\`tailscale funnel status\` output, including **your actual HTTPS URL**.
Append \`/#/chat\` for a QR-ready chat link. Do **not** invent a URL
before that output appears.

## If Nginx reports 502 before Funnel

A successful Docker image build and Nginx \`/healthz\` response do **not**
prove FastAPI is accepting requests yet. A 502 on
\`http://127.0.0.1:8787/api/v1/operations/atm/network\` means the reverse
proxy did not obtain a valid backend response. This may be an ordinary
container-startup race, but it may also mean FastAPI exited or became
unhealthy.

The startup script now waits for a *real* FastAPI health result through
Nginx at \`/api/v1/health\`, and Docker Compose waits for the isolated
backend's Python HTTP healthcheck before starting the gateway. If a 502
persists, the script prints recent container logs and refuses to publish.

Run these diagnostics locally (they do not expose a public URL):

\`\`\`powershell
docker compose -f compose.funnel.yaml ps
docker compose -f compose.funnel.yaml logs --tail=100 demo-backend demo-gateway
Invoke-RestMethod 'http://127.0.0.1:8787/api/v1/health'
Invoke-RestMethod 'http://127.0.0.1:8787/api/v1/operations/atm/network'
\`\`\`

Avoid opening Funnel, changing bind addresses to \`0.0.0.0\`, or removing
the read-only backend restrictions just to bypass a 502. The log details
are needed to distinguish startup delays from actual application failures.

## Verify on a different network / phone

- Open the HTTPS link in an incognito browser and over mobile data (not
  just from the host laptop).
- Ask **Which ATM is broken, and where is it?** → a map is animated
  inside the chat, ATM-042 is flagged red, and synthetic evidence expands.
- Ask **Show ATM-042 PATHCOM and CPU evidence** → technical explanation,
  registered fictional data, and actual PATHCOM status UNKNOWN.
- Select a green ATM → no fictional incident there (not real health).
- Ask **Restart ATM-042 now** → denied; no system command executed.
- Open **Operations Lab → Ask Qwen** to check local model-backed text
  under registered-citation-ID controls. Inference can be slow depending
  on the laptop and simultaneous visitors.
- Opening an expert/reviewer mutation URL must return HTTP 403; keys
  are never sent to the public gateway.
- Check \`tailscale funnel status\` for a public listener (not merely
  \`tailscale serve status\`).

**Stop immediately after testing or pitch day:**

\`\`\`powershell
.\scripts\stop_tailscale_funnel.ps1
\`\`\`

Or see \`tailscale funnel --help\` for the exact stop command if your
Tailscale client version differs.

## Operational limitations

- A Funnel HTTPS URL is **public and unauthenticated**, including to
  people outside your team. Use only fictional training content.
- The public gateway has a small per-connection request budget; due to
  Funnel/Docker NAT this may be shared among audience members. A large
  crowd might see rate limits; avoid advertising unrestricted throughput.
- Single laptop + Docker/Ollama are a single point of failure. Keep the
  device powered, asleep mode disabled and on stable power/network.
- Funnel URLs use Tailscale's \`.ts.net\` domain and supported public ports
  443/8443/10000; we use public HTTPS **443** to local port **8787**.
- Local \`https://localhost:5173\` is NOT the public destination and
  neither \`11434\` nor \`8000\` should be exposed through Funnel.
- Final signoff requires **fresh build verification and an off-network
  browser test** on this branch. The previously passed tests apply
  to earlier commits, not this gateway change.

Official docs: https://tailscale.com/docs/features/tailscale-funnel and
https://tailscale.com/docs/reference/tailscale-cli/funnel.
