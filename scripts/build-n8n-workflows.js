const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const engine = fs.readFileSync(path.join(root, 'engine', 'assurance-engine.js'), 'utf8').replace(/\nif \(typeof module !== 'undefined'\) module\.exports = RKH_ASSURANCE_ENGINE;\s*$/, '');
const publicApi = fs.readFileSync(path.join(root, 'engine', 'public-api.js'), 'utf8').replace(/\nif \(typeof module !== 'undefined'\) module\.exports = \{ PUBLIC_RUN_FIELDS, serializePublicRun, serializePublicResult \};\s*$/, '');
const processorWorkflowId = process.env.RKH_PROCESSOR_WORKFLOW_ID || 'REPLACE_WITH_MAXIMO_MMS_PROCESSOR_WORKFLOW_ID';
const assuranceTableLocator = { __rl: true, mode: 'name', value: 'assurance_runs' };
const assuranceColumns = [
  ['run_id', 'string'], ['filename', 'string'], ['source', 'string'], ['created_at', 'string'], ['updated_at', 'string'], ['status', 'string'],
  ['total_rows', 'number'], ['eligible_count', 'number'], ['excluded_count', 'number'], ['green_count', 'number'], ['yellow_count', 'number'], ['amber_count', 'number'], ['red_count', 'number'],
  ['mapping_confidence', 'number'], ['rule_version', 'string'], ['detected_sheet', 'string'], ['detected_header_row', 'number'], ['error_code', 'string'], ['error_message', 'string'],
  ['source_base64', 'string'], ['results_json', 'string'], ['results_csv', 'string'],
];
function dataTableSchema() { return assuranceColumns.map(([name, type]) => ({ id: name, displayName: name, required: false, defaultMatch: name === 'run_id', display: true, type, canBeUsedToMatch: name === 'run_id' })); }
function dataTableValues(prefix = '$json') { return Object.fromEntries(assuranceColumns.map(([name]) => [name, `={{ ${prefix}.${name} ?? '' }}`])); }
function dataTableMapping() { return { mappingMode: 'defineBelow', value: dataTableValues(), schema: dataTableSchema() }; }
const outDir = path.join(root, 'n8n', 'workflows');

function node(name, type, typeVersion, parameters, position, notes = '') {
  const value = { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, type, typeVersion, position, parameters, ...(notes ? { notes, notesInFlow: true } : {}) };
  if (type === 'n8n-nodes-base.webhook') {
    const hex = crypto.createHash('sha256').update(`rkh-execution-assurance:${name}:${parameters.path || ''}`).digest('hex').slice(0, 32);
    value.webhookId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }
  return value;
}
function workflow(name, nodes, connections, active = false) {
  return { name, nodes, connections, active, settings: { executionOrder: 'v1' }, versionId: `rkh-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, meta: { templateCredsSetupCompleted: false }, pinData: {}, tags: [] };
}
function write(name, value) { fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`); }

const createRunCode = `const item = $input.first();
const binary = item.binary && item.binary.data;
if (!binary) throw new Error('UPLOAD_BINARY_MISSING');
const filename = String(binary.fileName || item.json.body?.filename || 'upload').split(/[\\/]/).pop();
const extension = filename.toLowerCase().split('.').pop();
if (!['csv', 'xlsx', 'xls'].includes(extension)) throw new Error('UNSUPPORTED_FILE_TYPE');
const sourceBuffer = await this.helpers.getBinaryDataBuffer(0, 'data');
const maxBytes = 25000000;
if (sourceBuffer.length > maxBytes) throw new Error('UPLOAD_TOO_LARGE');
const now = new Date();
const day = now.toISOString().slice(0, 10).replaceAll('-', '');
const stamp = day + '-' + now.toISOString().slice(11, 19).replaceAll(':', '');
const runId = 'RKH-' + day + '-' + stamp + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
const run = { run_id: runId, filename, source: 'DASHBOARD_UPLOAD', created_at: now.toISOString(), updated_at: now.toISOString(), status: 'RECEIVED', total_rows: 0, eligible_count: 0, excluded_count: 0, green_count: 0, yellow_count: 0, amber_count: 0, red_count: 0, mapping_confidence: 0, rule_version: 'MAXIMO-MMS-KEYWORD-v1', error_code: '', error_message: '', source_base64: sourceBuffer.toString('base64'), results_json: '', results_csv: '' };
return [{ json: { ...run, response: { run_id: runId, status: 'RECEIVED' } } }];`;

