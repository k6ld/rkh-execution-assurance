# Security and release gates

The imported workflow JSON is a development/pilot foundation, not a claim of production readiness.

Before shared use, configure:

- HTTPS on the n8n endpoint.
- Authentication at n8n or an approved reverse proxy.
- A strict CORS allowlist for the GitHub Pages origin.
- Maximum request/body size and file-extension/content checks.
- Persistent disk permissions limited to the n8n service account.
- No raw filesystem paths in API responses.
- Access control for list, run, results, and source downloads.
- Backups and restore testing for the persistent data root.
- An always-on host rather than a sleeping developer laptop.
- Approved Outlook/IMAP credentials, sender allowlist, and subject policy.

The frontend must never contain an n8n credential or reusable backend secret. GitHub must contain only source code, generated workflow JSON, synthetic tests, and documentation; never real MAXIMO/MMS reports, runtime results, credentials, or the handoff source workbooks/PDF.

Release evidence should include local engine tests, M0 Golden/Provisional parity, target-n8n workflow execution, restart persistence, upload failure tests, mapping failure tests, and shadow comparison against real human assurance results. The highest-risk metric is false Green.
