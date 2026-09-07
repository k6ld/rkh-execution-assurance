(() => {
  const config = window.RKH_CONFIG || {};
  const base = String(config.apiBaseUrl || '').replace(/\/$/, '');
  const endpoints = config.endpoints || {};
  const $ = (id) => document.getElementById(id);
  const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const severity = { Red: 5, Amber: 4, Yellow: 3, Green: 2, Excluded: 1 };
  const viewMeta = {
    dashboard: ['Execution Assurance', 'Work order review for MAXIMO / MMS'],
    'work-orders': ['Work Orders', 'Triage, inspect and action analyzed maintenance work orders'],
    reports: ['Reports', 'Assurance run history, status and result distribution'],
    rules: ['Rules', 'Understand how assurance results and required actions are interpreted']
  };
  const state = {
    runs: [],
    run: null,
    results: [],
    resultsCache: new Map(),
    currentView: 'dashboard',
    wo: { query: '', type: 'All', status: 'All', grade: 'All', sort: 'severity', page: 1, pageSize: 25, selectedRow: null },
    reports: { query: '', status: 'All', source: 'All' },
    uploading: false
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const count = (run, key) => Number(key === 'total' ? (run?.total_rows ?? run?.total ?? 0) : (run?.[`${key}_count`] ?? run?.[key] ?? 0));
  const fileExt = (name) => String(name || '').split('.').pop().toLowerCase();
  const statusClass = (status) => String(status || '').toUpperCase() === 'COMPLETED' ? 'completed' : String(status || '').toUpperCase() === 'FAILED' ? 'failed' : 'processing';
  const normalizeRun = (payload) => payload?.run || payload?.result || payload || {};
  const normalizeResults = (payload) => payload?.results || payload?.rows || payload?.data || [];
  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : dateFormatter.format(date);
  };
  const debounce = (fn, wait = 140) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; };
  const apiUrl = (path, query = {}) => {
    const url = new URL(`${base}${path}`);
    Object.entries(query).forEach(([key, value]) => value != null && url.searchParams.set(key, value));
    return url.toString();
  };

  async function request(path, options = {}, query = {}) {
    if (!base) throw new Error('API base URL is not configured.');
    const response = await fetch(apiUrl(path, query), { cache: 'no-store', ...options });
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

  function setServiceHealth(status, label) {
    const el = $('service-health');
    el.className = `service-health ${status || ''}`;
    el.querySelector('b').textContent = label;
  }

  function toast(title, message, type = 'info', timeout = 3600) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';
    $('toast-region').insertAdjacentHTML('beforeend', `<div class="toast ${esc(type)}" id="${id}"><div class="toast-icon">${icon}</div><div><strong>${esc(title)}</strong><p>${esc(message)}</p></div><button type="button" aria-label="Dismiss">×</button></div>`);
    const el = $(id);
    el.querySelector('button').addEventListener('click', () => el.remove());
    if (timeout) setTimeout(() => el?.remove(), timeout);
  }

  function closeSidebar() {
    $('sidebar').classList.remove('open');
    $('sidebar-backdrop').classList.remove('open');
  }
  function openSidebar() {
    $('sidebar').classList.add('open');
    $('sidebar-backdrop').classList.add('open');
  }

  function setView(name, options = {}) {
    if (!viewMeta[name]) return;
    state.currentView = name;
    document.querySelectorAll('.app-view').forEach((view) => view.classList.toggle('active', view.dataset.view === name));
    document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === name));
    $('page-title').textContent = viewMeta[name][0];
    $('page-subtitle').textContent = viewMeta[name][1];
    closeSidebar();
    if (!options.keepScroll) $('main-content').scrollTo({ top: 0, behavior: 'instant' });
    if (name === 'work-orders') renderWorkOrdersPage();
    if (name === 'reports') renderReportsPage();
    if (name === 'rules' && state.run?.rule_version) $('rules-version').textContent = state.run.rule_version;
  }

  function setStep(number) {
    document.querySelectorAll('.step').forEach((step) => {
      const value = Number(step.dataset.step);
      step.classList.toggle('active', value === number);
      step.classList.toggle('done', value < number);
    });
  }
  function progress(title, status, message, value) {
    const complete = value >= 100 || status === 'Completed' || status === 'Failed';
    $('progress-area').classList.toggle('complete', complete && status !== 'Failed');
    $('progress-spinner').classList.toggle('hidden', complete || status === 'Waiting');
    $('progress-title').textContent = title;
    $('progress-status').textContent = status;
    $('progress-message').textContent = message;
    $('progress-bar').style.width = `${Math.max(0, Math.min(100, value))}%`;
  }
  function showUploadError(message) { $('upload-error').textContent = message; $('upload-error').classList.remove('hidden'); }
  function clearUploadError() { $('upload-error').classList.add('hidden'); $('upload-error').textContent = ''; }

  function mergeRun(run) {
    const index = state.runs.findIndex((item) => item.run_id === run.run_id);
    if (index >= 0) state.runs[index] = { ...state.runs[index], ...run };
    else state.runs.unshift(run);
    state.runs.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  function renderRecentReports() {
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
        <div class="report-copy"><strong title="${esc(filename)}">${esc(filename)}</strong><span>${esc(formatDate(run.created_at))} · ${count(run, 'total').toLocaleString()} work orders</span></div>
        <span class="status ${statusClass(run.status)}">${esc(run.status || 'UNKNOWN')}</span>
        <button class="report-open" type="button" data-run-id="${esc(run.run_id)}" aria-label="Open ${esc(filename)}">›</button>
      </div>`;
    }).join('');
  }

  function renderDashboardSummary() {
    const run = state.run;
    const total = count(run, 'total');
    $('count-analyzed').textContent = total.toLocaleString();
    ['green', 'yellow', 'amber', 'red'].forEach((grade) => {
      const value = count(run, grade);
      $(`count-${grade}`).textContent = value.toLocaleString();
      $(`pct-${grade}`).textContent = total ? `${((value / total) * 100).toFixed(1)}%` : '0%';
    });
  }

  function distributionHtml(run) {
    const total = Math.max(1, count(run, 'total'));
    const values = ['green', 'yellow', 'amber', 'red'].map((key) => ({ key, value: count(run, key) }));
    return `<div class="distribution" aria-label="Assurance distribution">${values.map(({ key, value }) => `<i class="${key[0]}" style="width:${(value / total) * 100}%"></i>`).join('')}</div><div class="distribution-labels"><span>G ${count(run, 'green').toLocaleString()}</span><span>Y ${count(run, 'yellow').toLocaleString()}</span><span>A ${count(run, 'amber').toLocaleString()}</span><span>R ${count(run, 'red').toLocaleString()}</span></div>`;
  }

  function renderDashboardInsight() {
    const panel = $('dashboard-insight');
    const run = state.run;
    if (!run) {
      panel.innerHTML = '<div class="insight-empty"><div class="insight-icon"><svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h16M8 15l3-3 3 2 5-7"/></svg></div><h2>Run Overview</h2><p>Select a completed report to see its assurance distribution and analysis details.</p></div>';
      return;
    }
    const attention = count(run, 'yellow') + count(run, 'amber') + count(run, 'red');
    panel.innerHTML = `<div class="insight-run"><span class="section-kicker">Selected report</span><h3>${esc(run.filename || run.run_id)}</h3><p>${esc(formatDate(run.created_at))}</p>${distributionHtml(run)}<div class="insight-facts"><div><span>Work orders</span><strong>${count(run, 'total').toLocaleString()}</strong></div><div><span>Attention items</span><strong>${attention.toLocaleString()}</strong></div><div><span>Mapping confidence</span><strong>${run.mapping_confidence ?? '—'}%</strong></div><div><span>Source</span><strong>${esc(run.source || '—')}</strong></div><div><span>Rule version</span><strong>${esc(run.rule_version || '—')}</strong></div></div></div>`;
  }

  function renderDashboardPreview() {
    const tbody = $('dashboard-results-table');
    const empty = $('dashboard-results-empty');
    if (!state.run || String(state.run.status || '').toUpperCase() !== 'COMPLETED' || !state.results.length) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      empty.textContent = state.run ? 'Loading work-order results…' : 'No completed report selected.';
      $('dashboard-review-meta').textContent = state.run ? `Preparing ${state.run.filename || state.run.run_id}` : 'Select a completed report to review its highest-priority work orders.';
      return;
    }
    const sorted = [...state.results].sort((a, b) => (severity[b.grade] || 0) - (severity[a.grade] || 0) || String(a.wo_number || '').localeCompare(String(b.wo_number || ''))).slice(0, 7);
    $('dashboard-review-meta').textContent = `${state.run.filename || state.run.run_id} · Highest-priority items first`;
    empty.classList.toggle('hidden', Boolean(sorted.length));
    tbody.innerHTML = sorted.map((row) => `<tr><td><strong>${esc(row.wo_number || '—')}</strong></td><td>${esc(row.work_type || '—')}</td><td>${esc(row.status || '—')}</td><td><span class="grade ${esc(row.grade || '')}">${esc(row.grade || '—')}</span></td><td>${esc(row.category || row.reason_code || '—')}</td><td>${esc(row.action || '—')}</td><td><button class="button ghost row-action dashboard-review" type="button" data-row="${Number(row.row_number)}">Review ›</button></td></tr>`).join('');
  }

  function renderDashboard() {
    renderRecentReports();
    renderDashboardSummary();
    renderDashboardInsight();
    renderDashboardPreview();
  }

  function populateRunSelectors() {
    const completed = state.runs.filter((run) => String(run.status || '').toUpperCase() === 'COMPLETED');
    $('wo-report-select').innerHTML = completed.length ? completed.map((run) => `<option value="${esc(run.run_id)}">${esc(run.filename || run.run_id)}</option>`).join('') : '<option value="">No completed reports</option>';
    if (state.run && completed.some((run) => run.run_id === state.run.run_id)) $('wo-report-select').value = state.run.run_id;
  }

  function updateWorkOrderStatusOptions() {
    const select = $('wo-status-filter');
    const current = state.wo.status;
    const statuses = [...new Set(state.results.map((row) => String(row.status || '').trim()).filter(Boolean))].sort();
    select.innerHTML = '<option value="All">All statuses</option>' + statuses.map((status) => `<option value="${esc(status)}">${esc(status)}</option>`).join('');
    state.wo.status = statuses.includes(current) ? current : 'All';
    select.value = state.wo.status;
  }

  function renderWorkOrderKpis() {
    const run = state.run;
    $('wo-kpi-total').textContent = count(run, 'total').toLocaleString();
    ['green', 'yellow', 'amber', 'red', 'excluded'].forEach((grade) => $(`wo-kpi-${grade}`).textContent = count(run, grade).toLocaleString());
    document.querySelectorAll('[data-wo-grade]').forEach((card) => card.classList.toggle('active', card.dataset.woGrade === state.wo.grade));
  }

  function filteredWorkOrders() {
    const query = state.wo.query.toLowerCase();
    const rows = state.results.filter((row) => {
      const blob = [row.wo_number, row.work_type, row.status, row.location, row.category, row.action, row.reason_code, row.original_problem, row.worklog, ...(row.keyword_hits || []), ...(row.matched_rule_ids || [])].join(' ').toLowerCase();
      return (!query || blob.includes(query)) && (state.wo.type === 'All' || row.work_type === state.wo.type) && (state.wo.status === 'All' || row.status === state.wo.status) && (state.wo.grade === 'All' || row.grade === state.wo.grade);
    });
    if (state.wo.sort === 'severity') rows.sort((a, b) => (severity[b.grade] || 0) - (severity[a.grade] || 0) || String(a.wo_number || '').localeCompare(String(b.wo_number || '')));
    if (state.wo.sort === 'wo') rows.sort((a, b) => String(a.wo_number || '').localeCompare(String(b.wo_number || ''), undefined, { numeric: true }));
    if (state.wo.sort === 'status') rows.sort((a, b) => String(a.status || '').localeCompare(String(b.status || '')) || String(a.wo_number || '').localeCompare(String(b.wo_number || '')));
    return rows;
  }

  function renderActiveWorkOrderFilters() {
    const chips = [];
    if (state.wo.grade !== 'All') chips.push(`Grade: ${state.wo.grade}`);
    if (state.wo.type !== 'All') chips.push(`Type: ${state.wo.type}`);
    if (state.wo.status !== 'All') chips.push(`Status: ${state.wo.status}`);
    if (state.wo.query) chips.push(`Search: ${state.wo.query}`);
    $('wo-active-filters').innerHTML = chips.length ? chips.map((chip) => `<span class="filter-chip">${esc(chip)}</span>`).join('') : '<span class="filter-chip">Showing all analyzed work orders</span>';
  }

  function renderWorkOrderPagination(totalRows) {
    const pages = Math.max(1, Math.ceil(totalRows / state.wo.pageSize));
    state.wo.page = Math.min(state.wo.page, pages);
    if (pages <= 1) { $('wo-pagination').innerHTML = ''; return; }
    const visible = [];
    const start = Math.max(1, Math.min(state.wo.page - 2, Math.max(1, pages - 4)));
    for (let page = start; page <= Math.min(pages, start + 4); page += 1) visible.push(page);
    $('wo-pagination').innerHTML = `<button class="page-button" data-page="${state.wo.page - 1}" ${state.wo.page === 1 ? 'disabled' : ''}>‹</button>${visible.map((page) => `<button class="page-button ${page === state.wo.page ? 'active' : ''}" data-page="${page}">${page}</button>`).join('')}${pages > visible[visible.length - 1] ? `<span>… ${pages}</span>` : ''}<button class="page-button" data-page="${state.wo.page + 1}" ${state.wo.page === pages ? 'disabled' : ''}>›</button>`;
  }

  function renderWorkOrderTable() {
    renderActiveWorkOrderFilters();
    const rows = filteredWorkOrders();
    const start = (state.wo.page - 1) * state.wo.pageSize;
    const pageRows = rows.slice(start, start + state.wo.pageSize);
    $('wo-results-empty').classList.toggle('hidden', Boolean(pageRows.length));
    $('wo-results-table').innerHTML = pageRows.map((row) => {
      const selected = Number(row.row_number) === Number(state.wo.selectedRow);
      const rule = (row.matched_rule_ids || []).join(', ') || row.reason_code || 'No issues';
      return `<tr class="${selected ? 'selected' : ''}" data-row="${Number(row.row_number)}"><td><strong>${esc(row.wo_number || '—')}</strong></td><td>${esc(row.work_type || '—')}</td><td>${esc(row.status || '—')}</td><td>${esc(row.location || '—')}</td><td><span class="grade ${esc(row.grade || '')}">${esc(row.grade || '—')}</span></td><td>${esc(rule)}</td><td>${esc(row.action || '—')}</td><td><button class="button ghost row-action wo-view" type="button" data-row="${Number(row.row_number)}">View ›</button></td></tr>`;
    }).join('');
    $('wo-results-count').textContent = rows.length ? `Showing ${(start + 1).toLocaleString()}–${Math.min(start + state.wo.pageSize, rows.length).toLocaleString()} of ${rows.length.toLocaleString()} work orders` : '0 work orders';
    renderWorkOrderPagination(rows.length);
  }

  function clearWorkOrderPageDetail() {
    state.wo.selectedRow = null;
    $('wo-page-content').classList.add('hidden');
    $('wo-page-empty').classList.remove('hidden');
    renderWorkOrderTable();
  }

  function showWorkOrderPageDetail(rowNumber) {
    const row = state.results.find((item) => Number(item.row_number) === Number(rowNumber));
    if (!row) return;
    state.wo.selectedRow = Number(rowNumber);
    $('wo-page-empty').classList.add('hidden');
    $('wo-page-content').classList.remove('hidden');
    $('wo-page-grade').className = `grade large ${row.grade || ''}`;
    $('wo-page-grade').textContent = row.grade || '—';
    $('wo-page-title').textContent = `WO ${row.wo_number || ''}`;
    $('wo-page-category').textContent = row.category || 'Assurance result';
    $('wo-page-status').textContent = row.status || '—';
    $('wo-page-type').textContent = row.work_type || '—';
    $('wo-page-location').textContent = row.location || '—';
    $('wo-page-contractor').textContent = row.contractor || '—';
    $('wo-page-rules').textContent = (row.matched_rule_ids || []).join(', ') || 'No rule breaches';
    $('wo-page-keywords').textContent = (row.keyword_hits || []).join(', ') || 'No keyword hits';
    $('wo-page-problem').textContent = row.original_problem || 'Not mapped / not available';
    $('wo-page-worklog').textContent = row.worklog || 'Not available';
    $('wo-page-action').textContent = row.action || 'None';
    $('wo-page-checks').textContent = [...(row.reasons || []), ...(row.warnings || []), row.relation?.state ? `Relationship: ${row.relation.state}` : ''].filter(Boolean).join('\n') || 'No further action required.';
    renderWorkOrderTable();
  }

  function renderWorkOrdersPage() {
    populateRunSelectors();
    renderWorkOrderKpis();
    updateWorkOrderStatusOptions();
    $('wo-search').value = state.wo.query;
    $('wo-type-filter').value = state.wo.type;
    $('wo-status-filter').value = state.wo.status;
    $('wo-sort').value = state.wo.sort;
    $('wo-page-size').value = String(state.wo.pageSize);
    renderWorkOrderTable();
  }

  function populateReportSourceFilter() {
    const select = $('reports-source-filter');
    const sources = [...new Set(state.runs.map((run) => String(run.source || '').trim()).filter(Boolean))].sort();
    select.innerHTML = '<option value="All">All sources</option>' + sources.map((source) => `<option value="${esc(source)}">${esc(source.replaceAll('_', ' '))}</option>`).join('');
    if (!sources.includes(state.reports.source)) state.reports.source = 'All';
    select.value = state.reports.source;
  }

  function renderReportKpis() {
    const completed = state.runs.filter((run) => String(run.status || '').toUpperCase() === 'COMPLETED');
    const totalWos = completed.reduce((sum, run) => sum + count(run, 'total'), 0);
    const attention = completed.reduce((sum, run) => sum + count(run, 'yellow') + count(run, 'amber') + count(run, 'red'), 0);
    $('reports-total').textContent = state.runs.length.toLocaleString();
    $('reports-completed').textContent = completed.length.toLocaleString();
    $('reports-workorders').textContent = totalWos.toLocaleString();
    $('reports-attention').textContent = attention.toLocaleString();
  }

  function filteredReports() {
    const query = state.reports.query.toLowerCase();
    return state.runs.filter((run) => {
      const status = String(run.status || '').toUpperCase();
      const coarseStatus = status === 'COMPLETED' ? 'COMPLETED' : status === 'FAILED' ? 'FAILED' : 'PROCESSING';
      const blob = `${run.filename || ''} ${run.run_id || ''}`.toLowerCase();
      return (!query || blob.includes(query)) && (state.reports.status === 'All' || coarseStatus === state.reports.status) && (state.reports.source === 'All' || run.source === state.reports.source);
    });
  }

  function renderReportsTable() {
    const rows = filteredReports();
    $('reports-empty').classList.toggle('hidden', Boolean(rows.length));
    $('reports-table-body').innerHTML = rows.map((run) => {
      const status = String(run.status || '').toUpperCase();
      const ready = status === 'COMPLETED';
      const mapping = Number(run.mapping_confidence || 0);
      return `<tr><td class="report-name-cell"><strong title="${esc(run.filename || run.run_id)}">${esc(run.filename || run.run_id)}</strong><small>${esc(run.run_id)}</small></td><td><span class="source-pill">${esc(String(run.source || '—').replaceAll('_', ' '))}</span></td><td>${esc(formatDate(run.created_at))}</td><td><span class="status ${statusClass(status)}">${esc(status || 'UNKNOWN')}</span></td><td>${count(run, 'total').toLocaleString()}</td><td class="distribution-cell">${distributionHtml(run)}</td><td><span class="mapping-badge ${mapping && mapping < 70 ? 'low' : ''}">${mapping || '—'}%</span></td><td><button class="button ghost report-review" type="button" data-run-id="${esc(run.run_id)}" ${ready ? '' : 'disabled'}>${ready ? 'Open review' : 'Processing'}</button></td></tr>`;
    }).join('');
  }

  function renderReportsPage() {
    populateReportSourceFilter();
    renderReportKpis();
    $('reports-search').value = state.reports.query;
    $('reports-status-filter').value = state.reports.status;
    renderReportsTable();
  }

  function selectRunMetadata(run) {
    state.run = run || null;
    renderDashboard();
    populateRunSelectors();
    renderWorkOrderKpis();
    if (run?.rule_version) $('rules-version').textContent = run.rule_version;
    if (!run) return;
    const status = String(run.status || '').toUpperCase();
    if (status === 'COMPLETED') {
      setStep(4);
      progress('Report ready', 'Completed', 'Analysis completed. Review the work orders below.', 100);
    } else if (status === 'ANALYZING') {
      setStep(3);
      progress('Analyzing report', 'Analyzing', 'Applying PM/CM assurance rules…', 72);
    } else {
      setStep(2);
      progress('Preparing report', status || 'Processing', 'Validating and preparing work-order records…', 40);
    }
  }

  async function ensureResults(runId, { showLoading = false } = {}) {
    if (!runId) return [];
    if (state.resultsCache.has(runId)) return state.resultsCache.get(runId);
    if (showLoading) $('wo-table-loading').classList.remove('hidden');
    try {
      const payload = await request(endpoints.getResults, {}, { run_id: runId });
      const rows = normalizeResults(payload);
      state.resultsCache.set(runId, rows);
      return rows;
    } finally {
      $('wo-table-loading').classList.add('hidden');
    }
  }

  function resetWorkOrderFilters() {
    state.wo = { ...state.wo, query: '', type: 'All', status: 'All', grade: 'All', sort: 'severity', page: 1, selectedRow: null };
  }

  async function loadRun(runId, { navigate = false, showLoading = false } = {}) {
    try {
      let run = state.runs.find((item) => item.run_id === runId);
      if (!run) run = normalizeRun(await request(endpoints.getRun, {}, { run_id: runId }));
      selectRunMetadata(run);
      state.results = [];
      resetWorkOrderFilters();
      if (String(run.status || '').toUpperCase() === 'COMPLETED') {
        state.results = await ensureResults(runId, { showLoading });
      }
      renderDashboard();
      renderWorkOrdersPage();
      if (navigate) setView('work-orders');
      return run;
    } catch (error) {
      toast('Unable to open report', error.message, 'error');
      throw error;
    }
  }

  async function loadRuns({ initial = false, notify = false } = {}) {
    if (initial) setServiceHealth('', 'Connecting');
    try {
      const payload = await request(endpoints.listRuns);
      state.runs = payload.runs || [];
      state.runs.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      setServiceHealth('online', 'Live');
      $('connection-note').textContent = '';
      renderRecentReports();
      renderReportsPage();
      populateRunSelectors();
      if (!state.run) {
        const latest = state.runs.find((run) => String(run.status || '').toUpperCase() === 'COMPLETED') || state.runs[0];
        if (latest) {
          selectRunMetadata(latest);
          if (String(latest.status || '').toUpperCase() === 'COMPLETED') {
            setTimeout(async () => {
              try {
                state.results = await ensureResults(latest.run_id);
                if (state.run?.run_id === latest.run_id) {
                  renderDashboard();
                  renderWorkOrdersPage();
                }
              } catch (error) { toast('Results unavailable', error.message, 'error'); }
            }, 0);
          }
        } else {
          selectRunMetadata(null);
        }
      } else {
        const updated = state.runs.find((run) => run.run_id === state.run.run_id);
        if (updated) state.run = updated;
        renderDashboard();
        renderWorkOrdersPage();
      }
      if (notify) toast('Reports refreshed', `${state.runs.length} run${state.runs.length === 1 ? '' : 's'} available.`, 'success');
    } catch (error) {
      setServiceHealth('error', 'Offline');
      $('connection-note').textContent = `Backend unavailable: ${error.message}`;
      renderRecentReports();
      if (initial) toast('Connection unavailable', 'The dashboard could not reach the assurance service.', 'error', 5000);
    } finally {
      if (initial) setTimeout(() => $('app-loader').classList.add('hidden'), 180);
    }
  }

  async function pollRun(runId, started) {
    while (Date.now() - started < (config.pollTimeoutMs || 600000)) {
      const run = normalizeRun(await request(endpoints.getRun, {}, { run_id: runId }));
      mergeRun(run);
      selectRunMetadata(run);
      renderReportsPage();
      const status = String(run.status || '').toUpperCase();
      if (status === 'COMPLETED') {
        state.results = await ensureResults(runId);
        state.resultsCache.set(runId, state.results);
        renderDashboard();
        renderWorkOrdersPage();
        toast('Report ready', `${run.filename || run.run_id} is ready for review.`, 'success', 5000);
        $('dashboard-review-meta').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return run;
      }
      if (status === 'FAILED' || status === 'QUARANTINED') throw new Error(run.error_message || `Run ${status.toLowerCase()}.`);
      await new Promise((resolve) => setTimeout(resolve, config.pollMs || 1500));
    }
    throw new Error('The report did not finish before the polling timeout. It remains available in Reports.');
  }

  async function upload(file) {
    clearUploadError();
    if (!file || state.uploading) return;
    const extension = fileExt(file.name);
    if (!['csv', 'xlsx', 'xls'].includes(extension)) {
      showUploadError('Choose a CSV or XLSX report.');
      toast('Unsupported file', 'Use a CSV or XLSX MAXIMO / MMS report.', 'error');
      return;
    }
    if (file.size > 25_000_000) {
      showUploadError('This file is larger than the 25 MB upload limit.');
      toast('File too large', 'Choose a report smaller than 25 MB.', 'error');
      return;
    }
    state.uploading = true;
    $('drop-zone').classList.add('uploading');
    $('choose-file').disabled = true;
    setView('dashboard', { keepScroll: true });
    setStep(1);
    progress('Uploading report', 'Uploading', 'Securely sending the source file to the assurance service…', 18);
    const form = new FormData();
    form.append('data', file, file.name);
    try {
      const payload = await request(endpoints.upload, { method: 'POST', body: form });
      const runId = payload.run_id || payload.run?.run_id;
      if (!runId) throw new Error('The upload response did not include a Run ID.');
      progress('Preparing report', 'Received', `Run ${runId} created.`, 32);
      toast('Upload received', `${file.name} is being prepared.`, 'info');
      await pollRun(runId, Date.now());
      await loadRuns();
    } catch (error) {
      progress('Report needs attention', 'Failed', error.message, 100);
      setStep(1);
      showUploadError(error.message);
      toast('Upload failed', error.message, 'error', 6000);
      await loadRuns();
    } finally {
      state.uploading = false;
      $('drop-zone').classList.remove('uploading');
      $('choose-file').disabled = false;
      $('file-input').value = '';
    }
  }

  function exportRows(rows) {
    if (!rows.length) { toast('Nothing to export', 'No work orders match the current view.', 'info'); return; }
    const fields = ['wo_number', 'work_type', 'status', 'location', 'grade', 'category', 'action', 'reason_code', 'keyword_hits', 'matched_rule_ids', 'reasons', 'warnings', 'original_problem', 'worklog'];
    const quote = (value) => `"${String(Array.isArray(value) ? value.join(' | ') : value ?? '').replaceAll('"', '""')}"`;
    const lines = [fields.join(','), ...rows.map((row) => fields.map((field) => quote(row[field])).join(','))];
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const baseName = String(state.run?.filename || 'RKH_Assurance').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `${baseName}_assurance_results.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast('Export created', `${rows.length.toLocaleString()} work orders exported.`, 'success');
  }

  async function refreshCurrentRun() {
    if (!state.run?.run_id) return;
    try {
      const run = normalizeRun(await request(endpoints.getRun, {}, { run_id: state.run.run_id }));
      mergeRun(run);
      state.resultsCache.delete(run.run_id);
      await loadRun(run.run_id, { showLoading: true });
      toast('Report refreshed', 'Latest run metadata and results loaded.', 'success');
    } catch (error) { toast('Refresh failed', error.message, 'error'); }
  }

  function bindEvents() {
    initTheme();
    $('theme-toggle').addEventListener('click', toggleTheme);
    $('mobile-menu').addEventListener('click', openSidebar);
    $('sidebar-close').addEventListener('click', closeSidebar);
    $('sidebar-backdrop').addEventListener('click', closeSidebar);
    document.querySelectorAll('.nav-item[data-view]').forEach((item) => item.addEventListener('click', () => setView(item.dataset.view)));

    $('choose-file').addEventListener('click', (event) => { event.stopPropagation(); $('file-input').click(); });
    $('file-input').addEventListener('change', () => upload($('file-input').files[0]));
    $('drop-zone').addEventListener('click', (event) => { if (!event.target.closest('button')) $('file-input').click(); });
    $('drop-zone').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('file-input').click(); } });
    $('drop-zone').addEventListener('dragover', (event) => { event.preventDefault(); $('drop-zone').classList.add('active'); });
    $('drop-zone').addEventListener('dragleave', () => $('drop-zone').classList.remove('active'));
    $('drop-zone').addEventListener('drop', (event) => { event.preventDefault(); $('drop-zone').classList.remove('active'); upload(event.dataTransfer.files[0]); });

    $('report-list').addEventListener('click', (event) => {
      const row = event.target.closest('[data-run-id]');
      if (row) loadRun(row.dataset.runId);
    });
    $('view-all-reports').addEventListener('click', () => setView('reports'));
    $('open-full-work-orders').addEventListener('click', () => setView('work-orders'));
    $('dashboard-results-table').addEventListener('click', (event) => {
      const button = event.target.closest('.dashboard-review');
      if (!button) return;
      state.wo.selectedRow = Number(button.dataset.row);
      setView('work-orders');
      showWorkOrderPageDetail(state.wo.selectedRow);
    });
    document.querySelectorAll('.summary-card').forEach((card) => card.addEventListener('click', () => {
      state.wo.grade = card.dataset.filter;
      state.wo.page = 1;
      setView('work-orders');
    }));

    $('wo-report-select').addEventListener('change', () => loadRun($('wo-report-select').value, { showLoading: true }));
    $('wo-refresh').addEventListener('click', refreshCurrentRun);
    $('wo-export').addEventListener('click', () => exportRows(filteredWorkOrders()));
    document.querySelectorAll('[data-wo-grade]').forEach((card) => card.addEventListener('click', () => {
      state.wo.grade = card.dataset.woGrade;
      state.wo.page = 1;
      renderWorkOrdersPage();
    }));
    $('wo-search').addEventListener('input', debounce(() => { state.wo.query = $('wo-search').value.trim(); state.wo.page = 1; renderWorkOrderTable(); }, 120));
    $('wo-type-filter').addEventListener('change', () => { state.wo.type = $('wo-type-filter').value; state.wo.page = 1; renderWorkOrdersPage(); });
    $('wo-status-filter').addEventListener('change', () => { state.wo.status = $('wo-status-filter').value; state.wo.page = 1; renderWorkOrdersPage(); });
    $('wo-sort').addEventListener('change', () => { state.wo.sort = $('wo-sort').value; state.wo.page = 1; renderWorkOrderTable(); });
    $('wo-page-size').addEventListener('change', () => { state.wo.pageSize = Number($('wo-page-size').value); state.wo.page = 1; renderWorkOrderTable(); });
    $('wo-reset').addEventListener('click', () => { resetWorkOrderFilters(); renderWorkOrdersPage(); });
    $('wo-pagination').addEventListener('click', (event) => { const button = event.target.closest('[data-page]'); if (!button || button.disabled) return; state.wo.page = Number(button.dataset.page); renderWorkOrderTable(); });
    $('wo-results-table').addEventListener('click', (event) => { const row = event.target.closest('tr[data-row]'); if (row) showWorkOrderPageDetail(Number(row.dataset.row)); });
    $('wo-page-close').addEventListener('click', clearWorkOrderPageDetail);

    $('reports-refresh').addEventListener('click', () => loadRuns({ notify: true }));
    $('reports-upload').addEventListener('click', () => { setView('dashboard'); setTimeout(() => $('drop-zone').focus(), 80); });
    $('reports-search').addEventListener('input', debounce(() => { state.reports.query = $('reports-search').value.trim(); renderReportsTable(); }, 120));
    $('reports-status-filter').addEventListener('change', () => { state.reports.status = $('reports-status-filter').value; renderReportsTable(); });
    $('reports-source-filter').addEventListener('change', () => { state.reports.source = $('reports-source-filter').value; renderReportsTable(); });
    $('reports-reset').addEventListener('click', () => { state.reports = { query: '', status: 'All', source: 'All' }; renderReportsPage(); });
    $('reports-table-body').addEventListener('click', async (event) => { const button = event.target.closest('.report-review'); if (!button || button.disabled) return; await loadRun(button.dataset.runId, { navigate: true, showLoading: true }); });

    window.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeSidebar(); if (state.currentView === 'work-orders' && state.wo.selectedRow) clearWorkOrderPageDetail(); } });
  }

  async function init() {
    bindEvents();
    setView('dashboard');
    await loadRuns({ initial: true });
  }

  init();
})();
