import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiClient, ApiError } from '../src/api/client.ts'
const token = (name = 'old') => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ account_id: 1, username: name })).toString('base64url')}.c2ln`
const response = (payload, status = 200) => Response.json(payload, { status })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function setup(fetchImpl, initial = {}) {
  let state = { sessionId: 1, accessToken: token(), refreshToken: 'refresh', ...initial }
  const auth = {
    getSession: () => ({ ...state }),
    updateTokens: (id, expected, accessToken, refreshToken) => { if (state.sessionId === id && state.accessToken === expected) state = { ...state, accessToken, refreshToken: refreshToken ?? state.refreshToken } },
    clearSession: id => { if (state.sessionId === id) state = { sessionId: id + 1, accessToken: '', refreshToken: '' } },
  }
  return { client: createApiClient({ baseUrl: 'https://backend.test', fetchImpl, auth }), state: () => state, set: value => { state = { ...state, ...value } } }
}
test('400/403/404/409/413/429 do not refresh, retry or clear a valid session; code is parsed independently of prose', async () => {
  for (const status of [400,403,404,409,413,429]) {
    let calls = 0;
    const env = setup(async () => { calls++; return response({ code: 'FORBIDDEN', error: 'private' },status) });
    await assert.rejects(env.client.postJson('/private',{}), error => error instanceof ApiError && error.status === status && error.code === 'FORBIDDEN' && error.payload.error === 'private');
    assert.equal(calls,1);
    assert.equal(env.state().accessToken,token());
  }
});
test('concurrent 401s share refresh and preserve old refresh token', async () => {
  let refreshes = 0; const gate = deferred(); const started = deferred()
  const env = setup(async (url, init) => {
    if (url.endsWith('/account/refresh')) { refreshes++; assert.deepEqual(JSON.parse(init.body), { refresh_token: 'refresh' }); assert.equal(init.headers.Authorization, undefined); started.resolve(); await gate.promise; return response({ token: token('new'), refresh_token: '' }) }
    return init.headers.Authorization === `Bearer ${token()}` ? response({ error: 'expired' }, 401) : response({ ok: true })
  })
  const requests = Array.from({ length: 4 }, () => env.client.postJson('/private', {}, { auth: 'required' }))
  await started.promise; gate.resolve()
  assert.deepEqual(await Promise.all(requests), Array(4).fill({ ok: true }))
  assert.equal(refreshes, 1); assert.equal(env.state().refreshToken, 'refresh')
})
test('late original 401 replays with already updated token without refreshing', async () => {
  const late = deferred(); let refreshes = 0
  const env = setup(async (url, init) => {
    if (url.endsWith('/refresh')) { refreshes++; return response({ token: token('new') }) }
    if (url.endsWith('/late') && init.headers.Authorization === `Bearer ${token()}`) return late.promise
    return init.headers.Authorization === `Bearer ${token()}` ? response({}, 401) : response({ ok: true })
  })
  const pending = env.client.postJson('/late', {})
  await env.client.postJson('/first', {}); late.resolve(response({}, 401))
  await pending; assert.equal(refreshes, 1)
})
test('replayed 401 stops after one replay and clears session', async () => {
  let calls = 0
  const env = setup(async url => { calls++; return url.endsWith('/refresh') ? response({ token: token('new') }) : response({ error: 'revoked' }, 401) })
  await assert.rejects(env.client.postJson('/private', {}), error => error instanceof ApiError && error.status === 401)
  assert.equal(calls, 3); assert.equal(env.state().accessToken, '')
})

test('401 without refresh credentials clears the session without a refresh request', async () => {
  let calls = 0
  const env = setup(async url => {
    calls++
    assert.equal(url.endsWith('/refresh'), false)
    return response({ error: 'expired' }, 401)
  })
  env.set({ refreshToken: '' })
  await assert.rejects(env.client.postJson('/private', {}), error => error instanceof ApiError && error.status === 401)
  assert.equal(calls, 1)
  assert.equal(env.state().accessToken, '')
  assert.equal(env.state().refreshToken, '')
})

test('malformed successful refresh clears credentials and never replays the request', async () => {
  let calls = 0
  const env = setup(async url => {
    calls++
    return url.endsWith('/refresh') ? response({ token: 'invalid-jwt' }) : response({}, 401)
  })
  await assert.rejects(env.client.postJson('/private', {}), error => error instanceof ApiError && error.status === 401)
  assert.equal(calls, 2)
  assert.equal(env.state().accessToken, '')
  assert.equal(env.state().refreshToken, '')
})
test('none skips auth and refresh; required without token fails before fetch; network errors keep their type', async () => {
  let calls = 0
  const env = setup(async (_, init) => { calls++; assert.equal(init.headers.Authorization, undefined); return response({}, 401) })
  await assert.rejects(env.client.postJson('/login', {}, { auth: 'none' }), ApiError); assert.equal(calls, 1)
  env.set({ accessToken: '' }); await assert.rejects(env.client.postJson('/private', {}, { auth: 'required' }), ApiError); assert.equal(calls, 1)
  const network = setup(async () => { throw new TypeError('offline') })
  await assert.rejects(network.client.postJson('/private', {}), TypeError); assert.equal(network.state().sessionId, 1)
})
test('FormData survives replay without manual Content-Type', async () => {
  const body = new FormData(); body.append('file', new Blob(['data']), 'test.mp4'); let calls = 0
  const env = setup(async (url, init) => {
    if (url.endsWith('/refresh')) return response({ token: token('new') })
    assert.equal(init.body, body); assert.equal(init.headers['Content-Type'], undefined); calls++
    return response({}, calls === 1 ? 401 : 200)
  })
  await env.client.postForm('/upload', body); assert.equal(calls, 2)
})
for (const refreshStatus of [200, 401]) test(`old refresh ${refreshStatus} cannot restore or clear a new session`, async () => {
  const gate = deferred(); const started = deferred()
  const env = setup(async url => { if (url.endsWith('/refresh')) { started.resolve(); return gate.promise } return response({}, 401) })
  const pending = env.client.postJson('/private', {}); await started.promise
  env.set({ sessionId: 2, accessToken: token('other'), refreshToken: 'other-refresh' })
  gate.resolve(response({ token: token('late') }, refreshStatus))
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(env.state().accessToken, token('other'))
})
test('same-session rename takes precedence over old refresh result', async () => {
  const gate = deferred(); const started = deferred()
  const env = setup(async (url, init) => {
    if (url.endsWith('/refresh')) { started.resolve(); return gate.promise }
    return init.headers.Authorization === `Bearer ${token('renamed')}` ? response({ ok: true }) : response({}, 401)
  })
  const pending = env.client.postJson('/private', {}); await started.promise
  env.set({ accessToken: token('renamed') }); gate.resolve(response({ token: token('late') }))
  await pending; assert.equal(env.state().accessToken, token('renamed'))
})
test('cancelling a waiter is immediate and does not cancel shared refresh', async () => {
  const gate = deferred(); const started = deferred(); let refreshes = 0
  const env = setup(async (url, init) => {
    if (url.endsWith('/refresh')) { refreshes++; started.resolve(); assert.equal(init.signal.aborted, false); return gate.promise }
    return init.headers.Authorization === `Bearer ${token()}` ? response({}, 401) : response({ ok: true })
  })
  const controller = new AbortController()
  const cancelled = env.client.postJson('/one', {}, { signal: controller.signal }); const active = env.client.postJson('/two', {})
  await started.promise; controller.abort(); await assert.rejects(cancelled, { name: 'AbortError' })
  assert.equal(env.state().sessionId, 1); gate.resolve(response({ token: token('new') })); await active; assert.equal(refreshes, 1)
})
test('cancelled fetch does not refresh or clear and stale successful response is rejected', async () => {
  const controller = new AbortController()
  const env = setup(async (_, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))))
  const pending = env.client.postJson('/private', {}, { signal: controller.signal }); controller.abort()
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(env.state().sessionId, 1)
  const gate = deferred(); const other = setup(async () => gate.promise)
  const old = other.client.postJson('/private', {}); other.set({ sessionId: 2 }); gate.resolve(response({ old: true }))
  await assert.rejects(old, { name: 'AbortError' })
})
test('failed refresh clears only its session; ordinary errors are not retried', async () => {
  let calls = 0
  const env = setup(async url => { calls++; return response({ error: 'denied' }, url.endsWith('/refresh') ? 403 : 401) })
  await assert.rejects(env.client.postJson('/private', {}), error => error.status === 403)
  assert.equal(calls, 2); assert.equal(env.state().accessToken, '')
  calls = 0
  const business = setup(async () => { calls++; return response({ error: 'unavailable' }, 503) })
  await assert.rejects(business.client.postJson('/private', {}), error => error.status === 503)
  assert.equal(calls, 1); assert.equal(business.state().sessionId, 1)
})
