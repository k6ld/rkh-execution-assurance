# n8n setup and manual import

The JSON files in `n8n/workflows/` are the requested manual-import artifacts. They were generated locally from the tested engine; n8n was not available in this environment, so their execution still needs to be proven on the target instance.

## Runtime prerequisites

The processor Code node reads local files and parses XLS/XLSX with the `xlsx` package. Configure the self-hosted n8n process before importing:

```text
RKH_ASSURANCE_DATA_DIR=C:\RKH-Assurance
RKH_MAX_UPLOAD_BYTES=25000000
NODE_FUNCTION_ALLOW_BUILTIN=fs,path
NODE_FUNCTION_ALLOW_EXTERNAL=xlsx
```

Install `xlsx` in the same Node.js environment that runs n8n. Restart n8n after changing environment variables. Do not put these values in the GitHub Pages frontend.

The processor creates the data root and run directories if they do not exist. Use a persistent local disk, not a temporary execution directory.

## Import order

1. Import `rkh-maximo-mms-processor.json` and note its workflow ID.
2. Import `rkh-dashboard-upload-api.json`.
3. Open `Start MAXIMO MMS Processor` in the upload workflow and replace `REPLACE_WITH_MAXIMO_MMS_PROCESSOR_WORKFLOW_ID` with the processor ID.
4. Import `rkh-api-list-runs.json`, `rkh-api-get-run.json`, and `rkh-api-get-results.json`.
5. Import `rkh-maximo-email-intake-template.json`, replace its processor ID, and keep it inactive until the Outlook/IMAP trigger and business filtering are configured.

The frontend paths in `frontend/config.js` match the webhook paths in these files.

## What the processor does

The processor receives a run payload, writes `PREPARING`, reads the original file, writes `ANALYZING`, selects the strongest worksheet/header candidate, maps the MAXIMO/MMS fields, runs the deterministic engine, and writes the final `COMPLETED` or `FAILED` snapshot. The `results.json` file contains run metadata, mapping, and every per-work-order result; `results.csv` is the exportable audit view.

## Data Table choice

This baseline uses `run.json` files as the durable n8n-native filesystem record because the target n8n version is not known and Data Table node export schemas vary by version. This is deliberate, not hidden fallback behavior: the storage is durable, inspectable, and keeps the original source/result artifacts together. If the target n8n version has Data Tables and cross-run filtering becomes important, mirror `run.json` into an `assurance_runs` Data Table without moving business logic into the table.

## Test sequence on the target n8n instance

Use a synthetic CSV first:

1. Call the upload webhook with the sample report.
2. Verify the response contains a `run_id`.
3. Confirm `runs/<run_id>/source`, `run.json`, `results.json`, and `results.csv` exist.
4. Poll the Get Run webhook until `COMPLETED`.
5. Fetch Get Results and compare counts/results with the local engine tests.
6. Restart n8n and repeat the Get Run/Get Results calls.

Do not call the system production-ready until this sequence and the Golden fixture parity have passed in the actual n8n instance.
