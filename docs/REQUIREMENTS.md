# CAIL/Nonstop AI Operations Assistant — Sponsor Acceptance Traceability

**Updated 18 October 2026 · PR #15 DRAFT, local verification pending for current commit.**

The CAIL challenge asks: "How might we use AI to help the next generation
of IT operators understand, monitor, and troubleshoot mission-critical
enterprise systems through natural language, while preserving the expertise
of experienced professionals?"

**Authoritative source:** the user-provided six-page *CAIL / Nonstop AI
Operations Assistant* brochure and challenge statement screenshots.
The brochure explicitly allows an initial read-only advisory assistant:
no automatic system commands are needed for the first prototype.
Reference: `docs/SPONSOR_MISSION_ACCEPTANCE.md`.

| Sponsor objective / example | Feature path in current branch | Honest verification/status |
|---|---|---|
| Casual user asks system questions | Investigate Ask CAIL, Operations Lab command console, local Qwen | Implemented for fictional data; local complete-suite rerun pending |
| Convert questions to commands/queries | Bounded scenario-aware allowlist into synthetic EMS/ASAP/Guardian and documented SCF/PATHCOM references | No native HPE execution, broad vocabulary limited |
| See failed processes, CPU 3, disks, recent Pathway EMS, changes before failure | `/operations/lab/command` and new financial scenario | Fixed fictional event window, NOT an authenticated real last hour |
| Monitor multiple sources / correlate warnings | Health dashboard, incident evidence, chronological cross-tool lab case | Time order and hypotheses only; no proven causality |
| Guided diagnosis and documentation | Guided Command Playbook + Library + manual references + Qwen claims | Source URL/authenticity and model entailment unverified |
| Learn from veteran knowledge and resolutions | Decision DNA → Mentor approval → approved-only Knowledge Tree → Apprentice | Demo identities/lessons only; no authenticated veteran expertise |
| Controlled AI recommendations and approval | Sentinel default deny, allowlisted local previews, separate human review | Native commands display only; no write operations or RBAC |
| Overnight operations and management summaries | `/operations/lab/shift-summary` and Operations Lab frontend | Synthetic 3-case shift; no real restarts claimed |
| Interdependent financial failure / reduced capacity | `INC-FIN-HW-003` fictional hardware→CPU→Pathway→payment/process scenario | No genuine bank system or authenticated outage |
| Improve MTTR and operator efficiency | Built-in consented timed trial protocol and browser timer | Not measured yet; no numeric improvement claims |
| CAIL Suite / HPE operational integration | Local connector-shaped synthetic adapter layer and 11-subsystem inventory | **Not connected to real tools**; requires sponsor's authorized API/test environment |
| User-friendly / safe / $0 local | React/Vite UI, Python/FastAPI, SQLite, local Ollama, Docker | $0 software/API architecture; no production hardening claim |

## Completion gate

Run `scripts/verify_operator_center.ps1 -RunsPerIncident 1`.
Then manually test:
1. All 3 Operations Lab incidents and routing of native/status/query forms.
2. Wrong-incident redirect, blocked command, UNKNOWN SCF/PATHCOM source states.
3. Financial hardware investigation and local Qwen citation transparency.
4. Synthetic shift summary and timed evaluation without assumed MTTR gains.
5. Library → submit → Mentor approve → Knowledge Tree → Apprentice.
6. Responsive browser behavior, error states and no accidental secret exposure.

**Never call this a 100% live CAIL Suite solution.** A 100% verified
*synthetic demonstration* requires completing the local and browser checks.
Production requires permission, genuine data/tool APIs, access control, audit,
release verification, independent domain review, and consented evaluation.
