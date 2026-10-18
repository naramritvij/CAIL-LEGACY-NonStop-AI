# Unified CAIL/Nonstop AI Operations Assistant

Integration base: enterprise-bridge backend from feat/cail-operator-command-center and Maggie's v0 frontend from feat/maggie-v0-frontend.

- Keeps Maggie's React 19, Vite 7, Tailwind, SWR, route-based UI, interactive Knowledge Tree.
- Adds the system health/command-source panel into Home and Investigate sections.
- Uses the official Knowledge Tree endpoint; the legacy-tree path remains a compatibility route.
- Preserves safe, synthetic-only ASAP/EMS/SCF evidence and human safety controls.
- Adds tracked src/lib/format.ts; the original root .gitignore ignored nested lib/ folders, causing broken clean clones.
- Uses Maggie's package-lock.json / npm ci and frontend .dockerignore to prevent cross-platform esbuild conflicts.
- Sets the Compose HTTP adapter/proxy target to backend:8000.
- Backend and all tests from the operator command center branch remain in place.

## Verify locally

git fetch origin
git switch feat/cail-unified-maggie-operator-ui
git pull --ff-only
docker compose build --no-cache frontend
.\scripts\verify_operator_center.ps1 -RunsPerIncident 1

This has not been executed against real NonStop hosts, and merged-branch frontend compilation is pending local verification. Do not merge to main until build, API contracts and both scenario investigations pass.

## Caution

Because the earlier branches did not track frontend/src/lib/format.ts (root lib/ ignore), an older ignored local copy may remain on Windows after switching. Back up that file before checking out this branch if you've modified it manually. Never use git clean -fdx as a first response.
