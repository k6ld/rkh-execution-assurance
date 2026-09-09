window.RKH_CONFIG = window.RKH_CONFIG || {
  // The production reverse proxy and the localhost pilot both serve the UI and
  // API from one internal origin. Never put an n8n URL, credential, or secret
  // in this public browser configuration.
  apiBaseUrl: window.location.origin,
  endpoints: {
    upload: '/api/runs',
    listRuns: '/api/runs',
    getRun: '/api/run',
    getResults: '/api/results'
  },
  pollMs: 1500,
  pollTimeoutMs: 10 * 60 * 1000
};
