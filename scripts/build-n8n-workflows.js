const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const engine = fs.readFileSync(path.join(root, 'engine', 'assurance-engine.js'), 'utf8').replace(/\nif \(typeof module !== 'undefined'\) module\.exports = RKH_ASSURANCE_ENGINE;\s*$/, '');
const outDir = path.join(root, 'n8n', 'workflows');

function node(name, type, typeVersion, parameters, position, notes = '') {
  return { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, type, typeVersion, position, parameters, ...(notes ? { notes, notesInFlow: true } : {}) };
}
function workflow(name, nodes, connections, active = false) {
  return { name, nodes, connections, active, settings: { executionOrder: 'v1' }, versionId: `rkh-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, meta: { templateCredsSetupCompleted: false }, pinData: {}, tags: [] };
}
function write(name, value) { fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`); }

const createRunCode = `const fs = require('fs');
const path = require('path');
const item = $input.first();
const binary = item.binary && item.binary.data;
if (!binary || !binary.data) throw new Error('UPLOAD_BINARY_MISSING');
const filename = String(binary.fileName || item.json.body?.filename || 'upload').split(/[\\/]/).pop();
const extension = filename.toLowerCase().split('.').pop();
if (!['csv', 'xlsx', 'xls'].includes(extension)) throw new Error('UNSUPPORTED_FILE_TYPE');
const maxBytes = Number(process.env.RKH_MAX_UPLOAD_BYTES || 25000000);
const sourceBuffer = Buffer.from(binary.data, 'base64');
if (sourceBuffer.length > maxBytes) throw new Error('UPLOAD_TOO_LARGE');
const now = new Date();
const day = now.toISOString().slice(0, 10).replaceAll('-', '');
const stamp = day + '-' + now.toISOString().slice(11, 19).replaceAll(':', '');
const runId = 'RKH-' + day + '-' + stamp + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
const dataRoot = process.env.RKH_ASSURANCE_DATA_DIR || path.join(process.cwd(), 'rkh-assurance-data');
const runDir = path.join(dataRoot, 'runs', runId);
fs.mkdirSync(runDir, { recursive: true });
const sourcePath = path.join(runDir, filename.replace(/[^a-zA-Z0-9._-]/g, '_'));
const runPath = path.join(runDir, 'run.json');
const run = { run_id: runId, filename, source: 'DASHBOARD_UPLOAD', created_at: now.toISOString(), updated_at: now.toISOString(), status: 'RECEIVED', total_rows: 0, eligible_count: 0, excluded_count: 0, green_count: 0, yellow_count: 0, amber_count: 0, red_count: 0, source_path: sourcePath, results_json_path: path.join(runDir, 'results.json'), results_csv_path: path.join(runDir, 'results.csv'), mapping_confidence: 0, rule_version: 'MAXIMO-MMS-KEYWORD-v1', error_code: '', error_message: '' };
fs.writeFileSync(sourcePath, sourceBuffer);
fs.writeFileSync(runPath, JSON.stringify(run, null, 2));
return [{ json: { ...run, response: { run_id: runId, status: 'RECEIVED' } } }];`;

