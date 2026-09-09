/*
 * Localhost-only same-origin host for the single-operator pilot.
 * It intentionally has no TLS, login, or network listener. Production uses an
 * RKH-approved reverse proxy on an internal HTTPS hostname instead.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const host = '127.0.0.1';
const port = Number(process.env.RKH_PILOT_PORT || 8787);
const upstream = new URL(process.env.RKH_N8N_LOCAL_URL || 'http://127.0.0.1:5678');
const mime = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function proxy(req, res, targetPath) {
  const headers = { ...req.headers, host: upstream.host };
  delete headers.connection;
  const request = http.request({ protocol: upstream.protocol, hostname: upstream.hostname, port: upstream.port, method: req.method, path: targetPath, headers }, (response) => {
    const responseHeaders = { ...response.headers, 'cache-control': 'no-store' };
    delete responseHeaders['access-control-allow-origin'];
    res.writeHead(response.statusCode || 502, responseHeaders);
    response.pipe(res);
  });
  request.on('error', () => send(res, 502, { message: 'Local n8n is unavailable.' }));
  req.pipe(request);
}

function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(root, relative);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { message: 'Not found.' });
  res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${host}:${port}`);
  if (url.pathname === '/api/runs') {
    if (req.method === 'GET') return proxy(req, res, '/webhook/rkh-v2-api-list-runs');
    if (req.method === 'POST') return proxy(req, res, '/webhook/rkh-v2-dashboard-upload');
    return send(res, 405, { message: 'Method not allowed.' });
  }
  if (url.pathname === '/api/run' && req.method === 'GET') return proxy(req, res, `/webhook/rkh-v2-api-get-run${url.search}`);
  if (url.pathname === '/api/results' && req.method === 'GET') return proxy(req, res, `/webhook/rkh-v2-api-get-results${url.search}`);
  if (url.pathname.startsWith('/api/')) return send(res, 404, { message: 'Unknown API route.' });
  return serveStatic(req, res, decodeURIComponent(url.pathname));
}).listen(port, host, () => {
  console.log(`RKH local pilot is available only at http://${host}:${port}`);
});
