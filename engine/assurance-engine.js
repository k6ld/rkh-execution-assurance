/*
 * RKH Execution Assurance deterministic engine.
 *
 * This file is the only business-rule source of truth. The n8n workflow JSON
 * is generated from this file by scripts/build-n8n-workflows.js.
 */
const RKH_ASSURANCE_ENGINE = (() => {
  const RULE_VERSION = 'MAXIMO-MMS-KEYWORD-v1';
  const ELIGIBLE_STATUSES = ['COMP', 'COMPLETED', 'REVIEWED', 'CLOSED', 'CLOSE', 'COMPLETE'];
  const SEVERITY = { Excluded: -1, Green: 0, Yellow: 1, Amber: 2, Red: 3 };

  const POLICY = {
    pmOverdue: { grade: 'Amber', status: 'OPEN' },
    pmScope: { grade: 'Red', status: 'OPEN' },
    pmDefectWithReference: { grade: 'Green', status: 'OPEN' },
    cmGenericDefect: { grade: 'Yellow', status: 'OPEN' },
    cmUnspecified: { grade: 'Amber', status: 'OPEN' },
    cmRelationshipUnknown: { grade: 'Amber', status: 'OPEN' },
    cmInsufficientEvidence: { grade: 'Amber', status: 'OPEN' },
    missingWorklog: { grade: 'Red', status: 'OPEN' },
    unknownType: { grade: 'Amber', status: 'OPEN' },
    negation: { status: 'PROVISIONAL' },
  };

  const FIELD_ALIASES = {
    wo_number: ['work order number', 'work order', 'wo number', 'wonum', 'workorder', 'work order no', 'wo no', 'wo'],
    work_type: ['work type', 'wo type', 'work order type', 'type', 'worktype', 'maintenance type'],
    status: ['status', 'wo status', 'work order status'],
    location: ['location', 'location code', 'station', 'site', 'locations', 'functional location'],
    actual_finish: ['actual finish date', 'actual finish', 'actfinish', 'actual completion date', 'completion date', 'actual finish datetime'],
    finish_no_later_than: ['finish no later than', 'finish no later than date', 'fnlt', 'due date', 'target finish', 'finish nlt', 'finish no later'],
    tanc_reference: ['tanc', 'tanc number', 'tanc no', 'tanc ref', 'tanc reference'],
    defect_reference: ['defect reference', 'defect ref', 'defect number', 'defect no', 'follow up', 'follow-up', 'follow up reference', 'linked wo', 'related wo', 'defect id'],
    original_problem: ['original problem', 'fault description', 'problem', 'description', 'short description', 'reported fault', 'issue description', 'work order description'],
    worklog: ['closure log', 'work log', 'worklog', 'completion notes', 'actual work', 'work log details', 'wo log', 'completion log', 'long description', 'worklog details', 'comments'],
    contractor: ['contractor', 'vendor', 'company', 'responsible contractor', 'maintenance performer', 'supplier'],
    relationship_confirmed_mismatch: ['relationship mismatch confirmed', 'confirmed mismatch', 'worklog unrelated confirmed'],
  };

  const RULES = {
    pm: {
      incomplete: { id: 'PM-R04', phrases: ['incomplete'], grade: 'Amber', category: 'PM closed but work incomplete', action: 'Site verification / Assurance inspection required', reason_code: 'PM_INCOMPLETE', status: 'LOCKED' },
      partial: { id: 'PM-R05', phrases: ['partially completed'], grade: 'Amber', category: 'PM closed but work incomplete', action: 'Site verification / Assurance inspection required', reason_code: 'PM_PARTIAL', status: 'LOCKED' },
      ongoing: { id: 'PM-R06', phrases: ['on going activity', 'ongoing activity'], grade: 'Amber', category: 'PM closed but work incomplete', action: 'Site verification / Assurance inspection required', reason_code: 'PM_ONGOING', status: 'LOCKED' },
      asset_not_found: { id: 'PM-R07', phrases: ['asset not found'], grade: 'Amber', category: 'PM not performed but WO was closed', action: 'Site verification required', reason_code: 'PM_ASSET_NOT_FOUND', status: 'LOCKED' },
      scope: { id: 'PM-R08/R09', phrases: ['not in our scope', 'out of scope'], grade: 'Red', category: 'PM closed but work not done', action: 'Engineer notified and CAR raised', reason_code: 'PM_SCOPE_EXCEPTION', status: 'OPEN' },
      not_found: { id: 'PM-R10', phrases: ['not found'], grade: 'Red', category: 'PM closed but work not done', action: 'Engineer notified and CAR raised', reason_code: 'PM_NOT_FOUND', status: 'LOCKED' },
      defect: { id: 'PM-R11/R12', phrases: ['defect'], grade: 'Red', category: 'PM not performed but WO was closed', action: 'Engineer notified and CAR raised', reason_code: 'PM_DEFECT_NO_REFERENCE', status: 'LOCKED' },
      not_done: { id: 'PM-R13', phrases: ['not done'], grade: 'Red', category: 'PM closed but work not done', action: 'Engineer notified and CAR raised', reason_code: 'PM_NOT_DONE', status: 'LOCKED' },
    },
    cm: {
      weak: { id: 'CM-R03', phrases: ['attended', 'cm attended', 'checked', 'observed', 'inspected', 'booked in', 'closed', 'cm closed', 'na', 'n/a', 'sign off notes'], grade: 'Amber', category: 'Discrepancies found and can be verified on site', action: 'Assurance team verifies on site and reports to engineer', reason_code: 'CM_WEAK_SHORT', status: 'LOCKED' },
      pending: { id: 'CM-R04', phrases: ['pending', 'on hold', 'waiting', 'awaiting', 'under process', 'under observation', 'monitoring', 'to be completed', 'to be rectified', 'will be', 'need to', 'needs to', 'required to', 'further rectification', 'further action', 'forwarded', 'forward to', 'passed to', 'assigned to'], grade: 'Amber', category: 'Discrepancies found and can be verified on site', action: 'Engineers notified and Assurance Team perform site verification', reason_code: 'CM_PENDING_FUTURE', status: 'LOCKED' },
      no_fault: { id: 'CM-R05', phrases: ['no fault found', 'no issue found', 'working normal', 'no abnormality', 'no failure', 'normal operation'], grade: 'Amber', category: 'Discrepancies found and can be verified on site', action: 'Engineers notified and Assurance Team perform site verification', reason_code: 'CM_NO_FAULT', status: 'LOCKED' },
      temporary: { id: 'CM-R06', phrases: ['temporary', 'area barricaded', 'barricaded', 'isolated', 'signage placed', 'out of service'], grade: 'Amber', category: 'Discrepancies found and can be verified on site', action: 'Engineers notified and Assurance Team perform site verification', reason_code: 'CM_TEMPORARY', status: 'LOCKED' },
      material: { id: 'CM-R07', phrases: ['material required', 'waiting material', 'waiting for material', 'pending material', 'spare required', 'quotation required', 'parts not available'], grade: 'Amber', category: 'Discrepancies found and can be verified on site', action: 'Engineers notified and Assurance Team perform site verification', reason_code: 'CM_MATERIAL', status: 'LOCKED' },
      leakage: { id: 'CM-R08', phrases: ['water leakage', 'water dripping', 'structural leakage', 'water proofing', 'waterproofing', 'ceiling stain', 'seepage', 'grp leakage'], grade: 'Yellow', category: 'Defect related CM', action: 'Engineers notified; engineer verifies defect process', reason_code: 'CM_DEFECT_LEAKAGE', status: 'LOCKED' },
      generic_defect: { id: 'CM-R09', phrases: ['defect', 's200', 'under defect', 'com-ltr'], grade: 'Yellow', category: 'Defect related CM', action: 'Engineers notified; engineer verifies defect process', reason_code: 'CM_DEFECT_GENERIC', status: 'OPEN' },
      no_access: { id: 'CM-R10', phrases: ['no access', 'unable to access', 'unale to access', 'in accessible', 'inaccessible', 'mewp required', 'scaffolding required', 'height access required', 'unable to complete'], grade: 'Red', category: 'WO was closed without sufficient rectification', action: 'Engineer reviews WO and raises CAR if necessary', reason_code: 'CM_NO_ACCESS', status: 'LOCKED' },
      unspecified: { id: 'CM-R11', phrases: ['duplicate', 'cancelled', 'canceled', 'out of scope', 'not in scope'], grade: 'Amber', category: 'Manual review - CM disposition not specified', action: 'Human assurance review required', reason_code: 'CM_UNSPECIFIED', status: 'OPEN' },
    },
  };

  const RECTIFICATION = ['repaired', 'replaced', 'rectified', 'fixed', 'renewed', 'changed', 'installed', 'reset', 'adjusted', 'tightened', 'cleaned', 'calibrated', 'commissioned', 'corrected'];
  const VERIFICATION = ['tested', 'functional test', 'function test', 'operational test', 'verified', 'restored', 'returned to service', 'back in service', 'resolved', 'normal operation', 'operational'];

  function text(value) { return String(value == null ? '' : value).trim(); }
  function normalizeHeader(value) { return text(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' '); }
  function normalizeMatch(value) { return text(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
  function severity(grade) { return SEVERITY[grade] == null ? 0 : SEVERITY[grade]; }
  function meaningfulReference(value) { return !['', 'n/a', 'na', 'none', 'null', '-', '0', 'not found'].includes(normalizeMatch(value)); }
  function words(value) { return normalizeMatch(value).split(' ').filter(Boolean); }
  function containsSequence(sourceTokens, patternTokens) {
    if (!patternTokens.length || patternTokens.length > sourceTokens.length) return [];
    const starts = [];
    for (let i = 0; i <= sourceTokens.length - patternTokens.length; i += 1) {
      if (patternTokens.every((token, offset) => sourceTokens[i + offset] === token)) starts.push(i);
    }
    return starts;
  }
  function isNegated(sourceTokens, start) {
    return ['not', 'no', 'without'].includes(sourceTokens[start - 1]) || ['not', 'no', 'without'].includes(sourceTokens[start - 2]);
  }
  function matches(textValue, phrases) {
    const source = words(textValue);
    const hitList = [];
    for (const phrase of phrases) {
      const pattern = words(phrase);
      for (const start of containsSequence(source, pattern)) {
        if (!isNegated(source, start)) hitList.push({ phrase, start, end: start + pattern.length - 1 });
      }
    }
    return hitList;
  }
  function hitPhrases(textValue, phrases) { return unique(matches(textValue, phrases).map(hit => hit.phrase)); }

  function parseDate(value) {
    const raw = text(value);
    if (!raw) return null;
    if (/^\d{5}(\.\d+)?$/.test(raw)) {
      const date = new Date((Number(raw) - 25569) * 86400000);
      return Number.isNaN(date.getTime()) ? null : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    }
    let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (match) return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  }
  function dateLabel(date) { return date ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}` : ''; }

  function scoreHeader(row) {
    const cells = row.map(normalizeHeader).filter(Boolean);
    return Object.values(FIELD_ALIASES).reduce((score, aliases) => score + (aliases.some(alias => cells.some(cell => cell === normalizeHeader(alias) || cell.includes(normalizeHeader(alias)) || normalizeHeader(alias).includes(cell))) ? 1 : 0), 0);
  }
  function detectHeader(matrix, maxRows = 25) {
    let best = { index: -1, score: -1 };
    matrix.slice(0, maxRows).forEach((row, index) => {
      const score = scoreHeader(row);
      if (score > best.score) best = { index, score };
    });
    return best;
  }
  function matrixToRows(matrix, headerIndex) {
    if (headerIndex < 0 || !matrix[headerIndex]) return { headers: [], rows: [] };
    const headers = matrix[headerIndex].map((header, index) => text(header) || `Column ${index + 1}`);
    const rows = matrix.slice(headerIndex + 1).filter(row => row.some(value => text(value) !== '')).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] == null ? '' : row[index]])));
    return { headers, rows };
  }
  function mapHeaders(headers) {
    const normalized = headers.map(header => ({ header, value: normalizeHeader(header) }));
    const mapping = {};
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      let found = normalized.find(item => aliases.some(alias => item.value === normalizeHeader(alias)));
      if (!found) found = normalized.find(item => aliases.some(alias => item.value && (item.value.includes(normalizeHeader(alias)) || normalizeHeader(alias).includes(item.value))));
      mapping[field] = found ? found.header : '';
    }
    return mapping;
  }
  function mappingConfidence(mapping) {
    const weights = { wo_number: 3, worklog: 3, work_type: 2, status: 1, location: 1, actual_finish: 1, finish_no_later_than: 1, tanc_reference: 0.5, defect_reference: 0.5, original_problem: 1, contractor: 0.5 };
    let present = 0; let total = 0;
    Object.entries(weights).forEach(([field, weight]) => { total += weight; if (mapping[field]) present += weight; });
    return Math.round((present / total) * 100);
  }

  function valueFor(row, mapping, field) { return mapping[field] ? row[mapping[field]] : ''; }
  function inferType(row, mapping, defaultType = '') {
    const mapped = text(valueFor(row, mapping, 'work_type')).toUpperCase();
    if (mapped.includes('PM') || mapped.includes('PREVENT')) return 'PM';
    if (mapped.includes('CM') || mapped.includes('CORRECT')) return 'CM';
    const wo = text(valueFor(row, mapping, 'wo_number')).toUpperCase();
    if (/^PM(?:[\s_-]|$)/.test(wo)) return 'PM';
    if (/^CM(?:[\s_-]|$)/.test(wo)) return 'CM';
    return defaultType || 'UNKNOWN';
  }
  function relationCheck(problem, worklog, confirmedMismatch = false) {
    if (confirmedMismatch) return { state: 'Description and worklog confirmed unrelated', shared: [] };
    const stop = new Set(['the', 'and', 'for', 'with', 'from', 'was', 'were', 'are', 'is', 'to', 'of', 'in', 'on', 'at', 'a', 'an', 'this', 'that', 'wo', 'work', 'order', 'cm', 'pm', 'system', 'equipment', 'found', 'reported', 'issue']);
    const problemTokens = unique(words(problem).filter(word => word.length > 2 && !stop.has(word)));
    const logTokens = new Set(words(worklog).filter(word => word.length > 2 && !stop.has(word)));
    const shared = problemTokens.filter(word => logTokens.has(word));
    if (problemTokens.length < 2 || logTokens.size < 2) return { state: 'Not enough text for deterministic relation check', shared };
    return shared.length ? { state: 'Description and worklog share some terms', shared } : { state: 'No clear lexical overlap - manual relationship review required', shared: [] };
  }

  function candidate(rule, hits, overrides = {}) {
    return { rule_id: rule.id, grade: overrides.grade || rule.grade, category: overrides.category || rule.category, action: overrides.action || rule.action, reason_code: overrides.reason_code || rule.reason_code, keyword_hits: hits, policy_status: overrides.policy_status || rule.status, reasons: overrides.reasons || [] };
  }
  function chooseCandidates(base, candidates) {
    const all = [base, ...candidates].filter(Boolean);
    const best = all.reduce((current, next) => {
      if (severity(next.grade) > severity(current.grade)) return next;
      if (severity(next.grade) === severity(current.grade) && current.reason_code === 'CM_RELATIONSHIP_REVIEW' && next.reason_code !== 'CM_RELATIONSHIP_REVIEW') return next;
      return current;
    });
    const triggered = all.filter(item => item !== base);
    const policyStatuses = unique(triggered.map(item => item.policy_status));
    const multiple = new Set(triggered.map(item => item.grade)).size > 1;
    return {
      ...best,
      keyword_hits: unique(triggered.flatMap(item => item.keyword_hits || [])),
      matched_rule_ids: unique(triggered.map(item => item.rule_id)),
      policy_statuses: policyStatuses,
      policy_status: policyStatuses.includes('OPEN') ? 'OPEN' : (policyStatuses.includes('PROVISIONAL') ? 'PROVISIONAL' : 'LOCKED'),
      reason_code: multiple ? `MULTI_HIT_${best.grade.toUpperCase()}_WINS` : best.reason_code,
      reasons: unique(triggered.flatMap(item => item.reasons || []).concat(best.reasons || [])),
    };
  }

  function analyzePM(row) {
    const log = text(row.worklog);
    const candidates = [];
    const finish = parseDate(row.actual_finish); const due = parseDate(row.finish_no_later_than);
    if (finish && due && finish > due) {
      candidates.push({ rule_id: 'PM-R03', grade: POLICY.pmOverdue.grade, category: 'PM overdue', action: meaningfulReference(row.tanc_reference) ? 'TANC reference found - no further action required' : 'Engineer review - TANC not found', reason_code: 'PM_OVERDUE', keyword_hits: ['PM overdue'], policy_status: POLICY.pmOverdue.status, reasons: [`Actual Finish (${dateLabel(finish)}) is later than Finish No Later Than (${dateLabel(due)})`, meaningfulReference(row.tanc_reference) ? 'TANC reference is present' : 'TANC reference is missing'] });
    }
    const assetHits = hitPhrases(log, RULES.pm.asset_not_found.phrases);
    if (assetHits.length) candidates.push(candidate(RULES.pm.asset_not_found, assetHits, { reason_code: normalizeMatch(row.original_problem).includes('scheduled asset') ? 'PM_ASSET_NOT_FOUND' : 'SPECIFIC_PHRASE_PRECEDENCE', reasons: ['Specific PM step matched: Asset Not Found before generic not found'] }));
    for (const key of ['incomplete', 'partial', 'ongoing']) { const rule = RULES.pm[key]; const hits = hitPhrases(log, rule.phrases); if (hits.length) candidates.push(candidate(rule, hits, { reasons: ['PM keyword matrix indicates incomplete / ongoing work'] })); }
    const scopeHits = hitPhrases(log, RULES.pm.scope.phrases);
    if (scopeHits.length) candidates.push(candidate(RULES.pm.scope, scopeHits, { reasons: ['PM keyword matrix matched a work-not-done / scope exception'] }));
    const notFoundHits = assetHits.length ? [] : hitPhrases(log, RULES.pm.not_found.phrases);
    if (notFoundHits.length) candidates.push(candidate(RULES.pm.not_found, notFoundHits, { reasons: ['Generic "not found" keyword matched the PM keyword table'] }));
    const defectHits = hitPhrases(log, RULES.pm.defect.phrases);
    if (defectHits.length) {
      if (meaningfulReference(row.defect_reference)) candidates.push({ rule_id: 'PM-R12', grade: POLICY.pmDefectWithReference.grade, category: 'Defect documented', action: 'Defect reference found - no further action required', reason_code: 'PM_DEFECT_WITH_REFERENCE', keyword_hits: defectHits, policy_status: POLICY.pmDefectWithReference.status, reasons: ['Defect keyword detected', 'Defect / follow-up reference is present'] });
      else candidates.push(candidate(RULES.pm.defect, defectHits, { reasons: ['Defect keyword detected', 'Defect reference not found'] }));
    }
    const notDoneHits = hitPhrases(log, RULES.pm.not_done.phrases);
    if (notDoneHits.length) candidates.push(candidate(RULES.pm.not_done, notDoneHits, { reasons: ['PM keyword matrix matched a work-not-done / scope exception'] }));
    if (!candidates.length) return { grade: 'Green', category: 'No obvious discrepancies', action: 'No action', reason_code: finish && due && finish <= due ? (finish.getTime() === due.getTime() ? 'PM_ON_TIME' : 'PM_EARLY') : 'PM_NO_OBVIOUS_DISCREPANCY', keyword_hits: [], matched_rule_ids: ['PM-R01/PM-R02/PM-R14'], policy_status: 'LOCKED', policy_statuses: ['LOCKED'], reasons: ['No PM exception keyword was triggered'], warnings: [] };
    const result = chooseCandidates({ grade: 'Green', category: 'No obvious discrepancies', action: 'No action', reason_code: 'PM_NO_OBVIOUS_DISCREPANCY', keyword_hits: [], matched_rule_ids: [], policy_status: 'LOCKED', policy_statuses: ['LOCKED'], reasons: [] }, candidates);
    return { ...result, reason_code: result.reason_code.startsWith('MULTI_HIT_') ? `PM_${result.reason_code}` : result.reason_code, warnings: [] };
  }

  function analyzeCM(row) {
    const log = text(row.worklog); const candidates = [];
    const rectification = hitPhrases(log, RECTIFICATION); const verification = hitPhrases(log, VERIFICATION);
    const weakHits = hitPhrases(log, RULES.cm.weak.phrases); const wordCount = words(log).length;
    const initialRelation = relationCheck(row.original_problem, log, row.relationship_confirmed_mismatch === true || text(row.relationship_confirmed_mismatch).toLowerCase() === 'true');
    const relation = initialRelation.state.startsWith('No clear') && weakHits.length && wordCount <= 12 && !verification.length
      ? { state: 'Short closure requires the weak-closure rule; relationship is not inferred', shared: initialRelation.shared }
      : initialRelation;
    if (relation.state === 'Description and worklog confirmed unrelated') return { grade: 'Red', category: 'Worklog unrelated to reported fault', action: 'Engineers notified and CAR raised for subcontractor justification/action', reason_code: 'CM_RELATIONSHIP_MISMATCH_CONFIRMED', keyword_hits: [], matched_rule_ids: ['CM-R02'], policy_status: 'LOCKED', policy_statuses: ['LOCKED'], reasons: ['CM procedure requires the worklog to relate to the original fault', 'Mismatch was explicitly confirmed'], warnings: [], relation };
    else if (relation.state.startsWith('No clear lexical overlap')) { /* evaluated after concrete keyword rules */ }
    for (const key of ['no_access', 'leakage', 'generic_defect', 'no_fault', 'temporary', 'material', 'unspecified', 'pending']) {
      const rule = RULES.cm[key]; let hits = hitPhrases(log, rule.phrases);
      if (key === 'no_fault' && rectification.length && verification.length) hits = hits.filter(hit => hit !== 'normal operation');
      if (hits.length) candidates.push(candidate(rule, hits, { reason_code: key === 'no_access' && hits.includes('unable to complete') ? 'CM_UNABLE_COMPLETE' : key === 'pending' && hits.some(hit => ['forwarded', 'forward to'].includes(hit)) ? 'CM_FORWARDED' : key === 'leakage' && hits.some(hit => ['seepage', 'waterproofing', 'water proofing'].includes(hit)) ? 'CM_DEFECT_SEEPAGE' : undefined, reasons: [key === 'no_access' ? 'No-access / unable-to-complete keyword matched the CM validation table' : `${key.replace('_', ' ')} keyword matched the CM validation table`] }));
    }
    if (weakHits.length && wordCount <= 12 && !candidates.length && !(initialRelation.state.startsWith('No clear') && verification.length)) candidates.push(candidate(RULES.cm.weak, weakHits, { reasons: [`Worklog is short (${wordCount} words) and contains weak closure language`] }));
    if (!candidates.length && relation.state.startsWith('No clear lexical overlap')) return { grade: POLICY.cmRelationshipUnknown.grade, category: 'Relationship not deterministically established', action: 'Manual relationship review required before treating the CM as Green', reason_code: 'CM_RELATIONSHIP_REVIEW', keyword_hits: [], matched_rule_ids: ['CM-R02'], policy_status: POLICY.cmRelationshipUnknown.status, policy_statuses: [POLICY.cmRelationshipUnknown.status], reasons: ['CM procedure requires the worklog to relate to the original fault', 'No clear lexical overlap was detected; lexical non-overlap alone does not prove a mismatch'], warnings: ['Lexical non-overlap alone does not prove a semantic mismatch'], relation };
    if (!candidates.length && rectification.length && verification.length) return { grade: 'Green', category: 'The CM was performed and no obvious discrepancies found', action: 'No action', reason_code: words(log).includes('final') && !weakHits.includes('na') ? 'BOUNDARY_NA_FALSE_POSITIVE' : 'CM_NO_OBVIOUS_DISCREPANCY', keyword_hits: unique([...rectification, ...verification]), matched_rule_ids: ['CM-R01'], policy_status: 'LOCKED', policy_statuses: ['LOCKED'], reasons: ['Concrete rectification evidence detected', 'Testing / restoration evidence detected'], warnings: [], relation };
    if (!candidates.length) return { grade: POLICY.cmInsufficientEvidence.grade, category: 'Insufficient evidence fault fully resolved', action: 'Assurance verification required before treating the CM as fully rectified', reason_code: 'CM_INSUFFICIENT_EVIDENCE', keyword_hits: unique([...rectification, ...verification]), matched_rule_ids: ['CM-R12'], policy_status: POLICY.cmInsufficientEvidence.status, policy_statuses: [POLICY.cmInsufficientEvidence.status], reasons: ['No listed discrepancy keyword was found, but the worklog lacks both concrete rectification and testing/restoration evidence'], warnings: ['Conservative guardrail prevents a false Green classification'], relation };
    const result = chooseCandidates({ grade: 'Green', category: 'The CM was performed and no obvious discrepancies found', action: 'No action', reason_code: 'CM_NO_OBVIOUS_DISCREPANCY', keyword_hits: [], matched_rule_ids: [], policy_status: 'LOCKED', policy_statuses: ['LOCKED'], reasons: [] }, candidates);
    return { ...result, reason_code: result.reason_code.startsWith('MULTI_HIT_') ? `CM_${result.reason_code}` : result.reason_code, warnings: relation.state.startsWith('No clear') ? ['Manual relationship review is required before treating this CM as fully resolved'] : [], relation };
  }

  function canonicalize(raw, index, mapping, defaultType = '') {
    return {
      row_number: index + 1,
      wo_number: text(valueFor(raw, mapping, 'wo_number')) || `ROW-${index + 1}`,
      work_type: inferType(raw, mapping, defaultType),
      status: text(valueFor(raw, mapping, 'status')).toUpperCase(),
      location: text(valueFor(raw, mapping, 'location')),
      actual_finish: text(valueFor(raw, mapping, 'actual_finish')),
      finish_no_later_than: text(valueFor(raw, mapping, 'finish_no_later_than')),
      tanc_reference: text(valueFor(raw, mapping, 'tanc_reference')),
      defect_reference: text(valueFor(raw, mapping, 'defect_reference')),
      original_problem: text(valueFor(raw, mapping, 'original_problem')),
      worklog: text(valueFor(raw, mapping, 'worklog')),
      contractor: text(valueFor(raw, mapping, 'contractor')),
      relationship_confirmed_mismatch: valueFor(raw, mapping, 'relationship_confirmed_mismatch'),
    };
  }
  function analyzeRow(raw, index, mapping, options = {}) {
    const row = canonicalize(raw, index, mapping, options.defaultType || '');
    if (row.status && !ELIGIBLE_STATUSES.includes(row.status)) return { ...row, grade: 'Excluded', category: 'Outside validation population', action: 'No assurance grade assigned', reason_code: 'STATUS_NOT_ELIGIBLE', keyword_hits: [], matched_rule_ids: ['SYS-R01'], policy_status: 'PROVISIONAL', policy_statuses: ['PROVISIONAL'], reasons: [`Status "${row.status}" is not in the provisional eligible status set`], warnings: [], manual_review: false };
    if (row.work_type === 'UNKNOWN') return { ...row, grade: POLICY.unknownType.grade, category: 'Unknown PM/CM type', action: 'Inspect automatic mapping or quarantine before business grading', reason_code: 'UNKNOWN_WORK_TYPE', keyword_hits: [], matched_rule_ids: ['OD-09'], policy_status: POLICY.unknownType.status, policy_statuses: [POLICY.unknownType.status], reasons: ['PM/CM-specific rules cannot run without a work type'], warnings: ['Work type was not confidently detected'], manual_review: true };
    if (!row.worklog) return { ...row, grade: POLICY.missingWorklog.grade, category: 'Insufficient closure evidence', action: 'Human review required', reason_code: 'MISSING_WORKLOG', keyword_hits: [], matched_rule_ids: ['OD-08'], policy_status: POLICY.missingWorklog.status, policy_statuses: [POLICY.missingWorklog.status], reasons: ['No worklog text was available'], warnings: ['Missing worklog is an open policy default'], manual_review: true };
    const analysis = row.work_type === 'PM' ? analyzePM(row) : analyzeCM(row);
    return { ...row, ...analysis, manual_review: analysis.policy_statuses.includes('OPEN') || analysis.warnings.length > 0 || analysis.reason_code === 'CM_RELATIONSHIP_REVIEW' };
  }

  function analyzeRows(rawRows, options = {}) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const headers = options.headers && options.headers.length ? options.headers : Object.keys(rows[0] || {});
    const mapping = options.mapping || mapHeaders(headers);
    const mapping_confidence = mappingConfidence(mapping);
    const mapping_errors = [];
    if (!mapping.wo_number) mapping_errors.push('Work Order Number');
    if (!mapping.worklog) mapping_errors.push('Closure Log / Worklog');
    if (mapping_errors.length) return { ok: false, error_code: 'CORE_MAPPING_FAILURE', error_message: `Required columns were not confidently identified: ${mapping_errors.join(', ')}`, mapping, mapping_confidence, rows: [], counts: { total: rows.length, eligible: 0, excluded: 0, green: 0, yellow: 0, amber: 0, red: 0 } };
    const results = rows.map((row, index) => ({ ...analyzeRow(row, index, mapping, options), rule_version: RULE_VERSION, mapping_confidence }));
    const counts = { total: results.length, eligible: results.filter(row => row.grade !== 'Excluded').length, excluded: results.filter(row => row.grade === 'Excluded').length, green: results.filter(row => row.grade === 'Green').length, yellow: results.filter(row => row.grade === 'Yellow').length, amber: results.filter(row => row.grade === 'Amber').length, red: results.filter(row => row.grade === 'Red').length };
    return { ok: true, rule_version: RULE_VERSION, mapping, mapping_confidence, rows: results, counts };
  }

  function analyzeMatrix(matrix, options = {}) {
    const header = detectHeader(matrix);
    if (header.index < 0 || header.score < 2) return { ok: false, error_code: 'HEADER_NOT_DETECTED', error_message: 'Could not confidently detect a MAXIMO/MMS header row', mapping_confidence: 0, rows: [], counts: { total: 0, eligible: 0, excluded: 0, green: 0, yellow: 0, amber: 0, red: 0 } };
    const converted = matrixToRows(matrix, header.index);
    return { ...analyzeRows(converted.rows, { ...options, headers: converted.headers }), detected_header_row: header.index + 1, detected_header_score: header.score };
  }

  return { RULE_VERSION, POLICY, FIELD_ALIASES, RULES, ELIGIBLE_STATUSES, normalizeMatch, detectHeader, matrixToRows, mapHeaders, mappingConfidence, parseDate, meaningfulReference, analyzeRow, analyzeRows, analyzeMatrix };
})();

if (typeof module !== 'undefined') module.exports = RKH_ASSURANCE_ENGINE;
