# n8n setup and manual import

The JSON files in `n8n/workflows/` are the requested manual-import artifacts. They were generated locally from the tested engine; n8n was not available in this environment, so their execution still needs to be proven on the target instance.

## Runtime prerequisites

The workflows use the native n8n Data Table node for durable run metadata, source payload retention, and results JSON/CSV. This avoids requiring `fs`, `$env`, or an externally allowed `xlsx` package inside the Code node.

```text
RKH_MAX_UPLOAD_BYTES=25000000
```

The `assurance_runs` table is created with `createIfNotExists` and scoped to the existing n8n project. Do not put backend settings or credentials in the GitHub Pages frontend.

## Import order

1. Import `rkh-maximo-mms-processor.json` and note its workflow ID.
2. Import `rkh-dashboard-upload-api.json` with the processor ID injected by `RKH_PROCESSOR_WORKFLOW_ID` when the generator runs.
4. Import `rkh-api-list-runs.json`, `rkh-api-get-run.json`, and `rkh-api-get-results.json`.
5. Import `rkh-maximo-email-intake-template.json`, replace its processor ID, and keep it inactive until the Outlook/IMAP trigger and business filtering are configured.

The frontend paths in `frontend/config.js` match the webhook paths in these files.

## What the processor does

The processor receives a run payload, writes `PREPARING`, reconstructs the uploaded source from the Data Table payload, extracts CSV/XLSX rows through the native Extract From File node, writes `ANALYZING`, maps the MAXIMO/MMS fields, runs the deterministic engine, and upserts the final `COMPLETED` snapshot. The Data Table stores the results JSON and exportable CSV string.

## Data Table choice

This build uses `assurance_runs` as the durable metadata and result store. The table is created through a temporary setup workflow using the native Data Table node, then reused by the upload/processor/read APIs. The public APIs expose only the safe projection and never return `source_base64` or `results_json` directly.

## Test sequence on the target n8n instance

Use a synthetic CSV first:

1. Call the upload webhook with the sample report.
2. Verify the response contains a `run_id`.
3. Confirm the `assurance_runs` row contains the source payload, status, counts, results JSON, and results CSV fields.
4. Poll the Get Run webhook until `COMPLETED`.
5. Fetch Get Results and compare counts/results with the local engine tests.
6. Restart n8n and repeat the Get Run/Get Results calls.

Do not call the system production-ready until this sequence and the Golden fixture parity have passed in the actual n8n instance.
