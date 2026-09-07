window.RKH_CONFIG = window.RKH_CONFIG || {
  apiBaseUrl: 'https://n8n-coolify.barqai.app',
  endpoints: {
    upload: '/webhook/rkh-v2-dashboard-upload',
    listRuns: '/webhook/rkh-v2-api-list-runs',
    getRun: '/webhook/rkh-v2-api-get-run',
    getResults: '/webhook/rkh-v2-api-get-results'
  },
  pollMs: 1500,
  pollTimeoutMs: 10 * 60 * 1000
};
