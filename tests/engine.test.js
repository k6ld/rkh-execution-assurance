const assert = require('node:assert/strict');
const engine = require('../engine/assurance-engine');

const headers = ['Work Order Number', 'Work Type', 'Status', 'Location', 'Actual Finish Date', 'Finish No Later Than', 'TANC Number', 'Defect Reference', 'Original Problem', 'Closure Log', 'Contractor', 'Relationship Mismatch Confirmed'];
const row = (values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));

const cases = [
  ['PM on time', row(['PM-1', 'PM', 'CLOSED', '', '2026-09-01', '2026-09-01', '', '', 'Scheduled PM', 'PM completed. No discrepancies recorded.']), 'Green', 'PM_ON_TIME'],
  ['PM early', row(['PM-2', 'PM', 'COMP', '', '2026-09-01', '2026-09-03', '', '', 'Scheduled PM', 'PM completed. No discrepancies recorded.']), 'Green', 'PM_EARLY'],
  ['PM incomplete', row(['PM-3', 'PM', 'CLOSED', '', '2026-09-01', '2026-09-03', '', '', 'Scheduled PM', 'Activity incomplete. Further work required.']), 'Amber', 'PM_INCOMPLETE'],
  ['PM partially completed', row(['PM-4', 'PM', 'CLOSED', '', '2026-09-01', '2026-09-03', '', '', 'Scheduled PM', 'PM partially completed due to access restriction.']), 'Amber', 'PM_PARTIAL'],
  ['PM asset not found takes precedence', row(['PM-5', 'PM', 'CLOSED', '', '2026-09-01', '2026-09-03', '', '', 'Scheduled asset PM', 'Asset not found at the recorded location.']), 'Amber', 'PM_ASSET_NOT_FOUND'],
  ['PM generic not found', row(['PM-6', 'PM', 'CLOSED', '', '2026-09-01', '2026-09-03', '', '', 'Scheduled PM', 'Required component not found.']), 'Red', 'PM_NOT_FOUND'],
  ['PM defect without reference', row(['PM-7', 'PM', 'CLOSED', '', '2026-09-01', '2026-09-03', '', '', 'Scheduled PM', 'Defect identified and WO closed.']), 'Red', 'PM_DEFECT_NO_REFERENCE'],
  ['PM multiple hit severity', row(['PM-8', 'PM', 'CLOSED', '', '2026-09-05', '2026-09-03', '', '', 'Scheduled PM', 'PM not done. WO closed.']), 'Red', 'PM_MULTI_HIT_RED_WINS'],
  ['CM positive closure', row(['CM-1', 'CM', 'CLOSED', '', '2026-09-01', '', '', '', 'Door interlock relay fault', 'Faulty relay replaced. Functional test completed and equipment restored to normal operation.']), 'Green', 'CM_NO_OBVIOUS_DISCREPANCY'],
  ['CM weak closure', row(['CM-2', 'CM', 'CLOSED', '', '2026-09-01', '', '', '', 'Display communication fault', 'CM attended and checked. WO closed.']), 'Amber', 'CM_WEAK_SHORT'],
  ['CM pending', row(['CM-3', 'CM', 'CLOSED', '', '2026-09-01', '', '', '', 'Pump fault', 'Inspection completed; further rectification pending and assigned to contractor.']), 'Amber', 'CM_PENDING_FUTURE'],
  ['CM no fault language', row(['CM-4', 'CM', 'CLOSED', '', '2026-09-01', '', '', '', 'Reported abnormality', 'No fault found. Equipment working normal.']), 'Amber', 'CM_NO_FAULT'],
  ['CM temporary', row(['CM-5', 'CM', 'CLOSED', '', '2026-09-01', '', '', '', 'Damaged fitting', 'Area barricaded and equipment isolated pending permanent repair.']), 'Amber', 'CM_TEMPORARY'],
  ['CM material', row(['CM-6', 'CM', 'CLOSED', '', '2026-09-01', '', '', '', 'Display failure', 'Waiting material; spare required and parts not available.']), 'Amber', 'CM_MATERIAL'],
  ['CM leakage', row(['CM-7', 'CM', 'CLOSED', '', '2026-09-01', '', '', 'D-9911', 'Water ingress', 'Water leakage and ceiling stain observed.']), 'Yellow', 'CM_DEFECT_LEAKAGE'],
  ['CM no access takes Red', row(['CM-8', 'CM', 'CLOSED', '', '2026-09-01', '', '', '', 'High-level inspection', 'No access due to height. MEWP required. WO closed.']), 'Red', 'CM_NO_ACCESS'],
  ['CM generic defect provisional', row(['CM-9', 'CM', 'CLOSED', '', '2026-09-01', '', '', 'D-3001', 'Equipment fault', 'Defect D-3001 recorded and WO closed.']), 'Yellow', 'CM_DEFECT_GENERIC'],
  ['CM unspecified provisional', row(['CM-10', 'CM', 'CLOSED', '', '2026-09-01', '', '', '', 'Reported issue', 'Out of scope for this contractor.']), 'Amber', 'CM_UNSPECIFIED'],
  ['CM confirmed mismatch', row(['CM-11', 'CM', 'CLOSED', '', '2026-09-01', '', '', '', 'Door interlock fault', 'Ceiling waterproofing inspection completed.', '', 'true']), 'Red', 'CM_RELATIONSHIP_MISMATCH_CONFIRMED'],
  ['CM unknown relationship is review', row(['CM-12', 'CM', 'CLOSED', '', '2026-09-01', '', '', '', 'Door interlock fault', 'Panel inspected and returned to service.']), 'Amber', 'CM_RELATIONSHIP_REVIEW'],
  ['CM negated waiting phrase', row(['CM-13', 'CM', 'CLOSED', '', '2026-09-01', '', '', '', 'Display fault', 'Not waiting for material. Replacement installed and functional test completed.']), 'Amber', 'CM_RELATIONSHIP_REVIEW'],
  ['Excluded status', row(['CM-14', 'CM', 'WAPPR', '', '2026-09-01', '', '', '', 'Equipment fault', 'Fault repaired and tested.']), 'Excluded', 'STATUS_NOT_ELIGIBLE'],
  ['Missing worklog false-green guardrail', row(['CM-15', 'CM', 'CLOSED', '', '2026-09-01', '', '', '', 'Equipment fault', '']), 'Red', 'MISSING_WORKLOG'],
];

