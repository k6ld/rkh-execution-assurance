(() => {
  const config = window.RKH_CONFIG || {};
  const base = String(config.apiBaseUrl || '').replace(/\/$/, '');
  const endpoints = config.endpoints || {};
  const state = { runs: [], run: null, results: [], activeGrade: 'All', selectedRow: null, page: 1, pageSize: 8 };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const apiUrl = (path, query = {}) => { const url = new URL(`${base}${path}`); Object.entries(query).forEach(([key, value]) => value != null && url.searchParams.set(key, value)); return url.toString(); };
  const statusClass = (status) => String(status || '').toLowerCase() === 'completed' ? 'completed' : String(status || '').toLowerCase() === 'failed' ? 'failed' : 'processing';
  const count = (run, key) => Number(key === 'total' ? (run?.total_rows ?? run?.total ?? 0) : (run?.[`${key}_count`] ?? run?.[key] ?? 0));
  const fileExt = (name) => String(name || '').split('.').pop().toLowerCase();
  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  };

  async function request(path, options = {}, query = {}) {
    if (!base) throw new Error('API base URL is not configured.');
    const response = await fetch(apiUrl(path, query), options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error_message || body.message || `API request failed (${response.status})`);
    return body;
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('rkh-theme', theme);
    const next = theme === 'dark' ? 'light' : 'dark';
    $('theme-toggle').setAttribute('aria-label', `Switch to ${next} mode`);
    $('theme-toggle').setAttribute('title', `Switch to ${next} mode`);
  }
  function initTheme() {
    const saved = localStorage.getItem('rkh-theme');
    const preferred = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyTheme(saved === 'dark' || saved === 'light' ? saved : preferred);
  }
  function toggleTheme() { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }

  function setStep(number) {
    document.querySelectorAll('.step').forEach((step) => {
      const value = Number(step.dataset.step);
      step.classList.toggle('active', value === number);
      step.classList.toggle('done', value < number);
    });
  }
  function showError(message) { $('upload-error').textContent = message; $('upload-error').classList.remove('hidden'); }
  function clearError() { $('upload-error').classList.add('hidden'); $('upload-error').textContent = ''; }
  function progress(title, status, message, value) {
    const complete = value >= 100 || status === 'Completed' || status === 'Failed';
    $('progress-area').classList.toggle('complete', complete);
    $('progress-spinner').classList.toggle('hidden', complete || status === 'Waiting');
    $('progress-title').textContent = title;
    $('progress-status').textContent = status;
    $('progress-message').textContent = message;
    $('progress-bar').style.width = `${Math.max(0, Math.min(100, value))}%`;
  }

  function renderRuns() {
    if (!state.runs.length) {
      $('report-list').innerHTML = '<div class="empty-state">No reports have been loaded yet.</div>';
      return;
    }
    $('report-list').innerHTML = state.runs.slice(0, 4).map((run) => {
      const filename = run.filename || run.file_name || run.run_id;
      const ext = fileExt(filename);
      const active = state.run?.run_id === run.run_id ? ' aria-current="true"' : '';
      return `<div class="report-row" data-run-id="${esc(run.run_id)}"${active}>
        <div class="file-type ${esc(ext)}">${esc(ext === 'xlsx' || ext === 'xls' ? 'XLS' : 'CSV')}</div>
        <div class="report-copy"><strong>${esc(filename)}</strong><span>${esc(formatDate(run.created_at))} · ${count(run, 'total')} work orders</span></div>
        <span class="status ${statusClass(run.status)}">${esc(run.status || 'UNKNOWN')}</span>
        <button class="report-open" type="button" data-run-id="${esc(run.run_id)}" aria-label="Open ${esc(filename)}">›</button>
      </div>`;
    }).join('');
    document.querySelectorAll('.report-row').forEach((row) => row.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      loadRun(row.dataset.runId, true);
    }));
    document.querySelectorAll('.report-open').forEach((button) => button.addEventListener('click', () => loadRun(button.dataset.runId, true)));
  }

  function normalizeRun(payload) { return payload.run || payload.result || payload; }
  function normalizeResults(payload) { return payload.results || payload.rows || payload.data || []; }

  function updateStatusOptions() {
    const select = $('status-filter');
    const current = select.value;
    const statuses = [...new Set(state.results.map((row) => String(row.status || '').trim()).filter(Boolean))].sort();
    select.innerHTML = '<option value="All">All Statuses</option>' + statuses.map((status) => `<option value="${esc(status)}">${esc(status)}</option>`).join('');
    select.value = statuses.includes(current) ? current : 'All';
  }

  function renderSummary() {
    const run = state.run;
    const total = count(run, 'total');
    $('count-analyzed').textContent = total.toLocaleString();
    ['green', 'yellow', 'amber', 'red'].forEach((grade) => {
      const value = count(run, grade);
      $(`count-${grade}`).textContent = value.toLocaleString();
      $(`pct-${grade}`).textContent = total ? `${((value / total) * 100).toFixed(1)}%` : '0%';
    });
  }

  function renderDetail() {
    const run = state.run;
    if (!run) return;
    $('detail-title').textContent = run.filename || run.file_name || run.run_id;
    $('detail-meta').textContent = [run.run_id, run.source, formatDate(run.created_at), run.rule_version, `${run.mapping_confidence ?? '—'}% mapping confidence`].filter(Boolean).join(' · ');
    updateStatusOptions();
    renderSummary();
    renderResults();
    renderRuns();
  }

  function filteredResults() {
    const query = $('search').value.trim().toLowerCase();
    const type = $('type-filter').value;
    const status = $('status-filter').value;
    const grade = state.activeGrade !== 'All' ? state.activeGrade : $('grade-filter').value;
    return state.results.filter((row) => {
      const blob = [row.wo_number, row.work_type, row.status, row.location, row.category, row.action, row.original_problem, row.worklog, ...(row.keyword_hits || []), ...(row.matched_rule_ids || [])].join(' ').toLowerCase();
      return (!query || blob.includes(query)) && (type === 'All' || row.work_type === type) && (status === 'All' || row.status === status) && (grade === 'All' || row.grade === grade);
    });
  }

  function renderPagination(totalRows) {
    const pages = Math.max(1, Math.ceil(totalRows / state.pageSize));
    if (state.page > pages) state.page = pages;
    if (pages <= 1) { $('pagination').innerHTML = ''; return; }
    const visible = [];
    const start = Math.max(1, Math.min(state.page - 2, pages - 4));
    for (let page = start; page <= Math.min(pages, start + 4); page += 1) visible.push(page);
    $('pagination').innerHTML = `<button class="page-button" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>‹</button>` + visible.map((page) => `<button class="page-button ${page === state.page ? 'active' : ''}" data-page="${page}">${page}</button>`).join('') + (pages > visible[visible.length - 1] ? `<span>… ${pages}</span>` : '') + `<button class="page-button" data-page="${state.page + 1}" ${state.page === pages ? 'disabled' : ''}>›</button>`;
    document.querySelectorAll('.page-button[data-page]').forEach((button) => button.addEventListener('click', () => {
      if (button.disabled) return;
      state.page = Number(button.dataset.page);
      renderResults();
    }));
  }

  function renderResults() {
    const rows = filteredResults();
    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);
    $('results-empty').classList.toggle('hidden', Boolean(pageRows.length));
    $('results-table').innerHTML = pageRows.map((row) => {
      const selected = Number(row.row_number) === Number(state.selectedRow);
      const rule = (row.matched_rule_ids || []).join(', ') || row.reason_code || 'No issues';
      return `<tr class="${selected ? 'selected' : ''}"><td><input class="row-check" type="checkbox" ${selected ? 'checked' : ''} tabindex="-1" aria-hidden="true" /></td><td><strong>${esc(row.wo_number)}</strong></td><td>${esc(row.work_type || '—')}</td><td>${esc(row.status || '—')}</td><td><span class="grade ${esc(row.grade)}">${esc(row.grade || '—')}</span></td><td>${esc(rule)}</td><td>${esc(row.action || '—')}</td><td><button class="button ghost row-action view-wo" type="button" data-row="${Number(row.row_number)}">View&nbsp; ›</button></td></tr>`;
    }).join('');
    $('results-count').textContent = rows.length ? `Showing ${start + 1}–${Math.min(start + state.pageSize, rows.length)} of ${rows.length.toLocaleString()} work orders` : 'Showing 0 work orders';
    renderPagination(rows.length);
    document.querySelectorAll('.view-wo').forEach((button) => button.addEventListener('click', () => showWorkOrder(Number(button.dataset.row))));
  }

  function clearWorkOrder() {
    state.selectedRow = null;
    $('wo-content').classList.add('hidden');
    $('wo-empty').classList.remove('hidden');
    renderResults();
  }

  function showWorkOrder(rowNumber) {
    const row = state.results.find((item) => Number(item.row_number) === rowNumber);
    if (!row) return;
    state.selectedRow = rowNumber;
    $('wo-empty').classList.add('hidden');
    $('wo-content').classList.remove('hidden');
    $('wo-grade').className = `grade large ${row.grade || ''}`;
    $('wo-grade').textContent = row.grade || '—';
    $('wo-title').textContent = `WO ${row.wo_number || ''}`;
    $('wo-meta').textContent = row.category || [row.work_type, row.status].filter(Boolean).join(' · ');
    $('wo-status').textContent = row.status || '—';
    $('wo-type').textContent = row.work_type || '—';
    $('wo-location').textContent = row.location || '—';
    $('wo-contractor').textContent = row.contractor || '—';
    $('wo-problem').textContent = row.original_problem || 'Not mapped / not available';
    $('wo-worklog').textContent = row.worklog || 'Not available';
    $('wo-rules').textContent = (row.matched_rule_ids || []).join(', ') || 'No rule breaches';
    $('wo-keywords').textContent = (row.keyword_hits || []).join(', ') || 'No keyword hits';
    $('wo-action').textContent = row.action || 'None';
    $('wo-checks').textContent = [...(row.reasons || []), ...(row.warnings || []), row.relation?.state ? `Relationship: ${row.relation.state}` : ''].filter(Boolean).join('\n') || 'No further action required.';
    renderResults();
  }

  function exportResults() {
    if (!state.results.length) return;
    const fields = ['wo_number', 'work_type', 'status', 'location', 'grade', 'category', 'action', 'reason_code', 'keyword_hits', 'matched_rule_ids', 'reasons', 'warnings', 'original_problem', 'worklog'];
    const quote = (value) => `"${String(Array.isArray(value) ? value.join(' | ') : value ?? '').replaceAll('"', '""')}"`;
    const lines = [fields.join(',')];
    state.results.forEach((row) => lines.push(fields.map((field) => quote(row[field])).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `RKH_Assurance_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function loadRuns(retry = true) {
    $('report-list').innerHTML = '<div class="loading-state"><span class="loading-spinner" aria-hidden="true"></span><span>Loading recent reports...</span></div>';
    try {
      state.runs = (await request(endpoints.listRuns)).runs || [];
      $('connection-note').textContent = '';
      renderRuns();
      if (!state.run) {
        const latest = state.runs.find((run) => String(run.status).toUpperCase() === 'COMPLETED');
        if (latest) await loadRun(latest.run_id, false);
      }
      if (!state.runs.length && retry) setTimeout(() => loadRuns(false), 700);
    } catch (error) {
      $('connection-note').textContent = `Backend connection unavailable: ${error.message}.`;
      renderRuns();
    }
  }

  async function loadRun(runId, scroll = true) {
    try {
      const runPayload = await request(endpoints.getRun, {}, { run_id: runId });
      state.run = normalizeRun(runPayload);
      const status = String(state.run.status || '').toUpperCase();
      if (status === 'COMPLETED') state.results = normalizeResults(await request(endpoints.getResults, {}, { run_id: runId }));
      else state.results = [];
      state.activeGrade = 'All';
      state.page = 1;
      state.selectedRow = null;
      $('grade-filter').value = 'All';
      $('type-filter').value = 'All';
      $('search').value = '';
      setStep(status === 'COMPLETED' ? 4 : status === 'ANALYZING' ? 3 : 2);
      progress(status === 'COMPLETED' ? 'Report ready' : 'Report processing', status || 'Processing', status === 'COMPLETED' ? 'Analysis completed. Review the work orders below.' : 'This report is still being processed.', status === 'COMPLETED' ? 100 : status === 'ANALYZING' ? 72 : 40);
      renderDetail();
      if (state.results.length) showWorkOrder(Number(state.results[0].row_number)); else clearWorkOrder();
      if (scroll) $('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { showError(error.message); }
  }

  async function pollRun(runId, started) {
    while (Date.now() - started < (config.pollTimeoutMs || 600000)) {
      const payload = normalizeRun(await request(endpoints.getRun, {}, { run_id: runId }));
      state.run = payload;
      const status = String(payload.status || '').toUpperCase();
      if (status === 'COMPLETED') {
        progress('Report ready', 'Completed', 'Analysis completed. Review the work orders below.', 100);
        setStep(4);
        state.results = normalizeResults(await request(endpoints.getResults, {}, { run_id: runId }));
        state.runs = [payload, ...state.runs.filter((run) => run.run_id !== runId)];
        state.page = 1;
        state.selectedRow = null;
        renderDetail();
        if (state.results.length) showWorkOrder(Number(state.results[0].row_number));
        $('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (status === 'FAILED' || status === 'QUARANTINED') throw new Error(payload.error_message || `Run ${status.toLowerCase()}.`);
      const analyzing = status === 'ANALYZING';
      progress(analyzing ? 'Analyzing your report' : 'Preparing your report', status || 'Processing', analyzing ? 'Applying the PM/CM assurance rules...' : 'Validating the source and preparing work-order records...', analyzing ? 72 : 40);
      setStep(analyzing ? 3 : 2);
      await new Promise((resolve) => setTimeout(resolve, config.pollMs || 1500));
    }
    throw new Error('The run did not finish before the polling timeout. Check Recent Reports.');
  }

  async function upload(file) {
    clearError();
    if (!file) return;
    const extension = file.name.toLowerCase().split('.').pop();
    if (!['csv', 'xlsx', 'xls'].includes(extension)) { showError('Choose a CSV or XLSX report.'); return; }
    if (file.size > 25_000_000) { showError('The selected file exceeds the 25 MB upload limit.'); return; }
    setStep(1);
    progress('Uploading your report', 'Uploading', 'Sending the source file to the assurance service...', 18);
    const form = new FormData();
    form.append('data', file, file.name);
    try {
      const payload = await request(endpoints.upload, { method: 'POST', body: form });
      const runId = payload.run_id || payload.run?.run_id;
      if (!runId) throw new Error('The upload response did not include a Run ID.');
      progress('Preparing your report', 'Received', `Run ${runId} created.`, 32);
      await pollRun(runId, Date.now());
    } catch (error) {
      progress('Report run needs attention', 'Failed', error.message, 100);
      setStep(1);
      showError(error.message);
      await loadRuns();
    }
  }

  function resetFilters() {
    $('search').value = '';
    $('type-filter').value = 'All';
    $('status-filter').value = 'All';
    $('grade-filter').value = 'All';
    state.activeGrade = 'All';
    state.page = 1;
    renderResults();
  }

  initTheme();
  $('theme-toggle').addEventListener('click', toggleTheme);
  $('sidebar-theme').addEventListener('click', toggleTheme);
  $('choose-file').addEventListener('click', (event) => { event.stopPropagation(); $('file-input').click(); });
  $('file-input').addEventListener('change', () => upload($('file-input').files[0]));
  $('drop-zone').addEventListener('click', (event) => { if (!event.target.closest('button')) $('file-input').click(); });
  $('drop-zone').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('file-input').click(); } });
  $('drop-zone').addEventListener('dragover', (event) => { event.preventDefault(); $('drop-zone').classList.add('active'); });
  $('drop-zone').addEventListener('dragleave', () => $('drop-zone').classList.remove('active'));
  $('drop-zone').addEventListener('drop', (event) => { event.preventDefault(); $('drop-zone').classList.remove('active'); upload(event.dataTransfer.files[0]); });
  $('refresh-runs').addEventListener('click', () => loadRuns(false));
  $('detail-export').addEventListener('click', exportResults);
  $('close-wo').addEventListener('click', clearWorkOrder);
  $('search').addEventListener('input', () => { state.page = 1; renderResults(); });
  $('type-filter').addEventListener('change', () => { state.page = 1; renderResults(); });
  $('status-filter').addEventListener('change', () => { state.page = 1; renderResults(); });
  $('grade-filter').addEventListener('change', () => { state.activeGrade = 'All'; state.page = 1; renderResults(); });
  $('reset-filters').addEventListener('click', resetFilters);
  document.querySelectorAll('.summary-card').forEach((card) => card.addEventListener('click', () => { state.activeGrade = state.activeGrade === card.dataset.filter ? 'All' : card.dataset.filter; $('grade-filter').value = 'All'; state.page = 1; renderResults(); }));
  loadRuns();
})();