const markPreparingCode = `const input = $input.first().json;
return [{ json: { ...input, status: 'PREPARING', updated_at: new Date().toISOString() } }];`;
const buildSourceBinaryCode = `const input = $input.first().json;
return [{ json: input, binary: { data: { data: input.source_base64, mimeType: 'text/csv', fileName: input.filename } } }];`;
const markAnalyzingCode = `const input = $input.first().json;
return [{ json: { ...input, status: 'ANALYZING', updated_at: new Date().toISOString() }, binary: $input.first().binary }];`;

const processorCode = `${engine}
const input = $('Receive Processor Payload').first().json;
const sourceRows = $input.all().map(item => item.json);
const rows = sourceRows.length === 1 && Array.isArray(sourceRows[0].data) ? sourceRows[0].data : sourceRows;
const headers = rows.length ? Object.keys(rows[0]) : [];
const analysis = RKH_ASSURANCE_ENGINE.analyzeRows(rows, { headers });
if (!analysis.ok) throw new Error(analysis.error_code || 'CORE_MAPPING_FAILURE');
const csvFields = ['wo_number', 'work_type', 'status', 'location', 'grade', 'category', 'action', 'reason_code', 'keyword_hits', 'matched_rule_ids', 'policy_status', 'reasons', 'warnings', 'original_problem', 'worklog'];
const quote = value => '"' + String(Array.isArray(value) ? value.join(' | ') : value ?? '').replaceAll('"', '""') + '"';
const csv = [csvFields.join(',')].concat(analysis.rows.map(row => csvFields.map(field => quote(row[field])).join(','))).join('\\r\\n');
const analyzingRun = { ...input, status: 'ANALYZING', total_rows: analysis.counts.total, eligible_count: analysis.counts.eligible, excluded_count: analysis.counts.excluded, green_count: analysis.counts.green, yellow_count: analysis.counts.yellow, amber_count: analysis.counts.amber, red_count: analysis.counts.red, mapping_confidence: analysis.mapping_confidence, detected_sheet: input.filename.toLowerCase().endsWith('.csv') ? 'CSV' : 'first worksheet', detected_header_row: 1, rule_version: RKH_ASSURANCE_ENGINE.RULE_VERSION, error_code: '', error_message: '', updated_at: new Date().toISOString() };
const resultsJson = JSON.stringify({ run: analyzingRun, mapping: analysis.mapping, results: analysis.rows });
const summary = { ...analyzingRun, status: 'COMPLETED', results_json: resultsJson, results_csv: csv, updated_at: new Date().toISOString() };
return [{ json: { ...summary, public_payload: { run: summary, mapping: analysis.mapping, results: analysis.rows } } }];`;

