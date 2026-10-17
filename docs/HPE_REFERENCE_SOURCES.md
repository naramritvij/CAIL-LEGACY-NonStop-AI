# HPE NonStop Reference Registry — Sourced Pointers

**Research verification:** 17 October 2026. Source: publicly accessible HPE Support Center material. These are **pointers** to official HPE documentation, not full copies or endorsements by HPE. Product releases and local availability must be checked; exact messages require actual subsystem/event numbers.

1. **HPE NonStop Operator Messages Manual — Introduction**, document ID `c03911514en_us`; [link](https://support.hpe.com/hpesc/public/docDisplay?docId=c03911514en_us&docLocale=en_US&page=ch01_Introduction.html). It explains which metadata identify operator messages, including subsystem and event number. Refer to the original document for the actual message explanation. Used by: `HPE-OPERATOR-INTRO`.
2. **HPE NonStop Operator Messages Manual — EMS Messages**, same document, [EMS chapter](https://support.hpe.com/hpesc/public/docDisplay?docId=c03911514en_us&docLocale=en_US&page=EMS_Messages.html). The chapter explicitly expands EMS as *Event Management Service* and covers EMS subsystem messages. Used by: `HPE-EMS-CHAPTER`.
3. **HPE NonStop Operator Messages Manual — Table of Contents**, [manual homepage](https://support.hpe.com/hpesc/public/docDisplay?docId=c03911514en_us&docLocale=en_US). Contains chapters titled DISK Messages and PATHWAY Messages. **Only chapter existence is asserted in our source registry; no invented numeric event mapping.** Used by: `HPE-DISK-CHAPTER`, `HPE-PATHWAY-CHAPTER`.
4. **HPE NonStop SCF Reference Manual for the Kernel Subsystem L-Series Technical Update — STATUS**, document ID `c04583315en_us`, [STATUS command](https://support.hpe.com/hpesc/public/docDisplay?docId=c04583315en_us&docLocale=en_US&page=GUID-D7147C7F-2016-0901-02DF-0000000004D7.html). The L-series kernel SCF `STATUS` command displays object status, and is documented as nonsensitive. `STATUS SUBSYS $ZZKRN` is a *display-only* illustration in LEGACY; this is not an instruction to run it in a real environment.

The second user-supplied doc `sd00002149en_us` was not incorporated: its content could not be reliably retrieved at research time. Do not attribute details to it without confirming them.

## Provenance and limitations

- Registry `SOURCE_REGISTRY` has immutable document IDs, section labels, original URLs and hand-curated summaries.
- Automated search uses lexical overlap; it is not vector retrieval and its score is not model confidence.
- The prototype has no authenticated HPE API or HPE NonStop cluster access; synthetic IDs are not official EMS messages.
- No HPE docs are reproduced in bulk or ingested from access-controlled content.
- Before commercial/production work, obtain usage rights, check documentation currency and bind instructions to target RVU and operator privileges.

## Challenge brief HPE reference — body not yet verified

The user-provided HPE Support Center link (document ID a00099017en_us) is https://support.hpe.com/hpesc/public/docDisplay?docId=a00099017en_us&docLocale=en_US . Its body was not accessible through the research interface on 17 October 2026. **No command syntax, technical interpretation, or document title has been derived from its inaccessible contents.** The operator command center uses separate, readable HPE EMS and SCF references.
