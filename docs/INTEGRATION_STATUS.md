# CAIL Sponsor Demo — GitHub integration status (18 October 2026)

**Repository:** `naramritvij/CAIL-LEGACY-NonStop-AI` · default branch `main`.

## Merge history

- PR [#14](https://github.com/naramritvij/CAIL-LEGACY-NonStop-AI/pull/14): merged Maggie's unified frontend and the FastAPI/Qwen operator backend (merge commit `fb45aab`).
- PR [#15](https://github.com/naramritvij/CAIL-LEGACY-NonStop-AI/pull/15): merged review-gated Knowledge Engine, Decision DNA, Mentor, Library, Apprentice, Guided Command Playbook, unified synthetic command router, financial hardware-failure Operations Lab, shift summary, and evaluation framework (merge commit `d3d2234`).

The original feature-branch commit history was preserved by using ordinary **merge commits**. The completed feature branch has no file differences from the merged main contents at the time of integration. No branches were force-pushed or deleted.

## Local verification results

The full `scripts/verify_operator_center.ps1 -RunsPerIncident 1` pipeline passed on Windows at feature commit `6d92fd4`, before merging code unchanged into main:

- **184 / 184** backend Python tests passed; one nonblocking Starlette/httpx warning.
- Docker frontend and backend images built and containers started.
- TypeScript/Vite production build passed (**2,005** modules).
- **17 / 17** frontend contract and safety checks passed.
- **2 / 2** bounded local Ollama/Qwen incident runs accepted and reported safe.
- Guided command no-execution gates, curated HPE reference-only statuses, Knowledge Tree approved-only restrictions, synthetic financial case, management briefing, and evaluation smoke checks passed.

These are **local automated tests**, not GitHub Actions CI or live HPE acceptance testing.

## Before presenting the prototype

Manual browser walkthrough remains necessary: Operations Lab (`#/operations`), financial event correlation and Qwen explanation, explicit synthetic tool provenance, native STATUS references reporting UNKNOWN, unsafe command rejection, wrong-incident routing, and Library → Mentor → approved Knowledge Tree → Apprentice. Record any remaining UI defects separately.

**Boundaries:** No connected real HPE NonStop/CAIL Suite tools, no execution of native commands, no authenticated real incident/event provenance, no verified expert identity, no measured production MTTR improvement. Do not present this as a production-ready deployment. It is a $0 local read-only/synthetic proof of concept.

**Local checkout:** After inspecting `git status --short` and preserving tracked/untracked work, `git switch main` then `git pull --ff-only origin main`. Never delete the private `.env`, SQLite named volume, or locally untracked files.
