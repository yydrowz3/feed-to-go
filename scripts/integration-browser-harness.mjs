// Opt-in localhost observation and request-layer fault control for manual browser integration.
// No API proxy, credentials, server faults, or replacement application responses.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const batch = process.argv[2];
if (!batch || !/^[a-zA-Z0-9-]+$/.test(batch)) throw Error('Expected an existing batch name');
const evidence = path.join(root, '.local/test-data', batch, 'evidence');
if (!existsSync(evidence)) throw Error('Batch evidence directory does not exist');
const manifest = JSON.parse(readFileSync(path.join(evidence, '../manifest.json'), 'utf8'));
if (manifest.api_base !== 'http://localhost:8095' || manifest.web_base !== 'http://localhost:5174')
  throw Error('This harness only supports the confirmed localhost 5174 / 8095 environment');
const require = createRequire(path.join(root, 'apps/web/package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const controlPath = path.join(evidence, 'browser-control.json');
const auditPath = path.join(evidence, 'browser-requests.jsonl');
const secrets = Object.entries(parseEnv(readFileSync(path.join(root, 'apps/api/.env'), 'utf8')))
  .filter(([key, value]) => value && /PASSWORD|SECRET|TOKEN|DB_HOST|DB_USER|DB_NAME|REDIS_HOST|AMQP_HOST|AMQP_USER|AMQP_VHOST|AMQP_URL/.test(key))
  .flatMap(([, value]) => [value, encodeURIComponent(value)]).filter(value => value.length >= 3)
  .sort((a, b) => b.length - a.length);
function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/password|token|authorization|secret/i.test(key)).map(([key, val]) => [key, sanitize(val)]));
  if (typeof value !== 'string') return value;
  let result = value.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[REDACTED_JWT]')
    .replace(/(?:postgres(?:ql)?|amqps?|rediss?):\/\/[^\s"']+/gi, '[REDACTED_CONNECTION_URI]');
  for (const secret of secrets) result = result.split(secret).join('[REDACTED]');
  return result;
}
function browserAudit() {
  const original = window.fetch.bind(window);
  const sessions = new Map();
  function record(value) {
    return original('/__integration/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value), keepalive: true }).catch(() => {});
  }
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== 'http://localhost:8095' || /\/account\/(login|register|refresh|logout)$/.test(url.pathname))
      return original(input, init);
    const started = performance.now();
    let request = {};
    if (typeof init.body === 'string') { try { request = JSON.parse(init.body); } catch {} }
    else if (init.body instanceof FormData) {
      request = Object.fromEntries([...init.body].map(([key, value]) => [key,
        value instanceof Blob ? { bytes: value.size, type: value.type, name: value.name } : value]));
    }
    const base = { at: new Date().toISOString(), method: init.method ?? 'GET', path: url.pathname, request };
    try {
      if (url.pathname === '/video/chunk/upload') {
        const filename = sessions.get(request.upload_id);
        let observedHold = false;
        for (;;) {
          const control = await original(`/__integration/control?filename=${encodeURIComponent(filename ?? '')}&index=${request.chunk_index}`,
            { signal: init.signal }).then(r => r.json());
          if (control.fail) {
            await record({ ...base, status: 'injected-transport-failure', upstream_sent: false });
            throw new TypeError('Integration test: one local request transport failure');
          }
          if (!control.hold) break;
          if (!observedHold) { await record({ ...base, status: 'held-before-send', upstream_sent: false }); observedHold = true; }
          await new Promise(resolve => setTimeout(resolve, 250));
          init.signal?.throwIfAborted();
        }
      }
      const response = await original(input, init);
      let body;
      try { body = await response.clone().json(); } catch { body = { non_json: true }; }
      if (url.pathname === '/video/chunk/init' && response.ok) sessions.set(body.upload_id, request.filename);
      await record({ ...base, status: response.status, elapsed_ms: Math.round(performance.now() - started), response: body });
      return response;
    } catch (error) {
      await record({ ...base, status: init.signal?.aborted ? 'aborted' : 'transport-error',
        elapsed_ms: Math.round(performance.now() - started), error: error.name });
      throw error;
    }
  };
}
const plugin = {
  name: 'local-integration-observer',
  transformIndexHtml: { order: 'pre', handler: () => [{ tag: 'script', children: `(${browserAudit.toString()})();`, injectTo: 'head-prepend' }] },
  configureServer(server) {
    server.middlewares.use('/__integration', async (req, res, next) => {
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) ||
          (req.headers.origin && req.headers.origin !== 'http://localhost:5174')) { res.writeHead(403).end(); return; }
      const url = new URL(req.url, 'http://localhost');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      if (url.pathname === '/audit' && req.method === 'POST') {
        let data = '';
        for await (const part of req) { data += part; if (data.length > 1048576) { res.writeHead(413).end(); return; } }
        try {
          const row = JSON.parse(data);
          if (typeof row.path !== 'string' || !/^(?:\/(video|feed|like|social|comment|message)\/|\/account\/getProfile$)/.test(row.path))
            throw Error('Unsupported audit route');
          appendFileSync(auditPath, JSON.stringify(sanitize(row)) + '\n');
          res.end('{}');
        } catch { res.writeHead(400).end('{}'); }
      } else if (url.pathname === '/control' && req.method === 'GET') {
        const control = existsSync(controlPath) ? JSON.parse(readFileSync(controlPath, 'utf8')) : {};
        const matches = control.filename === url.searchParams.get('filename') && control.index === Number(url.searchParams.get('index'));
        const result = { hold: matches && !!control.hold, fail: matches && !!control.fail_once };
        if (result.fail) { control.fail_once = false; writeFileSync(controlPath, JSON.stringify(control)); }
        res.end(JSON.stringify(result));
      } else next();
    });
  },
};
const server = await createServer({ root: path.join(root, 'apps/web'), plugins: [plugin],
  server: { host: '127.0.0.1', port: 5174, strictPort: true } });
await server.listen();
writeFileSync(path.join(evidence, 'browser-harness-process.json'), JSON.stringify({ pid: process.pid,
  started_at: new Date().toISOString(), url: manifest.web_base, audit: auditPath, control: controlPath }, null, 2));
console.log('Local integration observer ready on localhost:5174; API requests go directly to localhost:8095.');
