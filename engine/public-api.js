const PUBLIC_RUN_FIELDS = [
  'run_id', 'filename', 'source', 'created_at', 'updated_at', 'status',
  'total_rows', 'eligible_count', 'excluded_count', 'green_count',
  'yellow_count', 'amber_count', 'red_count', 'mapping_confidence',
  'rule_version', 'detected_sheet', 'detected_header_row', 'error_code',
  'error_message',
];

const INTERNAL_PATH_FIELDS = new Set(['source_path', 'results_json_path', 'results_csv_path']);

function serializePublicRun(run = {}) {
  return Object.fromEntries(PUBLIC_RUN_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(run, field))
    .map((field) => [field, run[field]]));
}

function serializePublicResult(result = {}) {
  return Object.fromEntries(Object.entries(result)
    .filter(([field]) => !INTERNAL_PATH_FIELDS.has(field)));
}

if (typeof module !== 'undefined') module.exports = { PUBLIC_RUN_FIELDS, serializePublicRun, serializePublicResult };
