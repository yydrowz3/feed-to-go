import { createStore } from 'zustand/vanilla'
import { decodeJwtPayload } from '../lib/jwt.ts'
import type { JwtPayload } from '../lib/jwt.ts'
import type { AuthAccessor, SessionSnapshot } from '../api/session.ts'

export type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type AuthState = SessionSnapshot & AuthAccessor & {
  claims: JwtPayload | null; accountId: number; username: string
  replaceSession(accessToken: string, refreshToken: string): void
}
export function createAuthStore(storage?: TokenStorage) {
  const read = (key: string) => { try { return storage?.getItem(key) ?? '' } catch { return '' } }
  function persist(accessToken: string, refreshToken: string) {
    for (const [key, value] of [['access_token', accessToken], ['refresh_token', refreshToken]]) {
      try { if (value) storage?.setItem(key, value); else storage?.removeItem(key) } catch { /* Memory session remains usable when storage is unavailable. */ }
    }
  }
  const savedToken = read('access_token')
  const claims = decodeJwtPayload(savedToken)
  const accessToken = claims ? savedToken : ''
  const refreshToken = claims ? read('refresh_token') : ''
  if (!claims) persist('', '')
  return createStore<AuthState>()((set, get) => ({
    accessToken, refreshToken, claims, accountId: claims?.account_id ?? 0, username: claims?.username ?? '', sessionId: 0,
    getSession() { const { sessionId, accessToken, refreshToken } = get(); return { sessionId, accessToken, refreshToken } },
    replaceSession(accessToken, refreshToken) {
      const claims = decodeJwtPayload(accessToken)
      if (!claims || !refreshToken?.trim()) throw new Error('登录响应缺少有效凭据')
      persist(accessToken, refreshToken)
      set({ accessToken, refreshToken, claims, accountId: claims.account_id, username: claims.username, sessionId: get().sessionId + 1 })
    },
    updateTokens(sessionId, expectedToken, accessToken, refreshToken) {
      const current = get()
      if (current.sessionId !== sessionId || current.accessToken !== expectedToken) return
      const claims = decodeJwtPayload(accessToken)
      if (!claims || claims.account_id !== current.accountId) throw new Error('更新的登录凭据无效')
      const nextRefresh = refreshToken?.trim() ? refreshToken : current.refreshToken
      persist(accessToken, nextRefresh)
      set({ accessToken, refreshToken: nextRefresh, claims, accountId: claims.account_id, username: claims.username })
    },
    clearSession(sessionId) {
      if (get().sessionId !== sessionId) return
      persist('', '')
      set({ accessToken: '', refreshToken: '', claims: null, accountId: 0, username: '', sessionId: sessionId + 1 })
    },
  }))
}
export type AuthStore = ReturnType<typeof createAuthStore>
