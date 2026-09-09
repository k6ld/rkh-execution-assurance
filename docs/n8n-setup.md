# Local n8n workflow setup

These artifacts are for an RKH-local n8n instance. They must not be imported
into the superseded VPS for RKH work.

## Import order

1. Run `npm run build:n8n`.
2. Import `rkh-maximo-mms-processor.json` inactive and record its local ID.
3. Rebuild with `RKH_PROCESSOR_WORKFLOW_ID` set to that ID, then import the dashboard upload and three read-API workflows inactive.
4. Import `rkh-local-file-drop-intake-template.json` only after the local storage folders exist. Keep it inactive until synthetic validation is complete.
5. Import `rkh-maximo-email-intake-template.json` only after RKH approves the mailbox integration. Replace its webhook template with the approved Outlook/Exchange trigger; keep it inactive until tested.

Do not activate a workflow or use a real RKH report as an import test without
the corresponding authorization.

## Persistent data

The Data Table is `assurance_runs`. It contains only run lifecycle metadata,
counts, retention timestamp, and internal file references. The source report,
results JSON, and export CSV are protected local files under the configured
artifact root. Public response workflows never expose the file references.

The local root defaults to `C:/RKH/ExecutionAssurance` at generation time. To
use an approved different local volume, set `RKH_ASSURANCE_STORAGE_ROOT` only
when running `npm run build:n8n`; do not commit a machine-specific path or any
runtime data.

Set the n8n service's `N8N_RESTRICT_FILE_ACCESS_TO` to that same root and
restart n8n before activating these workflows. n8n v2 blocks native file nodes
outside its allowlist by design. For the workstation pilot also set
`N8N_LISTEN_ADDRESS=127.0.0.1` and verify the actual listener; production uses
the same loopback setting behind the internal reverse proxy.

## Target validation

Use the supplied synthetic CSV only. Verify that:

1. Upload returns a run ID and writes one source artifact.
2. The Data Table row has path metadata but no Base64 source or result payload columns.
3. The processor writes local JSON and CSV result artifacts and reaches `COMPLETED`.
4. Get Run and Get Results return the expected public shape without internal paths.
5. Restart persistence works, and the 90-day cleanup utility is dry-run only.

Before shared production, also verify loopback-only n8n binding, internal HTTPS
proxy behavior, AD/group authentication, backup restore, execution-data
pruning, and RKH-approved mailbox/file-drop controls.
