window.RKH_CONFIG = window.RKH_CONFIG || {
  apiBaseUrl: 'http://localhost:5678',
  endpoints: {
    upload: '/webhook/rkh-dashboard-upload',
    listRuns: '/webhook/rkh-api-list-runs',
    getRun: '/webhook/rkh-api-get-run',
    getResults: '/webhook/rkh-api-get-results'
  },
  pollMs: 1500,
  pollTimeoutMs: 10 * 60 * 1000
};
