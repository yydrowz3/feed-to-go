import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthStore } from '../src/stores/auth.ts'
import { createRuntime } from '../src/lib/runtime.ts'
import { queryKeys } from '../src/lib/query-keys.ts'
const token = (id = 1, username = '用户') => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ account_id: id, username, exp: 1 })).toString('base64url')}.c2ln`
function storage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key), data }
}
test('restores legacy keys including expired tokens and removes malformed credentials', () => {
  const saved = storage({ access_token: token(), refresh_token: 'refresh' })
  const store = createAuthStore(saved)
  assert.equal(store.getState().username, '用户'); assert.equal(store.getState().refreshToken, 'refresh')
  assert.equal(saved.data.size, 2)
  const broken = storage({ access_token: 'broken', refresh_token: 'refresh' })
  assert.equal(createAuthStore(broken).getState().accountId, 0); assert.equal(broken.data.size, 0)
})
test('storage failures leave a fully functional memory session', () => {
  const fail = () => { throw new Error('storage disabled') }
  const store = createAuthStore({ getItem: fail, setItem: fail, removeItem: fail })
  store.getState().replaceSession(token(), 'refresh')
  assert.equal(store.getState().accountId, 1)
  store.getState().clearSession(store.getState().sessionId)
  assert.equal(store.getState().accountId, 0)
})
test('login/logout isolate sessions while refresh and rename keep identity scope', () => {
  const saved = storage(); const store = createAuthStore(saved)
  store.getState().replaceSession(token(), 'refresh'); const sessionId = store.getState().sessionId
  store.getState().updateTokens(sessionId, token(), token(1, '改名'))
  assert.equal(store.getState().sessionId, sessionId); assert.equal(store.getState().refreshToken, 'refresh'); assert.equal(store.getState().username, '改名')
  store.getState().replaceSession(token(2), 'other')
  store.getState().clearSession(sessionId)
  store.getState().updateTokens(sessionId, token(), token(1, '迟到'))
  assert.equal(store.getState().accountId, 2)
  store.getState().clearSession(store.getState().sessionId)
  assert.equal(saved.data.size, 0); assert.equal(store.getState().sessionId, 3)
  assert.throws(() => store.getState().replaceSession('broken', 'refresh'))
})
test('all query keys contain session and viewer without tokens', () => {
  const first = { sessionId: 1, accountId: 2 }; const next = { sessionId: 2, accountId: 2 }
  assert.deepEqual(queryKeys.feed(first, 'latest', 10), ['feed', 1, 2, 'latest', 10])
  for (const kind of ['video', 'liked', 'followers', 'followings', 'comments']) {
    assert.deepEqual(queryKeys[kind](first, 8).slice(1), [1, 2, 8])
    assert.notDeepEqual(queryKeys[kind](first, 8), queryKeys[kind](next, 8))
  }
})
test('session coordinator cancels active queries/tasks, clears cache and invalidates router once', async () => {
  const runtime = createRuntime('https://backend.test')
  let invalidations = 0; let tasks = 0; let started
  const ready = new Promise(resolve => { started = resolve })
  runtime.setRouterInvalidation(() => invalidations++)
  runtime.registerSessionTask(() => tasks++)
  const request = runtime.queryClient.fetchQuery({ queryKey: ['old', 0, 0], queryFn: ({ signal }) => new Promise((_, reject) => { signal.addEventListener('abort', () => reject(signal.reason)); started() }) })
  const rejected = assert.rejects(request)
  await ready
  runtime.authStore.getState().replaceSession(token(), 'refresh')
  await rejected
  assert.equal(tasks, 1); assert.equal(invalidations, 1); assert.equal(runtime.queryClient.getQueryCache().getAll().length, 0)
  const current = runtime.authStore.getState()
  current.updateTokens(current.sessionId, current.accessToken, token(1, '新名'))
  assert.equal(invalidations, 1)
  assert.deepEqual(runtime.queryClient.getDefaultOptions(), { queries: { retry: false, staleTime: 30000, refetchOnWindowFocus: false }, mutations: { retry: false } })
  runtime.dispose(); runtime.authStore.getState().clearSession(current.sessionId); assert.equal(invalidations, 1)
})