const processorCode = `${engine}
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const input = $input.first().json;
const runPath = path.join(path.dirname(input.source_path), 'run.json');
function snapshot(status, extra = {}) {
  const run = { ...input, ...extra, status, updated_at: new Date().toISOString() };
  fs.writeFileSync(runPath, JSON.stringify(run, null, 2));
  return run;
}
function parseCsv(value) {
  const matrix = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i]; const n = value[i + 1];
    if (c === '"') { if (quoted && n === '"') { field += '"'; i += 1; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\\n' || c === '\\r') && !quoted) { if (c === '\\r' && n === '\\n') i += 1; row.push(field); matrix.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); matrix.push(row); }
  return matrix;
}
try {
  snapshot('PREPARING');
  const buffer = fs.readFileSync(input.source_path);
  const extension = input.filename.toLowerCase().split('.').pop();
  const matrices = extension === 'csv' ? [{ name: 'CSV', matrix: parseCsv(buffer.toString('utf8').replace(/^\\uFEFF/, '')) }] : (() => {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
    return workbook.SheetNames.map(name => ({ name, matrix: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' }) }));
  })();
  snapshot('ANALYZING');
  const analyses = matrices.map(candidate => ({ ...candidate, analysis: RKH_ASSURANCE_ENGINE.analyzeMatrix(candidate.matrix) })).filter(candidate => candidate.analysis && candidate.analysis.ok);
  if (!analyses.length) throw new Error('HEADER_OR_CORE_MAPPING_FAILURE');
  analyses.sort((a, b) => (b.analysis.detected_header_score || 0) - (a.analysis.detected_header_score || 0) || b.analysis.rows.length - a.analysis.rows.length);
  const selected = analyses[0]; const analysis = selected.analysis;
  const csvFields = ['wo_number', 'work_type', 'status', 'location', 'grade', 'category', 'action', 'reason_code', 'keyword_hits', 'matched_rule_ids', 'policy_status', 'reasons', 'warnings', 'original_problem', 'worklog'];
  const quote = value => '"' + String(Array.isArray(value) ? value.join(' | ') : value ?? '').replaceAll('"', '""') + '"';
  const csv = [csvFields.join(',')].concat(analysis.rows.map(row => csvFields.map(field => quote(row[field])).join(','))).join('\\r\\n');
  const summary = { ...input, status: 'COMPLETED', total_rows: analysis.counts.total, eligible_count: analysis.counts.eligible, excluded_count: analysis.counts.excluded, green_count: analysis.counts.green, yellow_count: analysis.counts.yellow, amber_count: analysis.counts.amber, red_count: analysis.counts.red, mapping_confidence: analysis.mapping_confidence, detected_sheet: selected.name, detected_header_row: analysis.detected_header_row, rule_version: RKH_ASSURANCE_ENGINE.RULE_VERSION, error_code: '', error_message: '', updated_at: new Date().toISOString() };
  fs.writeFileSync(input.results_json_path, JSON.stringify({ run: summary, mapping: analysis.mapping, results: analysis.rows }, null, 2));
  fs.writeFileSync(input.results_csv_path, csv);
  fs.writeFileSync(runPath, JSON.stringify(summary, null, 2));
  return [{ json: { ...summary, results: analysis.rows } }];
} catch (error) {
  const failed = { ...input, status: 'FAILED', error_code: error.message || 'PROCESSING_FAILED', error_message: 'The report could not be processed. Inspect the workflow execution for technical details.', updated_at: new Date().toISOString() };
  fs.writeFileSync(runPath, JSON.stringify(failed, null, 2));
  return [{ json: failed }];
}`;

write('rkh-dashboard-upload-api.json', workflow('RKH - Dashboard Upload API', [
  node('Dashboard Upload Webhook', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'rkh-dashboard-upload', responseMode: 'responseNode', options: { rawBody: false } }, [260, 300], 'POST multipart/form-data with the file in binary property data.'),
  node('Validate, Persist, and Create Run', 'n8n-nodes-base.code', 2, { jsCode: createRunCode }, [500, 300], 'Writes the original source and run.json before the processor starts. Configure fs in the n8n Code node allowlist.'),
  node('Respond with Run ID', 'n8n-nodes-base.respondToWebhook', 1, { respondWith: 'json', responseBody: '={{ JSON.stringify($json.response) }}', options: {} }, [760, 220]),
  node('Start MAXIMO MMS Processor', 'n8n-nodes-base.executeWorkflow', 1, { workflowId: 'REPLACE_WITH_MAXIMO_MMS_PROCESSOR_WORKFLOW_ID', mode: 'onceForAllItems', options: { waitForSubWorkflow: false } }, [760, 400], 'After importing both workflows, replace the placeholder workflow ID with the processor workflow ID.'),
], { 'Dashboard Upload Webhook': { main: [[{ node: 'Validate, Persist, and Create Run', type: 'main', index: 0 }]] }, 'Validate, Persist, and Create Run': { main: [[{ node: 'Respond with Run ID', type: 'main', index: 0 }, { node: 'Start MAXIMO MMS Processor', type: 'main', index: 0 }]] } }));

write('rkh-maximo-mms-processor.json', workflow('RKH - MAXIMO MMS Processor', [
  node('Receive Processor Payload', 'n8n-nodes-base.executeWorkflowTrigger', 1, {}, [260, 300], 'Receives run_id, source_path, results_json_path, results_csv_path, filename, and run metadata from the upload or email intake workflow.'),
  node('Analyze and Persist Results', 'n8n-nodes-base.code', 2, { jsCode: processorCode }, [540, 300], 'Parses CSV/XLS/XLSX with the approved xlsx package, detects worksheet/header/mapping, executes the centralized deterministic engine, and writes run.json/results.json/results.csv.'),
], { 'Receive Processor Payload': { main: [[{ node: 'Analyze and Persist Results', type: 'main', index: 0 }]] } }));

