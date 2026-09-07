# RKH Execution Assurance

RKH Execution Assurance is a static GitHub Pages dashboard for MAXIMO/MMS work-order review with a self-hosted n8n backend. The browser is a presentation and API client only. The deterministic PM/CM engine in `engine/assurance-engine.js` is the business-rule source of truth, and the generated n8n processor embeds that same source.

## Scope

This build covers MAXIMO/MMS CSV/XLS/XLSX reports, automatic header and column detection, deterministic PM/CM checks, explainable Green/Yellow/Amber/Red/Excluded results, persistent per-run artifacts, history, result export, and a manual-email-intake template.

PV13, PTW matching, SharePoint, AI/LLMs, Gemini/OpenAI/Ollama, Power BI, and automatic CAR/TANC issuance are deliberately out of scope.

## Repository layout

- `index.html` and `frontend/` - GitHub Pages-compatible dashboard.
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
```

The M0 parity test reads the local handoff's expected-results JSON when it exists at `/Users/et/Downloads/RKH_Execution_Assurance_Codex_Handoff`, or at the path in `RKH_HANDOFF_DIR`. It validates all 23 GOLDEN and 4 PROVISIONAL fixtures. The 14 DECISION fixtures remain intentionally unresolved.

## GitHub Pages

Publish the repository root as a GitHub Pages source. The static site contains no operational report data and no secrets. Set the n8n URL in `frontend/config.js` or in a deployment-specific config file. The default is the development URL `http://localhost:5678`.

GitHub Pages cannot reach another user's localhost. Department-wide use requires an approved reachable HTTPS n8n endpoint, authentication, and a CORS allowlist.

## n8n import

Read [`docs/n8n-setup.md`](docs/n8n-setup.md) before importing. The short version is:

1. Set the n8n Code node allowlist for `fs`, `path`, and `xlsx`.
2. Install the `xlsx` package into the n8n runtime.
3. Import `rkh-maximo-mms-processor.json` first.
4. Import `rkh-dashboard-upload-api.json` and replace its processor workflow ID placeholder.
5. Import the three read API workflows.
6. Import the email template only after sender, subject, and mailbox policy are approved.
7. Configure CORS/auth/reverse proxy before any shared deployment.

The generated workflows use the persistent `RKH_ASSURANCE_DATA_DIR` root and write `runs/<run_id>/source`, `run.json`, `results.json`, and `results.csv`. A corrupt or unmappable report is persisted as `FAILED`; it is not presented as a successful empty run.

## Current status

M0 is technically exercised and runtime policy is explicit, but business acceptance is still open as stated in the supplied handoff. The repository does not claim production readiness: the remaining external gates are n8n import/execution on the user's instance, HTTPS/auth/CORS, an always-on host, approved email credentials, and shadow validation against real reports.
