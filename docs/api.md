# API contract

The frontend calls only n8n webhooks. The exact public URL is deployment-specific; the development paths are configured in `frontend/config.js`.

## Upload

`POST /webhook/rkh-dashboard-upload`

Content type: `multipart/form-data`; binary form field: `data`.

Successful response:

```json
{ "run_id": "RKH-20260907-...", "status": "RECEIVED" }
```

The upload workflow persists the original file before returning and starts the processor as a sub-workflow.

## List runs

`GET /webhook/rkh-api-list-runs`

Returns newest-first run metadata:

```json
{ "runs": [{ "run_id": "...", "filename": "...", "status": "COMPLETED", "green_count": 1, "yellow_count": 0, "amber_count": 0, "red_count": 0 }] }
```

## Get a run

`GET /webhook/rkh-api-get-run?run_id=...`

Returns `{ "run": { ... } }`. Run IDs are sanitized server-side before filesystem lookup.

## Get results

`GET /webhook/rkh-api-get-results?run_id=...`

Returns `{ "run": { ... }, "mapping": { ... }, "results": [ ... ] }`.

Each result retains source evidence and audit fields including `wo_number`, `work_type`, `status`, source dates/references, original problem, original worklog, `keyword_hits`, `matched_rule_ids`, `grade`, `category`, `action`, `rule_version` at run level, `policy_status`, `reasons`, `warnings`, and `manual_review`.
