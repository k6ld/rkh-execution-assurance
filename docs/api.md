# Same-origin dashboard API

The browser calls only same-origin internal `/api` paths. The localhost pilot
maps these paths with `scripts/serve-local-pilot.js`; production maps the same
paths at the approved internal reverse proxy. Browser code never calls n8n,
the VPS, or GitHub directly.

| Browser route | Method | Local n8n webhook |
| --- | --- | --- |
| `/api/runs` | `POST` | `/webhook/rkh-v2-dashboard-upload` |
| `/api/runs` | `GET` | `/webhook/rkh-v2-api-list-runs` |
| `/api/run?run_id=...` | `GET` | `/webhook/rkh-v2-api-get-run` |
| `/api/results?run_id=...` | `GET` | `/webhook/rkh-v2-api-get-results` |

## Upload

`POST /api/runs` accepts `multipart/form-data` with binary field `data`.
Successful response:

```json
{ "run_id": "RKH-20260909-...", "status": "RECEIVED" }
```

Accepted files are CSV, XLS, or XLSX up to 25 MB. The workflow persists the
source on the protected local filesystem before returning a run ID.

## Read responses

List Runs returns safe run metadata. Get Run returns one safe run projection.
Get Results returns the safe run projection, detected mapping, and row results.
Internal source/result filesystem paths, raw Base64, and n8n credentials are
never present in browser responses.