write('rkh-dashboard-upload-api.json', workflow('RKH - Dashboard Upload API', [
  node('Dashboard Upload Webhook', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'rkh-v2-dashboard-upload', responseMode: 'responseNode', options: { rawBody: false } }, [260, 300], 'POST multipart/form-data with the file in binary property data.'),
  node('Validate and Create Run', 'n8n-nodes-base.code', 2, { jsCode: createRunCode }, [500, 300], 'Creates the run metadata and binary run snapshot without requiring Code-node filesystem modules.'),
  node('Create Assurance Runs Table', 'n8n-nodes-base.dataTable', 1.1, { resource: 'table', operation: 'create', tableName: 'assurance_runs', columns: { column: assuranceColumns.map(([name, type]) => ({ name, type })) }, options: { createIfNotExists: true } }, [760, 300]),
  node('Restore Run Before Insert', 'n8n-nodes-base.code', 2, { jsCode: `return [{json: $('Validate and Create Run').first().json}];` }, [1020, 300]),
  node('Insert Received Run', 'n8n-nodes-base.dataTable', 1.1, { resource: 'row', operation: 'insert', dataTableId: assuranceTableLocator, columns: dataTableMapping(), options: {} }, [1280, 300]),
  node('Restore Run Context', 'n8n-nodes-base.code', 2, { jsCode: `return [{json: $('Validate and Create Run').first().json}];` }, [1520, 300]),
  node('Respond with Run ID', 'n8n-nodes-base.respondToWebhook', 1, { respondWith: 'json', responseBody: '={{ JSON.stringify($json.response) }}', options: {} }, [1760, 220]),
  node('Start MAXIMO MMS Processor', 'n8n-nodes-base.executeWorkflow', 1, { workflowId: processorWorkflowId, mode: 'onceForAllItems', options: { waitForSubWorkflow: false } }, [1760, 400], 'The processor workflow ID is injected by RKH_PROCESSOR_WORKFLOW_ID during live installation.'),
], { 'Dashboard Upload Webhook': { main: [[{ node: 'Validate and Create Run', type: 'main', index: 0 }]] }, 'Validate and Create Run': { main: [[{ node: 'Create Assurance Runs Table', type: 'main', index: 0 }]] }, 'Create Assurance Runs Table': { main: [[{ node: 'Restore Run Before Insert', type: 'main', index: 0 }]] }, 'Restore Run Before Insert': { main: [[{ node: 'Insert Received Run', type: 'main', index: 0 }]] }, 'Insert Received Run': { main: [[{ node: 'Restore Run Context', type: 'main', index: 0 }]] }, 'Restore Run Context': { main: [[{ node: 'Respond with Run ID', type: 'main', index: 0 }, { node: 'Start MAXIMO MMS Processor', type: 'main', index: 0 }]] } }));

