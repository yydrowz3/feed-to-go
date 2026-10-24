import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerAccounts } from './test-data-auth.mjs';

function fixture(state = 'pending') {
  const accounts = [{ alias: 'A', username: 'qatestaccount', password: 'TestPassword1234', purpose: 'test',
    registration_status: state, account_id: state === 'registered' ? 41 : null, last_error: null,
    ...(state === 'unknown' ? { registration_attempt: { source: 'browser', started_at: '2026-10-24T09:00:00+08:00' } } : {}) }];
  const calls = [], snapshots = [], evidence = [], logs = [];
  return { accounts, calls, snapshots, evidence, logs, options: { accounts, apiBase: 'http://localhost:8095', only: 'all',
    now: () => '2026-10-24T09:00:00+08:00', wait: async () => {},
    save: async () => snapshots.push(structuredClone(accounts)), record: async item => evidence.push(item), log: line => logs.push(line) } };
}
const reply = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
function server(f, handler) {
  f.options.fetchImpl = async (url, request) => { const route = new URL(url).pathname; f.calls.push({ route, request }); return handler(route, JSON.parse(request.body), request); };
}
const identity = username => ({ id: 41, username });
const login = username => ({ account_id: 41, username, token: 'memory-only-access', refresh_token: 'memory-only-refresh' });

test('registered accounts are skipped without requests or credential changes', async () => {
  const f = fixture('registered');
  server(f, () => { throw Error('No request expected'); });
  const before = structuredClone(f.accounts);
  await registerAccounts(f.options);
  assert.deepEqual(f.accounts, before); assert.equal(f.calls.length, 0);
});

test('create persists unknown before request, verifies the true ID and a protected endpoint, redacts evidence', async () => {
  const f = fixture(); let created = false;
  server(f, (route, body) => {
    if (route.endsWith('findByUsername')) return created ? reply(200, identity(body.username)) : reply(500, { error: 'record not found' });
    if (route.endsWith('register')) { assert.equal(f.snapshots.at(-1)[0].registration_status, 'unknown'); created = true; return reply(200, { message: 'account created' }); }
    if (route.endsWith('login')) return reply(200, login(body.username));
    assert.equal(route, '/feed/listByFollowing'); return reply(200, { video_list: [] });
  });
  await registerAccounts(f.options);
  assert.equal(f.accounts[0].account_id, 41); assert.equal(f.accounts[0].registration_status, 'registered');
  assert.equal(f.calls.filter(c => c.route.endsWith('register')).length, 1);
  const output = JSON.stringify([f.evidence, f.logs]);
  for (const secret of [f.accounts[0].password, 'memory-only-access', 'memory-only-refresh']) assert.ok(!output.includes(secret));
});

test('unknown browser registration is reconciled by identity and login without re-registering', async () => {
  const f = fixture('unknown');
  server(f, (route, body) => route.endsWith('findByUsername') ? reply(200, identity(body.username))
    : route.endsWith('login') ? reply(200, login(body.username)) : reply(200, { video_list: [] }));
  await registerAccounts(f.options);
  assert.equal(f.accounts[0].account_id, 41); assert.equal(f.calls.some(c => c.route.endsWith('register')), false);
});

test('lost registration response is saved as unknown and resume never repeats a committed write', async () => {
  const f = fixture(); let exists = false;
  server(f, (route, body) => {
    if (route.endsWith('findByUsername')) return exists ? reply(200, identity(body.username)) : reply(500, { error: 'record not found' });
    if (route.endsWith('register')) { exists = true; throw Error('socket closed after commit'); }
    if (route.endsWith('login')) return reply(200, login(body.username));
    return reply(200, { video_list: [] });
  });
  await assert.rejects(registerAccounts(f.options), /no confirmed response/);
  assert.equal(f.accounts[0].registration_status, 'unknown');
  await registerAccounts(f.options);
  assert.equal(f.accounts[0].registration_status, 'registered');
  assert.equal(f.calls.filter(c => c.route.endsWith('register')).length, 1);
});

test('a pending name collision is never adopted; only the unregistered username suffix changes', async () => {
  const f = fixture(); const original = structuredClone(f.accounts[0]); let created = false;
  server(f, (route, body) => {
    if (route.endsWith('findByUsername')) return body.username === original.username || created ? reply(200, identity(body.username)) : reply(404, { error: 'account not found' });
    if (route.endsWith('register')) { created = true; return reply(200, {}); }
    if (route.endsWith('login')) return reply(200, login(body.username));
    return reply(200, { video_list: [] });
  });
  await registerAccounts(f.options);
  assert.match(f.accounts[0].username, /^[a-z]+$/); assert.notEqual(f.accounts[0].username, original.username);
  assert.equal(f.accounts[0].password, original.password);
  assert.ok(!f.calls.some(c => c.route.endsWith('login') && JSON.parse(c.request.body).username === original.username));
});

test('rate limits stop immediately without retrying or manufacturing success', async () => {
  const f = fixture();
  server(f, route => route.endsWith('findByUsername') ? reply(500, { error: 'record not found' }) : reply(429, { error: 'too many requests' }));
  await assert.rejects(registerAccounts(f.options), /HTTP 429/);
  assert.equal(f.calls.filter(c => c.route.endsWith('register')).length, 1);
  assert.notEqual(f.accounts[0].registration_status, 'registered'); assert.equal(f.accounts[0].account_id, null);
});

test('lookup outages and login identity mismatches cannot lead to registration success', async () => {
  const f = fixture(); server(f, () => reply(500, { error: 'database unavailable' }));
  await assert.rejects(registerAccounts(f.options), /HTTP 500/);
  assert.ok(!f.calls.some(c => c.route.endsWith('register')));
  const g = fixture('unknown');
  server(g, (route, body) => route.endsWith('findByUsername') ? reply(200, identity(body.username)) : reply(200, { ...login(body.username), account_id: 99 }));
  await assert.rejects(registerAccounts(g.options), /identity or credentials/);
  assert.equal(g.accounts[0].registration_status, 'unknown'); assert.equal(g.accounts[0].account_id, null);
});

test('a protected-read failure cannot be confused with a username collision', async () => {
  const f = fixture('unknown'); const original = f.accounts[0].username;
  server(f, (route, body) => route.endsWith('findByUsername') ? reply(200, identity(body.username))
    : route.endsWith('login') ? reply(200, login(body.username)) : reply(403, { error: 'forbidden' }));
  await assert.rejects(registerAccounts(f.options), /HTTP 403/);
  assert.equal(f.accounts[0].username, original); assert.ok(!f.calls.some(c => c.route.endsWith('register')));
});
