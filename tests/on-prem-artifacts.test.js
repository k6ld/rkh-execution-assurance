const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'frontend', 'config.js'), 'utf8');
assert.match(config, /apiBaseUrl: window\.location\.origin/);
assert.doesNotMatch(config, /barqai\.app|github\.io|https?:\/\/n8n/i);
assert.match(config, /upload: '\/api\/runs'/);

const workflows = fs.readdirSync(path.join(root, 'n8n', 'workflows')).map((name) => JSON.parse(fs.readFileSync(path.join(root, 'n8n', 'workflows', name), 'utf8')));
const upload = workflows.find((flow) => flow.name === 'RKH - Dashboard Upload API');
const processor = workflows.find((flow) => flow.name === 'RKH - MAXIMO MMS Processor');
const results = workflows.find((flow) => flow.name === 'RKH - API - Get Results');
const fileDrop = workflows.find((flow) => flow.name === 'RKH - Local File Drop Intake');
assert.ok(upload && processor && results && fileDrop);
assert.ok(upload.nodes.some((item) => item.name === 'Persist Source File' && item.type === 'n8n-nodes-base.readWriteFile'));
assert.ok(upload.nodes.some((item) => /source_sha256/.test(JSON.stringify(item))));
assert.ok(upload.nodes.some((item) => item.name === 'Restore Run for Insert'));
assert.ok(processor.nodes.some((item) => item.name === 'Read Source File' && item.type === 'n8n-nodes-base.readWriteFile'));
assert.ok(processor.nodes.some((item) => item.name === 'Write Results JSON'));
assert.ok(processor.nodes.some((item) => item.name === 'Write Results CSV'));
assert.ok(results.nodes.some((item) => item.name === 'Read Results JSON'));
assert.ok(fileDrop.nodes.some((item) => item.type === 'n8n-nodes-base.localFileTrigger'));
assert.ok(fileDrop.nodes.some((item) => item.name === 'Move Intake File to Run'));
assert.ok(fileDrop.nodes.some((item) => item.name === 'Restore File Drop for Insert'));
for (const flow of workflows) {
  const text = JSON.stringify(flow);
  assert.doesNotMatch(text, /n8n-coolify\.barqai\.app/);
  assert.doesNotMatch(text, /source_base64/);
  assert.doesNotMatch(text, /n8n-coolify\.barqai\.app/);
  const tables = flow.nodes.filter((item) => item.type === 'n8n-nodes-base.dataTable');
  for (const table of tables) assert.doesNotMatch(JSON.stringify(table), /\"name\":\"(?:source_base64|results_json|results_csv)\"/);
}
console.log('on-prem artifact tests passed');