write('rkh-maximo-mms-processor.json', workflow('RKH - MAXIMO MMS Processor', [
  node('Receive Processor Payload', 'n8n-nodes-base.executeWorkflowTrigger', 1, {}, [260, 300], 'Receives the Run ID, source base64, filename, and run metadata from the upload or email intake workflow.'),
  node('Mark Preparing', 'n8n-nodes-base.code', 2, { jsCode: markPreparingCode }, [500, 300]),
  node('Update Preparing Run', 'n8n-nodes-base.dataTable', 1.1, { resource: 'row', operation: 'upsert', dataTableId: assuranceTableLocator, matchType: 'allConditions', filters: { conditions: [{ keyName: 'run_id', condition: 'eq', keyValue: '={{$json.run_id}}' }] }, columns: dataTableMapping(), options: {} }, [740, 300]),
  node('Restore Preparing Context', 'n8n-nodes-base.code', 2, { jsCode: `return [{json: $('Mark Preparing').first().json}];` }, [980, 300]),
  node('Build Source Binary', 'n8n-nodes-base.code', 2, { jsCode: buildSourceBinaryCode }, [1220, 300]),
  node('Mark Analyzing', 'n8n-nodes-base.code', 2, { jsCode: markAnalyzingCode }, [1460, 300]),
  node('Update Analyzing Run', 'n8n-nodes-base.dataTable', 1.1, { resource: 'row', operation: 'upsert', dataTableId: assuranceTableLocator, matchType: 'allConditions', filters: { conditions: [{ keyName: 'run_id', condition: 'eq', keyValue: '={{$json.run_id}}' }] }, columns: dataTableMapping(), options: {} }, [1700, 300]),
  node('Restore Analyzing Context', 'n8n-nodes-base.code', 2, { jsCode: `return [{json: $('Mark Analyzing').first().json, binary: $('Build Source Binary').first().binary}];` }, [1940, 300]),
  node('Route CSV or XLSX', 'n8n-nodes-base.if', 2, { conditions: { options: { version: 2, leftValue: '', caseSensitive: true, typeValidation: 'strict' }, conditions: [{ leftValue: '={{$json.filename.toLowerCase().endsWith(".csv")}}', rightValue: true, operator: { type: 'boolean', operation: 'true' } }], combinator: 'and' }, options: {} }, [2180, 300]),
  node('Extract CSV Rows', 'n8n-nodes-base.extractFromFile', 1, { operation: 'csv', binaryPropertyName: 'data', options: {} }, [2420, 220]),
  node('Extract XLSX Rows', 'n8n-nodes-base.extractFromFile', 1, { operation: 'xlsx', binaryPropertyName: 'data', options: {} }, [2420, 400]),
  node('Analyze Rows', 'n8n-nodes-base.code', 2, { jsCode: processorCode }, [2660, 300], 'Runs the centralized deterministic engine on rows extracted by native n8n file nodes.'),
  node('Update Completed Run', 'n8n-nodes-base.dataTable', 1.1, { resource: 'row', operation: 'upsert', dataTableId: assuranceTableLocator, matchType: 'allConditions', filters: { conditions: [{ keyName: 'run_id', condition: 'eq', keyValue: '={{$json.run_id}}' }] }, columns: dataTableMapping(), options: {} }, [2900, 300]),
], { 'Receive Processor Payload': { main: [[{ node: 'Mark Preparing', type: 'main', index: 0 }]] }, 'Mark Preparing': { main: [[{ node: 'Update Preparing Run', type: 'main', index: 0 }]] }, 'Update Preparing Run': { main: [[{ node: 'Restore Preparing Context', type: 'main', index: 0 }]] }, 'Restore Preparing Context': { main: [[{ node: 'Build Source Binary', type: 'main', index: 0 }]] }, 'Build Source Binary': { main: [[{ node: 'Mark Analyzing', type: 'main', index: 0 }]] }, 'Mark Analyzing': { main: [[{ node: 'Update Analyzing Run', type: 'main', index: 0 }]] }, 'Update Analyzing Run': { main: [[{ node: 'Restore Analyzing Context', type: 'main', index: 0 }]] }, 'Restore Analyzing Context': { main: [[{ node: 'Route CSV or XLSX', type: 'main', index: 0 }]] }, 'Route CSV or XLSX': { main: [[{ node: 'Extract CSV Rows', type: 'main', index: 0 }], [{ node: 'Extract XLSX Rows', type: 'main', index: 0 }]] }, 'Extract CSV Rows': { main: [[{ node: 'Analyze Rows', type: 'main', index: 0 }]] }, 'Extract XLSX Rows': { main: [[{ node: 'Analyze Rows', type: 'main', index: 0 }]] }, 'Analyze Rows': { main: [[{ node: 'Update Completed Run', type: 'main', index: 0 }]] } }));

