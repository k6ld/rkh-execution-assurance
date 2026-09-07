const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const engine = require('../engine/assurance-engine');

const handoff = process.env.RKH_HANDOFF_DIR || '/Users/et/Downloads/RKH_Execution_Assurance_Codex_Handoff';
const expectedPath = path.join(handoff, '03_M0_RULE_FREEZE', 'RKH_M0_Expected_Results.json');
if (!fs.existsSync(expectedPath)) {
  console.log('M0 parity skipped: set RKH_HANDOFF_DIR to the local handoff bundle to run it.');
  process.exit(0);
}

const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
const headers = ['Work Order Number', 'Work Type', 'Status', 'Actual Finish Date', 'Finish No Later Than', 'TANC Number', 'Defect Reference', 'Original Problem', 'Closure Log', 'Relationship Mismatch Confirmed'];
const mapping = engine.mapHeaders(headers);
const runtimeFixtures = expected.fixtures.filter((fixture) => fixture.fixture_class !== 'DECISION');
let passed = 0;
for (const fixture of runtimeFixtures) {
  const raw = {
    'Work Order Number': fixture.wo_number || fixture.fixture_id,
    'Work Type': fixture.work_type,
    Status: fixture.status,
    'Actual Finish Date': fixture.actual_finish,
    'Finish No Later Than': fixture.finish_no_later_than,
    'TANC Number': fixture.tanc,
    'Defect Reference': fixture.defect_reference,
    'Original Problem': fixture.original_problem,
    'Closure Log': fixture.worklog,
    'Relationship Mismatch Confirmed': fixture.expected_reason_code === 'CM_RELATIONSHIP_MISMATCH_CONFIRMED' ? 'true' : '',
  };
  const result = engine.analyzeRows([raw], { headers, mapping }).rows[0];
  assert.equal(result.grade, fixture.expected_grade, `${fixture.fixture_id} grade`);
  assert.equal(result.category, fixture.expected_category, `${fixture.fixture_id} category`);
  assert.equal(result.action, fixture.expected_action, `${fixture.fixture_id} action`);
  if (fixture.expected_reason_code && !fixture.expected_reason_code.startsWith('OPEN_')) assert.equal(result.reason_code, fixture.expected_reason_code, `${fixture.fixture_id} reason`);
  passed += 1;
}
console.log(`M0 runtime parity passed: ${passed}/${runtimeFixtures.length} GOLDEN/PROVISIONAL fixtures; DECISION fixtures remain intentionally unresolved.`);
