# CAIL / Nonstop AI Operations Assistant — ATM mission demo

## Why this experience exists

CAIL's CEO highlighted an illustrative broken-ATM scenario: a location should
light up on a map, the assistant should help diagnose using existing enterprise
monitoring tools, surface similar prior knowledge, and explain it in language
appropriate to a frontline operator or a senior engineer. A useful
demonstration must show something **beyond a chat response**.

The product title uses the exact six-page CAIL brochure form:
**CAIL / Nonstop AI Operations Assistant**. This includes CAIL, Nonstop,
AI, Operations and Assistant; confirm capitalization/word order with the
team before printing the physical pitch deck.

## Chat-first opening (the investor-facing WOW moment)

Start on **Ask CAIL Chat** (#/chat), without opening any map yourself. Type
**"Which ATM is broken, and where is it?"** CAIL turns the question into a
**clickable fictional map inside its answer** and highlights ATM-042. Under
the map, expand EMS/ASAP/Guardian records and show PATHCOM as **UNKNOWN**,
because no native status was queried. Approved Decision DNA appears in that
same response when a distinct Mentor reviewer has approved a relevant
training lesson. Fictitious history examples are never relabeled as verified
repairs. Click a different ATM marker to see a new contextual chat response.

Next ask **"Show ATM-042 PATHCOM, EMS and CPU evidence"**: the backend
automatically switches to an engineer explanation using bounded keyword
rules, preserving the same synthetic evidence. Then ask **"What did we
learn last time?"**: the reply uses the previously selected ATM as context
and retrieves only review-approved lessons. Try **"Restart ATM-042 now"**
and demonstrate safety refusal.

You can also enter an ATM question in the existing **Ask CAIL · optional
AI** box on an incident page; it opens the same map-and-evidence assistant
inline, without inventing incident-specific ATM telemetry. The ATM
chat itself is deterministic and local. The optional Qwen button on the
full ATM page is separate and only analyzes synthetic backend events.

## How to demonstrate (3-4 minutes)

1. On localhost:5173 open **ATM Mission Demo**, or navigate to #/atm.
2. Show six fictional terminals on the interactive metro-district schematic,
   click the red **ATM-042 — North Exchange**. Point out that map coordinates
   are schematic and NOT real ATM locations.
3. Keep **Frontline employee** selected. Ask:
   "An ATM is not responding. Which one and what should I check?"
   CAIL returns clear, cited, safe guidance without requiring command knowledge.
4. Inspect the synthetic EMS, ASAP and Guardian adapter output. Open PATHCOM:
   the real native subsystem status is **UNKNOWN**. No HPE command executed.
5. Switch to **Technical engineer** and ask the same question. The *evidence*
   remains identical, but the language becomes precise about CPU, Pathway,
   process dependencies and status prerequisites.
6. Show **Retrieve expert knowledge**. Fictional example histories are
   **unreviewed** and disclosed as such; truly approved Decision DNA only
   appears after independent Mentor approval.
7. Open **Capture a reviewed-knowledge candidate**: with the private *expert*
   demo key, write the Pathway symptom and reasoning (using canonical
   SIM-EVT-201 and SIM-EVT-202, not the new invented ATM heartbeat) and submit.
   Navigate to Mentor, enter the *different* private reviewer key, examine and
   approve. Return to #/atm and click **Refresh reviewed knowledge**;
   the lesson appears in the approved matches and in the Knowledge Tree.
8. Optionally click **Ask local Qwen** for additional citation-ID-checked
   interpretation of the *financial backend* training events. Qwen does not
   authenticate a real ATM failure or issue commands.

Narrative: **Locate → Investigate → Retrieve → Assist → Learn**.

## Implementation

- GET /api/v1/operations/atm/network: fictional sites, offline adapter
  directory, reviewer-approved knowledge and clearly labeled example cards.
- POST /api/v1/operations/atm/assist: one mapped ATM, a user-selected
  frontline/engineer explanation, event citations and synthetic read-only
  adapter data. Unknown sites are rejected; state-changing requests blocked.
- Backend uses existing /operations/lab command routing, **not new fake native
  SCF/PATHCOM command output**. Approved matches only come through the
  existing approved-only Knowledge Tree filter.
- Lesson capture reuses existing expert submission, independent mentor review,
  approved Knowledge Tree and Apprentice training APIs.

The demo is **not live ATM telemetry**, GPS positioning, a real banking
incident, verified historical repair, CAIL Suite software integration,
authenticated HPE data, or measured MTTR benefit. Real integration requires
the sponsor's authorized interfaces and risk review. The fictional map
illustrates the interaction pattern, not an actual mapped ATM network.

## Verification

After pulling the PR branch, run:

    .\scripts\verify_operator_center.ps1 -RunsPerIncident 1

The complete Python suite, frontend TypeScript/Vite build, frontend contracts,
local Qwen checks and HTTP smoke tests must pass *on this new branch* before
merging. Then manually run the complete role-switch, source panels, approved
knowledge review and responsive mobile-browser walkthrough. Keep private keys
off screenshots, recordings and the demo stage.