const ensureRunsTable = () => node('Ensure Assurance Runs Table', 'n8n-nodes-base.dataTable', 1.1, { resource: 'table', operation: 'create', tableName: 'assurance_runs', columns: { column: assuranceColumns.map(([name, type]) => ({ name, type })) }, options: { createIfNotExists: true } }, [520, 300]);
const getAllRunsNode = () => node('Get Assurance Runs', 'n8n-nodes-base.dataTable', 1.1, { resource: 'row', operation: 'get', dataTableId: assuranceTableLocator, matchType: 'anyCondition', filters: { conditions: [] }, returnAll: true, orderBy: true, orderByColumn: 'created_at', orderByDirection: 'DESC' }, [780, 300]);
const publicListCode = `${publicApi}
const runs = $input.all().map(item => serializePublicRun(item.json)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
return [{json: {runs}}];`;
const publicRunCode = `${publicApi}
const row = $input.first()?.json;
if (!row) throw new Error('RUN_NOT_FOUND');
return [{json: {run: serializePublicRun(row)}}];`;
const publicResultsCode = `${publicApi}
const row = $input.first()?.json;
if (!row) throw new Error('RESULTS_NOT_FOUND');
const payload = JSON.parse(row.results_json || '{}');
return [{json: {run: serializePublicRun(payload.run || row), mapping: payload.mapping || {}, results: (payload.results || []).map(serializePublicResult)}}];`;
write('rkh-api-list-runs.json', workflow('RKH - API - List Runs', [node('List Runs Webhook', 'n8n-nodes-base.webhook', 2, { httpMethod: 'GET', path: 'rkh-v2-api-list-runs', responseMode: 'lastNode', options: {} }, [260, 300]), ensureRunsTable(), getAllRunsNode(), node('Serialize Public Response', 'n8n-nodes-base.code', 2, { jsCode: publicListCode }, [1040, 300])], { 'List Runs Webhook': { main: [[{ node: 'Ensure Assurance Runs Table', type: 'main', index: 0 }]] }, 'Ensure Assurance Runs Table': { main: [[{ node: 'Get Assurance Runs', type: 'main', index: 0 }]] }, 'Get Assurance Runs': { main: [[{ node: 'Serialize Public Response', type: 'main', index: 0 }]] } }));
const getRunPrepare = `const incoming = $('Get Run Webhook').first().json; const runId = String(incoming.query?.run_id || incoming.run_id || '').replace(/[^A-Za-z0-9_-]/g, ''); if (!runId) throw new Error('RUN_ID_REQUIRED'); return [{json: {run_id: runId}}];`;
const getRunNode = () => node('Get Assurance Run', 'n8n-nodes-base.dataTable', 1.1, { resource: 'row', operation: 'get', dataTableId: assuranceTableLocator, matchType: 'allConditions', filters: { conditions: [{ keyName: 'run_id', condition: 'eq', keyValue: '={{$json.run_id}}' }] }, returnAll: false, limit: 1, orderBy: false }, [1040, 300]);
write('rkh-api-get-run.json', workflow('RKH - API - Get Run', [node('Get Run Webhook', 'n8n-nodes-base.webhook', 2, { httpMethod: 'GET', path: 'rkh-v2-api-get-run', responseMode: 'lastNode', options: {} }, [260, 300]), ensureRunsTable(), node('Prepare Run Lookup', 'n8n-nodes-base.code', 2, { jsCode: getRunPrepare }, [780, 300]), getRunNode(), node('Serialize Public Response', 'n8n-nodes-base.code', 2, { jsCode: publicRunCode }, [1280, 300])], { 'Get Run Webhook': { main: [[{ node: 'Ensure Assurance Runs Table', type: 'main', index: 0 }]] }, 'Ensure Assurance Runs Table': { main: [[{ node: 'Prepare Run Lookup', type: 'main', index: 0 }]] }, 'Prepare Run Lookup': { main: [[{ node: 'Get Assurance Run', type: 'main', index: 0 }]] }, 'Get Assurance Run': { main: [[{ node: 'Serialize Public Response', type: 'main', index: 0 }]] } }));
const publicResultsPrepare = `const incoming = $('Get Results Webhook').first().json; const runId = String(incoming.query?.run_id || incoming.run_id || '').replace(/[^A-Za-z0-9_-]/g, ''); if (!runId) throw new Error('RUN_ID_REQUIRED'); return [{json: {run_id: runId}}];`;
const getResultsNode = () => node('Get Assurance Results Row', 'n8n-nodes-base.dataTable', 1.1, { resource: 'row', operation: 'get', dataTableId: assuranceTableLocator, matchType: 'allConditions', filters: { conditions: [{ keyName: 'run_id', condition: 'eq', keyValue: '={{$json.run_id}}' }] }, returnAll: false, limit: 1, orderBy: false }, [1040, 300]);
write('rkh-api-get-results.json', workflow('RKH - API - Get Results', [node('Get Results Webhook', 'n8n-nodes-base.webhook', 2, { httpMethod: 'GET', path: 'rkh-v2-api-get-results', responseMode: 'lastNode', options: {} }, [260, 300]), ensureRunsTable(), node('Prepare Results Lookup', 'n8n-nodes-base.code', 2, { jsCode: publicResultsPrepare }, [780, 300]), getResultsNode(), node('Serialize Public Response', 'n8n-nodes-base.code', 2, { jsCode: publicResultsCode }, [1280, 300])], { 'Get Results Webhook': { main: [[{ node: 'Ensure Assurance Runs Table', type: 'main', index: 0 }]] }, 'Ensure Assurance Runs Table': { main: [[{ node: 'Prepare Results Lookup', type: 'main', index: 0 }]] }, 'Prepare Results Lookup': { main: [[{ node: 'Get Assurance Results Row', type: 'main', index: 0 }]] }, 'Get Assurance Results Row': { main: [[{ node: 'Serialize Public Response', type: 'main', index: 0 }]] } }));

