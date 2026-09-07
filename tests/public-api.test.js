const assert = require('node:assert/strict');
const { serializePublicRun, serializePublicResult } = require('../engine/public-api');

const publicRun = serializePublicRun({
  run_id: 'RKH-test',
  filename: 'sample.csv',
  status: 'COMPLETED',
  source_path: 'C:\\private\\source.csv',
  results_json_path: 'C:\\private\\results.json',
  results_csv_path: 'C:\\private\\results.csv',
  error_message: '',
});
assert.equal(publicRun.run_id, 'RKH-test');
assert.equal(publicRun.filename, 'sample.csv');
assert.equal(publicRun.source_path, undefined);
assert.equal(publicRun.results_json_path, undefined);
assert.equal(publicRun.results_csv_path, undefined);

const publicResult = serializePublicResult({ wo_number: 'PM-1', grade: 'Green', source_path: 'C:\\private\\source.csv' });
assert.deepEqual(publicResult, { wo_number: 'PM-1', grade: 'Green' });
console.log('public API serializer tests passed');
