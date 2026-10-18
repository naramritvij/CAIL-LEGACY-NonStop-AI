# CAIL sponsor mission: integrated synthetic acceptance matrix

**Status:** code implemented on feature branch, local verification required.

The official CAIL brochure describes three inputs—CAIL Suite, HPE NonStop
operational data, and enterprise knowledge—augmented by generative AI. It
explicitly permits an initial **read-only advisory system** that presents
commands without automatically executing them. CAIL Suite and HPE live API
credentials were not provided, so this solution demonstrates the documented
interaction pattern using local synthetic adapters. No simulated connection is
represented as production access.

## Operator journey (run from the local app)

1. **Operations Lab** → choose **Financial payments — hardware capacity reduction**.
2. Type `Are there any problems on the system?`: health adapter returns fixture-defined state.
3. Type `Why is CPU 3 very busy?`: synthetic ASAP-style CPU data and provenance.
4. Type `Show me processes that have failed in the last hour`: synthetic Guardian-style
   process observation (fixed fictional shift; not a real rolling-hour query).
5. Type `Show me recent EMS errors related to Pathway`: filtered EMS-like event record.
6. Type `STATUS PATHWAY`: recognized HPE command **reference** plus documentation.
   The console returns UNKNOWN actual PATHCOM status and does not execute a command.
7. Type `SHOW CORRELATION`: original synthetic hardware warning, CPU, Pathway,
   transaction and process observations in time order, with alternate explanations,
   explicit unknowns and no proven root cause.
8. Type `STOP PATHWAY`: blocked unsafe; unknown `STATUS` strings unsupported.
9. Open **Overnight & management briefing**: complete event counts and outstanding
   gaps, never invented restarts or recovery.
10. Run the built-in evaluation timer for a consented manual static-evidence vs
    CAIL-assisted comparison. Record times and supported evidence. No improvement
    claims until actual evaluation.

**Existing Incident pages** also expose the same Unified Command Console.
It refuses a PATHCOM question while a disk case is selected, proposes a link to
the correct Pathway incident, and retains the earlier Guided Command Playbook.

## Requirements vs genuine remaining dependencies

| Sponsor capability | Offline implementation | External dependency for production |
|---|---|---|
| Natural language operator questions | Bounded query router plus local evidence-cited Qwen | Genuine access / wider command intents |
| NonStop command discovery | Documented SCF/PATHCOM reference allowlist | Version-specific manual / site object verification |
| Tool access across EMS, ASAP, SCF, PATHCOM, Guardian | Five clearly labeled synthetic adapters | Authorized CAIl Suite/NonStop test connector |
| Interconnected financial failure | New fictional hardware and payment scenario | Real, anonymized incident history and SME review |
| Domain knowledge preservation | Local reviewed Library, Mentor, Knowledge Tree | Real expert transcripts and authenticated provenance |
| Read-only and automation controls | Default deny, no execute endpoints | Real RBAC/SSO, approvals, audit and site policies |
| Operational summaries | Three synthetic incident handover cards | Signed shift schedule and live monitored systems |
| MTTR improvement | Independent timed evaluation protocol | Consented comparative study and valid results |
| Speech and broad documents | Local text input and approved excerpt intake | Approved transcription and complete knowledge corpus |

**Do not claim fully live, certified or production-ready.** A simulated interface
can meet hackathon prototype demonstration criteria but does not establish
real-world operational reliability. Identity, source authenticity, release
applicability and actual incident causes remain unverified.

## Verification

```powershell
git pull --ff-only
.\scripts\verify_operator_center.ps1 -RunsPerIncident 1
```

After the automated suite, manually exercise all ten steps and the separate
Library → Mentor → Knowledge Tree → Apprentice workflow. Do not overwrite
the private `.env`, SQLite Docker named volume or untracked frontend files.

## Grounded local Qwen on the financial case

The new Operations Lab has an **Ask CAIL** form backed by the existing
`investigate_with_corpus` model function. It receives the same registered
synthetic event and ASAP-style metric citations as the legacy incidents.
A local model response with an unknown ID is rejected; one with registered
IDs is still labeled unverified because source-ID presence does not establish
semantic support or causal accuracy. No model response drives any command
routing decision.
