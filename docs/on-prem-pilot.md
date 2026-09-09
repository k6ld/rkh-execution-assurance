# On-prem deployment and localhost pilot

This repository is an on-prem application. GitHub may hold source code only.
It must never receive RKH reports, result payloads, n8n runtime data, backups,
credentials, or deployment environment files.

## Workstation pilot

The pilot is single-operator and localhost-only. It is not shared production.

1. Run `scripts/initialize-local-pilot.ps1` to create `C:\RKH\ExecutionAssurance` with `runs`, `inbox`, and `quarantine` folders.
2. Run `npm run build:n8n` and import the generated processor first. Rebuild the remaining workflows with its local workflow ID in `RKH_PROCESSOR_WORKFLOW_ID`.
3. Configure n8n to listen on `127.0.0.1` only. Verify this with a listening-port check before testing. Do not rely only on `N8N_BASE_URL`.
   Set `N8N_LISTEN_ADDRESS=127.0.0.1` and `N8N_RESTRICT_FILE_ACCESS_TO=C:\RKH\ExecutionAssurance` in the n8n service environment before restarting it. The latter is required by n8n v2 for the native local-file nodes to access the protected artifact root.
4. Start `npm run serve:pilot`, which binds only to `http://127.0.0.1:8787` and proxies the four dashboard API routes to local n8n.
5. Import the upload/read workflows inactive. Activate only the synthetic test workflows needed for an approved test, then return them to inactive.

The pilot host deliberately has no remote listener, TLS, dashboard login, firewall exception, mailbox credential, or network-share mount.

## Storage model

`assurance_runs` contains metadata, counters, lifecycle state, the 90-day
retention timestamp, and internal artifact paths. It does not contain source
Base64, result JSON, or result CSV. Each accepted run writes:

```text
C:\RKH\ExecutionAssurance\runs\<run-id>\source.<extension>
C:\RKH\ExecutionAssurance\runs\<run-id>\results.json
C:\RKH\ExecutionAssurance\runs\<run-id>\results.csv
```

The dashboard never receives these paths. The public workflow serializers
remove them before returning responses.

`scripts/purge-local-artifacts.js` is dry-run by default. `--apply` removes
only RKH-shaped run artifacts older than 90 days; it never touches the n8n
database. Pair it with an IT-approved Data Table row-retention procedure and
backup/restore policy before any production use.

The local file-drop workflow watches `inbox` for newly added files, waits for
the write to finish, validates the extension/size, and copies accepted files
into `runs`. The inbox itself needs the same approved retention treatment. It
is intentionally inactive by default.

## Internal production pattern

RKH IT must provide a domain-managed, always-on server/VM, internal DNS name,
internal CA certificate, service account, encrypted storage, backup, and an
approved reverse proxy. The proxy serves this static frontend and maps only:

| Internal route | Local n8n route |
| --- | --- |
| `POST /api/runs` | `POST /webhook/rkh-v2-dashboard-upload` |
| `GET /api/runs` | `GET /webhook/rkh-v2-api-list-runs` |
| `GET /api/run?run_id=...` | `GET /webhook/rkh-v2-api-get-run?run_id=...` |
| `GET /api/results?run_id=...` | `GET /webhook/rkh-v2-api-get-results?run_id=...` |

Expose internal HTTPS port 443 only. Keep n8n port 5678 loopback-only and do
not proxy the n8n editor. Apply RKH AD/group authentication at the production
proxy. Mailbox integration requires separate RKH approval for its account,
sender allowlist, attachment policy, and credential storage.

## n8n runtime controls

- Run n8n as a dedicated service identity in production, not an interactive user process.
- Use `N8N_RESTRICT_FILE_ACCESS_TO` to permit only the RKH artifact root; never allow a drive root or broad user-profile path.
- Keep the n8n database, encryption key, Data Tables, binary-data directory, and run-artifact volume in the local backup set.
- Disable or tightly prune saved execution data so uploaded files and result payloads are not retained as unintended duplicates.
- Set a conservative `N8N_DATA_TABLES_MAX_SIZE_BYTES` after measuring the 90-day pilot. Do not use Data Tables as a 1 GiB document repository.
- Do not activate email or file-drop ingestion until its end-to-end controls have been validated with synthetic data.