const emailCode = `${createRunCode.replace("const item = $input.first();", "const item = $input.first();\nif (!String(item.json.subject || '').toLowerCase().includes('maximo')) throw new Error('EMAIL_SUBJECT_NOT_ALLOWED');").replace("source: 'DASHBOARD_UPLOAD'", "source: 'EMAIL'")}`;
write('rkh-maximo-email-intake-template.json', workflow('RKH - MAXIMO Email Intake', [
  node('Email Intake Webhook Template', 'n8n-nodes-base.webhook', 2, { httpMethod: 'POST', path: 'rkh-v2-maximo-email-intake', responseMode: 'lastNode', options: {} }, [260, 300], 'Template trigger: replace with Microsoft Outlook Trigger or Email Trigger (IMAP) after credentials and sender/subject policy are approved. Input must contain binary data and subject/from JSON fields.'),
  node('Validate Email and Create Run', 'n8n-nodes-base.code', 2, { jsCode: emailCode }, [520, 300]),
  node('Ensure Assurance Runs Table', 'n8n-nodes-base.dataTable', 1.1, { resource: 'table', operation: 'create', tableName: 'assurance_runs', columns: { column: assuranceColumns.map(([name, type]) => ({ name, type })) }, options: { createIfNotExists: true } }, [780, 300]),
  node('Insert Email Run', 'n8n-nodes-base.dataTable', 1.1, { resource: 'row', operation: 'insert', dataTableId: assuranceTableLocator, columns: dataTableMapping(), options: {} }, [1020, 300]),
  node('Restore Email Context', 'n8n-nodes-base.code', 2, { jsCode: `return [{json: $('Validate Email and Create Run').first().json}];` }, [1260, 300]),
  node('Start MAXIMO MMS Processor', 'n8n-nodes-base.executeWorkflow', 1, { workflowId: processorWorkflowId, mode: 'onceForAllItems', options: { waitForSubWorkflow: false } }, [1500, 300]),
], { 'Email Intake Webhook Template': { main: [[{ node: 'Validate Email and Create Run', type: 'main', index: 0 }]] }, 'Validate Email and Create Run': { main: [[{ node: 'Ensure Assurance Runs Table', type: 'main', index: 0 }]] }, 'Ensure Assurance Runs Table': { main: [[{ node: 'Insert Email Run', type: 'main', index: 0 }]] }, 'Insert Email Run': { main: [[{ node: 'Restore Email Context', type: 'main', index: 0 }]] }, 'Restore Email Context': { main: [[{ node: 'Start MAXIMO MMS Processor', type: 'main', index: 0 }]] } }));

console.log(`Generated ${fs.readdirSync(outDir).length} n8n workflow JSON files from engine/assurance-engine.js`);