function readApiWorkflow(name, pathName, code, title) {
  return workflow(name, [node(title, 'n8n-nodes-base.webhook', 2, { httpMethod: 'GET', path: pathName, responseMode: 'lastNode', options: {} }, [260, 300]), node('Read Persistent Assurance Data', 'n8n-nodes-base.code', 2, { jsCode: code }, [520, 300], 'Reads only the configured persistent RKH_ASSURANCE_DATA_DIR. Never exposes raw filesystem paths to the browser.')], { [title]: { main: [[{ node: 'Read Persistent Assurance Data', type: 'main', index: 0 }]] } });
}
const listCode = `const fs = require('fs'); const path = require('path');
const root = path.join(process.env.RKH_ASSURANCE_DATA_DIR || path.join(process.cwd(), 'rkh-assurance-data'), 'runs');
const runs = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => { try { return JSON.parse(fs.readFileSync(path.join(root, entry.name, 'run.json'), 'utf8')); } catch { return null; } }).filter(Boolean).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) : [];
return [{ json: { runs } }];`;
const getRunCode = `const fs = require('fs'); const path = require('path');
const runId = String($json.query?.run_id || $json.run_id || '').replace(/[^A-Za-z0-9_-]/g, ''); if (!runId) throw new Error('RUN_ID_REQUIRED');
const root = path.join(process.env.RKH_ASSURANCE_DATA_DIR || path.join(process.cwd(), 'rkh-assurance-data'), 'runs', runId, 'run.json'); if (!fs.existsSync(root)) throw new Error('RUN_NOT_FOUND');
return [{ json: { run: JSON.parse(fs.readFileSync(root, 'utf8')) } }];`;
const getResultsCode = `const fs = require('fs'); const path = require('path');
const runId = String($json.query?.run_id || $json.run_id || '').replace(/[^A-Za-z0-9_-]/g, ''); if (!runId) throw new Error('RUN_ID_REQUIRED');
const root = path.join(process.env.RKH_ASSURANCE_DATA_DIR || path.join(process.cwd(), 'rkh-assurance-data'), 'runs', runId, 'results.json'); if (!fs.existsSync(root)) throw new Error('RESULTS_NOT_FOUND');
return [{ json: JSON.parse(fs.readFileSync(root, 'utf8')) }];`;
write('rkh-api-list-runs.json', readApiWorkflow('RKH - API - List Runs', 'rkh-api-list-runs', listCode, 'List Runs Webhook'));
write('rkh-api-get-run.json', readApiWorkflow('RKH - API - Get Run', 'rkh-api-get-run', getRunCode, 'Get Run Webhook'));
write('rkh-api-get-results.json', readApiWorkflow('RKH - API - Get Results', 'rkh-api-get-results', getResultsCode, 'Get Results Webhook'));

const emailCode = `${createRunCode.replace("const item = $input.first();", "const item = $input.first();\nif (!String(item.json.subject || '').toLowerCase().includes(String(process.env.RKH_EMAIL_SUBJECT_PATTERN || 'maximo').toLowerCase())) throw new Error('EMAIL_SUBJECT_NOT_ALLOWED');\nif (process.env.RKH_EMAIL_ALLOWED_SENDERS && !String(process.env.RKH_EMAIL_ALLOWED_SENDERS).toLowerCase().split(',').map(value => value.trim()).includes(String(item.json.from || '').toLowerCase())) throw new Error('EMAIL_SENDER_NOT_ALLOWED');").replace("source: 'DASHBOARD_UPLOAD'", "source: 'EMAIL'")}`;
write('rkh-maximo-email-intake-template.json', workflow('RKH - MAXIMO Email Intake', [
  node('Email Intake Webhook Template', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'rkh-maximo-email-intake', responseMode: 'lastNode', options: {} }, [260, 300], 'Template trigger: replace with Microsoft Outlook Trigger or Email Trigger (IMAP) after credentials and sender/subject policy are approved. Input must contain binary data and subject/from JSON fields.'),
  node('Validate Email and Create Run', 'n8n-nodes-base.code', 2, { jsCode: emailCode }, [520, 300]),
  node('Start MAXIMO MMS Processor', 'n8n-nodes-base.executeWorkflow', 1, { workflowId: 'REPLACE_WITH_MAXIMO_MMS_PROCESSOR_WORKFLOW_ID', mode: 'onceForAllItems', options: { waitForSubWorkflow: false } }, [780, 300]),
], { 'Email Intake Webhook Template': { main: [[{ node: 'Validate Email and Create Run', type: 'main', index: 0 }]] }, 'Validate Email and Create Run': { main: [[{ node: 'Start MAXIMO MMS Processor', type: 'main', index: 0 }]] } }));

console.log(`Generated ${fs.readdirSync(outDir).length} n8n workflow JSON files from engine/assurance-engine.js`);
