# Load real reference data and connect authorized monitoring sources

## Start with real HPE documentation

After updating/rebuilding, open **Knowledge graph → Add knowledge → HPE references**. Choose the TACL Reference Manual or Security Hardening Guide and select **Import publisher PDF**.

CAIL downloads the actual PDF from its fixed HPE publisher catalog, extracts text, stores its file hash/cover edition and creates passage/reference nodes under your identity. The resulting graph is available immediately to the owner. Reimporting the same publisher PDF under the same owner reuses the contribution. Public manuals are not bundled in GitHub.

The November 4 verification imported 767 pages from those two publisher PDFs and produced 1,524 nodes / 2,607 relationships. These are documentation relationships, not live customer systems. Existing uploads can be expanded with **Index existing documents**; new uploads are indexed automatically. A source passage links back to its exact stored citation and full document.

For other manuals, use **Upload document → Reference manual**. Limits: PDF/TXT/Markdown, 32 MiB, 1,000 PDF pages, 2,000,000 extracted characters. Supply the edition/source URL, or retain the edition printed in the file. Ordinary notes and document uploads retain their smaller existing limits. Source URLs entered for a manual are provenance labels, not arbitrary URLs the server fetches.

Drafts remain private. Submit for independent review before enabling team/assistant retrieval. In a local demonstration, configure a separate reviewer as described in [README](../README.md#operators-and-document-review). The default single local identity cannot approve its own contribution.

## Direct Prognosis REST dataset

Obtain the full read URL of an admin-provisioned JSON dataset and a least-privilege read account. The reference project uses the Prognosis REST dataset mechanism, with paths shaped like `/Prognosis/Rest/v1/data/<dataset>`. CAIL uses the exact URL you configure; it does not discover hosts, create PQL queries or scan for datasets. Compatibility with the installed release's response shape must be verified with its administrator.

In the ignored local `.env`, replace all placeholders:

```dotenv
CAIL_LIVE_ENABLED=true
CAIL_LIVE_ALLOWED_HOSTS=YOUR-AUTHORIZED-PROGNOSIS-HOST
CAIL_PROGNOSIS_DATASET_URL=https://YOUR-AUTHORIZED-PROGNOSIS-HOST/Prognosis/Rest/v1/data/YOUR-APPROVED-DATASET
CAIL_PROGNOSIS_USER=YOUR-READ-ONLY-ACCOUNT
CAIL_PROGNOSIS_PASSWORD=YOUR-PRIVATE-PASSWORD
CAIL_PROGNOSIS_SYSTEM_ID=YOUR-EXACT-NONSTOP-NODE
CAIL_PROGNOSIS_FIELDS={}
CAIL_PROGNOSIS_ROWS_KEY=
```

The server sends only HTTPS GET with Basic authentication, verifies TLS, rejects redirects and URL credentials, and enforces the host allowlist. Credentials stay server-side. Native reads require an operator with `can_read_live=true`; the anonymous local demo identity cannot read them.

Default mapped columns:

| CAIL field | Dataset column |
| --- | --- |
| `id` | `ProblemId` |
| `node` | `NodeName` |
| `message` | `Description` |
| `category` | `Category` |
| `severity` | `Severity` |
| `timestamp` | `TimeRaised` |
| `state` | `State` |

Override column names with JSON, for example `CAIL_PROGNOSIS_FIELDS='{"id":"ProblemNumber","node":"NonStopNode","message":"AlarmText"}'`. These column names must come from the actual dataset. ID, node and message are required. A plain row array or an object containing one `data`, `rows`, `Data` or `Records` array is accepted. For a nested response, set a dotted rows key, such as `CAIL_PROGNOSIS_ROWS_KEY=result.items`.

Every row must match the configured source system. Case and a leading NonStop backslash are normalized; names are not guessed from prefixes such as PROD. Wrong-system or malformed rows reject the read. Empty datasets remain empty observations and never establish a green health state.

A direct native configuration takes precedence over the corresponding normalized topology gateway. An invalid native configuration does not fall back to a different source or a demo.

## MOMI alarm export directory

MOMI integration here reads files produced by an authorized MOMI client/export job. It does not invent a universal MOMI REST API or query its Enscribe files. Configure a dedicated UTF-8 alarm export folder using the installed product's supported template/log export facilities. See BlackWood's [export documentation](https://www.blackwood-systems.com/momi/documentation/WebHelp/Client/Screens/History/History___Export_Data.htm).

For Docker on Windows:

```dotenv
CAIL_LIVE_ENABLED=true
CAIL_MOMI_EXPORT_HOST_DIR=C:/YOUR/AUTHORIZED/MOMI-EXPORT-FOLDER
CAIL_MOMI_EXPORT_DIR=/readonly-momi
CAIL_MOMI_SYSTEM_ID=YOUR-EXACT-NONSTOP-NODE
```

Compose mounts that folder read-only. For direct Python development, set `CAIL_MOMI_EXPORT_DIR` to the existing absolute path on that machine. Keep application databases and unrelated files outside the dedicated export folder.

Accepted alarm template shape (placeholders, not observations):

```text
node=ACTUAL-NONSTOP-NODE
state=SET
date=SOURCE-DATE
time=SOURCE-TIME
alarm=SOURCE-ALARM-NAME
action=SOURCE-ACTION-NAME
entity=SOURCE-ENTITY-NAME
text=SOURCE-ALARM-TEXT
```

Separate blocks with blank lines. TXT/LOG/TSV exports can alternatively use TAB columns `date`, `time`, `node`, `text`, with an optional header. This adapter reads alarm rows; it does not claim to parse every MOMI history/metric format. A different format can still use the normalized gateway.

The newest regular TXT/LOG/TSV file is read without moving or modifying it. Symlink files are skipped. Export-file time must be within 300 seconds of the current time, with at most 60 seconds future tolerance; changed/partial or oversized files are rejected. Have the export job publish completed snapshots atomically. Local event timestamps are retained as exported, without an invented UTC offset. The observation time shown for this mode is the export-file time, not a restamped event occurrence time.

## Verify and use the sources

1. Recreate containers with `docker compose up -d --build` after configuration changes.
2. Sign in as a configured operator with live-read permission.
3. Open **Connections → Verify source**, then **Knowledge graph → Refresh sources**.
4. Inspect the actual system ID, source record IDs, source mode and observation time.

The graph reads configured sources every 15 seconds while visible and updates committed graph records every three seconds. Reads are foreground operations, not an unattended collector. The assistant can retrieve timestamped native observations through its existing authorized telemetry worker.

Native alarm datasets become observation graphs: dataset → alarm → reported system/category. Those edges describe supplied records, not physical infrastructure dependencies or confirmed causes. System-wide health stays unknown unless an appropriate source supplies sufficient evidence; successful HTTP/file access is not a health conclusion.

Limits: 16 MiB per source response/export, at most 5,000 alarm rows, bounded graph overview and at most 100 native evidence rows per assistant snapshot. Truncation is disclosed. Failed reads mark retained topology stale. Disabling access hides it. Changing a native system scope hides the old system's graph/history before another read, and system identities prevent old annotations being rebound to another system.

## Import an existing monitoring export

Use **Knowledge graph → Import dataset → Export format** and choose **Prognosis dataset JSON** or **MOMI alarm export**. This needs no live credentials and creates a private review-gated imported snapshot. It is labelled separately from an active connection. The same literal source node names, descriptions and timestamps are retained.

## ASAP and normalized source gateways

The existing authorized HTTPS contracts remain available for Prognosis, ASAP and MOMI. Use the installed ASAP Consumer/query interface through its approved collector/gateway; this change does not assert a new generic native ASAP REST API. Metrics and topology use their separate existing endpoint settings. See [SCALABLE_GRAPH.md](SCALABLE_GRAPH.md) and [AGENT_WORKSPACE.md](AGENT_WORKSPACE.md).

No native command execution or source permission change is implemented. The environment owner supplies private customer access locally. The HPE publisher catalog is independently usable without customer monitoring access.
