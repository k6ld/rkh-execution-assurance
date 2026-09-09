# RKH Execution Assurance

RKH Execution Assurance is an on-prem MAXIMO/MMS work-order dashboard with a local n8n backend. GitHub holds source code only; production serves the static frontend from an RKH internal origin and proxies only the required API routes to loopback n8n. The deterministic PM/CM engine in `engine/assurance-engine.js` is the business-rule source of truth, and the generated n8n processor embeds that same source.

## Scope

This build covers MAXIMO/MMS CSV/XLS/XLSX reports, automatic header and column detection, deterministic PM/CM checks, explainable Green/Yellow/Amber/Red/Excluded results, persistent per-run artifacts, history, result export, and a manual-email-intake template.

PV13, PTW matching, SharePoint, AI/LLMs, Gemini/OpenAI/Ollama, Power BI, and automatic CAR/TANC issuance are deliberately out of scope.

## Repository layout

- `index.html` and `frontend/` - same-origin dashboard assets for the internal proxy and localhost pilot.
- `engine/assurance-engine.js` - tested deterministic rule engine.
- `n8n/workflows/` - importable workflow JSON generated from the engine.
- `scripts/build-n8n-workflows.js` - regenerates the processor JSON after an engine change.
- `tests/` - focused rule tests and M0 Golden/Provisional parity test against the local handoff bundle.
- `docs/` - setup, API, storage, security, and release notes.

The handoff bundle is intentionally not copied into this repository and is not a GitHub runtime dependency.

## Local checks

This repository has no third-party Node dependency. Run:

```text
npm test
npm run build:n8n
npm run test:on-prem
```

The M0 parity test reads the local handoff's expected-results JSON from the path in `RKH_HANDOFF_DIR` when set, or from a sibling `RKH_Execution_Assurance_Codex_Handoff` directory. It validates all 23 GOLDEN and 4 PROVISIONAL fixtures. The 14 DECISION fixtures remain intentionally unresolved.

## Deployment

The frontend uses relative `/api` routes, not a VPS endpoint. For the
single-user workstation pilot, run `npm run serve:pilot`; it binds only to
`127.0.0.1`. For shared production, RKH IT serves the same source from an
internal HTTPS hostname and maps the documented `/api` routes to loopback n8n.
Read [`docs/on-prem-pilot.md`](docs/on-prem-pilot.md) before configuring n8n.

## n8n import

Read [`docs/n8n-setup.md`](docs/n8n-setup.md) before importing. The short version is:

1. Ensure the n8n Data Table node is available; the workflow creates or reuses `assurance_runs`.
2. Import `rkh-maximo-mms-processor.json` first.
3. Import `rkh-dashboard-upload-api.json` with the processor workflow ID injected by the generator.
4. Import the three read API workflows.
5. Import the email template only after sender, subject, and mailbox policy are approved.
6. Configure the internal same-origin reverse proxy and RKH authentication before any shared deployment.

The generated workflows store bounded run metadata in `assurance_runs` and keep source/result artifacts on protected local storage. A corrupt or unmappable report is persisted as `FAILED`; it is not presented as a successful empty run.

## Current status

M0 is technically exercised and runtime policy is explicit, but business acceptance is still open as stated in the supplied handoff. The repository does not claim production readiness: remaining gates are RKH IT host/DNS/TLS/identity/backup approval, local n8n import and execution evidence, approved email credentials, and shadow validation against real reports.