const mapping = engine.mapHeaders(headers);
for (const [name, input, expectedGrade, expectedReason] of cases) {
  const result = engine.analyzeRows([input], { headers, mapping }).rows[0];
  assert.equal(result.grade, expectedGrade, `${name}: grade`);
  assert.equal(result.reason_code, expectedReason, `${name}: reason`);
}

const matrix = [
  ['Report export'],
  headers,
  headers.map(header => row(['PM-16', 'PM', 'CLOSED', '', '2026-09-01', '2026-09-03', '', '', 'Scheduled PM', 'Asset not found at location.'])[header]),
];
const detected = engine.analyzeMatrix(matrix);
assert.equal(detected.ok, true);
assert.equal(detected.detected_header_row, 2);
assert.equal(detected.rows[0].grade, 'Amber');
assert.equal(detected.rows[0].reason_code, 'SPECIFIC_PHRASE_PRECEDENCE');

const boundary = engine.analyzeRows([row(['CM-17', 'CM', 'CLOSED', '', '2026-09-01', '', '', '', 'Panel fault', 'Panel repaired. Final functional test completed and equipment restored to service.'])], { headers, mapping }).rows[0];
assert.equal(boundary.grade, 'Green');
assert.equal(boundary.keyword_hits.includes('na'), false, 'NA must not match letters inside final');

console.log(`engine tests passed: ${cases.length + 2} cases`);
