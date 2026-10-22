import { apiUrl, parseApiBase } from '../lib/config.ts'
import { decodeJwtPayload } from '../lib/jwt.ts'
import type { AuthAccessor, SessionSnapshot } from './session.ts'

export type RequestOptions = { auth?: 'none' | 'optional' | 'required'; signal?: AbortSignal }
export class ApiError extends Error {
  status: number
  payload: unknown
  constructor(message: string, status: number, payload?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}
export function isCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
function staleSession(): DOMException { return new DOMException('会话已变更，请重新操作', 'AbortError') }
async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  let payload: unknown
  try { payload = text ? JSON.parse(text) : undefined } catch { payload = text }
  if (!response.ok) {
    const body = payload as { error?: unknown; message?: unknown } | undefined
    const message = typeof body?.error === 'string' ? body.error : typeof body?.message === 'string' ? body.message : `请求失败（${response.status}）`
    throw new ApiError(message, response.status, payload)
  }
  return payload
}
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export function createApiClient({ baseUrl, fetchImpl = fetch, auth }: { baseUrl: string; fetchImpl?: typeof fetch; auth: AuthAccessor }) {
  const base = parseApiBase(baseUrl)
  const refreshes = new Map<number, { promise: Promise<string>; controller: AbortController }>()
  function assertSession(sessionId: number) {
    const current = auth.getSession()
    if (current.sessionId !== sessionId) throw staleSession()
    return current
  }
  function refresh(snapshot: SessionSnapshot): Promise<string> {
    const existing = refreshes.get(snapshot.sessionId)
    if (existing) return existing.promise
    const controller = new AbortController()
    const promise = (async () => {
      try {
        if (!snapshot.refreshToken) throw new ApiError('登录已失效，请重新登录', 401)
        const response = await fetchImpl(apiUrl(base, '/account/refresh'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: snapshot.refreshToken }), signal: controller.signal,
        })
        const payload = await readResponse(response) as { token?: unknown; refresh_token?: unknown }
        const current = assertSession(snapshot.sessionId)
        if (current.accessToken !== snapshot.accessToken) return current.accessToken
        if (typeof payload?.token !== 'string' || !decodeJwtPayload(payload.token)) throw new ApiError('刷新响应缺少有效登录凭据', 401)
        auth.updateTokens(snapshot.sessionId, snapshot.accessToken, payload.token, typeof payload.refresh_token === 'string' && payload.refresh_token.trim() ? payload.refresh_token : undefined)
        return assertSession(snapshot.sessionId).accessToken
      } catch (error) {
        const current = assertSession(snapshot.sessionId)
        if (current.accessToken !== snapshot.accessToken) return current.accessToken
        auth.clearSession(snapshot.sessionId)
        throw error
      }
    })()
    const entry = { promise, controller }
    refreshes.set(snapshot.sessionId, entry)
    const cleanup = () => { if (refreshes.get(snapshot.sessionId) === entry) refreshes.delete(snapshot.sessionId) }
    void promise.then(cleanup, cleanup)
    return promise
  }
  async function post<T>(path: string, body: BodyInit, json: boolean, options: RequestOptions = {}): Promise<T> {
    const mode = options.auth ?? 'optional'
    const snapshot = auth.getSession()
    const authenticated = mode !== 'none' && !!snapshot.accessToken
    options.signal?.throwIfAborted()
    if (mode === 'required' && !authenticated) throw new ApiError('请先登录', 401)
    const send = async (token: string) => {
      options.signal?.throwIfAborted()
      const headers: Record<string, string> = {}
      if (json) headers['Content-Type'] = 'application/json'
      if (mode !== 'none' && token) headers.Authorization = `Bearer ${token}`
      const response = await fetchImpl(apiUrl(base, path), { method: 'POST', headers, body, signal: options.signal })
      const payload = await readResponse(response)
      options.signal?.throwIfAborted()
      if (authenticated) assertSession(snapshot.sessionId)
      return payload as T
    }
    try { return await send(authenticated ? snapshot.accessToken : '') } catch (error) {
      options.signal?.throwIfAborted()
      if (!(error instanceof ApiError) || error.status !== 401 || !authenticated) throw error
      const current = assertSession(snapshot.sessionId)
      const token = current.accessToken !== snapshot.accessToken ? current.accessToken : await waitFor(refresh(snapshot), options.signal)
      options.signal?.throwIfAborted()
      assertSession(snapshot.sessionId)
      try { return await send(token) } catch (replayError) {
        if (replayError instanceof ApiError && replayError.status === 401) {
          const latest = assertSession(snapshot.sessionId)
          if (latest.accessToken === token) auth.clearSession(snapshot.sessionId)
        }
        throw replayError
      }
    }
  }
  return {
    postJson<T>(path: string, body: unknown, options?: RequestOptions) { return post<T>(path, JSON.stringify(body), true, options) },
    postForm<T>(path: string, body: FormData, options?: RequestOptions) { return post<T>(path, body, false, options) },
    cancelSession(sessionId: number) { refreshes.get(sessionId)?.controller.abort(); refreshes.delete(sessionId) },
  }
}
export type ApiClient = ReturnType<typeof createApiClient>
